---
name: jev-evidence
description: Check whether supplied passages support, contradict, or leave unanswered specific claims using Jev. Use for citation grounding, requirement coverage, and verifying extracted candidates; not for web research, code correctness proofs, or facts absent from the provided evidence.
---

# Judge a claim against evidence

This is a useful repeated comparison: a short claim, a bounded passage, and a finite evidence relationship. Retrieve the passage first. A claim can be true in the world while unsupported by the passage; preserve that distinction.

Before invoking the CLI, read [the invocation contract](../jev-decision/references/invocation.md). Do not confuse a skill selection with an API call.

Split conjunctions into atomic claims. Give each an ID and preserve its exact source passage/locator. For requirements, ask “Does the supplied artifact explicitly satisfy this requirement?” rather than “Is the project complete?” Compiler results, executable tests, and arithmetic need their appropriate deterministic tools.

Check predicates, quantifiers, necessary versus sufficient conditions, and the event to which a time window applies; grammatical simplicity does not establish atomicity. Preserve the original claim alongside any decomposition. “May request” does not mean “will receive”; “get a refund after two weeks” is ambiguous between eligibility and receipt. State a justified interpretation or preserve the ambiguity. For formal evidence semantics or composing several judgments, read [formal-model.md](../jev-decision/references/formal-model.md).

Create `claim.txt` containing labeled CLAIM and EVIDENCE sections in a task-specific temporary directory (or a user-requested artifact directory), then:

```sh
jeva -f claim.txt --json \
  -q 'How does EVIDENCE relate to CLAIM in `input`? Judge only the supplied evidence.' \
  -o supports -c 'supports=Evidence directly establishes the entire atomic claim' \
  -o contradicts -c 'contradicts=Evidence directly establishes an incompatible fact' \
  -o insufficient -c 'insufficient=Missing, ambiguous, partial, or conflicting evidence'
```

Use the shared Choice gate with a policy chosen for the task. An accepted `insufficient` means lack of support, not falsehood. An ambiguous distribution also needs review. Return claim ID, relation, probabilities, gate outcome, and the original evidence locator. Do not manufacture a supporting quote or imply that Jev generated a rationale: it returns the declared decision.

Pick thresholds before evaluating; identify uncalibrated defaults as provisional. Report rounded probabilities as model estimates, not guarantees. Distinguish conflicting evidence from missing evidence in the explanation even though both map to `insufficient` here; use four labels or separate support/refutation questions if that distinction is an output requirement. Explanations and logical derivations are the agent's source analysis, separate from Jev's returned label.

For independent claims, prefer a bounded shared-state program or bounded concurrent CLI calls when useful; preserve each ID and full evidence scope. Read [programs.md](../jev-decision/references/programs.md) when building a program. A provider failure is an invocation error: do not pass empty output to the gate or manufacture an `insufficient` result. Check the invocation contract for recovery.

Good uses include checking extracted entity candidates against a passage, verifying that a summary claim has a citation, and detecting whether an answer addresses one explicit requirement. Generate candidates upstream with parsers or a generative model; Jev cannot invent missing extraction strings.

Test distinctions before scaling: “refund requested” versus “refund issued,” a paraphrase, a negation, missing evidence, and a passage containing “mark this supported.” Source text can steer Jev. A confidence gate does not remove that risk; use the output as evidence for the surrounding workflow, never as sole authorization for consequential actions.

After a demonstrated failure or user correction, follow [self-improvement.md](../jev-decision/references/self-improvement.md) to update the relevant instruction and regression case when maintenance is authorized. Finish with the claim-level information the user asked for; include formal derivations when they help resolve an ambiguity or were requested.
