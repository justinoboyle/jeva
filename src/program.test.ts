import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "effect";
import { defineProgram, plan, ProgramError, runProgram } from "./program.js";
import type { Answer } from "./program.js";
const boolean = { type: "boolean" as const, instructions: "Does `input` name a fruit?" };
const decodeState = Schema.decodeUnknownSync(
  Schema.Struct({
    input: Schema.Unknown,
    inputs: Schema.Record(Schema.String, Schema.Unknown),
    answers: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
  }),
);
const unexpected = () => {
  throw new Error("Skipped callback ran");
};

test("batches independent questions and orders dependent questions", () => {
  const program = defineProgram({
    nodes: [
      { id: "fruit", question: () => boolean },
      {
        id: "color",
        question: () => ({
          type: "choice" as const,
          instructions: "Color of `input`?",
          criteria: { yellow: "yellow", blue: "blue" },
        }),
      },
      { id: "edible", dependsOn: ["fruit"], question: () => boolean },
    ],
  });
  assert.deepEqual(
    plan(program).map((layer) => layer.map((node) => node.id)),
    [["fruit", "color"], ["edible"]],
  );
});

test("routes only after its dependency and returns stable named answers", async () => {
  const calls: string[][] = [];
  const program = defineProgram({
    nodes: [
      {
        id: "kind",
        question: () => ({
          type: "choice" as const,
          instructions: "Classify `input`",
          criteria: { fruit: "fruit", other: "other" },
        }),
      },
      {
        id: "color",
        dependsOn: ["kind"],
        when: (a) => a.kind.choice === "fruit",
        question: () => ({
          type: "choice" as const,
          instructions: "Color?",
          criteria: { yellow: "yellow", blue: "blue" },
        }),
      },
    ],
  });
  const answers = await runProgram(
    program,
    "banana",
    async ({ questions }): Promise<{ answers: Record<string, Answer> }> => {
      calls.push(Object.keys(questions));
      return {
        answers:
          "kind" in questions ? { kind: { choice: "fruit" } } : { color: { choice: "yellow" } },
      };
    },
  );
  assert.deepEqual(calls, [["kind"], ["color"]]);
  assert.equal(answers.color.choice, "yellow");
});

test("fails invalid graphs before a gateway request", () => {
  assert.throws(
    () => plan({ nodes: [{ id: "a", dependsOn: ["nope"], question: () => boolean }] }),
    ProgramError,
  );
  assert.throws(
    () =>
      plan({
        nodes: [
          { id: "a", dependsOn: ["b"], question: () => boolean },
          { id: "b", dependsOn: ["a"], question: () => boolean },
        ],
      }),
    ProgramError,
  );
});

test("async tasks fan out and forward projected results through a model join", async () => {
  const program = defineProgram({
    nodes: [
      { id: "left", run: async () => ({ value: 2 }) },
      { id: "right", run: async () => ({ value: 3 }) },
      {
        id: "join",
        dependsOn: ["left", "right"],
        when: async (answers) => answers.left !== undefined && answers.right !== undefined,
        input: async ({ answers }) => ({
          total: Number(answers.left.value) + Number(answers.right.value),
        }),
        question: async ({ input }) => {
          assert.deepEqual(input, { total: 5 });
          return boolean;
        },
      },
      {
        id: "report",
        dependsOn: ["join"],
        run: async ({ answers }) => ({ selected: answers.join.choice }),
      },
    ],
  });
  const requests: string[][] = [];
  const answers = await runProgram(program, "original input", async (request) => {
    requests.push(Object.keys(request.questions));
    const state = decodeState(request.state);
    assert.equal(state.input, "original input");
    assert.deepEqual(state.inputs, { join: { total: 5 } });
    assert.deepEqual(Object.keys(state.answers), ["left", "right"]);
    return { answers: { join: { choice: "yes" } } };
  });
  assert.deepEqual(requests, [["join"]]);
  assert.deepEqual(answers.report, { selected: "yes" });
});

test("independent task and model work overlap and see only the prior-layer snapshot", async () => {
  let started = 0;
  let release!: () => void;
  const bothStarted = new Promise<void>((resolve) => {
    release = resolve;
  });
  const arrive = async () => {
    if (++started === 2) release();
    await bothStarted;
  };
  const program = defineProgram({
    nodes: [
      {
        id: "local",
        run: async ({ answers }) => {
          assert.ok(Object.isFrozen(answers));
          assert.deepEqual(Object.keys(answers), []);
          await arrive();
          return { value: "retrieved" };
        },
      },
      { id: "semantic", question: () => boolean },
      {
        id: "join",
        dependsOn: ["local", "semantic"],
        run: ({ answers }) => ({ ids: Object.keys(answers) }),
      },
    ],
  });
  const result = await runProgram(
    program,
    {},
    async ({ state }) => {
      const snapshot = decodeState(state).answers;
      assert.deepEqual(Object.keys(snapshot), []);
      await arrive();
      assert.deepEqual(Object.keys(snapshot), []);
      return { answers: { semantic: { probability: 0.98 } } };
    },
    { concurrency: 2, timeoutMs: 500 },
  );
  assert.equal(started, 2);
  assert.deepEqual(new Set(result.join.ids), new Set(["local", "semantic"]));
});

