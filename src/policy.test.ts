import test from "node:test";
import assert from "node:assert/strict";
import { decisionExitCode, validatePolicy } from "./policy.js";

const choice = (p: number) => ({
  type: "choice",
  choice: p >= 0.5 ? "yellow" : "blue",
  probabilities: { yellow: p, blue: 1 - p },
});
test("exit policy distinguishes success, uncertain, and confident mismatch", () => {
  const policy = { minProbability: 0.9, expect: "yellow" };
  assert.equal(decisionExitCode(choice(0.95), policy), 0);
  assert.equal(decisionExitCode(choice(0.55), policy), 3);
  assert.equal(decisionExitCode(choice(0.05), policy), 4);
  assert.equal(decisionExitCode(choice(0.55), {}), 0);
});
test("boolean false can be confidently expected; ties always abstain when gated", () => {
  assert.equal(
    decisionExitCode(
      { type: "boolean", probability: 0.03 },
      { minProbability: 0.9, expect: "false" },
    ),
    0,
  );
  assert.equal(
    decisionExitCode(
      { type: "boolean", probability: 0.97 },
      { minProbability: 0.9, expect: "false" },
    ),
    4,
  );
  assert.equal(decisionExitCode({ type: "boolean", probability: 0.5 }, { expect: "true" }), 3);
  assert.equal(decisionExitCode(choice(0.5), { minProbability: 0 }), 3);
});
test("invalid policies fail before spending and absent probabilities cannot pass thresholds", () => {
  assert.throws(() => validatePolicy({ minProbability: 2 }, "choice", ["yellow", "blue"]));
  assert.throws(() => validatePolicy({ expect: "green" }, "choice", ["yellow", "blue"]));
  assert.throws(() => validatePolicy({ expect: "yes" }, "boolean", []));
  assert.throws(() => validatePolicy({ minProbability: 0.9 }, "score", []));
  assert.throws(
    () => decisionExitCode({ type: "choice", choice: "yellow" }, { minProbability: 0.9 }),
    /probabilities/,
  );
  assert.throws(() => decisionExitCode({ type: "boolean", probability: 2 }, { expect: "true" }));
});
