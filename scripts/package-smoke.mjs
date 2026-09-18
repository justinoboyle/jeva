import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const checkout = fileURLToPath(new URL("../", import.meta.url));
if (Number(process.versions.node.split(".")[0]) < 22) {
  throw new Error("Package smoke requires Node 22 or newer.");
}
const childEnv = {
  ...process.env,
  PATH: [dirname(process.execPath), process.env.PATH ?? ""].join(delimiter),
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {number} [expectedStatus]
 */
function run(command, args, cwd, expectedStatus = 0) {
  const result = spawnSync(command, args, {
    cwd,
    env: childEnv,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${basename(command)} was interrupted`);
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

/** @param {string[]} args @param {string} cwd */
function npm(args, cwd) {
  const entry = process.env.npm_execpath;
  return entry?.endsWith(".js")
    ? run(process.execPath, [entry, ...args], cwd)
    : run("npm", args, cwd);
}

/** @param {string} name */
function assertPublicFile(name) {
  assert(!name.startsWith("/") && !name.split("/").includes(".."), `Unsafe archive path: ${name}`);
  assert(
    !/(^|\/)(?:\.env(?:\.[^/]*)?|\.agents|AGENTS\.md|research|tests?|__tests__)(?:\/|$)/i.test(
      name,
    ),
    `Private/development file in package: ${name}`,
  );
  assert(!/\.(?:test|spec)\./.test(name), `Test file in package: ${name}`);
  const allowed =
    /^(?:package\.json|README\.md|LICENSE(?:\.[^/]*)?|tsconfig(?:\.examples)?\.json|dist\/[^/]+\.(?:js|d\.ts)|src\/[^/]+\.ts|docs\/.+\.(?:md|json)|examples\/.+\.ts|skills\/.+\.(?:md|mjs|yaml)|scripts\/(?:workflow\.mjs|tsconfig\.json))$/;
  assert(allowed.test(name), `Unexpected public package file: ${name}`);
}

const directory = await mkdtemp(join(tmpdir(), "jeva-package-smoke-"));
try {
  const packed = npm(["pack", "--json", "--pack-destination", directory], checkout);
  /** @type {unknown} */
  const decoded = JSON.parse(packed.stdout);
  assert(Array.isArray(decoded) && decoded.length === 1, "Expected one npm pack result");
  /** @type {unknown} */
  const archive = decoded[0];
  assert(isRecord(archive) && typeof archive.filename === "string" && Array.isArray(archive.files));
  assert.equal(basename(archive.filename), archive.filename, "Archive filename must be local");
  const files = new Set(
    archive.files.map(
      /** @param {unknown} item */
      (item) => {
        assert(isRecord(item) && typeof item.path === "string", "Invalid npm file metadata");
        assertPublicFile(item.path);
        return item.path;
      },
    ),
  );
  for (const required of [
    "package.json",
    "README.md",
    "dist/cli.js",
    "dist/program.js",
    "dist/search.js",
  ]) {
    assert(files.has(required), `Missing required package file: ${required}`);
  }

  const consumer = join(directory, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  console.log(`Checked ${files.size} packed files; installing isolated consumer.`);
  npm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      join(directory, archive.filename),
    ],
    consumer,
  );
  const installed = join(consumer, "node_modules", "jeva");
  /** @type {unknown} */
  const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
  assert(isRecord(manifest) && manifest.name === "jeva" && isRecord(manifest.bin));
  assert.equal(manifest.bin.jeva, "dist/cli.js");
  assert(isRecord(manifest.exports), "Package must export its typed program API");
  for (const name of ["./program", "./search"]) {
    const entry = manifest.exports[name];
    assert(isRecord(entry) && typeof entry.import === "string" && typeof entry.types === "string");
    assert(files.has(entry.import.replace(/^\.\//, "")), `Missing import for ${name}`);
    assert(files.has(entry.types.replace(/^\.\//, "")), `Missing declarations for ${name}`);
  }

  const cli = join(installed, "dist", "cli.js");
  if (process.platform !== "win32") {
    assert.equal(
      await realpath(join(consumer, "node_modules", ".bin", "jeva")),
      await realpath(cli),
    );
    assert((await stat(cli)).mode & 0o111, "Installed CLI must be executable");
  }
  assert.match(run(process.execPath, [cli, "--help"], consumer).stdout, /Usage: jeva/);
  assert.match(run(process.execPath, [cli, "setup", "--help"], consumer).stdout, /--budget/);
  const rejected = run(process.execPath, [cli, "setup", "--scope", "smoke-test"], consumer, 1);
  assert.match(rejected.stderr, /explicit positive --budget/);

  const probe = join(consumer, "probe.mjs");
  await writeFile(
    probe,
    `import assert from "node:assert/strict";
import { defineProgram, runProgram } from "jeva/program";
import { searchSpace } from "jeva/search";
assert.equal(typeof searchSpace, "function");
const installedRuntime = await import("./node_modules/jeva/dist/program.js");
assert.equal(installedRuntime.runProgram, runProgram);
const program = defineProgram({ nodes: [
  { id: "left", run: async () => ({ value: 2 }) },
  { id: "right", run: async () => ({ value: 3 }) },
  { id: "sum", dependsOn: ["left", "right"],
    run: ({ answers }) => ({ value: answers.left.value + answers.right.value }) },
] });
const answers = await runProgram(program, {}, async () => {
  throw new Error("Deterministic package smoke must never invoke a model");
});
assert.equal(answers.sum.value, 5);
console.log("Installed exports and task fan-in passed.");
`,
  );
  const result = run(process.execPath, [probe], consumer);
  process.stdout.write(result.stdout);
  console.log(
    "Package smoke passed: install, CLI help, budget validation, exports, and offline execution.",
  );
} finally {
  // This path is exclusively owned by this invocation's mkdtemp call.
  await rm(directory, { recursive: true, force: true });
}
