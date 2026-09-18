import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "effect";
import {
  decideLoopExit,
  hashLoopValue,
  runLoop,
  type LoopExitPolicy,
  type LoopOptions,
} from "./loop.js";
import type { Evaluate } from "./program.js";

const State = Schema.Struct({ count: Schema.Number });
const policy: LoopExitPolicy = {
  answerId: "exit",
  labels: { done: "complete", more: "continue", unknown: "review" },
  minProbability: 0.9,
  minMargin: 0.2,
};
const request = {
  state: { task: "fixture" },
  questions: {
    exit: {
      type: "choice" as const,
      instructions: "Choose the exit condition in `state.task`.",
      criteria: { done: "Complete", more: "Continue", unknown: "Review" },
    },
  },
};
const answer = (label = "done") => ({
  type: "choice",
  choice: label,
  probabilities: {
    done: label === "done" ? 0.98 : 0.01,
    more: label === "more" ? 0.98 : 0.01,
    unknown: label === "unknown" ? 0.98 : 0.01,
  },
});
const evaluate: Evaluate = async () => ({ answers: { exit: answer() } });
const options = (
  overrides: Partial<LoopOptions<{ readonly count: number }>> = {},
): LoopOptions<{ readonly count: number }> => ({
  stateSchema: State,
  evaluate,
  exitPolicy: policy,
  maxRounds: 4,
  maxCalls: 8,
  timeoutMs: 1000,
  concurrency: 2,
  mode: "fixture",
  ...overrides,
});

test("loop completion requires a validated and explicitly consumed current-round judgment", async () => {
  const report = await runLoop(
    { count: 0 },
    async (state, context) => {
      const call = await context.evaluate(request);
      return {
        state: { count: state.count + 1 },
        consumedCallIds: [call.callId],
        exitCallId: call.callId,
      };
    },
    options(),
  );
  assert.equal(report.status, "complete");
  assert.equal(report.state.count, 1);
  assert.equal(report.calls.length, 1);
  assert.equal(report.calls[0].status, "succeeded");
  assert.equal(report.rounds[0].exit?.status, "complete");
  assert.match(report.calls[0].resultHash ?? "", /^[a-f\d]{64}$/);
  assert.equal(
    report.calls[0].answerHashes?.exit,
    hashLoopValue(report.rounds[0].exitObservation?.answer),
  );
  assert.deepEqual(report.limits, { maxRounds: 4, maxCalls: 8, concurrency: 2, timeoutMs: 1000 });
});

test("exit policies preserve complete, continue, review and ambiguous outcomes", () => {
  assert.equal(decideLoopExit(answer("done"), policy).status, "complete");
  assert.equal(decideLoopExit(answer("more"), policy).status, "continue");
  assert.equal(decideLoopExit(answer("unknown"), policy).status, "review");
  for (const invalid of [
    undefined,
    { type: "choice", choice: "done", probabilities: { done: 0.5, more: 0.5, unknown: 0 } },
    { type: "choice", choice: "done", probabilities: { done: 0.9, more: 0.9, unknown: 0 } },
    { type: "choice", choice: "done", probabilities: { done: 0.98, other: 0.01, unknown: 0.01 } },
    { type: "choice", choice: "done", probabilities: { done: NaN, more: 0.01, unknown: 0.01 } },
  ]) {
    assert.equal(decideLoopExit(invalid, policy).status, "review");
  }
});

test("parallel loop calls overlap but never exceed the concurrency bound", async () => {
  let active = 0;
  let maximum = 0;
  const report = await runLoop(
    { count: 0 },
    async (state, context) => {
      const calls = await Promise.all(Array.from({ length: 5 }, () => context.evaluate(request)));
      return {
        state,
        consumedCallIds: calls.map((call) => call.callId),
        exitCallId: calls[0].callId,
      };
    },
    options({
      evaluate: async () => {
        maximum = Math.max(maximum, ++active);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        active--;
        return { answers: { exit: answer() } };
      },
    }),
  );
  assert.equal(report.status, "complete");
  assert.equal(maximum, 2);
  assert.equal(new Set(report.calls.map((call) => call.id)).size, 5);
});

