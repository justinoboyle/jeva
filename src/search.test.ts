import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { searchSpace, type Candidate, type SearchEvaluator } from "./search.js";

const node = (id: string, kind: "problem" | "solution" = "problem"): Candidate => ({
  id, kind, claim: `Claim ${id}`, evidence: [{ locator: `source:${id}`, text: `Evidence ${id}` }],
});
const answer = (choice = "supports") => ({ type: "choice", choice,
  probabilities: { supports: choice === "supports" ? 0.96 : 0.02,
    contradicts: choice === "contradicts" ? 0.96 : 0.02,
    insufficient: choice === "insufficient" ? 0.96 : 0.02 } });
const accepts: SearchEvaluator = async ({ questions }) => ({
  answers: Object.fromEntries(Object.keys(questions).map(id => [id, answer()])),
});

test("recursive search batches siblings, expands accepted problems, and preserves paths", async () => {
  const sizes: number[] = [];
  const result = await searchSpace({ objective: "check source", roots: [node("a"), node("b")],
    expand: async parent => [node(`${parent.id}-leaf`, "solution")],
  }, async request => { sizes.push(Object.keys(request.questions).length); return accepts(request, new AbortController().signal); });
  assert.deepEqual(sizes, [2, 2]);
  assert.deepEqual(result.candidates.map(r => r.path), [["a", "a-leaf"], ["b", "b-leaf"]]);
  assert.equal(result.calls, 2);
  assert.equal(result.stopped, "frontier_exhausted");
  assert.equal(result.records[0].candidate.evidence[0].locator, "source:a");
});

test("independent batches really overlap and never exceed the concurrency bound", async () => {
  let active = 0, peak = 0;
  const evaluate: SearchEvaluator = async (request, signal) => {
    active++; peak = Math.max(peak, active);
    await yieldTurn();
    const output = await accepts(request, signal);
    active--; return output;
  };
  const result = await searchSpace({ objective: "parallel", roots: Array.from({ length: 6 }, (_, i) => node(`leaf-${i}`, "solution")),
    expand: async () => [], limits: { batchSize: 1, concurrency: 2 },
  }, evaluate);
  assert.equal(peak, 2);
  assert.equal(result.candidates.length, 6);
});

test("one failed batch retains successful siblings and records errors without probabilities", async () => {
  const result = await searchSpace({ objective: "partial failure", roots: [node("a", "solution"), node("b", "solution")],
    expand: async () => [], limits: { batchSize: 1, concurrency: 2 },
  }, async (request, signal) => {
    if (JSON.stringify(request.state).includes('"id":"a"')) throw new Error("offline");
    return accepts(request, signal);
  });
  assert.equal(result.records[0].status, "error");
  assert.equal(result.records[0].answer, undefined);
  assert.equal(result.candidates[0].candidate.id, "b");
});

test("review, insufficient, and contradictions are preserved and never expanded", async () => {
  let expansions = 0;
  const result = await searchSpace({ objective: "gates", roots: [node("a"), node("b"), node("c")],
    expand: async () => { expansions++; return []; },
  }, async ({ questions }) => ({ answers: Object.fromEntries(Object.keys(questions).map((id, i) => [id,
    i === 0 ? { type: "choice", choice: "supports", probabilities: { supports: 0.5, contradicts: 0.5, insufficient: 0 } }
      : answer(i === 1 ? "insufficient" : "contradicts")])) }));
  assert.equal(expansions, 0);
  assert.deepEqual(result.records.map(r => r.status), ["review", "insufficient", "contradicts"]);
});

test("depth, node, and call limits stop expansion with unresolved paths", async () => {
  for (const limits of [{ maxDepth: 0 }, { maxNodes: 1 }, { maxCalls: 1, batchSize: 1 }]) {
    const result = await searchSpace({ objective: "bounded", roots: [node("root")], limits,
      expand: async parent => [node(`${parent.id}-child`)],
    }, accepts);
    assert.equal(result.stopped, "limited");
    assert.ok(result.unresolved.length > 0);
    assert.ok(result.calls <= (limits.maxCalls ?? 32));
  }
});

test("duplicate IDs and malformed answer distributions cannot masquerade as accepted nodes", async () => {
  const cycle = await searchSpace({ objective: "cycle", roots: [node("a")], expand: async () => [node("a")] }, accepts);
  assert.ok(cycle.unresolved.some(r => r.reason === "duplicate_id"));
  const invalid = await searchSpace({ objective: "invalid", roots: [node("a")], expand: async () => [] },
    async () => ({ answers: { q0: { type: "choice", choice: "supports", probabilities: { supports: 1 } } } }));
  assert.equal(invalid.records[0].status, "error");
  assert.equal(invalid.candidates.length, 0);
});

test("expander failures and missing answers remain unresolved without losing provenance", async () => {
  const expanded = await searchSpace({ objective: "expand", roots: [node("a")], expand: async () => { throw new Error("generation failed"); } }, accepts);
  assert.equal(expanded.unresolved[0].reason, "expansion_error");
  const absent = await searchSpace({ objective: "missing", roots: [node("a")], expand: async () => [] }, async () => ({ answers: {} }));
  assert.equal(absent.records[0].status, "error");
  assert.deepEqual(absent.records[0].path, ["a"]);
});

test("oversized state and invalid limits fail before any model request", async () => {
  let calls = 0;
  const evaluate: SearchEvaluator = async (request, signal) => { calls++; return accepts(request, signal); };
  const result = await searchSpace({ objective: "bytes", roots: [node("a")], expand: async () => [], limits: { maxStateBytes: 1 } }, evaluate);
  assert.equal(result.records[0].status, "error");
  assert.equal(calls, 0);
  await assert.rejects(searchSpace({ objective: "bad", roots: [], expand: async () => [], limits: { concurrency: 0 } }, evaluate));
});
