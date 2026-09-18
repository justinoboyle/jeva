# Recursive problem and solution spaces

Use when a task benefits from progressively refining subproblems or comparing a supplied set of candidate solutions. Use direct evidence checks for a small flat list. Recursion is a program structure, not a claim that Jev produces hidden reasoning or invents candidate text.

## Formal construction

Let a node v = (id, kind, claim, evidence, provenance). A proposer Γ(v) yields a finite set of candidate refinements. Γ can be deterministic rules, retrieval, the calling agent, or an explicitly authorized generative model. Jev supplies a finite judgment J(v) over the claim and supplied evidence. The controller maintains a frontier Fₜ and visited IDs Vₜ:

    Aₜ = {v ∈ Fₜ : gate(J(v)) = accepted supports}
    Fₜ₊₁ = bounded({u ∈ Γ(v) : v ∈ Aₜ, u.id ∉ Vₜ})
    Vₜ₊₁ = Vₜ ∪ ids(Fₜ₊₁)

Terminal supported nodes are local candidate conclusions. Nonterminal supported nodes permit further exploration. Rejected, uncertain, failed, duplicate, and budget-limited paths remain inspectable. Candidate generation must stay within the user's objective; this evidence oracle does not separately establish relevance or permissions.

This lets Jev help recursively construct a _selected_ search space: its judgments control which proposed branches code expands. It cannot autonomously produce arbitrary subproblem descriptions or solution programs. If it needs to select an expansion operator, ask a separate Choice over a finite declared operator set, then let code apply that operator. Keep an explicit unknown/review outcome. The included implementation uses a fixed caller-supplied expander; operator selection is an extension, not an implemented feature.

Problem decomposition and solution alternatives have different logic. An AND decomposition needs every required child and a valid composition rule. An OR node needs a verified alternative. A support judgment on a parent's descriptive claim does not prove that Γ is an exhaustive decomposition, that its children are jointly satisfiable, or that a child's evidence proves the parent. Preserve that distinction in both types and output.

To claim a complete solution, supply a separate verifier V(solution, requirements). For code this might be tests or a proof checker; for evidence-backed summaries it may be source-grounded coverage of each requested claim. The current search utility returns `candidates`, not `solved`. For formal AND/OR search, maintain explicit obligation IDs, composition rules, and independently checked certificates. Do not infer a solved root by multiplying probabilities along a path.

## What can be proved

- **Bounded work:** with finite roots/expansions and terminating callbacks, at most maxNodes distinct nodes are admitted, at most maxCalls evaluator calls begin, and no node deeper than maxDepth is evaluated. Each breadth-first iteration consumes a nonempty admitted frontier; finite admission bounds the iterations.
- **Bounded concurrency:** the frontier is partitioned into batches of at most batchSize ≤ 128, each passed through `defineProgram`. The Effect worker pool admits at most concurrency evaluation batches at a time. Child frontiers begin after parent judgments and gates finish.
- **Conditional soundness:** if every accepted local claim is true and every decomposition/composition step used by an external verifier is valid, verified conclusions follow by induction on the derivation tree. The utility alone does not establish those hypotheses.
- **No general completeness:** heuristic pruning, unavailable evidence, limited candidate generation, and finite budgets can all omit a valid solution. A contradicted parent description does not logically refute every conceivable descendant. `frontier_exhausted` means the chosen traversal ended, not that the problem was solved or every possibility explored.

These are proofs about control flow under stated callback contracts. Abort signals request cancellation; custom evaluators and expanders must honor them and settle. They do not forcibly interrupt arbitrary trusted JavaScript. Node/call limits are not monetary budgets, and maxStateBytes is a UTF-8 input-size bound, not a model token-count guarantee.

## Runnable implementation

The checkout includes `src/search.ts`, `src/search.test.ts`, and `examples/recursive-space.ts`. `searchSpace(spec, evaluator)` accepts roots, an async expander, and explicit limits. It uses `defineProgram` and the existing runner for each frontier batch. Returned records include original claims, evidence locators, paths, raw answers, gate statistics, and errors. Duplicate IDs are reported, not merged; use unique IDs for context-dependent states. Expansion is currently serialized for predictable admission under the shared node budget; model batches run concurrently.

The example provides explicit refinements for annual and monthly refund claims. Compile from the checkout with a supported Node 22+ runtime:

```sh
npm run demo:search
npm run jev:search
```

Both commands compile first using `tsconfig.examples.json`. `demo:search` uses a labeled fake evaluator and prints `offline-fake-evaluator`; it tests orchestration only. `jev:search` uses configured gateway credentials, sends the example evidence, and disables SDK retries so maxCalls also bounds request attempts in that adapter. It preserves failures with nonzero process status. Live output and thresholds still need evaluation on representative labeled tasks before treating them as a tuned policy.

For several independent user items, schedule bounded batches while preserving per-item IDs. For a large search, choose batchSize, concurrency, depth, and call limits before execution. Keep errors separate from semantic insufficiency. A global configuration error should be resolved before a run; an isolated batch failure should not erase successful siblings. The utility does not yet implement checkpoint/resume, adaptive beam search, caching, monetary accounting, arbitrary AND/OR verification, or automatic model-generated expansion.

## Return an interpretable answer

Project the traversal into what the user asked: supported candidate conclusions and their sources, contradicted claims, unresolved alternatives, and limits that materially affect the answer. A path is provenance, not a model-generated explanation. Avoid dumping the entire tree unless requested. If no candidate meets the gate, return the unresolved result instead of selecting the least uncertain item by default.

When a branch exposes an ambiguity, failed invocation, bad pruning rule, or misleading projection, follow [self-improvement.md](self-improvement.md): retain a minimal regression case, improve the relevant layer, and distinguish demonstrated gains from untested proposals.
