// Provision a budgeted key without putting credentials into terminal output/history.
import { spawnSync } from "node:child_process";
import { mkdir, open, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const scope = process.argv[2];
if (!scope || !/^[a-zA-Z0-9_-]+$/.test(scope)) {
  console.error("Usage: node scripts/setup-global-key.mjs <vercel-team-slug>");
  process.exit(1);
}
const folder = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "jeva");
const path = join(folder, ".env");
try {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const info = await stat(folder);
  if ((info.mode & 0o077) !== 0) throw new Error("Global config directory must have permissions 700.");
  // Exclusive open: an existing key is never replaced. Reserve the file before spending.
  const file = await open(path, "wx", 0o600);
  try {
    const created = spawnSync("vercel", ["--scope", scope, "ai-gateway", "api-keys", "create", "--name", "jeva-cli", "--limit", "100", "--refresh-period", "none"], { encoding: "utf8", timeout: 60000 });
    if (created.status !== 0) throw new Error("Gateway key creation failed; provider output suppressed to protect credentials. Config file is empty.");
    const key = created.stdout.trim();
    if (!/^[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error("Unexpected key output; credentials were not displayed. Check the new key in Vercel.");
    await file.writeFile(`AI_GATEWAY_API_KEY=${key}\nJEV_MODEL=typesafe-ai/jev\n`);
    await file.sync();
    console.log(`Saved private global config: ${path}\nVercel team: ${scope}\nKey: jeva-cli; budget: $100; refresh: none`);
  } finally { await file.close(); }
} catch (error) {
  console.error(error?.code === "EEXIST" ? "Global config already exists; left unchanged." : error.message);
  process.exitCode = 1;
}
