import test from "node:test";
import assert from "node:assert/strict";
import { defineProgram, plan, ProgramError, runProgram } from "./program.js";
const boolean = { type: "boolean" as const, instructions: "Does `input` name a fruit?" };

test("batches independent questions and orders dependent questions", () => {
  const program = defineProgram({ nodes: [
    { id: "fruit", question: () => boolean },
    { id: "color", question: () => ({ type: "choice" as const, instructions: "Color of `input`?", criteria: { yellow: "yellow", blue: "blue" } }) },
    { id: "edible", dependsOn: ["fruit"], question: () => boolean },
  ] });
  assert.deepEqual(plan(program).map((layer) => layer.map((node) => node.id)), [["fruit", "color"], ["edible"]]);
});

test("routes only after its dependency and returns stable named answers", async () => {
  const calls: string[][] = [];
  const program = defineProgram({ nodes: [
    { id: "kind", question: () => ({ type: "choice" as const, instructions: "Classify `input`", criteria: { fruit: "fruit", other: "other" } }) },
    { id: "color", dependsOn: ["kind"], when: (a) => a.kind.choice === "fruit", question: () => ({ type: "choice" as const, instructions: "Color?", criteria: { yellow: "yellow", blue: "blue" } }) },
  ] });
  const answers = await runProgram(program, "banana", async ({ questions }) => {
    calls.push(Object.keys(questions));
    return { answers: ("kind" in questions ? { kind: { choice: "fruit" } } : { color: { choice: "yellow" } }) as Record<string, { choice: string }> };
  });
  assert.deepEqual(calls, [["kind"], ["color"]]);
  assert.equal(answers.color.choice, "yellow");
});

test("fails invalid graphs before a gateway request", () => {
  assert.throws(() => plan({ nodes: [{ id: "a", dependsOn: ["nope"], question: () => boolean }] }), ProgramError);
  assert.throws(() => plan({ nodes: [{ id: "a", dependsOn: ["b"], question: () => boolean }, { id: "b", dependsOn: ["a"], question: () => boolean }] }), ProgramError);
});
