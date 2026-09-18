import { experimental_evaluate as evaluate } from "ai";
import { Effect, Schema } from "effect";
import { loadConfig } from "./config.js";
import type { Evaluate } from "./program.js";

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

/** Lazy config permits task-only runs without credentials; no hidden SDK retries. */
async function configValue() {
  return Effect.runPromise(loadConfig());
}

export function gatewayEvaluator(): Evaluate {
  let configuration: ReturnType<typeof configValue> | undefined;
  return async (request) => {
    const state = Schema.decodeUnknownSync(Schema.JsonObject)(request.state);
    const questions = Schema.decodeUnknownSync(Questions)(request.questions);
    configuration ??= configValue();
    const config = await configuration;
    process.env.AI_GATEWAY_API_KEY = config.apiKey;
    const result = await evaluate({
      model: config.model,
      state,
      questions,
      abortSignal: request.signal,
      maxRetries: 0,
    });
    return { answers: result.answers };
  };
}
