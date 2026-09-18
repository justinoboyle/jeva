import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formalCommand } from "./formal-command.js";

test("formal CLI records task execution without credentials and cannot present it as model use", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jeva-commands-"));
  try {
    const module = join(directory, "task.mjs");
    const receipt = join(directory, "receipt.json");
    await writeFile(
      module,
      'export default {nodes:[{id:"task",run:async({input})=>({value:input})}]};',
    );
    const output = await formalCommand(
      ["run", module, "-i", "sample", "--receipt", receipt],
      async () => "",
    );
    assert.equal(output.code, 0);
    assert.deepEqual(output.output, { task: { value: "sample" } });
    assert.equal((await stat(receipt)).mode & 0o777, 0o600);
    assert.equal((await formalCommand(["verify", receipt], async () => "")).code, 1);
    assert.equal(
      (await formalCommand(["verify", receipt, "--min-calls", "0"], async () => "")).code,
      0,
    );
    assert.equal(
      (
        await formalCommand(
          ["verify", receipt, "--min-calls", "0", "--require-live"],
          async () => "",
        )
      ).code,
      1,
    );
    await assert.rejects(
      formalCommand(["run", module, "-i", "sample", "--receipt", receipt], async () => ""),
    );
    await assert.rejects(formalCommand(["run", module, "--bogus"], async () => ""));
    assert.doesNotMatch(await readFile(receipt, "utf8"), /"sample"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("external loop exit command returns complete, continue, and review distinctly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jeva-exit-"));
  try {
    const policy = join(directory, "policy.json");
    await writeFile(
      policy,
      JSON.stringify({
        answerId: "exit",
        labels: { done: "complete", more: "continue", unknown: "review" },
        minProbability: 0.9,
        minMargin: 0.2,
      }),
    );
    for (const [choice, expected] of [
      ["done", 0],
      ["more", 4],
      ["unknown", 3],
    ] as const) {
      const answer = {
        type: "choice",
        choice,
        probabilities: {
          done: choice === "done" ? 1 : 0,
          more: choice === "more" ? 1 : 0,
          unknown: choice === "unknown" ? 1 : 0,
        },
      };
      // oxlint-disable-next-line no-await-in-loop -- Each iteration asserts a different deterministic CLI exit contract.
      const result = await formalCommand(["exit", "--policy", policy, "--answer", "-"], async () =>
        JSON.stringify(answer),
      );
      assert.equal(result.code, expected);
    }
    assert.equal(
      (await formalCommand(["exit", "--policy", policy, "--answer", "-"], async () => "{}")).code,
      3,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
