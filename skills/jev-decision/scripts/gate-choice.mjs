#!/usr/bin/env node
import { Schema } from "effect";

// Deterministic policy only: accepts one CLI --json result on stdin.
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some((value) => value.trim() === "")) {
    throw new Error("Usage: gate-choice.mjs <minimum probability> <minimum margin>");
  }
  const [minimum, separation] = args.map(Number);
  if (![minimum, separation].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
    throw new Error("Thresholds must be numbers in [0, 1]");
  }
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1024 * 1024) throw new Error("Result exceeds 1 MiB");
  }
  const {
    answers: { answer },
  } = Schema.decodeUnknownSync(
    Schema.fromJsonString(
      Schema.Struct({
        answers: Schema.Struct({
          answer: Schema.Struct({
            type: Schema.Literal("choice"),
            choice: Schema.String,
            probabilities: Schema.Record(Schema.String, Schema.Number),
          }),
        }),
      }),
    ),
  )(input);
  const probabilities = answer.probabilities;
  const entries = Object.entries(probabilities);
  if (
    entries.length < 2 ||
    !Object.hasOwn(probabilities, answer.choice) ||
    entries.some(([, p]) => typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) ||
    Math.abs(entries.reduce((sum, [, p]) => sum + p, 0) - 1) > 0.01
  ) {
    throw new Error("Invalid or incomplete probability distribution");
  }
  const probability = probabilities[answer.choice];
  const runnerUp = Math.max(
    ...entries.filter(([label]) => label !== answer.choice).map(([, p]) => p),
  );
  if (probability < runnerUp) throw new Error("Choice is inconsistent with its distribution");
  const margin = probability - runnerUp;
  const status =
    probability >= minimum && margin > 0 && margin >= separation ? "accepted" : "review";
  process.stdout.write(
    JSON.stringify({ status, choice: answer.choice, probability, margin }) + "\n",
  );
} catch (error) {
  process.stderr.write(
    `gate-choice: ${error instanceof Error ? error.message : "Invalid result"}\n`,
  );
  process.exitCode = 1;
}
