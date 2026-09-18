import { createHash, randomUUID } from "node:crypto";
import { Predicate, Schema } from "effect";
import {
  ProgramError,
  runProgram,
  type AnswersOf,
  type Evaluate,
  type Program,
  type RunOptions,
} from "./program.js";

const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const Identifier = Schema.String.check(Schema.isMinLength(1));
const Count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const GraphNode = Schema.Struct({
  id: Identifier,
  kind: Schema.Literals(["question", "task"]),
  dependsOn: Schema.Array(Identifier),
  conditional: Schema.Boolean,
  projected: Schema.Boolean,
});
const Header = Schema.Struct({
  version: Schema.Literal(1),
  runId: Identifier,
  programId: Identifier,
  mode: Schema.Literals(["fixture", "live"]),
  maxCalls: Count,
  inputDigest: Digest,
  programDigest: Digest,
  artifactDigest: Schema.optional(Digest),
  graph: Schema.Array(GraphNode),
});
const QuestionMetadata = Schema.Struct({
  id: Identifier,
  type: Schema.Literals(["choice", "boolean", "score"]),
  questionDigest: Digest,
});
const AnswerFields = {
  choice: Schema.optional(Schema.String),
  probability: Schema.optional(Schema.Finite),
  score: Schema.optional(Schema.Finite),
  probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Finite)),
};
const AnswerMetadata = Schema.Struct({ id: Identifier, answerDigest: Digest, ...AnswerFields });
const CallStart = Schema.Struct({
  kind: Schema.Literal("call-start"),
  callId: Identifier,
  requestDigest: Digest,
  questions: Schema.Array(QuestionMetadata),
});
const CallSuccess = Schema.Struct({
  kind: Schema.Literal("call-success"),
  callId: Identifier,
  answers: Schema.Array(AnswerMetadata),
});
const CallError = Schema.Struct({
  kind: Schema.Literal("call-error"),
  callId: Identifier,
  errorCode: Schema.Literals(["evaluation", "invalid-response", "cancelled"]),
});
const RunEnd = Schema.Struct({
  kind: Schema.Literal("run-end"),
  status: Schema.Literals(["succeeded", "failed"]),
  startedCalls: Count,
  successfulCalls: Count,
  failureCode: Schema.optional(Schema.Literals(["execution", "call-limit", "timeout", "aborted"])),
});
const chainFields = { seq: Count, previousDigest: Digest, digest: Digest };
const Event = Schema.Union([
  Schema.Struct({ ...CallStart.fields, ...chainFields }),
  Schema.Struct({ ...CallSuccess.fields, ...chainFields }),
  Schema.Struct({ ...CallError.fields, ...chainFields }),
  Schema.Struct({ ...RunEnd.fields, ...chainFields }),
]);
type EventPayload =
  | typeof CallStart.Type
  | typeof CallSuccess.Type
  | typeof CallError.Type
  | typeof RunEnd.Type;

export const ExecutionReceiptSchema = Schema.Struct({
  header: Header,
  headerDigest: Digest,
  events: Schema.Array(Event),
  digest: Digest,
});
export type ExecutionReceipt = typeof ExecutionReceiptSchema.Type;
export type RecordOptions = RunOptions & {
  programId: string;
  mode: "fixture" | "live";
  maxCalls?: number;
  /** Optional SHA256 of caller-selected artifact bytes; imports are not automatically bound. */
  artifactDigest?: string;
};
export type VerifyOptions = {
  expectedDigest?: string;
  requireLive?: boolean;
  minSuccessfulCalls?: number;
};
export type ReceiptVerification = {
  ok: boolean;
  issues: string[];
  successfulCalls: number;
  live: boolean;
  anchored: boolean;
  limitations: readonly string[];
};
export const receiptLimitations = [
  "Unsigned local receipts do not establish authenticity; live mode is a caller declaration, not provider attestation.",
  "An expected digest detects corruption relative to that separately retained anchor; it is not a signature.",
  "The graph digest binds topology and callback kinds, not function implementations; an artifact digest does not bind transitive imports.",
  "Observed evaluator invocation and response do not prove answer consumption, semantic correctness, cognition, or compilation.",
  "Input/request digests can disclose equality and permit guessing low-entropy values; answer metadata may contain sensitive labels.",
] as const;

/** Canonical key order for already validated JSON; no raw values are retained. */
function hash(value: Schema.Json): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item: unknown) => {
        if (!Predicate.isObject(item)) return item;
        const entries = Object.entries(item);
        // Mutate only the freshly allocated entries array; arrays in input remain ordered.
        entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
        return Object.fromEntries(entries);
      }),
    )
    .digest("hex");
}
const decodeJson = Schema.decodeUnknownSync(Schema.Json);
const decodeEvent = Schema.decodeUnknownSync(Event);
const decodeAnswers = Schema.decodeUnknownSync(
  Schema.Struct({
    answers: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
  }),
);
class RecordingError extends Error {
  constructor(readonly code: "call-limit" | "invalid-response") {
    super(code);
  }
}

