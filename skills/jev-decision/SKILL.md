---
name: jev-decision
description: Build or tune reusable Jev decision programs, batched judgments, conditional workflows, and confidence policies. Use for composing several semantic decisions or diagnosing inaccurate Jev questions; use task-specific Jev skills for triage, evidence checks, or relevance scoring.
---

# Compose Jev decisions

Jev is useful where software needs a small semantic judgment over supplied context, especially when repeated across inputs. Start by writing the decisions the caller actually consumes. Do not call it for arithmetic, exact string matching, prose generation, external fact discovery, or an answer already established by a deterministic tool.

Read [invocation.md](references/invocation.md) before invoking the CLI; it covers global symlinks, inputs, output contracts, and current runtime limitations. Read [programs.md](references/programs.md) when authoring a multi-question template. These references are sufficient; do not load every sibling skill.

For first-principles design, composition guarantees, or proof obligations, read [formal-model.md](references/formal-model.md). Treat Jev as a probabilistic semantic oracle inside a deterministic program: specify preconditions, finite answer types, invariants, and failure cases. Prove properties of code under explicit assumptions; measure semantic correctness on labeled evidence. A model distribution is not a proof certificate.

For recursive problem/solution exploration, read [recursive-spaces.md](references/recursive-spaces.md). It describes the runnable bounded frontier search, candidate expansion contract, parallel batches, and distinction between a supported local candidate and a verified complete solution.

## Design from the consuming code backward

For complex work, first read [problem-compilation.md](references/problem-compilation.md) and encode the whole problem as a typed, compiled program. Explicitly represent objective, inputs, requirements, alternatives, observations, dependencies, uncertainty policy, and verification conditions. Compile and run it; describing a possible program is not the requested workflow. Individual Jev questions stay atomic while deterministic composition expresses the complex problem. Use a one-question CLI call for genuinely atomic work, not as the default representation of a multi-part task.

For explicitly requested aggressive use, keep a small decision ledger for substantive semantic choices: question, available state, finite labels, dependencies, selected outcome, gate, and consuming decision. Actually invoke Jev for applicable observations, rather than only describing how it could help. When bypassing Jev, identify the missing prerequisite or deterministic operation and reconsider after the state changes. Maximize useful composable judgments, not artificial dependency depth or repeated votes on an unchanged question.

Proactively audit coverage at substantive phase boundaries using [reasoning-loop.md](references/reasoning-loop.md): supply current typed state, ask whether a useful semantic opportunity remains, and gate a dependent selection among finite next workflows. Run `npm run jev:audit -- --state task.json`, then perform the selected authorized work and update state from its observed result. Bound audit rounds and calls. The default embedded demonstration and offline evaluator do not audit current work; a coverage label does not prove completeness.

For a repeated executable task, first-class Jev exit conditions, or evidence of actual consumption, read [loop-execution.md](references/loop-execution.md). Use the implemented loop and receipt APIs, validate and gate the semantic exit Choice, and verify the actual saved receipt. Preserve budget/failure exits separately from completion, keep receipts private, and distinguish recorded access from causal influence or authenticity.

1. Name the outputs and the code branches they control. Write the fallback as well as the happy path.
2. Separate semantic observations from policy. For example, ask whether a customer requests a refund and whether a refund was already issued as two independent observations; compute the queue in code.
3. Pick Choice for one of named alternatives, Boolean for a crisp proposition, Score for one ordered dimension. A Boolean probability near 0.5 means uncertainty, not medium severity.
4. Keep instructions literal, with exact state paths. IDs are output labels, not prompts. Supply context and contrasting definitions; add `other`, `insufficient`, or `none` when coverage is incomplete.
5. Batch independent observations sharing bounded state when the saved latency justifies extra questions. Draw a dependency edge when a later question's input, criteria, or execution guard needs a prior answer. If all inputs are already available, compare speculative fan-out against conditional execution; conditional use of an answer alone does not require a second request. Parallel execution does not imply statistically independent errors.
6. Keep scores, weights, counts, dates, routing, and action execution in code. Include a review outcome for ambiguous results. Model judgments cannot grant permission to act.

## What to measure

Use labeled examples including positives, nearby negatives, missing evidence, multiple intents, and input text trying to dictate the result. Freeze some examples as holdouts. Log predicted labels, probabilities, abstentions, latency, and available usage; compare against a deterministic baseline. Tune thresholds on development data and report both error rate and coverage on holdouts. Higher confidence by itself is not improvement.

Change one question boundary at a time. If a multi-part question cannot be tuned without trading unrelated errors, split it. An extreme Score level needs its own concrete description; each level must make sense alone. Do not let the same item's inferred labels stand in for ground truth.

## Improve from actual use

After a meaningful failure, correction, blocked invocation, or newly discovered limitation, use [self-improvement.md](references/self-improvement.md). When ongoing skill maintenance is authorized, actively make the smallest justified update to the canonical skill/reference and add a regression case. Otherwise retain the finding in the current deliverable. Distinguish a proposed improvement from a measured one; do not spend live calls merely to claim continuous activity.

## Completion

Deliver the runnable invocation or template, input/output example, routing policy, and observed checks. Distinguish offline policy tests from live model evaluations. Missing credentials permit authoring and offline tests, not a claim that Jev agreed with the design.

Project the internal result back to the user's requested information. Include formal notation when it clarifies a guarantee or the user requests it; omit irrelevant execution metadata. Report partial failures by ID instead of dropping them or labeling them `insufficient`.

TypeSafe guidance: [fan-out](https://docs.typesafe.ai/patterns/fan-out), [model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13). Recheck model-specific limits if the gateway alias changes.
