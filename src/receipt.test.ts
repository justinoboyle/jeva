import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Predicate } from "effect";
import { defineProgram } from "./program.js";
import { recordProgram, verifyReceipt, type ExecutionReceipt } from "./receipt.js";

const program = defineProgram({
  nodes: [
    {
      id: "observe",
      question: () => ({
        type: "boolean" as const,
        instructions: "Does `input` meet the requirement?",
      }),
    },
    {
      id: "followup",
      dependsOn: ["observe"],
      question: () => ({
        type: "boolean" as const,
        instructions: "Does `answers.observe` support the next step?",
      }),
    },
  ],
});
const evaluator = async ({ questions }: { questions: Record<string, unknown> }) => ({
  answers: Object.fromEntries(
    Object.keys(questions).map((id) => [id, { type: "boolean", probability: 0.98 }]),
  ),
});
const options = { programId: "receipt-test", mode: "fixture" as const };

test("receipts bind observed calls, graph and JSON input without raw source or state", async () => {
  const secret = "private-source-value-never-record";
  const recorded = await recordProgram(program, { secret }, evaluator, options);
  assert.equal(recorded.answers?.followup.probability, 0.98);
  assert.deepEqual(
    recorded.receipt.events.map((event) => event.kind),
    ["call-start", "call-success", "call-start", "call-success", "run-end"],
  );
  assert.equal(JSON.stringify(recorded.receipt).includes(secret), false);
  assert.equal(JSON.stringify(recorded.receipt).includes("Does `input`"), false);
  const verified = verifyReceipt(recorded.receipt, {
    expectedDigest: recorded.receipt.digest,
    minSuccessfulCalls: 2,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.anchored, true);
  assert.equal(verified.successfulCalls, 2);
  assert.equal(verified.live, false);
  assert.ok(verified.limitations.some((item) => item.includes("authenticity")));
});

test("verification rejects corruption, truncation, duplicate calls and fixture-as-live", async () => {
  const { receipt } = await recordProgram(program, "input", evaluator, options);
  assert.equal(verifyReceipt(receipt, { requireLive: true }).ok, false);
  assert.equal(verifyReceipt(receipt, { expectedDigest: "0".repeat(64) }).ok, false);
  assert.equal(verifyReceipt({ ...receipt, events: receipt.events.slice(0, -1) }).ok, false);
  assert.equal(
    verifyReceipt({
      ...receipt,
      events: [...receipt.events.slice(0, 1), receipt.events[0], ...receipt.events.slice(1)],
    }).ok,
    false,
  );
  assert.equal(
    verifyReceipt({ ...receipt, header: { ...receipt.header, programId: "changed" } }).ok,
    false,
  );
  assert.equal(verifyReceipt({ arbitrary: true }).ok, false);
  assert.equal(verifyReceipt(receipt, { minSuccessfulCalls: -1 }).ok, false);
});

test("failed evaluator calls preserve redacted failure receipts and cannot pass", async () => {
  const { answers, receipt } = await recordProgram(
    program,
    {},
    async () => {
      throw new Error("secret-key-and-provider-prompt");
    },
    options,
  );
  assert.equal(answers, undefined);
  assert.deepEqual(
    receipt.events.map((event) => event.kind),
    ["call-start", "call-error", "run-end"],
  );
  assert.equal(JSON.stringify(receipt).includes("secret-key"), false);
  const verified = verifyReceipt(receipt);
  assert.equal(verified.ok, false);
  assert.equal(verified.successfulCalls, 0);
});

test("missing response IDs and configured call limits produce failed receipts", async () => {
  const missing = await recordProgram(program, {}, async () => ({ answers: {} }), options);
  assert.equal(missing.answers, undefined);
  assert.equal(verifyReceipt(missing.receipt).ok, false);
  let calls = 0;
  const limited = await recordProgram(
    program,
    {},
    async (request) => {
      calls++;
      return evaluator(request);
    },
    { ...options, maxCalls: 1 },
  );
  assert.equal(calls, 1);
  assert.equal(limited.answers, undefined);
  assert.equal(verifyReceipt(limited.receipt).ok, false);
  assert.equal(limited.receipt.events.at(-1)?.kind, "run-end");
  const terminal = limited.receipt.events.at(-1);
  assert.ok(terminal?.kind === "run-end");
  assert.equal(terminal.failureCode, "call-limit");
});

test("task-only programs do not count as model use and live mode remains a declaration", async () => {
  const tasks = defineProgram({ nodes: [{ id: "task", run: () => ({ value: 1 }) }] });
  const { receipt } = await recordProgram(tasks, {}, evaluator, {
    ...options,
    mode: "live",
    maxCalls: 0,
  });
  assert.equal(verifyReceipt(receipt).ok, true);
  assert.equal(verifyReceipt(receipt, { requireLive: true }).ok, false);
  assert.equal(verifyReceipt(receipt, { requireLive: true, minSuccessfulCalls: 1 }).ok, false);
  assert.equal(verifyReceipt(receipt).anchored, false);
});

test("input digests are stable across key order and artifact digests are bound", async () => {
  const first = await recordProgram(program, { b: 2, a: 1 }, evaluator, {
    ...options,
    artifactDigest: "a".repeat(64),
  });
  const second = await recordProgram(program, { a: 1, b: 2 }, evaluator, options);
  assert.equal(first.receipt.header.inputDigest, second.receipt.header.inputDigest);
  assert.equal(first.receipt.header.programDigest, second.receipt.header.programDigest);
  assert.notEqual(first.receipt.header.runId, second.receipt.header.runId);
  assert.equal(
    verifyReceipt({
      ...first.receipt,
      header: { ...first.receipt.header, artifactDigest: "b".repeat(64) },
    }).ok,
    false,
  );
});

test("canonical input digests distinguish arrays from objects and preserve array order", async () => {
  const receipts = await Promise.all(
    [[], {}, [1, 2], { 0: 1, 1: 2 }, [2, 1]].map(
      async (input) => (await recordProgram(program, input, evaluator, options)).receipt,
    ),
  );
  assert.equal(
    new Set(receipts.map((receipt) => receipt.header.inputDigest)).size,
    receipts.length,
  );
});

test("verifier rejects unbound fields and nonfinite metadata without throwing", async () => {
  const { receipt } = await recordProgram(program, {}, evaluator, options);
  assert.equal(verifyReceipt({ ...receipt, unbound: "text" }).ok, false);
  assert.equal(
    verifyReceipt({ ...receipt, header: { ...receipt.header, unbound: "text" } }).ok,
    false,
  );
  const events = receipt.events.map((event) =>
    event.kind === "call-success"
      ? { ...event, answers: event.answers.map((answer) => ({ ...answer, probability: Infinity })) }
      : event,
  );
  assert.equal(verifyReceipt({ ...receipt, events }).ok, false);
});

const digest = (value: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item: unknown) => {
        if (!Predicate.isObject(item)) return item;
        const entries = Object.entries(item);
        entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return Object.fromEntries(entries);
      }),
    )
    .digest("hex");

