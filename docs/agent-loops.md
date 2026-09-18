# Agent loops with Jev exit conditions

A Jev-assisted loop should do more than make a model call and continue an unrelated plan. Represent its current state, execute a typed observation program, consume the returned judgments in code, and record what controlled the next step. When completion itself needs a semantic judgment, make that judgment an explicit exit condition.

The distinction matters: a declared dependency says an answer may be available; it does not establish that the consumer read it. A recorded model call establishes an evaluation in the instrumented workflow; it does not establish that its output changed the decision. An execution receipt makes these claims inspectable within stated limits.

## A state machine, not a paragraph promising a loop

Let S be typed task states, O observations, A authorized actions, and R terminal reasons. A loop consists of a bounded transition system:

```text
observe : S → O ∪ InvocationError
judge   : (S, O) → Distribution<ExitLabel> ∪ InvocationError
gate    : Distribution<ExitLabel> → Accepted<ExitLabel> ∪ Review
step    : (S, O) → S
project : (S, O, R) → UserAnswer
```

These signatures describe the design, not exported TypeScript declarations. Compile the actual controller against the installed API. Represent missing evidence, contradictory evidence, review, and execution errors separately. The exit question names the current requirement set and evidence paths; it must not ask whether the model feels finished.

One example is reviewing a summary: retrieve the supplied source, judge each atomic claim in parallel, preserve locators, and compose the coverage result. An exit question can judge whether remaining semantic ambiguities have been resolved. Code still checks that every required claim ID has an observation, gates the result, and selects a terminal outcome. A high-confidence completion label does not fill missing claim records.

Jev selects finite labels. The caller supplies candidate work, executes tools, validates inputs, and enforces authority. An exit judgment cannot authorize another external action or replace a required test.

## Exit policy is part of the program

For a declared finite label set L, validate that the returned distribution has exactly the expected labels, finite probabilities, valid normalization, and a selected label consistent with its unique maximum. Let p* be the winning probability and m its separation from the runner-up. Fix thresholds τ and δ before evaluation:

```text
accepted(p) ⇔ valid(p) ∧ uniqueWinner(p) ∧ p* ≥ τ ∧ m ≥ δ
```

Code maps accepted labels to actions such as continue or terminate. A review outcome, invalid answer, timeout, or exhausted budget must retain its own reason. None is automatically successful completion. Keep the full distribution, gate thresholds, selected label, and state revision with the exit decision.

The loop API uses a declared policy shaped like this:

```ts
const exitPolicy = {
  answerId: "completion",
  labels: {
    complete: "complete",
    continue: "continue",
    insufficient: "review",
  },
  minProbability: 0.9,
  minMargin: 0.2,
} as const;
```

The policy's left-hand labels must exactly match the exit Choice's criteria; the right-hand values are controller outcomes. These numerical thresholds are illustrative, not calibrated accuracy guarantees. A step receives a context with a bounded `evaluate` function. It returns its next state, `consumedCallIds`, and the `exitCallId` whose answer should control the round. The runner reads its own recorded evaluator response and recomputes the gate; the step cannot complete the loop by merely returning a claimed completion result. An explicit review stop can abstain without a model call.

**Conditional exit invariant.** Suppose the controller's only semantic-completion branch requires an accepted completion label, and every other terminal branch has a distinct reason. Then every result marked semantic completion contains a validated judgment that met the declared gate. Proof: inspect the sole assignment of that terminal reason; the gate predicates dominate it. This proves a controller property. Concluding that the user's actual goal is complete additionally requires sound observations, adequate requirements, and valid composition or verification. Model confidence does not establish those hypotheses.

**Bounded-round termination.** Let B be the configured finite round limit and r the number of rounds already entered. The ranking function μ = B − r is nonnegative before an admitted round and decreases by one on each transition to another round. Therefore at most B rounds are admitted. This proves bounded iteration, assuming each admitted operation returns or its deadline is observed. It does not prove a successful outcome.

Call and concurrency limits are additional invariants. A model batch may contain several questions but count as one evaluator call; provider retries and helper code may perform other work. Do not convert a call limit into a monetary bound. Cancellation is cooperative: a deadline can reject the controller's await without forcibly stopping trusted JavaScript or undoing external effects.

## Receipts and what they establish

Record the execution that answers the actual user task, not an unrelated demonstration. Keep fixture and live modes distinct. A supplied mode label alone is not provider attestation; inspect which evaluator was actually used.

Useful evidence has several different strengths:

