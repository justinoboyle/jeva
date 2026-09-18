import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const current = spawnSync("git", ["config", "--local", "--get", "core.hooksPath"], {
  cwd: root,
  encoding: "utf8",
});
if (current.error) throw current.error;
if (current.status !== 0 && current.status !== 1) {
  throw new Error(current.stderr || "Install hooks from a Git checkout.");
}
if (current.stdout.trim() && current.stdout.trim() !== ".githooks") {
  throw new Error(
    `Existing core.hooksPath=${current.stdout.trim()}; integrate the Jeva hook without replacing it.`,
  );
}
chmodSync(new URL("../.githooks/pre-commit", import.meta.url), 0o755);
const installed = spawnSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
  cwd: root,
  encoding: "utf8",
});
if (installed.error) throw installed.error;
if (installed.status !== 0) throw new Error(installed.stderr || "Unable to install hooks.");
console.log("Installed .githooks/pre-commit: commits require npm run verify.");
