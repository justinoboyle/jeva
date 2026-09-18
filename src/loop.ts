import { createHash } from "node:crypto";
import { Schema } from "effect";
import type { Answer, Awaitable, Evaluate } from "./program.js";

export type LoopExitStatus = "complete" | "continue" | "review";
export type LoopExitPolicy = {
  answerId: string;
  labels: Record<string, LoopExitStatus>;
  minProbability: number;
  minMargin: number;
};
export type LoopExitDecision = {
  status: LoopExitStatus;
  reason: "accepted_label" | "uncertain" | "invalid_answer";
  choice?: string;
  probability?: number;
  margin?: number;
};
export type LoopLimits = {
  maxRounds: number;
  maxCalls: number;
  concurrency?: number;
  timeoutMs?: number;
};
export type LoopCallResult = { callId: string; answers: Record<string, Answer> };
export type LoopContext = {
  readonly round: number;
  readonly signal: AbortSignal;
  readonly remainingCalls: number;
  evaluate: (request: Omit<Parameters<Evaluate>[0], "signal">) => Promise<LoopCallResult>;
};
export type LoopStepResult<S> = {
  state: S;
  consumedCallIds: string[];
  exitCallId?: string;
  status?: "continue" | "review";
};
export type LoopStep<S> = (state: S, context: LoopContext) => Awaitable<LoopStepResult<S>>;
export type LoopOptions<S> = LoopLimits & {
  stateSchema: Schema.Decoder<S>;
  evaluate: Evaluate;
  exitPolicy: LoopExitPolicy;
  mode: "fixture" | "live";
  signal?: AbortSignal;
};
export type LoopDefinition<S> = {
  initialState: S;
  stateSchema: Schema.Decoder<S>;
  step: LoopStep<S>;
  exitPolicy: LoopExitPolicy;
  limits: LoopLimits;
};
export type LoopStatus =
  | "complete"
  | "review"
  | "stalled"
  | "max_rounds"
  | "max_calls"
  | "timeout"
  | "cancelled"
  | "error";
export type LoopCallEvidence = {
  id: string;
  round: number;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  requestHash: string;
  resultHash?: string;
  answerHashes?: Record<string, string>;
  errorCode?: string;
};
export type LoopRoundEvidence = {
  round: number;
  stateBeforeHash: string;
  stateAfterHash?: string;
  consumedCallIds: string[];
  exitCallId?: string;
  exit?: LoopExitDecision;
  exitObservation?: { callId: string; answerId: string; answer: typeof ChoiceAnswer.Type };
};
export type LoopReport<S> = {
  status: LoopStatus;
  reason: string;
  mode: "fixture" | "live";
  state: S;
  limits: Required<LoopLimits>;
  exitPolicy: LoopExitPolicy;
  rounds: LoopRoundEvidence[];
  calls: LoopCallEvidence[];
};

const ExitStatus = Schema.Literals(["complete", "continue", "review"]);
export const LoopExitPolicySchema = Schema.Struct({
  answerId: Schema.String,
  labels: Schema.Record(Schema.String, ExitStatus),
  minProbability: Schema.Number,
  minMargin: Schema.Number,
});
export const LoopLimitsSchema = Schema.Struct({
  maxRounds: Schema.Number,
  maxCalls: Schema.Number,
  concurrency: Schema.optional(Schema.Number),
  timeoutMs: Schema.optional(Schema.Number),
});
const ChoiceAnswer = Schema.Struct({
  type: Schema.Literal("choice"),
  choice: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Number),
});
const Question = Schema.Struct({
  type: Schema.Literals(["choice", "boolean", "score"]),
  instructions: Schema.String,
  criteria: Schema.optional(
    Schema.Union([Schema.Record(Schema.String, Schema.String), Schema.Array(Schema.String)]),
  ),
});
const Request = Schema.Struct({
  state: Schema.Json,
  questions: Schema.Record(Schema.String, Question),
});
const Response = Schema.Struct({ answers: Schema.Record(Schema.String, Schema.JsonObject) });
const StepResult = Schema.Struct({
  state: Schema.Json,
  consumedCallIds: Schema.Array(Schema.String),
  exitCallId: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Literals(["continue", "review"])),
});
const decodeChoice = Schema.decodeUnknownSync(ChoiceAnswer);
const decodeJson = Schema.decodeUnknownSync(Schema.Json);
type Json = typeof Schema.Json.Type;

