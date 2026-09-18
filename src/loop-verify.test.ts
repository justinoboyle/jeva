import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "effect";
import { runLoop, decideLoopExit, type LoopExitPolicy } from "./loop.js";
import { verifyLoopReport } from "./loop-verify.js";

const policy: LoopExitPolicy = {
  answerId: "exit",
  labels: { done: "complete", more: "continue", unknown: "review" },
  minProbability: 0.9,
  minMargin: 0.2,
};
async function recordedLoop() {
  return runLoop(
    { n: 0 },
    async (state, ctx) => {
      const result = await ctx.evaluate({
        state,
        questions: {
          exit: {
            type: "choice",
            instructions: "Classify input",
            criteria: { done: "complete", more: "continue", unknown: "review" },
          },
        },
      });
      return { state, consumedCallIds: [result.callId], exitCallId: result.callId };
    },
    {
      stateSchema: Schema.Struct({ n: Schema.Number }),
      mode: "fixture",
      maxCalls: 2,
      maxRounds: 2,
      exitPolicy: policy,
      evaluate: async () => ({
        answers: {
          exit: {
            type: "choice",
            choice: "done",
            probabilities: { done: 0.98, more: 0.01, unknown: 0.01 },
          },
        },
      }),
    },
  );
}

test("loop report verifier replays actual recorded exit and refuses fixture-as-live", async () => {
  const report = await recordedLoop();
  assert.equal(report.status, "complete");
  const verification = verifyLoopReport(report, { requireComplete: true });
  assert.equal(verification.ok, true, JSON.stringify(verification));
  assert.equal(verifyLoopReport(report, { requireLive: true }).ok, false);
  assert.equal(verifyLoopReport(report, { expectedDigest: "0".repeat(64) }).ok, false);
  assert.equal(verifyLoopReport(report, { expectedDigest: verification.digest }).ok, true);
});

test("loop report verifier rejects changed answer, invented use, false exit, and missing calls", async () => {
  const original = await recordedLoop();
  const changed = structuredClone(original);
  assert.ok(changed.rounds[0].exitObservation);
  changed.rounds[0].exitObservation.answer = {
    ...changed.rounds[0].exitObservation.answer,
    probabilities: { done: 0.5, more: 0.49, unknown: 0.01 },
  };
  assert.equal(verifyLoopReport(changed).ok, false);
  const invented = structuredClone(original);
  invented.rounds[0].consumedCallIds = ["invented"];
  assert.equal(verifyLoopReport(invented).ok, false);
  const missing = structuredClone(original);
  missing.calls = [];
  assert.equal(verifyLoopReport(missing).ok, false);
  const falseExit = structuredClone(original);
  falseExit.rounds[0].exit = { status: "continue", reason: "accepted_label" };
  assert.equal(verifyLoopReport(falseExit).ok, false);
  assert.equal(verifyLoopReport({ ...original, unexpected: true }).ok, false);
});

test("finite probability grid obeys the completion conjunction and unknown always reviews", () => {
  for (let percent = 0; percent <= 100; percent++) {
    const p = percent / 100;
    const choice = p >= 0.5 ? "done" : "more";
    const decision = decideLoopExit(
      { type: "choice", choice, probabilities: { done: p, more: 1 - p, unknown: 0 } },
      policy,
    );
    assert.equal(
      decision.status === "complete",
      choice === "done" && p >= 0.9 && p - (1 - p) >= 0.2,
    );
  }
  assert.equal(
    decideLoopExit(
      { type: "choice", choice: "unknown", probabilities: { done: 0, more: 0, unknown: 1 } },
      policy,
    ).status,
    "review",
  );
});

test("honest review reports verify directly but cannot fabricate budgets, limits, or live use", async () => {
  const report = await runLoop(
    { n: 0 },
    async (state) => ({ state, consumedCallIds: [], status: "review" }),
    {
      stateSchema: Schema.Struct({ n: Schema.Number }),
      mode: "live",
      maxCalls: 2,
      maxRounds: 2,
      exitPolicy: policy,
      evaluate: async () => {
        throw new Error("Must not run");
      },
    },
  );
  assert.equal(verifyLoopReport(report).ok, true);
  assert.equal(verifyLoopReport(report, { requireLive: true }).ok, false);
  assert.equal(verifyLoopReport({ ...report, status: "max_calls" }).ok, false);
  assert.equal(
    verifyLoopReport({ ...report, limits: { ...report.limits, concurrency: -1 } }).ok,
    false,
  );
  assert.equal(
    verifyLoopReport({ ...report, limits: { ...report.limits, timeoutMs: 0 } }).ok,
    false,
  );
  assert.equal(
    verifyLoopReport({ ...report, exitPolicy: { ...policy, labels: {}, minProbability: 2 } }).ok,
    false,
  );
  const complete = await recordedLoop();
  delete complete.rounds[0].stateAfterHash;
  assert.equal(verifyLoopReport(complete, { requireComplete: true }).ok, false);
});

test("report replay rejects continuation after stalling and nonchronological call rounds", async () => {
  const report = await runLoop(
    { n: 0 },
    async (state, ctx) => {
      const call = await ctx.evaluate({
        state,
        questions: {
          exit: {
            type: "choice",
            instructions: "Classify",
            criteria: { done: "done", more: "more", unknown: "unknown" },
          },
        },
      });
      return { state: { n: state.n + 1 }, consumedCallIds: [call.callId], exitCallId: call.callId };
    },
    {
      stateSchema: Schema.Struct({ n: Schema.Number }),
      mode: "fixture",
      maxCalls: 3,
      maxRounds: 2,
      exitPolicy: policy,
      evaluate: async () => ({
        answers: {
          exit: { type: "choice", choice: "more", probabilities: { done: 0, more: 1, unknown: 0 } },
        },
      }),
    },
  );
  assert.equal(verifyLoopReport(report).ok, true);
  const stalled = structuredClone(report);
  assert.ok(stalled.rounds[0].stateAfterHash);
  stalled.rounds[0].stateBeforeHash = stalled.rounds[0].stateAfterHash;
  assert.ok(verifyLoopReport(stalled).issues.includes("continued_after_stall"));
  const reordered = structuredClone(report);
  reordered.calls[0].round = 2;
  reordered.calls[1].round = 1;
  assert.ok(verifyLoopReport(reordered).issues.includes("call_round_order"));
});
