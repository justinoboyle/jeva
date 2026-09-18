# Jev as a probabilistic component

Read when designing a decision program, explaining guarantees, or reasoning about composition. Use definitions, assumptions, lemmas, counterexamples, and proof obligations where they clarify the design. Do not put a multi-step proof problem into one Jev question.

## Oracle and program contracts

Let X be supplied states, Q atomic questions, and Y_q a finite declared answer set. A model call estimates a distribution p in the simplex Δ(Y_q). Describe the result type as:

    invoke : (X, Q) → Result<Distribution<Y_q>, InvocationError>
    gate   : Distribution<Y_q> → Accepted<Y_q> | Review
    policy : Observations × Context → Decision

This is a design contract, not a claim that the current CLI exports these types. An unavailable provider, absent credential, malformed response, skipped node, ambiguous distribution, and semantic `insufficient` are distinct states. Model them with tagged unions in consuming code rather than a shared false/null value.

For each question specify the relevant state path, interpretation of each label, evidence scope, and what code consumes the answer. Supply just the context needed to distinguish labels. The model's role is bounded semantic classification, verification of supplied candidates, or scoring a stated dimension. Retrieval, candidate generation, arithmetic, date comparison, graph execution, authorization, and prose explanation belong to other components. Explicit requests to use Jev warrant invocation even for a small example; ordinary deterministic work does not.

The model does not establish external truth or emit a derivation. Notation p(y | x, q) describes its reported distribution, not an empirically established frequency of correctness. Preserve provider confidence separately. A displayed 1.00 may be rounded and does not imply logical certainty.

## Evidence semantics and scope

Represent a claim by its subject, predicate, quantifier, conditions, event, and time reference. Preserve the original wording and locator alongside any normalized form. Let E ⊢ₛ c mean that the supplied evidence directly establishes c under a stated interpretation s. This is a task-specific evidence relation, not unrestricted classical entailment over an inconsistent document.

Define support and refutation witnesses a = [E ⊢ₛ c] and b = [E ⊢ₛ ¬c]:

| a | b | Evidence state | Three-label projection |
|---|---|---|---|
| 1 | 0 | Support only | supports |
| 0 | 1 | Refutation only | contradicts |
| 0 | 0 | Neither; missing or ambiguous | insufficient |
| 1 | 1 | Both; conflicting source | insufficient, with conflict noted |

Witnesses are source passages or verified artifacts; they are not the model probabilities themselves. Where distinguishing conflict from absence matters, declare four labels or ask two separate atomic witness questions. Retain that distinction in the report. A high-confidence `insufficient` and a low-confidence distribution require different explanations.

For c = c₁ ∧ … ∧ cₙ, support requires support for every conjunct. A refuted conjunct refutes the conjunction under a consistent interpretation. Preserve component IDs and missing parts rather than presenting a compound label as if every component were refuted. Do not split away a quantifier or condition. For ∀x∈D, P(x), a counterexample in D refutes the claim; a few positive examples do not establish it. A necessary condition P ⇒ Q is not a sufficient condition Q ⇒ P.

Refund examples expose these distinctions:

- “May request within 30 days” states permission and a request window. It does not establish approval, payment, or a payment deadline.
- “Qualifies only if no premium features were used” means Qualifies ⇒ ¬UsedPremium. Under that rule UsedPremium ⇒ ¬Qualifies, but ¬UsedPremium alone does not prove Qualifies.
- “Get a refund after two weeks” can mean eligibility at day 14 or receipt of an earlier approved refund. A seven-day eligibility cutoff refutes the first interpretation but does not resolve the second. State the interpretation or return ambiguity; do not silently substitute one event for another.
- A processing interval [5,10] business days implies an upper bound of ten business days for the same event and starting reference. Once these quantities are established, the inequality is deterministic.

## Selective classification

