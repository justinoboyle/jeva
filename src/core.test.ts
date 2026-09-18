import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, defaultOptions, selectOutput } from "./core.js";

test("builds a focused choice request", () => {
  const options = { ...defaultOptions(), input: "banana", choices: ["yellow", "blue"] };
  assert.deepEqual(buildRequest(options).questions.answer.criteria, { yellow: "yellow", blue: "blue" });
});

test("selects pipeline-safe scalar and probability output", () => {
  const result = { answers: { answer: { choice: "yellow", probabilities: { yellow: 0.98, blue: 0.02 } } } };
  assert.equal(selectOutput(result, defaultOptions()), "yellow");
  assert.equal(selectOutput(result, { ...defaultOptions(), probabilities: true }), result.answers.answer.probabilities);
});
