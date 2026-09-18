import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineProgram, runProgram, type Answer } from "./program.js";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = resolve(checkout, "scripts/workflow.mjs");
const labels = ["supports", "contradicts", "insufficient"];
type GateResult = { status: "accepted" | "review" | "error"; choice?: string; probability?: number; margin?: number };
type DesignReport = {
  mode: string; calls: number; observations: (GateResult & { id: string })[];
  eligible: string[]; selection: GateResult; outcome: { status: string; candidate: { id: string } };
};
let gate: (answer: Answer | undefined, labels: readonly string[], minimum?: number, separation?: number) => GateResult;
let readReasoningState: (file: string) => Promise<unknown>;
let design: DesignReport;
let fixtureDirectory: string;
let fixtureId = 0;

function runWorkflow(args: string[], cwd = tmpdir()) {
  // A different cwd detects accidental dependence on the caller's location.
  return spawnSync(process.execPath, [wrapper, ...args], {
    cwd, encoding: "utf8", timeout: 90_000,
  });
}

before(async () => {
  const result = runWorkflow(["decide"]);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  design = JSON.parse(result.stdout);
  const moduleUrl = pathToFileURL(resolve(checkout, "dist/templates/examples/support/evaluation.js")).href;
  ({ gate } = await import(moduleUrl));
  const stateUrl = pathToFileURL(resolve(checkout, "dist/templates/examples/support/reasoning-state.js")).href;
  ({ readReasoningState } = await import(stateUrl));
  fixtureDirectory = await mkdtemp(resolve(tmpdir(), "jeva-workflow-test-"));
});

after(async () => { if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true }); });

async function stateFile(value: unknown) {
  const file = resolve(fixtureDirectory, `state-${fixtureId++}.json`);
  await writeFile(file, JSON.stringify(value));
  return file;
}

test("workflow compiles and runs the design fixture from another working directory", () => {
  assert.equal(design.mode, "offline-fixture");
  assert.equal(design.calls, 2);
  assert.equal(design.observations.length, 9);
  assert.deepEqual(design.observations.map((observation: { id: string }) => observation.id), [
    "c0_r0", "c0_r1", "c0_r2", "c1_r0", "c1_r1", "c1_r2", "c2_r0", "c2_r1", "c2_r2",
  ]);
  assert.ok(design.observations.every((observation: GateResult) => observation.status === "accepted"));
  assert.ok(design.observations.slice(0, 3).every((observation: GateResult) => observation.choice === "insufficient"));
  assert.deepEqual(design.eligible, ["fixed_graph", "recursive_frontier"]);
  assert.equal(design.selection.status, "accepted");
  assert.equal(design.outcome.status, "candidate-design");
  assert.equal(design.outcome.candidate.id, "recursive_frontier");
});

test("workflow audit fixture yields a gated proposal after two dependency rounds", () => {
  const result = runWorkflow(["audit"]);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.mode, "offline-fixture");
  assert.equal(audit.calls, 2);
  assert.equal(audit.coverage.status, "accepted");
  assert.equal(audit.coverage.choice, "missed_opportunity");
  assert.equal(audit.next.status, "accepted");
  assert.equal(audit.next.choice, "compiled_design");
  assert.equal(audit.proposedNextStep.id, audit.next.choice);
});

test("workflow rejects unknown commands and flags without running an example", () => {
  for (const args of [[], ["unknown"], ["decide", "--unknown"], ["audit", "--live", "--unknown"],
    ["audit", "--live", "--live"], ["audit", "--state"], ["audit", "--state", "--live"],
    ["audit", "--state", "one.json", "--state", "two.json"], ["decide", "--state", "one.json"]]) {
    const result = runWorkflow(args);
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Usage:/);
  }
});

const state = {
  objective: "Check the current task's evidence.", requestedMethod: "Use bounded judgments.",
  completed: [], unresolved: ["Decide which source supports the claim."],
  opportunities: [{ id: "evidence_check", description: "Judge the claim against supplied evidence." }],
};

test("provided single-opportunity audit resolves a relative state path and skips a needless second judgment", async () => {
  const file = await stateFile(state);
  const result = runWorkflow(["audit", "--state", file.split("/").at(-1)!], fixtureDirectory);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.inputSource, "provided-state");
  assert.equal(audit.calls, 1);
  assert.equal(audit.coverage.choice, "missed_opportunity");
  assert.equal(Object.hasOwn(audit, "next"), false);
  assert.deepEqual(audit.proposedNextStep, state.opportunities[0]);
});

