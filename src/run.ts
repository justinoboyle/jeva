import { experimental_evaluate as evaluate } from "ai";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { runProgram, type Program } from "./program.js";

export async function runFile(file: string, input: unknown) {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is missing. Copy .env.example to .env.local and add a dedicated Gateway key.");
  const module = await import(pathToFileURL(resolve(file)).href);
  const program = module.default as Program | undefined;
  if (!program) throw new Error(`${file} must default-export defineProgram({ nodes: [...] }).`);
  return runProgram(program, input, async (request) => evaluate({ model: process.env.JEV_MODEL ?? "typesafe-ai/jev", ...request } as any) as any);
}