test("shared call budget is reserved before queued provider starts", async () => {
  let calls = 0;
  const report = await runLoop(
    { count: 0 },
    async (state, context) => {
      const receipts = await Promise.all([context.evaluate(request), context.evaluate(request)]);
      return {
        state,
        consumedCallIds: receipts.map((call) => call.callId),
        exitCallId: receipts[0].callId,
      };
    },
    options({
      maxCalls: 1,
      evaluate: async () => {
        calls++;
        return { answers: { exit: answer() } };
      },
    }),
  );
  assert.equal(report.status, "max_calls");
  assert.ok(calls <= 1);
  assert.equal(report.calls.length, 1);
});

test("maximum rounds is not successful completion", async () => {
  const report = await runLoop(
    { count: 0 },
    async (state, context) => {
      const call = await context.evaluate(request);
      return {
        state: { count: state.count + 1 },
        consumedCallIds: [call.callId],
        exitCallId: call.callId,
      };
    },
    options({ maxRounds: 2, evaluate: async () => ({ answers: { exit: answer("more") } }) }),
  );
  assert.equal(report.status, "max_rounds");
  assert.equal(report.rounds.length, 2);
});

test("missing, forged, stale or unconsumed evidence cannot complete a loop", async () => {
  const missing = await runLoop(
    { count: 0 },
    (state) => ({ state, consumedCallIds: [] }),
    options(),
  );
  assert.equal(missing.status, "review");
  const forged = await runLoop(
    { count: 0 },
    (state) => ({ state, consumedCallIds: ["call_1"], exitCallId: "call_1" }),
    options(),
  );
  assert.equal(forged.status, "review");
  const unconsumed = await runLoop(
    { count: 0 },
    async (state, context) => {
      const call = await context.evaluate(request);
      return { state, consumedCallIds: [], exitCallId: call.callId };
    },
    options(),
  );
  assert.equal(unconsumed.status, "review");
  let previous = "";
  const stale = await runLoop(
    { count: 0 },
    async (state, context) => {
      if (previous) return { state, consumedCallIds: [previous], exitCallId: previous };
      const call = await context.evaluate(request);
      previous = call.callId;
      return { state: { count: 1 }, consumedCallIds: [call.callId], exitCallId: call.callId };
    },
    options({ evaluate: async () => ({ answers: { exit: answer("more") } }) }),
  );
  assert.equal(stale.status, "review");
  assert.equal(stale.rounds.length, 2);
});

test("unchanged state with an accepted continue condition stops as stalled", async () => {
  const report = await runLoop(
    { count: 0 },
    async (state, context) => {
      const call = await context.evaluate(request);
      return { state, consumedCallIds: [call.callId], exitCallId: call.callId };
    },
    options({ evaluate: async () => ({ answers: { exit: answer("more") } }) }),
  );
  assert.equal(report.status, "stalled");
});

