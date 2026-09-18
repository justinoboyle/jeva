#!/usr/bin/env node
import { Effect } from "effect";
import { experimental_evaluate as evaluate } from "ai";
import { readFile } from "node:fs/promises";
import { stdin, stderr, stdout } from "node:process";
import { buildRequest, defaultOptions, parseCriterion, selectOutput, type Options } from "./core.js";
import { runFile } from "./run.js";
import { loadConfig } from "./config.js";
import { decisionExitCode, validatePolicy } from "./policy.js";
import { parseSetupOptions, setupHelp, setupKey } from "./setup.js";

const help = `jeva — fast structured decisions with Jev\n\nUsage: jeva -o <option> -o <option> -i <input> [flags]\n\nExamples:\n  jeva -o yellow -o blue -i banana\n  printf 'urgent: production is down' | jeva --boolean -q 'Does input convey urgency?' --percentage\n  jeva --score -l 'no impact' -l 'workaround exists' -l 'blocked' -i 'Login is broken' --probabilities\n  jeva -o billing -o technical -i \"$(cat ticket.txt)\" --json | jq '.answers.answer'\n\nInput/options:\n  -i, --input <text>       Input text; use - for stdin\n  -f, --file <path>        Read input from a file\n  -o, --option <value>     Choice option (repeatable)\n  -c, --criterion k=meaning Describe a choice option (repeatable)\n  -q, --question <text>    Exact atomic question; name input in the prompt\n  --boolean                Return P(true) for a crisp condition\n  --score                  Select an ordered rubric\n  -l, --level <description> Score level, low to high (repeatable)\n\nOutput (stdout stays pipeline-safe):\n  --json                   Full gateway result\n  --probabilities          Distribution as JSON\n  --percentage             Winning probability / boolean probability as 0–100\n  --confidence             Choice/score confidence (or boolean certainty)\n  -v, --verbose            Request/answer summary to stderr\n  -h, --help               Show this help\n`;

async function readStdin(): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of stdin) {
    const value: unknown = chunk;
    if (typeof value === "string") parts.push(Buffer.from(value));
    else if (Buffer.isBuffer(value)) parts.push(value);
    else throw new Error("Unsupported input stream chunk");
  }
  return Buffer.concat(parts).toString("utf8").trim();
}

function value(argv: string[], i: number, flag: string): string {
  const next = argv[i + 1];
  if (!next || (next.startsWith("-") && next !== "-")) throw new Error(`${flag} needs a value`);
  return next;
}

async function parse(argv: string[]): Promise<Options> {
  const options = defaultOptions();
  let readPipe = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      stdout.write(help + "\nSetup: jeva setup --scope <vercel-team> --budget <USD>\n\nExit policy (Choice/Boolean):\n  --min-probability <0..1> Minimum selected-answer probability\n  --expect <label>         Require a specific option or true/false\n  Exit: 0 pass, 1 error, 3 uncertain, 4 confident mismatch.\n  Gated results remain on stdout; without gates every valid answer exits 0.\n\nPrograms: jeva run <trusted-compiled-program.js> -i <input>\nConfig: environment > explicit DOTENV_CONFIG_PATH > .env.local > .env > ~/.config/jeva/.env\n");
      process.exit(0);
    }
    if (arg === "--min-probability") { options.minProbability = Number(value(argv, i++, arg)); continue; }
    if (arg === "--expect") { options.expect = value(argv, i++, arg); continue; }
    if (arg === "-i" || arg === "--input") { const v = value(argv, i++, arg); if (v === "-") readPipe = true; else options.input = v; continue; }
    // eslint-disable-next-line no-await-in-loop -- File arguments apply in order so later input flags retain their precedence.
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
  validatePolicy(options, options.type, options.choices);
  if (readPipe || !options.input) {
    if (stdin.isTTY) throw new Error("Provide input with -i, --file, or stdin.");
    options.input = await readStdin();
  }
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
  if (argv[0] === "setup") {
    if (argv.includes("--help") || argv.includes("-h")) stdout.write(setupHelp);
    else {
      const result = await Effect.runPromise(setupKey(parseSetupOptions(argv.slice(1))));
      stdout.write(`Saved private config: ${result.file}\nBudget: $${result.budget}; refresh: ${result.refresh}\n`);
    }
  } else if (argv[0] === "run") await runCommand(argv);
  else {
  const options = await parse(argv);
  const config = await Effect.runPromise(loadConfig());
  process.env.AI_GATEWAY_API_KEY = config.apiKey;
  const request = buildRequest(options);
  if (options.verbose) stderr.write(`jeva: ${options.type} question via ${process.env.JEV_MODEL ?? "typesafe-ai/jev"}\n`);
  const result = await evaluate({ model: config.model, ...request });
  const code = decisionExitCode(result.answers.answer, options);
  const output = selectOutput(result, options);
  stdout.write(typeof output === "string" || typeof output === "number" ? `${output}\n` : `${JSON.stringify(output)}\n`);
  if (options.verbose) stderr.write(`jeva: answer ${JSON.stringify(result.answers.answer)}\n`);
  process.exitCode = code;
  }
} catch (error) {
  stderr.write(`jeva: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
