# Audit and improve the current reasoning program

Use when the user requests active Jev assistance or a substantive multi-step task has unresolved semantic decisions. A usage audit asks whether useful observations are missing from the current program. The number of calls is not the objective, and a model cannot establish its own correctness by endorsing its work.

## Supply current state and actually invoke

Create a task-specific JSON file with this shape, replacing every example value with observations from the current task. Keep the completed list factual; mark proposed or unverified work as unresolved. Opportunity IDs name finite workflows the caller knows how to execute.

```json
{
  "objective": "Choose a representation for adaptive evidence checks",
  "requestedMethod": "Compile typed problems and use Jev for semantic observations",
  "completed": ["The compiler and offline scheduler tests passed"],
  "unresolved": ["Which supplied design descriptions cover the requirements?"],
  "opportunities": [
    {
      "id": "requirements",
      "description": "Judge each candidate description against each requirement; gate results, then choose among eligible candidates"
    },
    {
      "id": "retrieval",
      "description": "Identify whether the supplied passages leave a required claim unanswered"
    }
  ]
}
```

```sh
npm run jev:audit -- --state task.json
```

The workflow compiles TypeScript, validates state, and runs the guarded `coverage → next` graph in `examples/reasoning-loop.ts`. `coverage` judges whether a useful supplied opportunity remains. Only an accepted `missed_opportunity` with multiple opportunities enables `next`, which selects an opportunity ID. With one supplied opportunity, code proposes it directly after accepted coverage; with none, no next step is proposed. The caller checks the gates and performs the corresponding authorized workflow. An accepted `adequate` means the supplied opportunities contain no judged actionable gap; it does not prove that all possible opportunities were enumerated. Review, insufficient context, and invocation errors remain separate outcomes.

Without `--state`, the example uses embedded demonstration state. `demo:audit` uses a synthetic evaluator. Neither establishes that the current task was audited. CLI output is an observation artifact, not evidence that the recommended work was executed. Perform that work and record its result before marking it completed.

## A bounded controller around the graph

Represent controller state as Sₜ = (objective, observations, unresolved, opportunities, revision, budget). Each cycle uses the following transitions:

1. Prepare a fresh state snapshot from retrieved evidence and verified tool results. Generate finite opportunities with the agent or code; Jev cannot invent arbitrary descriptions.
2. Compile and run the audit graph. Preserve probabilities, thresholds, statuses, and snapshot revision.
3. When a useful opportunity is selected, compile its typed observation graph and execute it. Independent observations share a layer; independent batches use a bounded worker pool. Chain only declared data or guard dependencies.
4. Apply deterministic gates and composition. Verify the resulting artifact using the appropriate tools. Update completed and unresolved from the actual outcome.
5. Re-audit after a material state change or phase boundary, within a chosen call/round budget. Stop on completed objective, exhausted budget, or a prerequisite that prevents useful progress. Retrieve missing context or improve the opportunity set before treating an inconclusive audit as actionable.

The included example implements one audit cycle; the calling agent owns these outer transitions. It is not a daemon, a task executor, or a general automatic optimizer. Deduplicate evaluations by state revision and question version; do not repeatedly query an unchanged snapshot for a preferred answer. If opportunities are all deterministic, run those checks and record that boundary; do not invent a semantic uncertainty to fill the audit.

**Termination lemma.** If the controller starts with a finite round budget B, each entered cycle decreases it by one, and every invoked operation settles, at most B cycles execute. This establishes a bound, not goal completion. Use deadlines and cancellation-aware evaluators to enforce the operation contract. Parallelism changes scheduling, not the proof obligation or the independence of model errors.

**Action invariant.** Every executed action is chosen from a caller-supplied opportunity and passes the caller's existing authority and applicability checks. A gate accepts a semantic observation only; it does not grant permission. This invariant requires the consuming controller to enforce it and is not automatically supplied by `defineProgram`.

## Improve from what the loop exposes

When an audit or user correction reveals a reusable omission, follow [self-improvement.md](self-improvement.md). Record the old behavior and an independent expectation, change the narrowest relevant instruction or representation, and verify that layer. Audits can suggest what to test; their predictions cannot serve as their own ground truth. Preserve negative and ambiguous examples alongside success cases.

The user-facing answer should say what was established for the requested task, which evidence supports it, and what remains unresolved. Link the typed program or saved report when useful. Do not narrate every audit cycle or attribute a generated rationale to Jev.