/**
 * Wrap actual evaluator calls; never equate reading a skill or constructing a
 * program with invoking its evaluator. Invalid record options/non-JSON input
 * reject before execution. Execution errors return a sealed, redacted receipt.
 */
export async function recordProgram<P extends Program>(
  program: P,
  input: unknown,
  evaluate: Evaluate,
  options: RecordOptions,
): Promise<{ answers?: AnswersOf<P>; receipt: ExecutionReceipt }> {
  const checked = Schema.decodeUnknownSync(
    Schema.Struct({
      programId: Identifier,
      mode: Schema.Literals(["fixture", "live"]),
      maxCalls: Schema.optional(Count),
      artifactDigest: Schema.optional(Digest),
    }),
  )(options);
  const jsonInput = decodeJson(input);
  const graph = program.nodes.map((node) => ({
    id: node.id,
    kind: node.question ? ("question" as const) : ("task" as const),
    dependsOn: [...(node.dependsOn ?? [])],
    conditional: Boolean(node.when),
    projected: Boolean(node.input),
  }));
  const header = Schema.decodeUnknownSync(Header)({
    version: 1,
    runId: randomUUID(),
    programId: checked.programId,
    mode: checked.mode,
    maxCalls: checked.maxCalls ?? 128,
    inputDigest: hash(jsonInput),
    programDigest: hash(graph),
    graph,
    ...(checked.artifactDigest ? { artifactDigest: checked.artifactDigest } : {}),
  });
  const headerDigest = hash(header);
  const events: ExecutionReceipt["events"][number][] = [];
  let previousDigest = headerDigest;
  let successfulCalls = 0;
  let startedCalls = 0;
  let sealed = false;
  const pending = new Set<string>();
  const append = (payload: EventPayload) => {
    if (sealed) return;
    const data = { ...payload, seq: events.length, previousDigest };
    const event = decodeEvent({ ...data, digest: hash(decodeJson(data)) });
    events.push(event);
    previousDigest = event.digest;
  };
  const wrapped: Evaluate = async (request) => {
    if (sealed) throw new RecordingError("call-limit");
    if (startedCalls >= header.maxCalls) throw new RecordingError("call-limit");
    // Reject an unhashable transport request before invoking the evaluator.
    const requestDigest = hash(decodeJson({ state: request.state, questions: request.questions }));
    const questions = Object.entries(request.questions).map(([id, question]) => ({
      id,
      type: question.type,
      questionDigest: hash(decodeJson(question)),
    }));
    const callId = `${header.runId}:${startedCalls}`;
    append({ kind: "call-start", callId, requestDigest, questions });
    startedCalls++;
    pending.add(callId);
    let returned = false;
    try {
      const raw: unknown = await evaluate(request);
      returned = true;
      const result = decodeAnswers(raw);
      const expected = new Set(questions.map((question) => question.id));
      if (
        Object.keys(result.answers).length !== expected.size ||
        Object.keys(result.answers).some((id) => !expected.has(id))
      ) {
        throw new RecordingError("invalid-response");
      }
      // oxlint-disable-next-line oxc/no-map-spread -- Each immutable receipt entry owns its copied metadata.
      const answers = Object.entries(result.answers).map(([id, answer]) => ({
        id,
        answerDigest: hash(decodeJson(answer)),
        ...Schema.decodeUnknownSync(Schema.Struct(AnswerFields))(answer),
      }));
      if (!sealed) {
        append({ kind: "call-success", callId, answers });
        successfulCalls++;
        pending.delete(callId);
      }
      return result;
    } catch (cause) {
      if (!sealed) {
        append({
          kind: "call-error",
          callId,
          errorCode: returned ? "invalid-response" : "evaluation",
        });
        pending.delete(callId);
      }
      throw cause;
    }
  };
  let answers: AnswersOf<P> | undefined;
  let failureCode: (typeof RunEnd.Type)["failureCode"];
  try {
    answers = await runProgram(program, jsonInput, wrapped, options);
  } catch (cause) {
    const inner = cause instanceof ProgramError ? cause.cause : cause;
    failureCode =
      inner instanceof RecordingError && inner.code === "call-limit"
        ? "call-limit"
        : cause instanceof ProgramError && (cause.code === "timeout" || cause.code === "aborted")
          ? cause.code
          : "execution";
  }
  for (const callId of pending) append({ kind: "call-error", callId, errorCode: "cancelled" });
  append({
    kind: "run-end",
    status: failureCode ? "failed" : "succeeded",
    startedCalls,
    successfulCalls,
    ...(failureCode ? { failureCode } : {}),
  });
  sealed = true;
  const receipt = Schema.decodeUnknownSync(ExecutionReceiptSchema)({
    header,
    headerDigest,
    events,
    digest: previousDigest,
  });
  return answers ? { answers, receipt } : { receipt };
}

