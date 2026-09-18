import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../skills/jev-decision/scripts/gate-choice.mjs", import.meta.url));
function gate(input: unknown, args = ["0.9", "0.2"]) {
  return spawnSync(process.execPath, [script, ...args], { input: JSON.stringify(input), encoding: "utf8" });
}
const result = (choice: string, probabilities: unknown) => ({ answers: { answer: { type: "choice", choice, probabilities } } });

test("skill policy accepts decisive results without executing the chosen label", () => {
  const label = "$(touch should-never-exist)";
  const output = gate(result(label, { [label]: 0.97, other: 0.03 }));
  assert.equal(output.status, 0, output.stderr);
  assert.deepEqual(JSON.parse(output.stdout), { status: "accepted", choice: label, probability: 0.97, margin: 0.94 });
});

test("skill policy abstains on weak evidence and ties", () => {
  for (const probabilities of [{ yes: 0.7, no: 0.3 }, { yes: 0.5, no: 0.5 }]) {
    const output = gate(result("yes", probabilities));
    assert.equal(output.status, 0, output.stderr);
    assert.equal(JSON.parse(output.stdout).status, "review");
  }
});

test("skill policy rejects unavailable or malformed distributions instead of inventing certainty", () => {
  for (const input of [
    {}, result("yes", undefined), result("yes", { yes: 1.1, no: -0.1 }),
    result("yes", { yes: "0.95", no: 0.05 }), result("yes", { yes: 0.8, no: 0.8 }),
    result("yes", { no: 1 }), result("yes", { yes: 0.1, no: 0.9 }),
  ]) {
    const output = gate(input);
    assert.equal(output.status, 1);
    assert.equal(output.stdout, "");
    assert.match(output.stderr, /gate-choice:/);
  }
});

test("skill policy validates thresholds and supports explicit probability/margin policy", () => {
  const input = result("yes", { yes: 0.8, no: 0.2 });
  assert.equal(JSON.parse(gate(input, ["0.75", "0.5"]).stdout).status, "accepted");
  assert.equal(JSON.parse(gate(input, ["0.75", "0.7"]).stdout).status, "review");
  for (const args of [["bad", "0.2"], ["1.5", "0.2"], ["", "0.2"], []]) {
    const output = gate(input, args);
    assert.equal(output.status, 1);
    assert.equal(output.stdout, "");
  }
});