test("audit fixtures with no unresolved work or no candidates abstain from proposing further work", async () => {
  for (const input of [{ ...state, unresolved: [] }, { ...state, opportunities: [] }]) {
    const file = await stateFile(input);
    const result = spawnSync(process.execPath, [resolve(checkout, "dist/templates/examples/reasoning-loop.js"), "--state", file], {
      cwd: fixtureDirectory, encoding: "utf8", timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const audit = JSON.parse(result.stdout);
    assert.equal(audit.calls, 1);
    assert.equal(audit.coverage.choice, "adequate");
    assert.equal(Object.hasOwn(audit, "next"), false);
    assert.equal(Object.hasOwn(audit, "proposedNextStep"), false);
  }
});

test("audit state parser rejects malformed, oversized, and ambiguous state", async () => {
  assert.deepEqual(await readReasoningState(await stateFile(state)), state);
  for (const input of [
    { ...state, objective: " " }, { ...state, requestedMethod: "" },
    { ...state, completed: [123] }, { ...state, unresolved: "not an array" },
    { ...state, opportunities: [state.opportunities[0], state.opportunities[0]] },
    { ...state, opportunities: [{ id: " ", description: "evidence check" }] },
    { ...state, opportunities: [{ id: "evidence_check", description: " " }] },
    { ...state, objective: "é".repeat(32_001) },
  ]) {
    await assert.rejects(readReasoningState(await stateFile(input)));
  }
  const invalidJson = resolve(fixtureDirectory, "invalid.json");
  await writeFile(invalidJson, "{");
  await assert.rejects(readReasoningState(invalidJson));
  const result = runWorkflow(["audit", "--state", invalidJson]);
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
});

const choice = (winner: string, probabilities: Record<string, number>): Answer => ({ type: "choice", choice: winner, probabilities });

test("example gate separates accepted observations, review, and malformed answers", () => {
  const cases: { name: string; answer: Answer | undefined; expected: GateResult["status"]; minimum?: number; separation?: number }[] = [
    { name: "inclusive probability boundary", answer: choice("supports", { supports: 0.9, contradicts: 0.05, insufficient: 0.05 }), expected: "accepted" },
    { name: "confident missing evidence", answer: choice("insufficient", { supports: 0.01, contradicts: 0.01, insufficient: 0.98 }), expected: "accepted" },
    { name: "below probability boundary", answer: choice("supports", { supports: 0.89, contradicts: 0.06, insufficient: 0.05 }), expected: "review" },
    { name: "below separation boundary", answer: choice("supports", { supports: 0.6, contradicts: 0.4, insufficient: 0 }), minimum: 0.5, separation: 0.25, expected: "review" },
    { name: "tied winners", answer: choice("supports", { supports: 0.5, contradicts: 0.5, insufficient: 0 }), minimum: 0.5, separation: 0, expected: "review" },
    { name: "missing answer", answer: undefined, expected: "error" },
    { name: "missing probability map", answer: { type: "choice", choice: "supports" }, expected: "error" },
    { name: "unexpected labels", answer: choice("supports", { supports: 0.98, contradicts: 0.01, other: 0.01 }), expected: "error" },
    { name: "unreported option", answer: choice("supports", { supports: 0.98, contradicts: 0.02 }), expected: "error" },
    { name: "winner outside distribution", answer: choice("other", { supports: 0.98, contradicts: 0.01, insufficient: 0.01 }), expected: "error" },
    { name: "nonmaximal winner", answer: choice("supports", { supports: 0.01, contradicts: 0.98, insufficient: 0.01 }), expected: "error" },
    { name: "unnormalized distribution", answer: choice("supports", { supports: 0.98, contradicts: 0.5, insufficient: 0.5 }), expected: "error" },
    { name: "nonfinite probability", answer: choice("supports", { supports: NaN, contradicts: 0.01, insufficient: 0.01 }), expected: "error" },
  ];
  for (const entry of cases) {
    assert.equal(gate(entry.answer, labels, entry.minimum, entry.separation).status, entry.expected, entry.name);
  }
});

test("guarded program never requests a dependent judgment after review, errors, or a different accepted label", async () => {
  const answers = [
    undefined,
    choice("supports", { supports: 0.6, contradicts: 0.3, insufficient: 0.1 }),
    choice("insufficient", { supports: 0.01, contradicts: 0.01, insufficient: 0.98 }),
    choice("contradicts", { supports: 0.01, contradicts: 0.98, insufficient: 0.01 }),
    choice("supports", { supports: 0.98, contradicts: 0.01, other: 0.01 }),
    choice("supports", { supports: 0.98, contradicts: 0.01, insufficient: 0.01 }),
  ];
  for (const answer of answers) {
    const rounds: string[][] = [];
    const program = defineProgram({ nodes: [
      { id: "observation", question: () => ({ type: "choice" as const, instructions: "Judge `input`.", criteria: Object.fromEntries(labels.map(label => [label, label])) }) },
      { id: "next", dependsOn: ["observation"],
        when: observations => { const result = gate(observations.observation, labels); return result.status === "accepted" && result.choice === "supports"; },
        question: () => ({ type: "boolean" as const, instructions: "Judge the accepted observation in `answers.observation`." }),
      },
    ] });
    const result = await runProgram(program, { evidence: "fixture" }, async (request): Promise<{ answers: Record<string, Answer> }> => {
      rounds.push(Object.keys(request.questions));
      if (Object.hasOwn(request.questions, "observation")) return { answers: answer ? { observation: answer } : {} };
      assert.deepEqual((request.state as { answers: Record<string, Answer> }).answers.observation, answer);
      return { answers: { next: { type: "boolean", probability: 0.98 } } };
    });
    const judgment = gate(answer, labels);
    const enabled = judgment.status === "accepted" && judgment.choice === "supports";
    assert.deepEqual(rounds, enabled ? [["observation"], ["next"]] : [["observation"]]);
    assert.equal(Object.hasOwn(result, "next"), enabled);
  }
});