/** Inspect consistency and a separately supplied anchor, never authenticate a provider. */
export function verifyReceipt(value: unknown, options: VerifyOptions = {}): ReceiptVerification {
  const issues: string[] = [];
  const output: ReceiptVerification = {
    ok: false,
    issues,
    successfulCalls: 0,
    live: false,
    anchored: false,
    limitations: receiptLimitations,
  };
  let receipt: ExecutionReceipt;
  let policy: VerifyOptions;
  try {
    receipt = Schema.decodeUnknownSync(ExecutionReceiptSchema, { onExcessProperty: "error" })(
      value,
    );
    policy = Schema.decodeUnknownSync(
      Schema.Struct({
        expectedDigest: Schema.optional(Digest),
        requireLive: Schema.optional(Schema.Boolean),
        minSuccessfulCalls: Schema.optional(Count),
      }),
    )(options);
  } catch {
    issues.push("Malformed receipt or verification options");
    return output;
  }
  output.live = receipt.header.mode === "live";
  output.anchored = policy.expectedDigest !== undefined && policy.expectedDigest === receipt.digest;
  if (policy.expectedDigest !== undefined && !output.anchored)
    issues.push("Terminal digest differs from the supplied anchor");
  if (policy.requireLive && !output.live)
    issues.push("Fixture receipt cannot establish a live-mode run");
  if (hash(receipt.header) !== receipt.headerDigest) issues.push("Header digest mismatch");
  if (hash(receipt.header.graph) !== receipt.header.programDigest)
    issues.push("Program graph digest mismatch");
  const nodeIds = new Set(receipt.header.graph.map((node) => node.id));
  if (nodeIds.size !== receipt.header.graph.length) issues.push("Duplicate program node IDs");
  if (!nodeIds.size || nodeIds.size > 128) issues.push("Invalid program graph size");
  if (
    receipt.header.graph.some(
      (node) =>
        Object.hasOwn(Object.prototype, node.id) || node.dependsOn.some((id) => !nodeIds.has(id)),
    )
  )
    issues.push("Invalid program graph references");
  const waiting = new Map(receipt.header.graph.map((node) => [node.id, node]));
  const complete = new Set<string>();
  while (waiting.size) {
    const ready = [...waiting.values()].filter((node) =>
      node.dependsOn.every((id) => complete.has(id)),
    );
    if (!ready.length) {
      issues.push("Cyclic program graph");
      break;
    }
    for (const node of ready) {
      complete.add(node.id);
      waiting.delete(node.id);
    }
  }
  const questions = new Set(
    receipt.header.graph.filter((node) => node.kind === "question").map((node) => node.id),
  );
  const calls = new Map<string, { ids: Set<string>; ended: boolean }>();
  const requested = new Set<string>();
  let previous = receipt.headerDigest;
  let terminal: typeof RunEnd.Type | undefined;
  for (const [index, event] of receipt.events.entries()) {
    const { digest: _digest, ...data } = event;
    if (event.seq !== index) issues.push("Event sequence is not contiguous");
    if (event.previousDigest !== previous || hash(decodeJson(data)) !== event.digest)
      issues.push("Event hash chain mismatch");
    previous = event.digest;
    if (terminal) issues.push("Events follow the terminal event");
    if (event.kind === "call-start") {
      if (calls.has(event.callId)) issues.push("Duplicate call ID");
      const ids = new Set(event.questions.map((question) => question.id));
      if (
        !ids.size ||
        ids.size !== event.questions.length ||
        [...ids].some((id) => !questions.has(id) || requested.has(id))
      )
        issues.push("Invalid requested question IDs");
      for (const id of ids) requested.add(id);
      calls.set(event.callId, { ids, ended: false });
    } else if (event.kind === "call-success" || event.kind === "call-error") {
      const call = calls.get(event.callId);
      if (!call || call.ended) {
        issues.push("Call outcome is missing a unique start");
        continue;
      }
      call.ended = true;
      if (event.kind === "call-error") issues.push("Evaluator call failed or was cancelled");
      else {
        const ids = new Set(event.answers.map((answer) => answer.id));
        if (
          ids.size !== event.answers.length ||
          ids.size !== call.ids.size ||
          [...ids].some((id) => !call.ids.has(id))
        )
          issues.push("Response IDs do not match the request");
        output.successfulCalls++;
      }
    } else {
      terminal = event;
      if (event.status !== "succeeded" || event.failureCode) issues.push("Program run failed");
    }
  }
  if (!terminal) issues.push("Missing terminal event");
  if (previous !== receipt.digest) issues.push("Terminal digest mismatch");
  if ([...calls.values()].some((call) => !call.ended))
    issues.push("An evaluator call has no outcome");
  if (calls.size > receipt.header.maxCalls) issues.push("Declared call budget exceeded");
  if (
    terminal &&
    (terminal.startedCalls !== calls.size || terminal.successfulCalls !== output.successfulCalls)
  )
    issues.push("Terminal call counts do not match events");
  if (output.successfulCalls < Math.max(policy.minSuccessfulCalls ?? 0, policy.requireLive ? 1 : 0))
    issues.push("Too few successful evaluator calls");
  output.ok = issues.length === 0;
  return output;
}
