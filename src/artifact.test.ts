import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withArtifact } from "./artifact.js";

test("artifacts are private, exclusive, and reserved before running work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jeva-artifact-"));
  const file = join(directory, "run.json");
  try {
    assert.deepEqual(await withArtifact(file, async () => ({ ok: true })), { ok: true });
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { ok: true });
    let called = false;
    await assert.rejects(
      withArtifact(file, async () => {
        called = true;
        return {};
      }),
    );
    assert.equal(called, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed operation removes only its own empty artifact reservation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jeva-artifact-"));
  const file = join(directory, "run.json");
  try {
    await assert.rejects(
      withArtifact(file, async () => {
        throw new Error("failed");
      }),
    );
    await assert.rejects(stat(file), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
