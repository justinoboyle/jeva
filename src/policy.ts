import { Schema } from "effect";

export type ExitPolicy = { minProbability?: number; expect?: string };
const BooleanAnswer = Schema.Struct({ type: Schema.Literal("boolean"), probability: Schema.Number });
const ChoiceAnswer = Schema.Struct({ type: Schema.Literal("choice"), choice: Schema.String, probabilities: Schema.Record(Schema.String, Schema.Number) });
const decode = Schema.decodeUnknownSync(Schema.Union([BooleanAnswer, ChoiceAnswer]));

export function validatePolicy(policy: ExitPolicy, type: string, choices: string[]) {
  if (policy.minProbability !== undefined && (!Number.isFinite(policy.minProbability) || policy.minProbability < 0 || policy.minProbability > 1)) {
    throw new Error("--min-probability must be a number in [0, 1]");
  }
  if (type === "score" && (policy.minProbability !== undefined || policy.expect !== undefined)) {
    throw new Error("Exit gates support Choice and Boolean; use --json and numeric comparisons for Score.");
  }
  if (policy.expect !== undefined && !(type === "boolean" ? ["true", "false"] : choices).includes(policy.expect)) {
    throw new Error("--expect must name a declared option (or true/false for Boolean)");
  }
}

export function decisionExitCode(raw: unknown, policy: ExitPolicy): 0 | 3 | 4 {
  if (policy.minProbability === undefined && policy.expect === undefined) return 0;
  let answer;
  try { answer = decode(raw); } catch { throw new Error("Exit gate requires a valid answer with probabilities"); }
  let selected: string;
  let probability: number;
  let tied = false;
  if (answer.type === "boolean") {
    if (answer.probability < 0 || answer.probability > 1) throw new Error("Invalid Boolean probability");
    selected = answer.probability >= 0.5 ? "true" : "false";
    probability = Math.max(answer.probability, 1 - answer.probability);
    tied = answer.probability === 0.5;
  } else {
    const entries = Object.entries(answer.probabilities);
    if (entries.length < 2 || !Object.hasOwn(answer.probabilities, answer.choice) ||
        entries.some(([, value]) => value < 0 || value > 1 || !Number.isFinite(value)) ||
        Math.abs(entries.reduce((sum, [, value]) => sum + value, 0) - 1) > 0.01) throw new Error("Invalid Choice probabilities");
    selected = answer.choice;
    probability = answer.probabilities[selected];
    const runnerUp = Math.max(...entries.filter(([key]) => key !== selected).map(([, value]) => value));
    if (probability < runnerUp) throw new Error("Choice is inconsistent with probabilities");
    tied = probability === runnerUp;
  }
  if (tied || probability < (policy.minProbability ?? 0)) return 3;
  if (policy.expect !== undefined && selected !== policy.expect) return 4;
  return 0;
}
