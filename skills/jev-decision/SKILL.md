---
name: jev-decision
description: Design Jev choice, boolean, score, and typed decision-program questions for this CLI when software needs a fast structured judgment rather than generated prose.
---

# Jev decisions in this repository

Use a one-liner for one atomic decision. Use `defineProgram()` for a dependency graph whose nodes must be type-checked and evaluated safely.

- Give Jev only the state needed for the judgment. Name `input` or another exact state path in the instructions.
- Choice options must be complete and contrasting; add `other` if needed. Boolean asks a crisp true/false condition. Score levels describe distinct situations from low to high.
- Put questions with no data dependency in the same layer. Use `dependsOn` only when a later question truly needs an earlier answer; use `when` to make routing deterministic in TypeScript.
- Keep thresholds and actions in code. A probability or confidence is a signal, not a proof of correctness.
- Test each program’s expected branch with a fake evaluator. Test missing dependencies and cycles before using the gateway.

Prefer `jeva --json` for pipes that need answer details, e.g. `jeva ... --json | jq -r '.answers.answer.choice'`. Default scalar output is for chaining a result directly into the next command.
