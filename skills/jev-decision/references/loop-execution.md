# Execute the loop and verify its evidence

Use when the task asks for a repeated Jev-assisted workflow, first-class model exit conditions, or evidence that an agent actually consumed Jev's answers. The [formal loop guide](../../../docs/agent-loops.md) distinguishes conditional guarantees, recorded access, semantic correctness, and receipt authenticity.

## Compile an exit condition with the work

Encode typed current state, observation nodes, deterministic transitions, required evidence, and terminal reasons. Make completion a declared Choice question when it requires a semantic judgment. State contrasting completion/continuation/insufficiency criteria against exact state paths, validate the returned label set and distribution, and enforce the selected probability and margin thresholds in code. Keep deterministic prerequisites such as required IDs, test results, permissions, and budget bounds outside the model question.

Use the implemented loop runner and receipt recorder; inspect their current types and CLI help before authoring an invocation. Do not invent flags or describe an unexecuted sketch as a functioning loop. Bound rounds, evaluator calls, wall-clock waiting, and callback concurrency. Batch independent observations, declare real dependencies, and preserve absent/skipped outcomes. A call budget is not a token or monetary budget; ensure the evaluator's retries match the stated bound.

After compiling the trusted modules, the supported command shapes are:

```sh
jeva run program.js --input-json state.json --receipt run.json
jeva verify run.json --require-live --min-calls 1
jeva loop task-loop.js --input-json state.json --report loop-report.json
```

`--input-json` reads structured state. A loop module supplies its typed definition and mandatory limits; omitted input uses its initial state. Use `jeva exit --policy policy.json --answer answer.json` to replay a bare Choice answer against policy, not to perform a model evaluation. A replayed gate alone proves no invocation or consumption. Keep receipt verification and loop completion as separate checks.

An accepted semantic exit label can terminate under the declared policy. Review, missing evidence, invalid results, exhausted budget, timeout, and cancellation are different outcomes. Return the actual reason; do not treat a budget stop as completed work. No amount of confidence grants authority for an external action.

## Produce evidence of actual use

1. Supply the current task snapshot and execute the compiled program. An embedded demonstration or fixture is not evidence about changed current work.
2. Record the actual evaluator path, declared mode, model observations, distributions, gate, terminal reason, and consumption evidence the implementation supports. The recorder observes calls, not answer-property reads. Loop `consumedCallIds` are validated declarations, while the runner itself reads the recorded exit answer and recomputes its gate. Do not promote a declaration into proof of arbitrary answer consumption or causal influence.
3. Run the receipt verifier on the saved artifact. If the recorder or verifier fails, preserve that failure. Never fabricate probabilities, invent a successful receipt, or substitute a prose assurance that Jev was used.
4. Where the task calls for behavioral assurance, test the consuming branch using controlled opposite and uncertain answers. Verify that its output responds as the declared policy requires. Keep fixture tests separate from live semantic evaluations.
5. Project the result into the requested answer and remaining obligations. Explain that consistency verification is conditional on trusted instrumentation and an unmodified execution environment; unsigned logs are not proof of authenticity or hidden reasoning. `mode: "live"` is a caller declaration, not provider attestation.

Save receipts and loop reports locally with mode `600` in a private task directory. The receipt avoids raw prompts/state but retains metadata and answer fields; loop reports can contain private state. Do not upload them, send them to another model, or commit them publicly as part of this workflow. If an example must be shared, author a separate sanitized fixture and identify it as such; never relabel it as the original run.

## Improve the method from observed failures

The recurring omission this reference corrects is claiming a reasoning loop uses Jev based on a plan, an example invocation, or a declared dependency. Require the actual run and inspectable consumption/exit evidence appropriate to the claim. A receipt records only its instrumented scope: unrelated terminal activity and later agent decisions are not covered automatically.

Keep a regression where the answer is returned but not read, one where it is read but ignored, and one where accepted/uncertain/opposite outcomes change the branch. Keep an invalid distribution and a budget termination case to prevent false completion. Check these deterministically; use independently labeled live cases for semantic quality. Apply [self-improvement.md](self-improvement.md) to a demonstrated miss, and retain uncertainty when evidence does not establish an improvement.
