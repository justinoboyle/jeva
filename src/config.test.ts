import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { loadConfig } from "./config.js";

test("global config works outside checkout and env/project settings override it", async () => {
  const root = await mkdtemp(join(tmpdir(), "jeva-config-"));
  const originalKey = process.env.AI_GATEWAY_API_KEY;
  try {
    const cwd = join(root, "other-project");
    await mkdir(cwd);
    const globalFile = join(root, "global.env");
    await writeFile(globalFile, "AI_GATEWAY_API_KEY=global-test-key\nJEV_MODEL=typesafe-ai/jev\n", {
      mode: 0o600,
    });
    const run = (env: NodeJS.ProcessEnv = {}) =>
      Effect.runPromise(loadConfig({ cwd, env, globalFile }));
    assert.equal((await run()).apiKey, "global-test-key");
    await writeFile(join(cwd, ".env.local"), "AI_GATEWAY_API_KEY=local-test-key\n");
    assert.equal((await run()).apiKey, "local-test-key");
    assert.equal(
      (await run({ AI_GATEWAY_API_KEY: "environment-test-key" })).apiKey,
      "environment-test-key",
    );
    const custom = join(cwd, "explicit.env");
    await writeFile(custom, "AI_GATEWAY_API_KEY=explicit-test-key\n");
    assert.equal((await run({ DOTENV_CONFIG_PATH: custom })).apiKey, "explicit-test-key");
    assert.equal(process.env.AI_GATEWAY_API_KEY, originalKey);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("config errors do not expose secrets and reject globally readable key files", async () => {
  const root = await mkdtemp(join(tmpdir(), "jeva-private-config-"));
  try {
    const globalFile = join(root, "global.env");
    await assert.rejects(
      Effect.runPromise(loadConfig({ cwd: root, env: {}, globalFile })),
      /AI_GATEWAY_API_KEY is missing/,
    );
    await writeFile(globalFile, "AI_GATEWAY_API_KEY=never-print-this-secret", { mode: 0o600 });
    await chmod(globalFile, 0o644);
    await assert.rejects(
      Effect.runPromise(loadConfig({ cwd: root, env: {}, globalFile })),
      (error: Error) => {
        assert.match(error.message, /permissions/);
        assert.ok(!error.message.includes("never-print-this-secret"));
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