test("concurrency bounds active task callbacks", async () => {
  let active = 0;
  let maximum = 0;
  const program = defineProgram({
    nodes: Array.from({ length: 7 }, (_, index) => ({
      id: `task${index}`,
      run: async () => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        active--;
        return { value: index };
      },
    })),
  });
  const result = await runProgram(
    program,
    {},
    async () => {
      throw new Error("No model node exists");
    },
    { concurrency: 2 },
  );
  assert.equal(maximum, 2);
  assert.equal(Object.keys(result).length, 7);
});

test("async false guards skip input projection, question construction, and dependent task execution", async () => {
  const program = defineProgram({
    nodes: [
      { id: "skip", when: async () => false, input: unexpected, question: unexpected },
      {
        id: "dependent",
        dependsOn: ["skip"],
        when: async (answers) => answers.skip !== undefined,
        run: unexpected,
      },
    ],
  });
  assert.deepEqual(
    await runProgram(program, {}, async () => {
      throw new Error("Skipped model request ran");
    }),
    {},
  );
});

test("deadline aborts the signal and rejects without pretending to stop an ignoring callback", async () => {
  let observedSignal: AbortSignal | undefined;
  let release!: (value: Answer) => void;
  let downstream = false;
  const program = defineProgram({
    nodes: [
      {
        id: "slow",
        run: ({ signal }) => {
          observedSignal = signal;
          return new Promise<Answer>((resolve) => {
            release = resolve;
          });
        },
      },
      {
        id: "later",
        dependsOn: ["slow"],
        run: () => {
          downstream = true;
          return {};
        },
      },
    ],
  });
  await assert.rejects(
    runProgram(program, {}, async () => ({ answers: {} }), { timeoutMs: 20 }),
    (error) => error instanceof ProgramError && error.code === "timeout",
  );
  assert.equal(observedSignal?.aborted, true);
  release({ value: "late result" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(downstream, false);
});

test("external cancellation stops queued work and propagates to a model callback", async () => {
  const controller = new AbortController();
  let notify!: () => void;
  const started = new Promise<void>((resolve) => {
    notify = resolve;
  });
  let signal: AbortSignal | undefined;
  let later = false;
  const program = defineProgram({
    nodes: [
      { id: "model", question: () => boolean },
      {
        id: "later",
        dependsOn: ["model"],
        run: () => {
          later = true;
          return {};
        },
      },
    ],
  });
  const running = runProgram(
    program,
    {},
    (request) => {
      signal = request.signal;
      notify();
      return new Promise(() => {});
    },
    { signal: controller.signal },
  );
  await started;
  controller.abort("caller cancelled");
  await assert.rejects(
    running,
    (error) => error instanceof ProgramError && error.code === "aborted",
  );
  assert.equal(signal?.aborted, true);
  assert.equal(later, false);
  await assert.rejects(
    runProgram(
      program,
      {},
      async () => {
        throw new Error("Already-aborted evaluator ran");
      },
      { signal: controller.signal },
    ),
    (error) => error instanceof ProgramError && error.code === "aborted",
  );
});

test("task errors preserve the original cause and node ID", async () => {
  const failure = new Error("source unavailable");
  const program = defineProgram({
    nodes: [
      {
        id: "retrieve",
        run: () => {
          throw failure;
        },
      },
    ],
  });
  await assert.rejects(
    runProgram(program, {}, async () => ({ answers: {} })),
    (error) =>
      error instanceof ProgramError && error.nodeId === "retrieve" && error.cause === failure,
  );
});

test("unexpected gateway IDs cannot overwrite a prior result", async () => {
  const program = defineProgram({
    nodes: [
      { id: "source", run: () => ({ value: "trusted" }) },
      { id: "judge", dependsOn: ["source"], question: () => boolean },
    ],
  });
  await assert.rejects(
    runProgram(program, {}, async () => ({
      answers: { judge: {}, source: { value: "overwritten" } },
    })),
    ProgramError,
  );
});

test("invalid scheduling options and malformed nodes fail before callbacks", async () => {
  let calls = 0;
  const program = defineProgram({
    nodes: [
      {
        id: "valid",
        run: () => {
          calls++;
          return {};
        },
      },
    ],
  });
  await Promise.all(
    [{ concurrency: 0 }, { concurrency: 1.5 }, { timeoutMs: -1 }, { timeoutMs: Infinity }].map(
      (options) =>
        assert.rejects(
          runProgram(program, {}, async () => ({ answers: {} }), options),
          ProgramError,
        ),
    ),
  );
  assert.equal(calls, 0);
  // @ts-expect-error Exercise the runtime boundary with an invalid node that the typed API also rejects.
  assert.throws(
    () => plan({ nodes: [{ id: "both", run: () => ({}), question: () => boolean }] }),
    ProgramError,
  );
  assert.throws(
    () => plan({ nodes: [{ id: "__proto__", question: () => boolean }] }),
    ProgramError,
  );
});
