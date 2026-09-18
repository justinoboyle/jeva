#!/usr/bin/env node
import "dotenv/config";
import { experimental_evaluate as evaluate } from "ai";
import { readFile } from "node:fs/promises";
import { stdin, stderr, stdout } from "node:process";
import { buildRequest, defaultOptions, parseCriterion, selectOutput, type Options } from "./core.js";
import { runFile } from "./run.js";

const help = `jeva — fast structured decisions with Jev\n\nUsage: jeva -o <option> -o <option> -i <input> [flags]\n\nExamples:\n  jeva -o yellow -o blue -i banana\n  printf 'urgent: production is down' | jeva --boolean -q 'Does input convey urgency?' --percentage\n  jeva --score -l 'no impact' -l 'workaround exists' -l 'blocked' -i 'Login is broken' --probabilities\n  jeva -o billing -o technical -i \"$(cat ticket.txt)\" --json | jq '.answers.answer'\n\nInput/options:\n  -i, --input <text>       Input text; use - for stdin\n  -f, --file <path>        Read input from a file\n  -o, --option <value>     Choice option (repeatable)\n  -c, --criterion k=meaning Describe a choice option (repeatable)\n  -q, --question <text>    Exact atomic question; name input in the prompt\n  --boolean                Return P(true) for a crisp condition\n  --score                  Select an ordered rubric\n  -l, --level <description> Score level, low to high (repeatable)\n\nOutput (stdout stays pipeline-safe):\n  --json                   Full gateway result\n  --probabilities          Distribution as JSON\n  --percentage             Winning probability / boolean probability as 0–100\n  --confidence             Choice/score confidence (or boolean certainty)\n  -v, --verbose            Request/answer summary to stderr\n  -h, --help               Show this help\n`;

async function readStdin(): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of stdin) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts).toString("utf8").trim();
}

function value(argv: string[], i: number, flag: string): string {
  const next = argv[i + 1];
  if (!next || next.startsWith("-")) throw new Error(`${flag} needs a value`);
  return next;
}

async function parse(argv: string[]): Promise<Options> {
  const options = defaultOptions();
  let readPipe = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") { stdout.write(help); process.exit(0); }
    if (arg === "-i" || arg === "--input") { const v = value(argv, i++, arg); if (v === "-") readPipe = true; else options.input = v; continue; }
    if (arg === "-f" || arg === "--file") { options.input = await readFile(value(argv, i++, arg), "utf8"); continue; }
    if (arg === "-o" || arg === "--option") { options.choices.push(value(argv, i++, arg)); continue; }
    if (arg === "-c" || arg === "--criterion") { const [k, v] = parseCriterion(value(argv, i++, arg)); options.criteria[k] = v; continue; }
    if (arg === "-q" || arg === "--question") { options.question = value(argv, i++, arg); continue; }
    if (arg === "-l" || arg === "--level") { options.levels.push(value(argv, i++, arg)); continue; }
    if (arg === "--boolean") { options.type = "boolean"; continue; }
    if (arg === "--score") { options.type = "score"; continue; }
    if (arg === "--json") { options.json = true; continue; }
    if (arg === "--probabilities") { options.probabilities = true; continue; }
    if (arg === "--percentage") { options.percentage = true; continue; }
    if (arg === "--confidence") { options.confidence = true; continue; }
    if (arg === "-v" || arg === "--verbose") { options.verbose = true; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (readPipe || !options.input) options.input = await readStdin();
  return options;
}

async function runCommand(argv: string[]): Promise<void> {
  const file = argv[1];
  if (!file) throw new Error("Usage: jeva run <compiled-program.mjs> -i <input>");
  const at = argv.findIndex((arg) => arg === "-i" || arg === "--input");
  const input = at < 0 || argv[at + 1] === "-" ? await readStdin() : argv[at + 1];
  if (!input) throw new Error("Provide program input with -i or stdin.");
  stdout.write(`${JSON.stringify(await runFile(file, input))}\n`);
}

try {
  const argv = process.argv.slice(2);
  if (argv[0] === "run") await runCommand(argv);
  else {
  const options = await parse(argv);
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is missing. Copy .env.example to .env.local and add a dedicated Gateway key.");
  const request = buildRequest(options);
  if (options.verbose) stderr.write(`jeva: ${options.type} question via ${process.env.JEV_MODEL ?? "typesafe-ai/jev"}\n`);
  const result = await evaluate({ model: process.env.JEV_MODEL ?? "typesafe-ai/jev", ...request } as any);
  const output = selectOutput(result, options);
  stdout.write(typeof output === "string" || typeof output === "number" ? `${output}\n` : `${JSON.stringify(output)}\n`);
  if (options.verbose) stderr.write(`jeva: answer ${JSON.stringify(result.answers.answer)}\n`);
  }
} catch (error) {
  stderr.write(`jeva: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
