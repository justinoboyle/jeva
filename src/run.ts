import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runProgram, type DecisionNode } from "./program.js";
import { Predicate, Schema } from "effect";
import { gatewayEvaluator } from "./gateway.js";

export async function loadProgram(file: string) {
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
  return program;
}

export async function runFile(file: string, input: unknown) {
  return runProgram(await loadProgram(file), input, gatewayEvaluator());
}
