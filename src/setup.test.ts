import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { parseSetupOptions, setupKey } from "./setup.js";

test("setup requires an explicit positive budget and scope before provisioning", () => {
  assert.deepEqual(parseSetupOptions(["--scope", "my-team", "--budget", "12.5"]), { scope: "my-team", budget: 12.5 });
  for (const args of [[], ["--scope", "my-team"], ["--budget", "10"], ["--scope", "my-team", "--budget", "0"],
    ["--scope", "my-team", "--budget", "NaN"], ["--scope", "my-team", "--budget", "Infinity"],
    ["--scope", "bad team", "--budget", "10"], ["--scope", "team", "--budget", "10", "--budget", "20"]]) {
    assert.throws(() => parseSetupOptions(args));
  }
});

test("setup saves a private config without returning the key, and never overwrites it", async () => {
  const folder = await mkdtemp(join(tmpdir(), "jeva-setup-test-"));
  const file = join(folder, "config", ".env");
  let calls = 0;
  const key = "test_secret_key_not_for_display_123456";
  try {
    const result = await Effect.runPromise(setupKey({ scope: "my-team", budget: 12.5 }, {
      file, provision: async (scope, budget) => { calls++; assert.equal(scope, "my-team"); assert.equal(budget, 12.5); return key; },
    }));
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes(key), false);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await stat(join(folder, "config"))).mode & 0o777, 0o700);
    assert.match(await readFile(file, "utf8"), /AI_GATEWAY_API_KEY=test_secret_key/);
    await assert.rejects(Effect.runPromise(setupKey({ scope: "my-team", budget: 12.5 }, { file, provision: async () => { calls++; return key; } })), /already exists/);
    assert.equal(calls, 1);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("failed provisioning removes only its own empty reservation and redacts provider output", async () => {
  const folder = await mkdtemp(join(tmpdir(), "jeva-setup-error-"));
  const file = join(folder, ".env");
  try {
    await assert.rejects(Effect.runPromise(setupKey({ scope: "my-team", budget: 10 }, {
      file, provision: async () => { throw new Error("secret-provider-output"); },
    })), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /provisioning failed/);
      assert.equal(error.message.includes("secret-provider-output"), false);
      return true;
    });
    await assert.rejects(stat(file), /ENOENT/);
    await writeFile(file, "existing", { mode: 0o600 });
    await assert.rejects(Effect.runPromise(setupKey({ scope: "my-team", budget: 10 }, { file, provision: async () => "unused" })), /already exists/);
    assert.equal(await readFile(file, "utf8"), "existing");
  } finally { await rm(folder, { recursive: true, force: true }); }
});