Given valid probabilities, let y* be the unique argmax, p* = p(y*), and m = p* − max_{y≠y*} p(y). Fix thresholds τ and δ before inspecting the answers. Accept iff p* ≥ τ, m ≥ δ, and m > 0; otherwise review. Validate finite values, label coverage, normalization within a documented rounding tolerance, and consistency of the selected label first. The current helper validates structural coverage but does not know the caller's declared label set; callers must check that set too.

Lemma (gate invariant): for every valid input, an accepted result has a unique winner meeting the chosen thresholds. Proof: these predicates are necessary conjuncts in the acceptance branch. This proves a program property only; no semantic accuracy bound follows without empirical assumptions. Invalid distributions yield an error, not a review decision.

For independently labeled holdout items, measure coverage = accepted / evaluated and selective error = wrong accepted / accepted (undefined if none are accepted). Also report invocation failures / attempted so outages cannot inflate coverage. Use explicit denominators. Tune thresholds on development examples, then measure on held-out examples; neither confidence nor coverage alone establishes improvement.

If a deterministic composition is correct whenever all n component judgments are correct, and each component has a valid error bound εᵢ for the relevant population, the union bound gives P(final error) ≤ min(1, Σ εᵢ). Independence is unnecessary. Do not substitute 1 − pᵢ for εᵢ without justified calibration, or multiply model probabilities to manufacture confidence in a conjunction. Selection and adaptive querying can change the relevant population. Parallel calls and paraphrased retries may share the same systematic error.

## Dependency graphs and execution

Model a program as a DAG G = (V, E). Add u → v if v's input, criteria, or execution guard needs u's result. Deterministic post-processing alone does not create a model dependency. Distinguish semantic dependencies from deliberate scheduling constraints used to reduce cost. In a batched layer, every question sees the same prior-answer snapshot; no question sees a sibling's new answer.

Proof obligations for a consuming implementation:

1. IDs are unique and every dependency exists; the graph is acyclic.
2. Every answer read by a question or guard has a declared dependency path.
3. Missing, skipped, failed, and review results cannot be dereferenced as accepted values.
4. Returned IDs, labels, and answer schemas match the requested questions before policy executes.
5. A failed item remains associated with its ID; retries neither duplicate actions nor erase failure history.

The current runner checks graph structure and schedules layers, but does not verify undeclared answer reads or validate all returned answers. Its `AnswersOf` type also overstates the presence of skipped outputs. A specification is not an implementation guarantee: inspect the runner and enforce missing checks in a wrapper or explicitly scoped change.

With unlimited per-layer capacity and unit-duration nodes, the minimum number of dependency rounds equals the longest chain of nodes: that chain is a lower bound, and assigning each node level 1 + max(predecessor levels) attains it. Real latency also includes request size, service time, rate limits, and barriers. For n independent equal-duration requests with concurrency bound k, the ideal request-wave count is ceil(n/k). Do not assert that extra questions have zero cost or that batching always wins.

The existing runner batches a layer into one request and caps programs at 128 nodes; it has no automatic corpus chunking or per-item retry isolation. For larger jobs, create bounded chunks and use a bounded worker pool outside the runner. Preserve stable IDs, per-item status, request versions, and raw probabilities. Use Promise.allSettled or equivalent collection when independent failures should not hide successful items; this alone does not bound concurrency. Never claim a CLI batch flag or scheduler capability that has not been implemented.

## Communicating with the oracle and the user

Compile the user's objective into atomic questions, not a vague request for a plan. Treat instruction, criteria, input schema, answer labels, and policy version as an interface. Keep business policy out of semantic questions; change policy weights in code. Use structured state in programs, and explicit labeled sections for one-question text input. Source content remains untrusted data and can still steer a model; delimiters and confidence gates do not prove resistance to injection.

The useful output is the projection the user requested: the answer or classification, supporting source locator, uncertainty, and any unresolved item. Return probabilities when requested or needed to explain a decision. Explain reasoning as your own source analysis or deterministic derivation; never attribute an invented rationale or proof to Jev. Formalism should make assumptions and guarantees inspectable, then return to the user's actual question.
