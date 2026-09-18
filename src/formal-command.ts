import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Predicate, Schema } from "effect";
import { withArtifact } from "./artifact.js";
import { commandFlags, integerFlag, readJson, textFlag } from "./command-options.js";
import { gatewayEvaluator } from "./gateway.js";
import { loadProgram } from "./run.js";
import { runProgram } from "./program.js";
import { recordProgram, verifyReceipt } from "./receipt.js";
import {
  decideLoopExit,
  runLoop,
  LoopExitPolicySchema,
  LoopLimitsSchema,
  type LoopStep,
} from "./loop.js";
import { verifyLoopReport } from "./loop-verify.js";

export const formalHelp = `Formal program tools (trusted JavaScript, not a sandbox):
  jeva run program.js [-i text | --input-json state.json] [--receipt run.json]
  jeva loop loop.js [--input-json state.json] [--report report.json]
  jeva exit --policy policy.json --answer answer.json
  jeva verify run.json [--require-live] [--min-calls N] [--digest SHA256]
  jeva verify-loop report.json [--require-live] [--require-complete] [--digest SHA256]

Run input defaults to stdin; exit --answer - reads a bare answer from stdin.
Loop modules declare initialState, stateSchema, step, exitPolicy, and finite limits.
Artifacts are created exclusively with mode 600; existing files are never overwritten.
Exit: 0 complete/pass, 3 review, 4 continue/budget/stalled, 1 error/cancel/timeout.
Local receipts prove consistency under a trusted recorder, not provider authenticity or hidden reasoning.
`;

export type CommandResult = { output: unknown; code: number };

function required(flags: Readonly<Record<string, string | true>>, name: string): string {
  const value = textFlag(flags, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function inputFor(
  flags: Readonly<Record<string, string | true>>,
  stdin: () => Promise<string>,
) {
  const file = textFlag(flags, "--input-json");
  const text = textFlag(flags, "-i") ?? textFlag(flags, "--input");
  if (file && text !== undefined) throw new Error("Choose text input or --input-json, not both");
  if (flags["-i"] && flags["--input"]) throw new Error("Input was specified twice");
  if (file) return readJson(file);
  const input = text === undefined || text === "-" ? await stdin() : text;
  if (!input) throw new Error("Provide program input with -i, --input-json, or stdin");
  return input;
}

async function loadLoop(file: string) {
  const module: unknown = await import(pathToFileURL(resolve(file)).href);
  return Schema.decodeUnknownSync(
    Schema.Struct({
      default: Schema.Struct({
        initialState: Schema.Unknown,
        stateSchema: Schema.declare<Schema.Decoder<unknown>>(
          (value): value is Schema.Decoder<unknown> => Schema.isSchema(value),
        ),
        step: Schema.declare<LoopStep<unknown>>((value): value is LoopStep<unknown> =>
          Predicate.isFunction(value),
        ),
        exitPolicy: LoopExitPolicySchema,
        limits: LoopLimitsSchema,
      }),
    }),
  )(module).default;
}

export async function formalCommand(
  args: readonly string[],
  stdin: () => Promise<string>,
): Promise<CommandResult> {
  const [command, file, ...rest] = args;
  if (command === "exit") {
    const flags = commandFlags(args.slice(1), ["--policy", "--answer"]);
    const policy = Schema.decodeUnknownSync(LoopExitPolicySchema)(
      await readJson(required(flags, "--policy")),
    );
    const answerFile = required(flags, "--answer");
    const answer: unknown =
      answerFile === "-" ? JSON.parse(await stdin()) : await readJson(answerFile);
    const output = decideLoopExit(answer, policy);
    return {
      output,
      code: output.status === "complete" ? 0 : output.status === "continue" ? 4 : 3,
    };
  }
  if (!file || file.startsWith("-"))
    throw new Error("A compiled module or receipt path is required");
  if (command === "verify") {
    const flags = commandFlags(rest, ["--min-calls", "--digest"], ["--require-live"]);
    const output = verifyReceipt(await readJson(file), {
      requireLive: flags["--require-live"] === true,
      minSuccessfulCalls: integerFlag(flags, "--min-calls") ?? 1,
      expectedDigest: textFlag(flags, "--digest"),
    });
    return { output, code: output.ok ? 0 : 1 };
  }
  if (command === "verify-loop") {
    const flags = commandFlags(rest, ["--digest"], ["--require-live", "--require-complete"]);
    const output = verifyLoopReport(await readJson(file), {
      requireLive: flags["--require-live"] === true,
      requireComplete: flags["--require-complete"] === true,
      expectedDigest: textFlag(flags, "--digest"),
    });
    return { output, code: output.ok ? 0 : 1 };
  }
  if (command === "run") {
    const flags = commandFlags(rest, ["-i", "--input", "--input-json", "--receipt"]);
    const input = await inputFor(flags, stdin);
    const artifact = textFlag(flags, "--receipt");
    if (!artifact)
      return {
        output: await runProgram(await loadProgram(file), input, gatewayEvaluator()),
        code: 0,
      };
    const result = await withArtifact(
      artifact,
      async () => {
        const artifactDigest = createHash("sha256")
          .update(await readFile(file))
          .digest("hex");
        return recordProgram(await loadProgram(file), input, gatewayEvaluator(), {
          programId: file,
          artifactDigest,
          mode: "live",
          maxCalls: 128,
          timeoutMs: 60_000,
        });
      },
      (run) => run.receipt,
    );
    return {
      output: result.answers ?? { error: "Program failed; inspect its receipt" },
      code: result.answers ? 0 : 1,
    };
  }
  if (command === "loop") {
    const flags = commandFlags(rest, ["--input-json", "--report"]);
    const result = await withArtifact(textFlag(flags, "--report"), async () => {
      const definition = await loadLoop(file);
      const input = textFlag(flags, "--input-json");
      return runLoop(input ? await readJson(input) : definition.initialState, definition.step, {
        ...definition.limits,
        stateSchema: definition.stateSchema,
        exitPolicy: definition.exitPolicy,
        evaluate: gatewayEvaluator(),
        mode: "live",
      });
    });
    const code =
      result.status === "complete"
        ? 0
        : result.status === "review"
          ? 3
          : ["max_rounds", "max_calls", "stalled"].includes(result.status)
            ? 4
            : 1;
    return { output: result, code };
  }
  throw new Error(`Unknown formal command: ${command}`);
}
