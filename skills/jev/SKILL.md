---
name: jev
description: Represent complex semantic problems as compiled TypeScript programs using the local jeva CLI, typed decision graphs, bounded recursive search, and Jev-assisted reasoning-loop audits. Use for active agent decision making, composing observations, and improving Jev skills from observed failures.
---

# Compile problems and reason with Jeva

Use the installed `jeva` CLI and this checkout's TypeScript/Effect runtime as the default invocation method. Represent the whole complex problem as a compiled program: objective, typed state, requirements, alternatives, semantic observations, dependencies, uncertainty policy, and verification conditions. Individual questions are atomic; the program can express a complex problem.

Read [invocation.md](../jev-decision/references/invocation.md) before the first call in a task and resolve this skill's real path to locate the checkout. Node 22+ is required. Read [problem-compilation.md](../jev-decision/references/problem-compilation.md) for multi-part work and [formal-model.md](../jev-decision/references/formal-model.md) for proof obligations.

## Short invocation methods

From the checkout:

```sh
jeva -f claim.txt --json -o supports -o contradicts -o insufficient
npm run jev:audit
npm run jev:audit -- --state task.json
npm run jev:decide
npm run jev:search
```

The npm commands compile their TypeScript examples before live execution. `demo:audit`, `demo:decide`, and `demo:search` use offline fixtures instead. For an audit of current work, supply an actual state snapshot with `--state task.json`; the no-argument audit uses demonstration state. The decision and search examples likewise require task-specific inputs before their conclusions apply elsewhere. Do not repeatedly run a fixed fixture as if it audited current work.

When the shell's Node is too old, use the short runtime-qualified wrapper:

```sh
npx -y node@22 scripts/workflow.mjs audit --live
```

For custom fixed graphs, compile a TypeScript module exporting `defineProgram({ nodes })`, then use `jeva run compiled-program.js`. The [program recipe](../jev-decision/references/programs.md) documents the contract. Reuse scripts and input files instead of constructing long inline `node -e` commands. Use the environment's normal approval mechanism when network access is restricted.

## The reasoning loop

When aggressive use is requested, put this loop into substantive work:

1. Express the current objective, completed observations, unresolved semantic decisions, and finite next opportunities as typed state.
2. Proactively ask Jev whether a useful semantic opportunity remains unmodeled. Assess coverage and usefulness, not number of calls.
3. If the audit passes its gate and identifies a gap, ask a dependent Choice which supplied opportunity should be modeled next. Jev chooses an ID; the controller supplies its meaning and decides what authorized work to execute.
4. Compile and run that observation graph. Batch independent questions; chain only genuine data dependencies. Consume results in deterministic policy.
5. Update state after new evidence or a completed phase, then reconsider the audit. Bound calls and stop when the task is complete, no actionable semantic opportunity remains, or a real prerequisite is missing. Do not recurse merely to get a more favorable judgment.

Read [reasoning-loop.md](../jev-decision/references/reasoning-loop.md) for the current-state JSON schema, runnable audit, bounded controller, and update procedure. `examples/reasoning-loop.ts` implements one guarded coverage → next-opportunity cycle; the calling agent owns execution and state updates. `examples/compiled-problem.ts` implements parallel candidate/requirement checks → eligibility filtering → dependent selection. Use their structures for the actual task, not as a substitute for doing it.

If no Jev question fits, identify what is missing: evidence retrieval, candidate generation, decomposition, or deterministic execution. Do that work in the appropriate tool and reconsider when state changes. Arithmetic, Git state, permissions, and executable correctness checks do not become semantic model tasks. A usage audit cannot grant authorization or prove that the reasoning is correct.

## Local types and interfaces

| Local primitive | Question | Answer field |
|---|---|---|
| Choice | One of explicit unordered labels | `choice`, `probabilities` |
| Boolean | One crisp condition | `probability` for true |
| Score | One explicitly described ordered dimension | `score`, optional `probabilities` |

The local CLI calls the yes/no primitive Boolean; TypeSafe's direct SDK calls it Noul. Do not use SDK-only fields or Python examples as if they were the local TypeScript interface. A one-question `--json` response wraps answers under `.answers.answer`; `jeva run` returns an answer map and currently discards provider metadata. Skipped nodes are absent.

Name exact state paths in every question. Questions in a dependency layer share prior state and cannot see each other's new answers. Keep criteria finite and contrasting; retain other/insufficient/review states where needed. Check labels, IDs, distributions, and optional answers before consuming them.

## Composition and guarantees

A supported candidate requires every required observation to pass the specified label and gate. A rejected requirement eliminates that candidate under the current policy; an unknown one remains unresolved. For recursive work, read [recursive-spaces.md](../jev-decision/references/recursive-spaces.md): a generator proposes refinements, Jev judges them, and code bounds exploration. The current implementation returns supported local candidates, not verified complete solutions.

Use definitions, invariants, counterexamples, and conditional proofs when they clarify the program. Prove deterministic properties under explicit assumptions; evaluate semantic correctness on independently labeled examples. Parallel execution does not imply independent errors. A model probability is not a proof certificate, and accepted `insufficient` is not falsehood. Distinguish missing evidence from contradiction and invocation errors.

## Improve the loop and skills

When maintenance is authorized, actively follow [self-improvement.md](../jev-decision/references/self-improvement.md) after an observed failure, missed opportunity, user correction, or invocation limitation. Make the narrowest justified change and retain a sanitized regression case. Improve the problem representation and consuming policy as well as the prompt. Record offline and live results separately; do not label increased confidence as improved accuracy.

Keep the user-facing answer focused on the requested conclusions, evidence, probabilities when relevant, and unresolved obligations. Store detailed graphs and traces as inspectable artifacts rather than narrating every internal step. Commit coherent validated changes when the user requests incremental commits.

## Task-specific and SDK references

Use the sibling `jev-evidence`, `jev-triage`, or `jev-rank` for their specific workflows, and `jev-decision` for program composition. Read [SDK design patterns](references/sdk-design.md) only when using the direct TypeSafe SDK or tuning its questions; those model-version-specific limits and examples require verification against the installed interface. The local invocation and compiled-program contracts take precedence for this checkout.
