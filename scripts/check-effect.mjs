import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertEffectCoverage } from "./effect-report.mjs";

const root = new URL("../", import.meta.url);
/** @type {unknown} */
const config = JSON.parse(readFileSync(new URL("tsconfig.effect.json", root), "utf8"));
if (
  typeof config !== "object" ||
  config === null ||
  !("compilerOptions" in config) ||
  typeof config.compilerOptions !== "object" ||
  config.compilerOptions === null ||
  !("plugins" in config.compilerOptions) ||
  !Array.isArray(config.compilerOptions.plugins)
) {
  throw new Error("Effect lint configuration must declare its language-service plugin.");
}
/** @type {unknown} */
const plugin = config.compilerOptions.plugins.find(
  /** @param {unknown} candidate */
  (candidate) =>
    typeof candidate === "object" &&
    candidate !== null &&
    "name" in candidate &&
    candidate.name === "@effect/language-service",
);
if (!plugin) throw new Error("Effect language-service plugin configuration is missing.");

// --project selects files; the CLI otherwise rediscovers a different tsconfig for
// each file and can silently skip every file lacking an installed plugin config.
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/@effect/language-service/cli.js", root)),
    "diagnostics",
    "--project",
    fileURLToPath(new URL("tsconfig.effect.json", root)),
    "--lspconfig",
    JSON.stringify(plugin),
    "--format",
    "json",
    "--strict",
    "--severity",
    "error,warning",
  ],
  { cwd: fileURLToPath(root), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
if (result.error) throw result.error;
if (result.stderr) process.stderr.write(result.stderr);
if (result.signal) throw new Error(`Effect lint interrupted by ${result.signal}.`);
/** @type {unknown} */
const report = assertEffectCoverage(JSON.parse(result.stdout));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = result.status ?? 1;
