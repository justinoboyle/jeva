import { Schema } from "effect";

export type QuestionType = "choice" | "boolean" | "score";

export type Options = {
  input?: string;
  question?: string;
  type: QuestionType;
  choices: string[];
  criteria: Record<string, string>;
  levels: string[];
  json: boolean;
  probabilities: boolean;
  percentage: boolean;
  confidence: boolean;
  verbose: boolean;
  minProbability?: number;
  expect?: string;
};

export const defaultOptions = (): Options => ({
  type: "choice",
  choices: [],
  criteria: {},
  levels: [],
  json: false,
  probabilities: false,
  percentage: false,
  confidence: false,
  verbose: false,
});

export function parseCriterion(value: string): [string, string] {
  const at = value.indexOf("=");
  if (at < 1 || at === value.length - 1) throw new Error("--criterion must be key=meaning");
  return [value.slice(0, at), value.slice(at + 1)];
}

export function buildRequest(options: Options) {
  if (!options.input?.trim()) throw new Error("Provide input with -i, --file, or stdin.");
  const instructions =
    options.question ??
    (options.type === "choice"
      ? "Which option best describes the input in `input`? Choose only when the option is supported by the input."
      : options.type === "boolean"
        ? "Is the statement or condition described by this input true?"
        : "How strongly does the input match this ordered rubric?");
  if (options.type === "choice") {
    if (options.choices.length < 2)
      throw new Error("Choice questions need at least two -o/--option values.");
    const criteria = Object.fromEntries(
      options.choices.map((choice) => [choice, options.criteria[choice] ?? choice]),
    );
    return {
      state: { input: options.input },
      questions: { answer: { type: "choice" as const, instructions, criteria } },
    };
  }
  if (options.type === "score") {
    if (options.levels.length < 2)
      throw new Error("Score questions need at least two -l/--level descriptions.");
    return {
      state: { input: options.input },
      questions: { answer: { type: "score" as const, instructions, criteria: options.levels } },
    };
  }
  return {
    state: { input: options.input },
    questions: { answer: { type: "boolean" as const, instructions } },
  };
}

const OutputSchema = Schema.Struct({
  answers: Schema.Struct({
    answer: Schema.Struct({
      choice: Schema.optional(Schema.String),
      probability: Schema.optional(Schema.Number),
      score: Schema.optional(Schema.Number),
      probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
      confidence: Schema.optional(Schema.Number),
    }),
  }),
  providerMetadata: Schema.optional(
    Schema.Struct({
      typesafe: Schema.optional(
        Schema.Struct({
          confidence: Schema.optional(Schema.Struct({ answer: Schema.optional(Schema.Number) })),
        }),
      ),
    }),
  ),
});

export function selectOutput(result: unknown, options: Options): unknown {
  if (!Schema.is(OutputSchema)(result)) throw new Error("Invalid evaluation output");
  const answer = result.answers.answer;
  if (options.json) return result;
  if (options.probabilities) {
    if (answer.probabilities) return answer.probabilities;
    if (answer.probability === undefined) throw new Error("Probability output is unavailable");
    return { true: answer.probability, false: 1 - answer.probability };
  }
  if (options.confidence)
    return (
      answer.confidence ??
      result.providerMetadata?.typesafe?.confidence?.answer ??
      Math.abs((answer.probability ?? 0.5) - 0.5) * 2
    );
  if (options.percentage) {
    const value =
      answer.probability ??
      (answer.choice === undefined ? undefined : answer.probabilities?.[answer.choice]) ??
      (answer.score === undefined
        ? undefined
        : answer.score / Math.max(1, options.levels.length - 1));
    if (value === undefined) throw new Error("Percentage output is unavailable");
    return Math.round(value * 10000) / 100;
  }
  return answer.choice ?? answer.score ?? answer.probability;
}