// Recompute an unsigned chain to test semantic checks independently of stale hashes.
function rechain(receipt: ExecutionReceipt): ExecutionReceipt {
  const headerDigest = digest(receipt.header);
  let previousDigest = headerDigest;
  const events = receipt.events.map((event) => {
    const { digest: _old, ...rest } = event;
    const data = { ...rest, previousDigest };
    const replacement = { ...data, digest: digest(data) };
    previousDigest = replacement.digest;
    return replacement;
  });
  return { ...receipt, headerDigest, events, digest: previousDigest };
}

test("self-consistent forged chains cannot bypass duplicate, missing or mismatched call checks", async () => {
  const { receipt } = await recordProgram(program, {}, evaluator, options);
  const duplicate = rechain({
    ...receipt,
    events: receipt.events.map((event) =>
      "callId" in event && event.callId.endsWith(":1")
        ? { ...event, callId: `${receipt.header.runId}:0` }
        : event,
    ),
  });
  assert.ok(verifyReceipt(duplicate).issues.includes("Duplicate call ID"));
  const missing = rechain({
    ...receipt,
    events: receipt.events.filter((event) => event.kind !== "call-success"),
  });
  assert.ok(verifyReceipt(missing).issues.includes("An evaluator call has no outcome"));
  const mismatch = rechain({
    ...receipt,
    events: receipt.events.map((event) =>
      event.kind === "call-success"
        ? { ...event, answers: event.answers.map((answer) => ({ ...answer, id: "unrequested" })) }
        : event,
    ),
  });
  assert.ok(verifyReceipt(mismatch).issues.includes("Response IDs do not match the request"));
  const relabeled = rechain({ ...receipt, header: { ...receipt.header, mode: "live" } });
  assert.equal(verifyReceipt(relabeled, { requireLive: true }).ok, true);
  assert.equal(verifyReceipt(relabeled, { expectedDigest: receipt.digest }).ok, false);
  const graph = receipt.header.graph.map((node) =>
    node.id === "followup" ? { ...node, dependsOn: ["absent"] } : node,
  );
  const invalidGraph = rechain({
    ...receipt,
    header: { ...receipt.header, graph, programDigest: digest(graph) },
  });
  assert.ok(verifyReceipt(invalidGraph).issues.includes("Invalid program graph references"));
});

test("invalid options and non-JSON inputs fail before invoking the evaluator", async () => {
  let called = false;
  const judge = async () => {
    called = true;
    return { answers: {} };
  };
  await assert.rejects(recordProgram(program, {}, judge, { ...options, maxCalls: -1 }));
  await assert.rejects(recordProgram(program, { bad: undefined }, judge, options));
  assert.equal(called, false);
});

test("deadlines seal pending calls and late evaluator completion cannot mutate a receipt", async () => {
  let complete: ((value: Awaited<ReturnType<typeof evaluator>>) => void) | undefined;
  const { receipt } = await recordProgram(
    program,
    {},
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    { ...options, timeoutMs: 15 },
  );
  assert.equal(verifyReceipt(receipt).ok, false);
  const sealed = JSON.stringify(receipt);
  complete?.({ answers: { observe: { type: "boolean", probability: 0.98 } } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(JSON.stringify(receipt), sealed);
  assert.ok(receipt.events.some((event) => event.kind === "call-error"));
});