/** Errors contain fixed codes only: never include provider bodies or input data. */
export class LoopError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LoopError";
  }
}

export function decodeLoopExitPolicy(value: unknown): LoopExitPolicy {
  let policy: typeof LoopExitPolicySchema.Type;
  try {
    policy = Schema.decodeUnknownSync(LoopExitPolicySchema)(value);
  } catch {
    throw new LoopError("invalid_policy");
  }
  if (
    !policy.answerId.trim() ||
    Object.keys(policy.labels).length < 2 ||
    !Object.values(policy.labels).includes("complete") ||
    !Object.keys(policy.labels).every((label) => label.trim()) ||
    !Number.isFinite(policy.minProbability) ||
    policy.minProbability < 0 ||
    policy.minProbability > 1 ||
    !Number.isFinite(policy.minMargin) ||
    policy.minMargin < 0 ||
    policy.minMargin > 1
  )
    throw new LoopError("invalid_policy");
  return policy;
}

export function decideLoopExit(raw: unknown, exitPolicy: LoopExitPolicy): LoopExitDecision {
  const policy = decodeLoopExitPolicy(exitPolicy);
  try {
    const answer = decodeChoice(raw);
    const entries = Object.entries(answer.probabilities);
    const labels = Object.keys(policy.labels);
    if (
      entries.length !== labels.length ||
      !labels.every((label) => Object.hasOwn(answer.probabilities, label)) ||
      !Object.hasOwn(policy.labels, answer.choice) ||
      entries.some(([, p]) => !Number.isFinite(p) || p < 0 || p > 1) ||
      Math.abs(entries.reduce((total, [, p]) => total + p, 0) - 1) > 0.01
    )
      return { status: "review", reason: "invalid_answer" };
    const probability = answer.probabilities[answer.choice];
    const margin =
      probability -
      Math.max(...entries.filter(([label]) => label !== answer.choice).map(([, p]) => p));
    if (margin < 0) return { status: "review", reason: "invalid_answer" };
    if (margin === 0 || margin < policy.minMargin || probability < policy.minProbability)
      return { status: "review", reason: "uncertain", choice: answer.choice, probability, margin };
    return {
      status: policy.labels[answer.choice],
      reason: "accepted_label",
      choice: answer.choice,
      probability,
      margin,
    };
  } catch {
    return { status: "review", reason: "invalid_answer" };
  }
}

function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = Schema.decodeUnknownSync(Schema.JsonObject)(value);
    const keys = Object.keys(object);
    keys.sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function hashLoopValue(value: unknown): string {
  return createHash("sha256")
    .update(canonical(decodeJson(value)))
    .digest("hex");
}
const hash = hashLoopValue;
function copyJson(value: unknown): Json {
  const text = JSON.stringify(decodeJson(value));
  if (Buffer.byteLength(text) > 1_048_576) throw new LoopError("json_size_limit");
  return decodeJson(JSON.parse(text));
}

