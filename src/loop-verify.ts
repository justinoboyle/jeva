import { Schema } from "effect";
import {
  decideLoopExit,
  decodeLoopExitPolicy,
  hashLoopValue,
  LoopExitPolicySchema,
  LoopLimitsSchema,
} from "./loop.js";

const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const Positive = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Choice = Schema.Struct({
  type: Schema.Literal("choice"),
  choice: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Number),
});
const Decision = Schema.Struct({
  status: Schema.Literals(["complete", "continue", "review"]),
  reason: Schema.Literals(["accepted_label", "uncertain", "invalid_answer"]),
  choice: Schema.optional(Schema.String),
  probability: Schema.optional(Schema.Number),
  margin: Schema.optional(Schema.Number),
});
const Report = Schema.Struct({
  status: Schema.Literals([
    "complete",
    "review",
    "stalled",
    "max_rounds",
    "max_calls",
    "timeout",
    "cancelled",
    "error",
  ]),
  reason: Schema.String,
  mode: Schema.Literals(["fixture", "live"]),
  state: Schema.Json,
  exitPolicy: LoopExitPolicySchema,
  limits: LoopLimitsSchema,
  rounds: Schema.Array(
    Schema.Struct({
      round: Positive,
      stateBeforeHash: Digest,
      stateAfterHash: Schema.optional(Digest),
      consumedCallIds: Schema.Array(Schema.String),
      exitCallId: Schema.optional(Schema.String),
      exit: Schema.optional(Decision),
      exitObservation: Schema.optional(
        Schema.Struct({ callId: Schema.String, answerId: Schema.String, answer: Choice }),
      ),
    }),
  ),
  calls: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      round: Positive,
      status: Schema.Literals(["queued", "running", "succeeded", "failed", "cancelled"]),
      requestHash: Digest,
      resultHash: Schema.optional(Digest),
      answerHashes: Schema.optional(Schema.Record(Schema.String, Digest)),
      errorCode: Schema.optional(Schema.String),
    }),
  ),
});

export type LoopVerifyOptions = {
  requireLive?: boolean;
  requireComplete?: boolean;
  expectedDigest?: string;
};
export const loopVerificationLimitations = [
  "This replays recorded exits and declared consumption under a trusted controller; it does not inspect hidden reasoning.",
  "Unsigned local reports and caller-declared live mode are forgeable, not provider attestations.",
  "A separately retained digest detects changes relative to that anchor, not semantic errors or malicious authorship.",
  "The verifier checks recorded bounds and links, not actual timing, concurrency, or unseen side effects.",
] as const;

