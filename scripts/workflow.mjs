// Short, reproducible entry points for compiled examples; no inline shell programs.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const commands = {
  audit: "reasoning-loop",
  decide: "compiled-problem",
  search: "recursive-space",
  async: "async-fanout",
};
const [command, ...flags] = process.argv.slice(2);
let valid = Object.hasOwn(commands, command);
let stateSeen = false;
let liveSeen = false;
for (let index = 0; index < flags.length; index++) {
  if (flags[index] === "--live" && !liveSeen) {
    liveSeen = true;
    continue;
  }
  if (
    flags[index] === "--state" &&
    ["audit", "decide"].includes(command) &&
    !stateSeen &&
    flags[index + 1] &&
    !flags[index + 1].startsWith("--")
  ) {
    stateSeen = true;
    index++;
    continue;
  }
  valid = false;
}
if (!valid) {
  console.error(
    "Usage: node scripts/workflow.mjs <audit|decide|search|async> [--live] [--state task.json (audit/decide)]",
  );
  process.exit(1);
}
if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error(
    "Node 22+ required. Use a supported runtime, for example: npx -y node@22 scripts/workflow.mjs audit",
  );
  process.exit(1);
}
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compile = spawnSync(
  process.execPath,
  [resolve(checkout, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.examples.json"],
  {
    cwd: checkout,
    stdio: "inherit",
    timeout: 60_000,
  },
);
if (compile.error || compile.status !== 0) {
  console.error("Example compilation failed.");
  process.exit(compile.status ?? 1);
}
// Keep the caller's working directory for the documented configuration precedence.
const run = spawnSync(
  process.execPath,
  [resolve(checkout, `dist/templates/examples/${commands[command]}.js`), ...flags],
  {
    stdio: "inherit",
    timeout: 180_000,
  },
);
if (run.error) console.error(run.error.message);
process.exitCode = run.status ?? 1;