/** Bounded controller evidence is not proof of private cognition or model accuracy. */
export async function runLoop<S>(
  initialState: S,
  step: LoopStep<S>,
  options: LoopOptions<S>,
): Promise<LoopReport<S>> {
  const policy = decodeLoopExitPolicy(options.exitPolicy);
  const maxRounds = options.maxRounds;
  const maxCalls = options.maxCalls;
  const concurrency = options.concurrency ?? 4;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const limits = { maxRounds, maxCalls, concurrency, timeoutMs };
  const evaluate = options.evaluate;
  const signal = options.signal;
  let mode: "fixture" | "live";
  try {
    mode = Schema.decodeUnknownSync(Schema.Literals(["fixture", "live"]))(options.mode);
  } catch {
    throw new LoopError("invalid_mode");
  }
  for (const [value, maximum] of [
    [maxRounds, 1000],
    [maxCalls, 10_000],
    [concurrency, 128],
    [timeoutMs, 2_147_483_647],
  ]) {
    if (!Number.isInteger(value) || value < 1 || value > maximum)
      throw new LoopError("invalid_limits");
  }
  const decodeState = Schema.decodeUnknownSync(options.stateSchema);
  let state: S;
  try {
    state = decodeState(copyJson(initialState));
  } catch {
    throw new LoopError("invalid_initial_state");
  }
  const calls: LoopCallEvidence[] = [];
  const rounds: LoopRoundEvidence[] = [];
  const stored = new Map<string, Answer>();
  const controller = new AbortController();
  let terminal: LoopStatus | undefined;
  let active = 0;
  let finished = false;
  const waiting: { resolve: (release: () => void) => void; reject: (error: LoopError) => void }[] =
    [];
  const stop = (status: "cancelled" | "timeout" | "max_calls") => {
    if (controller.signal.aborted || finished) return;
    terminal = status;
    controller.abort(new LoopError(status));
    for (const queued of waiting.splice(0)) queued.reject(new LoopError(status));
    for (const call of calls)
      if (call.status === "queued" || call.status === "running") {
        call.status = "cancelled";
        call.errorCode = status;
      }
  };
  const abort = () => stop("cancelled");
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => stop("timeout"), timeoutMs);
  let rejectOnAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => {
      reject(new LoopError(terminal ?? "cancelled"));
    };
    controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    if (controller.signal.aborted) rejectOnAbort();
  });
  const check = () => {
    if (controller.signal.aborted || finished) throw new LoopError(terminal ?? "closed");
  };
  const release = () => {
    active--;
    if (controller.signal.aborted || finished) return;
    const next = waiting.shift();
    if (next) {
      active++;
      next.resolve(release);
    }
  };
  const acquire = (): Promise<() => void> => {
    check();
    if (active < concurrency) {
      active++;
      return Promise.resolve(release);
    }
    return new Promise((resolve, reject) => {
      waiting.push({ resolve, reject });
    });
  };
  const report = (status: LoopStatus, reason: string): LoopReport<S> => {
    for (const call of calls)
      if (call.status === "queued" || call.status === "running") {
        call.status = "cancelled";
        call.errorCode = "loop_closed";
      }
    return {
      status,
      reason,
      mode,
      limits: { ...limits },
      state: decodeState(copyJson(state)),
      exitPolicy: decodeLoopExitPolicy(policy),
      rounds: rounds.map((round) => ({ ...round, consumedCallIds: [...round.consumedCallIds] })),
      calls: calls.map((call) => ({
        ...call,
        answerHashes: call.answerHashes ? { ...call.answerHashes } : undefined,
      })),
    };
  };

  async function execute(): Promise<LoopReport<S>> {
    for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber++) {
      check();
      if (calls.length >= maxCalls) return report("max_calls", "call_budget_exhausted");
      let open = true;
      const round: LoopRoundEvidence = {
        round: roundNumber,
        stateBeforeHash: hash(state),
        consumedCallIds: [],
      };
      rounds.push(round);
      const pending: Promise<LoopCallResult>[] = [];
      const invoke = async (
        rawRequest: Omit<Parameters<Evaluate>[0], "signal">,
      ): Promise<LoopCallResult> => {
        check();
        if (!open) throw new LoopError("closed_round");
        if (calls.length >= maxCalls) {
          stop("max_calls");
          throw new LoopError("max_calls");
        }
        let request: typeof Request.Type;
        try {
          request = Schema.decodeUnknownSync(Request)(copyJson(rawRequest));
          const exitQuestion = Object.hasOwn(request.questions, policy.answerId)
            ? request.questions[policy.answerId]
            : undefined;
          if (
            !Object.keys(request.questions).length ||
            Object.keys(request.questions).length > 128 ||
            (exitQuestion &&
              (exitQuestion.type !== "choice" ||
                !exitQuestion.criteria ||
                Array.isArray(exitQuestion.criteria) ||
                Object.keys(exitQuestion.criteria).length !== Object.keys(policy.labels).length ||
                !Object.keys(policy.labels).every((label) =>
                  Object.hasOwn(exitQuestion.criteria ?? {}, label),
                )))
          )
            throw new LoopError("invalid_request");
        } catch {
          throw new LoopError("invalid_request");
        }
        const evidence: LoopCallEvidence = {
          id: `call_${calls.length + 1}`,
          round: roundNumber,
          status: "queued",
          requestHash: hash(request),
        };
        calls.push(evidence);
        const done = await acquire();
        try {
          check();
          evidence.status = "running";
          let response: Awaited<ReturnType<Evaluate>>;
          try {
            response = await Promise.race([
              evaluate({ ...request, signal: controller.signal }),
              interrupted,
            ]);
          } catch {
            throw new LoopError(terminal ?? "provider_failed");
          }
          check();
          let answers: Record<string, Answer>;
          try {
            // SDK transport metadata is outside the answer contract and may not be JSON.
            const envelope = Schema.decodeUnknownSync(Response)(response);
            const decoded = Schema.decodeUnknownSync(Response)(copyJson(envelope));
            if (
              Object.keys(decoded.answers).length !== Object.keys(request.questions).length ||
              !Object.keys(request.questions).every((id) => Object.hasOwn(decoded.answers, id))
            )
              throw new LoopError("invalid_response");
            answers = Object.fromEntries(
              Object.entries(decoded.answers).map(([id, value]) => [
                id,
                id === policy.answerId ? decodeChoice(value) : value,
              ]),
            );
          } catch {
            throw new LoopError("invalid_response");
          }
          evidence.status = "succeeded";
          evidence.answerHashes = Object.fromEntries(
            Object.entries(answers).map(([id, value]) => [id, hash(value)]),
          );
          evidence.resultHash = hash({ answers });
          if (Object.hasOwn(answers, policy.answerId))
            stored.set(evidence.id, answers[policy.answerId]);
          return {
            callId: evidence.id,
            answers: Schema.decodeUnknownSync(Response)(copyJson({ answers })).answers,
          };
        } catch (error) {
          if (evidence.status !== "cancelled") {
            evidence.status = "failed";
            evidence.errorCode = error instanceof LoopError ? error.code : "evaluation_failed";
          }
          throw error instanceof LoopError ? error : new LoopError("evaluation_failed");
        } finally {
          done();
        }
      };
      const context: LoopContext = {
        round: roundNumber,
        signal: controller.signal,
        get remainingCalls() {
          return maxCalls - calls.length;
        },
        evaluate: (request) => {
          const promise = invoke(request);
          pending.push(promise);
          void promise.catch(() => {});
          return promise;
        },
      };
      let rawResult: LoopStepResult<S>;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Each round depends on the validated state and exit decision of its predecessor.
        rawResult = await Promise.race([
          Promise.resolve().then(() => step(decodeState(copyJson(state)), context)),
          interrupted,
        ]);
      } catch (error) {
        open = false;
        if (terminal) return report(terminal, terminal);
        return report("error", error instanceof LoopError ? error.code : "step_failed");
      }
      open = false;
      // oxlint-disable-next-line no-await-in-loop -- Finish already-admitted calls before validating a round's consumption and exit.
      await Promise.race([Promise.allSettled(pending), interrupted]);
      check();
      let result: typeof StepResult.Type;
      try {
        result = Schema.decodeUnknownSync(StepResult)(rawResult);
        state = decodeState(copyJson(result.state));
      } catch {
        return report("review", "invalid_step_result");
      }
      round.stateAfterHash = hash(state);
      round.consumedCallIds = [...result.consumedCallIds];
      round.exitCallId = result.exitCallId;
      if (
        new Set(result.consumedCallIds).size !== result.consumedCallIds.length ||
        result.consumedCallIds.some(
          (id) =>
            !calls.some(
              (call) => call.id === id && call.round === roundNumber && call.status === "succeeded",
            ),
        )
      )
        return report("review", "invalid_consumption");
      if (result.status === "review") return report("review", "requested_review");
      if (!result.exitCallId || !result.consumedCallIds.includes(result.exitCallId))
        return report("review", "missing_exit_evidence");
      const exitAnswer = stored.get(result.exitCallId);
      if (!exitAnswer) return report("review", "missing_exit_evidence");
      const answer = decodeChoice(copyJson(exitAnswer));
      round.exitObservation = { callId: result.exitCallId, answerId: policy.answerId, answer };
      round.exit = decideLoopExit(answer, policy);
      if (round.exit.status !== "continue") return report(round.exit.status, round.exit.reason);
      if (round.stateBeforeHash === round.stateAfterHash)
        return report("stalled", "unchanged_state");
    }
    return report("max_rounds", "round_budget_exhausted");
  }
  try {
    return await Promise.race([execute(), interrupted]);
  } catch {
    return report(terminal ?? "error", terminal ?? "controller_failed");
  } finally {
    finished = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    controller.abort(new LoopError("closed"));
    if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
    for (const queued of waiting.splice(0)) queued.reject(new LoopError("closed"));
  }
}
