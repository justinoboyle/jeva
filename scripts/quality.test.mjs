import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertEffectCoverage } from "./effect-report.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("Effect quality gate rejects empty, partial, and invalid scan coverage", () => {
  for (const summary of [
    { filesChecked: 0, totalFiles: 20 },
    { filesChecked: 0, totalFiles: 0 },
    { filesChecked: 1, totalFiles: 2 },
    { filesChecked: 1.5, totalFiles: 1.5 },
  ]) {
    assert.throws(() => assertEffectCoverage({ summary }), /every selected file/);
  }
  const full = { summary: { filesChecked: 2, totalFiles: 2 } };
  assert.equal(assertEffectCoverage(full), full);
});

test("installed lint tools reject floating Promises and Effects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jeva-quality-test-"));
  try {
    await symlink(join(root, "node_modules"), join(directory, "node_modules"), "dir");
    await Promise.all([
      writeFile(join(directory, "package.json"), JSON.stringify({ type: "module" })),
      writeFile(
        join(directory, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            strict: true,
            skipLibCheck: true,
          },
          include: ["fixture.ts"],
        }),
      ),
      writeFile(
        join(directory, "fixture.ts"),
        'import { Effect } from "effect";\nPromise.resolve(1);\nEffect.succeed(1);\n',
      ),
    ]);
    const lint = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/oxlint/bin/oxlint"),
        "--config",
        join(root, ".oxlintrc.json"),
        "--format",
        "unix",
        join(directory, "fixture.ts"),
      ],
      { cwd: directory, encoding: "utf8", timeout: 30_000 },
    );
    assert.ifError(lint.error);
    assert.equal(lint.status, 1, lint.stderr || lint.stdout);
    assert.match(lint.stdout + lint.stderr, /no-floating-promises/);
    const effect = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/@effect/language-service/cli.js"),
        "diagnostics",
        "--project",
        join(directory, "tsconfig.json"),
        "--lspconfig",
        "{}",
        "--strict",
        "--format",
        "json",
        "--severity",
        "error,warning",
      ],
      { cwd: directory, encoding: "utf8", timeout: 30_000 },
    );
    assert.ifError(effect.error);
    assert.equal(effect.status, 1, effect.stderr || effect.stdout);
    assert.match(effect.stdout, /floatingEffect/);
    assertEffectCoverage(JSON.parse(effect.stdout));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
