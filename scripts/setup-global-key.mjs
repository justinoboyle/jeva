// Compatibility entry point; setup and its explicit budget policy live in the CLI.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const result = spawnSync(process.execPath, [cli, "setup", ...process.argv.slice(2)], {
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