/** Offline verification never executes a callback, imports a program, or calls a model. */
export function verifyLoopReport(value: unknown, options: LoopVerifyOptions = {}) {
  const issues: string[] = [];
  try {
    const report = Schema.decodeUnknownSync(Report, { onExcessProperty: "error" })(value);
    decodeLoopExitPolicy(report.exitPolicy);
    // Optional in-memory properties are omitted in the actual JSON artifact.
    const json: unknown = JSON.parse(JSON.stringify(report));
    const digest = hashLoopValue(json);
    if (options.expectedDigest !== undefined && options.expectedDigest !== digest)
      issues.push("digest_mismatch");
    if (
      options.requireLive &&
      (report.mode !== "live" || !report.calls.some((call) => call.status === "succeeded"))
    )
      issues.push("live_use_not_recorded");
    if (options.requireComplete && report.status !== "complete") issues.push("not_complete");
    if (
      !Number.isInteger(report.limits.maxRounds) ||
      report.limits.maxRounds < 1 ||
      report.limits.maxRounds > 1000 ||
      !Number.isInteger(report.limits.maxCalls) ||
      report.limits.maxCalls < 1 ||
      report.limits.maxCalls > 10000 ||
      !Number.isInteger(report.limits.concurrency) ||
      (report.limits.concurrency ?? 0) < 1 ||
      (report.limits.concurrency ?? 129) > 128 ||
      !Number.isInteger(report.limits.timeoutMs) ||
      (report.limits.timeoutMs ?? 0) < 1 ||
      (report.limits.timeoutMs ?? Infinity) > 2_147_483_647
    )
      issues.push("invalid_limits");
    if (
      report.rounds.length > report.limits.maxRounds ||
      report.calls.length > report.limits.maxCalls
    )
      issues.push("budget_exceeded");
    if (new Set(report.calls.map((call) => call.id)).size !== report.calls.length)
      issues.push("duplicate_calls");
    const calls = new Map(report.calls.map((call) => [call.id, call]));
    for (const [index, call] of report.calls.entries()) {
      if (index > 0 && call.round < report.calls[index - 1].round) issues.push("call_round_order");
      if (call.id !== `call_${index + 1}` || call.round > report.rounds.length)
        issues.push("invalid_call_identity");
      if (call.status === "queued" || call.status === "running") issues.push("unfinished_call");
      if (call.status === "succeeded" && (!call.resultHash || !call.answerHashes || call.errorCode))
        issues.push("invalid_success");
      if (call.status !== "succeeded" && (call.resultHash || call.answerHashes))
        issues.push("failed_call_has_result");
    }
    for (const [index, round] of report.rounds.entries()) {
      if (round.round !== index + 1) issues.push("invalid_round_order");
      if (index > 0 && report.rounds[index - 1].stateAfterHash !== round.stateBeforeHash)
        issues.push("broken_state_chain");
      if (new Set(round.consumedCallIds).size !== round.consumedCallIds.length)
        issues.push("duplicate_consumption");
      for (const id of round.consumedCallIds) {
        const call = calls.get(id);
        if (!call || call.round !== round.round || call.status !== "succeeded")
          issues.push("invalid_consumption");
      }
      const observation = round.exitObservation;
      if (observation) {
        const call = calls.get(observation.callId);
        if (
          !call ||
          call.round !== round.round ||
          call.status !== "succeeded" ||
          !round.consumedCallIds.includes(observation.callId) ||
          round.exitCallId !== observation.callId ||
          observation.answerId !== report.exitPolicy.answerId ||
          call.answerHashes?.[observation.answerId] !== hashLoopValue(observation.answer)
        )
          issues.push("unlinked_exit");
        const replay = decideLoopExit(observation.answer, report.exitPolicy);
        if (!round.exit || hashLoopValue(replay) !== hashLoopValue(round.exit))
          issues.push("exit_replay_mismatch");
      } else if (round.exit) issues.push("missing_exit_observation");
      if (index < report.rounds.length - 1 && round.exit?.status !== "continue")
        issues.push("continued_after_terminal");
      if (index < report.rounds.length - 1 && round.stateBeforeHash === round.stateAfterHash)
        issues.push("continued_after_stall");
    }
    const last = report.rounds.at(-1);
    if (last && hashLoopValue(report.state) !== (last.stateAfterHash ?? last.stateBeforeHash))
      issues.push("final_state_mismatch");
    if (
      report.status === "complete" &&
      (!last?.exitObservation || last.exit?.status !== "complete" || !last.stateAfterHash)
    )
      issues.push("unsupported_completion");
    if (last?.exit?.status === "complete" && report.status !== "complete")
      issues.push("terminal_mismatch");
    if (
      report.status === "stalled" &&
      (!last || last.exit?.status !== "continue" || last.stateAfterHash !== last.stateBeforeHash)
    )
      issues.push("unsupported_stall");
    if (
      report.status === "max_rounds" &&
      (report.rounds.length !== report.limits.maxRounds || last?.exit?.status !== "continue")
    )
      issues.push("unsupported_round_limit");
    if (report.status === "max_calls" && report.calls.length !== report.limits.maxCalls)
      issues.push("unsupported_call_limit");
    return {
      ok: issues.length === 0,
      issues: [...new Set(issues)],
      digest,
      status: report.status,
      successfulCalls: report.calls.filter((call) => call.status === "succeeded").length,
      limitations: loopVerificationLimitations,
    };
  } catch {
    return { ok: false, issues: ["invalid_report"], limitations: loopVerificationLimitations };
  }
}