| Evidence                   | Establishes within the trusted execution                                                 | Does not establish                                    |
| -------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Declared dependency        | Intended availability/order between nodes                                                | That the consumer read the answer                     |
| Declared `consumedCallIds` | The step named recorded calls it claims to use, subject to ID validation                 | That arbitrary step code read or used their answers   |
| Runner's exit-policy check | The controller reads its recorded exit answer to select the terminal/continuation branch | That all other answers influenced the step            |
| Gate and exit record       | Which distribution and policy selected a branch                                          | Semantic correctness or actual goal completion        |
| State and artifact digests | Consistency with the recorded bytes or values                                            | Identity, provenance, or authenticity of their author |
| Fixture evaluation         | Tested control-flow behavior on synthetic results                                        | A live Jev judgment                                   |
| Live evaluation record     | The instrumented evaluator path recorded a model interaction                             | Provider-signed proof or hidden agent reasoning       |

The program recorder observes evaluator invocation and return; it does not trace JavaScript property reads or arbitrary step reasoning. The loop validates consumption declarations and directly consumes the exit answer in its own gate. It does not instrument every use of every response. Even a property-read trace would not prove influence: a consumer can read an answer and ignore it. To test meaningful use, hold other inputs fixed, vary the answer across accepted, review, and opposite-label cases, and verify the expected branch changes. This is a behavioral regression check of the declared policy, not evidence that every possible future input is handled correctly. Use an independent expected result; the model's own prediction cannot serve as its ground truth.

Receipt verification checks a declared structure and its consistency rules. The recorder keeps digests and call metadata rather than raw state or prompts; its `live` mode is a caller declaration. An unsigned local receipt can be edited and its digests recomputed by someone with write access. A separately retained expected digest can detect changes relative to that anchor, but is not a signature or provider attestation. Verification does not prove authenticity, disclose private reasoning, or establish that an external action succeeded. Corroborate material side effects with their actual tool results and the appropriate verifier.

## Run, verify, and explain the result

Compile trusted TypeScript modules before execution. For a one-program receipt with structured input:

```sh
jeva run program.js --input-json state.json --receipt run.json
jeva verify run.json --require-live --min-calls 1
```

`jeva run` also accepts `-i text` or stdin text. `--input-json` parses a file as structured input. `--receipt` records the gateway-backed execution; the receipt's `live` mode still depends on the caller and adapter, not provider attestation. The verifier defaults to requiring at least one successful call. A run containing only deterministic nodes needs a deliberate `--min-calls 0` policy if that is the claim being checked. An expected digest retained separately can be supplied with `--digest`.

For a repeated task, a trusted compiled module default-exports its loop definition, including initial state, state schema, step, exit policy, and mandatory limits:

```sh
jeva loop task-loop.js --input-json state.json --report loop-report.json
jeva verify-loop loop-report.json --require-live --require-complete
```

Omit `--input-json` to use the module's declared initial state. The controller injects its bounded evaluator context into each step. The CLI does not generate tools, implement arbitrary actions from prose, or accept a completion flag that bypasses the declared exit policy.

The independent exit-gate command evaluates supplied data without calling Jev:

`verify-loop` validates report structure, state-hash continuity, call/round bounds, consumption IDs, and exit-observation digests, then recomputes the exit gate. `--require-complete` rejects other terminal outcomes; `--require-live` rejects fixture mode. `--digest` compares a separately retained report hash. Like program receipts, this is consistency verification rather than authentication. It never executes the reported module or calls a model.

```sh
jeva exit --policy policy.json --answer answer.json
```

`answer.json` contains the bare Choice answer, not the single-question CLI's `.answers.answer` wrapper. `--answer -` reads that object from stdin. This command is useful for replaying a recorded gate or testing counterexamples. It does not establish that a model produced the answer; the loop controller supplies the call linkage during actual execution.

| Command     | Exit status                                                                |
| ----------- | -------------------------------------------------------------------------- |
| `jeva exit` | `0` complete, `4` continue, `3` review, `1` invalid invocation             |
| `jeva loop` | `0` complete, `3` review, `4` budget/stalled, `1` failed/cancelled/timeout |

A successful receipt-verifier result is a consistency result; report the loop's terminal reason separately. If execution or verification failed, retain that failure instead of manufacturing a complete receipt or model probabilities. Inspect `--help` when using another installed version; new commands are not available in an older binary merely because its docs were updated.

Store generated receipts and loop reports in a task-specific private directory. Loop reports can contain task state and answers; receipt metadata and finite answer fields can also be sensitive. Create files with mode `600`, keep their directory private, and do not upload them or put them into public commits. The programmatic recorder returns data and does not itself write files or upload them. Publish only deliberately sanitized examples with clear fixture/live provenance. Digests can still identify predictable sensitive content, so a digest is not a confidentiality mechanism.

Return the answer the user asked for: established conclusions, sources, requested probabilities, and unresolved obligations. Link the private receipt when useful to that user. Report whether the loop exited through its semantic policy, a deterministic bound, or a failure; do not equate all three with “done.”

For agent instructions, see [loop execution](../skills/jev-decision/references/loop-execution.md). The [current-work audit](../skills/jev-decision/references/reasoning-loop.md) finds useful observations to model; it is a different operation from executing a bounded task loop and checking its exit decision.
