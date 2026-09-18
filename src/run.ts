import { experimental_evaluate as evaluate } from "ai";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runProgram, type Program } from "./program.js";
import { Effect } from "effect";
import { loadConfig } from "./config.js";

export async function runFile(file: string, input: unknown) {
  const config = await Effect.runPromise(loadConfig());
  process.env.AI_GATEWAY_API_KEY = config.apiKey;
  const module = await import(pathToFileURL(resolve(file)).href);
  const program = module.default as Program | undefined;
  if (!program) throw new Error(`${file} must default-export defineProgram({ nodes: [...] }).`);
  return runProgram(program, input, async (request) => evaluate({ model: config.model, ...request } as any) as any);
}