test("cancellation rejects ignoring callbacks and does not start queued calls", async () => {
  const controller = new AbortController();
  let notify!: () => void;
  const started = new Promise<void>((resolve) => {
    notify = resolve;
  });
  let release!: (value: Awaited<ReturnType<Evaluate>>) => void;
  let count = 0;
  const running = runLoop(
    { count: 0 },
    async (state, context) => {
      const calls = await Promise.all([context.evaluate(request), context.evaluate(request)]);
      return {
        state,
        consumedCallIds: calls.map((call) => call.callId),
        exitCallId: calls[0].callId,
      };
    },
    options({
      signal: controller.signal,
      concurrency: 1,
      evaluate: () => {
        count++;
        notify();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    }),
  );
  await started;
  controller.abort();
  const report = await running;
  assert.equal(report.status, "cancelled");
  assert.equal(count, 1);
  const frozen = JSON.stringify(report);
  release({ answers: { exit: answer() } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(JSON.stringify(report), frozen);
  assert.equal(count, 1);
});

test("whole-loop deadline stops an ignoring step", async () => {
  const report = await runLoop(
    { count: 0 },
    () => new Promise(() => {}),
    options({ timeoutMs: 20 }),
  );
  assert.equal(report.status, "timeout");
});

test("failure evidence is retained without provider or step error bodies", async () => {
  const provider = await runLoop(
    { count: 0 },
    async (state, context) => {
      const call = await context.evaluate(request);
      return { state, consumedCallIds: [call.callId], exitCallId: call.callId };
    },
    options({
      evaluate: async () => {
        throw new Error("SECRET provider payload");
      },
    }),
  );
  assert.equal(provider.status, "error");
  assert.equal(provider.calls[0].status, "failed");
  assert.equal(provider.calls[0].errorCode, "provider_failed");
  assert.equal(JSON.stringify(provider).includes("SECRET"), false);
  const step = await runLoop(
    { count: 0 },
    () => {
      throw new Error("SECRET step body");
    },
    options(),
  );
  assert.equal(step.status, "error");
  assert.equal(JSON.stringify(step).includes("SECRET"), false);
});

test("mutating delivered answers cannot forge the internal exit evidence", async () => {
  const report = await runLoop(
    { count: 0 },
    async (state, context) => {
      const call = await context.evaluate(request);
      call.answers.exit = answer("done");
      return {
        state: { count: state.count + 1 },
        consumedCallIds: [call.callId],
        exitCallId: call.callId,
      };
    },
    options({ maxRounds: 1, evaluate: async () => ({ answers: { exit: answer("more") } }) }),
  );
  assert.equal(report.status, "max_rounds");
});

test("exit question labels must match policy before a provider is invoked", async () => {
  let count = 0;
  const report = await runLoop(
    { count: 0 },
    async (state, context) => {
      const call = await context.evaluate({
        ...request,
        questions: { exit: { type: "boolean", instructions: "Exit?" } },
      });
      return { state, consumedCallIds: [call.callId], exitCallId: call.callId };
    },
    options({
      evaluate: async () => {
        count++;
        return { answers: {} };
      },
    }),
  );
  assert.equal(report.status, "error");
  assert.equal(count, 0);
});

test("a fabricated complete status is rejected at the runtime step boundary", async () => {
  const initial = { count: 0 };
  const invalidStep = () => ({
    state: initial,
    status: "complete" as const,
    consumedCallIds: [],
  });
  // @ts-expect-error Completion must come from a recorded exit judgment, even when untyped callers try to bypass it.
  const report = await runLoop({ count: 0 }, invalidStep, options());
  assert.equal(report.status, "review");
  assert.equal(report.reason, "invalid_step_result");
});

test("already-aborted loops perform no step or provider work", async () => {
  const controller = new AbortController();
  controller.abort();
  const report = await runLoop(
    { count: 0 },
    () => {
      throw new Error("Step should not run");
    },
    options({ signal: controller.signal }),
  );
  assert.equal(report.status, "cancelled");
  assert.deepEqual(report.rounds, []);
  assert.deepEqual(report.calls, []);
});

test("policy and limits are captured before callbacks can mutate caller configuration", async () => {
  const settings = options({
    maxRounds: 1,
    exitPolicy: { ...policy, labels: { ...policy.labels } },
    evaluate: async () => ({ answers: { exit: answer("more") } }),
  });
  const report = await runLoop(
    { count: 0 },
    async (state, context) => {
      settings.maxRounds = 100;
      settings.exitPolicy.labels.more = "complete";
      const call = await context.evaluate(request);
      assert.ok(call.answers.exit.probabilities);
      call.answers.exit.probabilities.done = 0.98;
      call.answers.exit.probabilities.more = 0.01;
      return {
        state: { count: state.count + 1 },
        consumedCallIds: [call.callId],
        exitCallId: call.callId,
      };
    },
    settings,
  );
  assert.equal(report.status, "max_rounds");
  assert.equal(report.limits.maxRounds, 1);
  assert.equal(report.exitPolicy.labels.more, "continue");
  assert.equal(report.rounds[0].exitObservation?.answer.choice, "more");
});

test("canonical evidence hashes ignore object-key order but retain changed values", () => {
  assert.equal(hashLoopValue({ b: [2, 3], a: 1 }), hashLoopValue({ a: 1, b: [2, 3] }));
  assert.notEqual(hashLoopValue({ a: 1 }), hashLoopValue({ a: 2 }));
});

test("invalid limits, malformed responses and manual review have distinct outcomes", async () => {
  await assert.rejects(
    runLoop({ count: 0 }, (state) => ({ state, consumedCallIds: [] }), options({ maxCalls: 0 })),
    /invalid_limits/,
  );
  const invalid = await runLoop(
    { count: 0 },
    async (state, context) => {
      const call = await context.evaluate(request);
      return { state, consumedCallIds: [call.callId], exitCallId: call.callId };
    },
    options({ evaluate: async () => ({ answers: { wrong: answer() } }) }),
  );
  assert.equal(invalid.status, "error");
  assert.equal(invalid.calls[0].errorCode, "invalid_response");
  const review = await runLoop(
    { count: 0 },
    (state) => ({ state, consumedCallIds: [], status: "review" }),
    options(),
  );
  assert.equal(review.status, "review");
  assert.equal(review.reason, "requested_review");
  assert.equal(review.calls.length, 0);
});
