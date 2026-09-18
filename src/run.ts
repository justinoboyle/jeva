import { experimental_evaluate as evaluate } from "ai";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runProgram, type DecisionNode } from "./program.js";
import { Effect, Predicate, Schema } from "effect";
import { loadConfig } from "./config.js";

export async function runFile(file: string, input: unknown) {
  const config = await Effect.runPromise(loadConfig());
  process.env.AI_GATEWAY_API_KEY = config.apiKey;
  const module: unknown = await import(pathToFileURL(resolve(file)).href);
  const baseFields = {
    id: Schema.String,
    dependsOn: Schema.optional(Schema.Array(Schema.String)),
    when: Schema.optional(
      Schema.declare<NonNullable<DecisionNode["when"]>>(
        (value): value is NonNullable<DecisionNode["when"]> => Predicate.isFunction(value),
      ),
    ),
    input: Schema.optional(
      Schema.declare<NonNullable<DecisionNode["input"]>>(
        (value): value is NonNullable<DecisionNode["input"]> => Predicate.isFunction(value),
      ),
    ),
  };
  // Imported programs are trusted executable code; validate callable slots and
  // node data before passing them to the runner's graph and question validation.
  const { default: program } = Schema.decodeUnknownSync(
    Schema.Struct({
      default: Schema.Struct({
        nodes: Schema.Array(
          Schema.Union([
            Schema.Struct({
              ...baseFields,
              question: Schema.declare<NonNullable<DecisionNode["question"]>>(
                (value): value is NonNullable<DecisionNode["question"]> =>
                  Predicate.isFunction(value),
              ),
              run: Schema.optional(Schema.Never),
            }),
            Schema.Struct({
              ...baseFields,
              run: Schema.declare<NonNullable<DecisionNode["run"]>>(
                (value): value is NonNullable<DecisionNode["run"]> => Predicate.isFunction(value),
              ),
              question: Schema.optional(Schema.Never),
            }),
          ]),
        ),
      }),
    }),
  )(module);
  const Questions = Schema.Record(
    Schema.String,
    Schema.Union([
      Schema.Struct({
        type: Schema.Literal("choice"),
        instructions: Schema.String,
        criteria: Schema.Record(Schema.String, Schema.String),
      }),
      Schema.Struct({
        type: Schema.Literal("score"),
        instructions: Schema.String,
        criteria: Schema.Array(Schema.String),
      }),
      Schema.Struct({ type: Schema.Literal("boolean"), instructions: Schema.String }),
    ]),
  );
  return runProgram(program, input, async (request) =>
    evaluate({
      model: config.model,
      state: Schema.decodeUnknownSync(Schema.JsonObject)(request.state),
      questions: Schema.decodeUnknownSync(Questions)(request.questions),
      abortSignal: request.signal,
    }),
  );
}
