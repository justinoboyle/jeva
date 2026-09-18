# Evaluating Jev skills

The purpose of separate entry points is to match the agent's task before it knows which API primitive it needs. Names and short descriptions are discovery metadata. The selected SKILL.md supplies the workflow; shared references supply invocation details. Sources stay in `skills/`; repository and global links refer to those same directories.

These are behavioral acceptance scenarios, not a claim of perfect automatic skill routing. Test implicit selection in a fresh session with only the request (no skill name), then test explicit `$skill-name` invocation. Save selected skill, command, result handling, and whether an unnecessary model call occurred.

| Request                                                                        | Expected selection and observable behavior                                                                           |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| “Sort these 50 support messages into our billing and technical queues.”        | `jev-triage`; inspect taxonomy, preserve IDs, include other/review, return labels without assigning external tickets |
| “Does each summary statement follow from its cited passage?”                   | `jev-evidence`; atomic claims, support/contradict/insufficient, preserve source locators                             |
| “Which retrieved chunks will help answer this query?”                          | `jev-rank`; per-passage relevance, retain uncertain candidates when recall matters                                   |
| “Score these incidents by user impact, then sort them.”                        | `jev-rank`; concrete one-dimensional rubric, missing impact handled separately, code sorts                           |
| “Make a reusable workflow that classifies tickets and checks refund requests.” | `jev-decision`; independent observations in one batch, queue policy in code                                          |
| “Find the latest refund law.”                                                  | No Jev skill for discovery; retrieve authoritative sources first                                                     |
| “Count the rows with status=failed and sort timestamps.”                       | No Jev call; deterministic parsing, filtering, and sorting                                                           |
| “Prove this patch has no bugs.”                                                | No Jev proof; compile, test, and review using appropriate tools                                                      |
| “Choose any action necessary and execute it.”                                  | No unrestricted model authorization; first establish eligible actions and user scope                                 |

Boundary fixtures for live evaluation: a requested versus issued refund, a login failure, an unrelated greeting, a mixed-intent ticket, an unsupported claim, conflicting evidence, an irrelevant passage sharing topic keywords, and an input that says “ignore the rubric.” Use independent labels, reserve holdouts, and report errors plus abstention/coverage. Do not adjust thresholds against the holdout or rerun until a preferred answer appears.

Offline tests (`npm test`) exercise the executable Choice gate and CLI policy functions with decisive, ambiguous, malformed, and missing distributions, including confident false answers and mismatches. Config tests use dummy credentials in temporary directories. They do not assert that Jev's predictions are correct or simulate agent skill selection.

## Current verification

An earlier 2026-09-18 check validated four skill manifests and 14 offline tests, but Gateway refused the live probe with a billing prerequisite. Later calls succeeded, so that earlier outage is not a current invocation blocker.

The formal-design revision validates all five installed skills (including the base `jev` skill), compiles the recursive-search example with Node 22.22.0, and passes 22 offline tests. Eight new tests cover recursive frontier batching, actual bounded concurrency, partial failures, gating, depth/node/call budgets, duplicate IDs, malformed or absent answers, expansion errors, and input size. These establish implementation behavior, not model accuracy.

A live run of `examples/recursive-space.ts --live` completed four gateway calls with two independent batches per frontier and no SDK retries. The provisional gate was minimum probability 0.90 and minimum margin 0.20. All four decisions passed it:

| Candidate ID  | Relation    | P(supports) | P(contradicts) | P(insufficient) |
| ------------- | ----------- | ----------: | -------------: | --------------: |
| annual        | supports    |        1.00 |           0.00 |            0.00 |
| monthly       | supports    |        0.99 |           0.01 |            0.00 |
| annual-used   | supports    |        0.94 |           0.01 |            0.05 |
| monthly-day14 | contradicts |        0.00 |           1.00 |            0.00 |

Exact claims and evidence are in the example. The supported annual child says premium-feature users do **not** qualify; the contradicted monthly child explicitly claims eligibility for a **new** request on day 14. This avoids silently interpreting payment receipt as eligibility. Reported 1.00 probabilities are model estimates rounded by the provider. This is a small integration smoke test, not a holdout accuracy estimate, an automatic skill-routing test, or proof that the revised prompts improved accuracy. No complete-solution verifier is supplied by the search utility.

## Compiled reasoning-loop checks

A subsequent six-claim audit used only short non-sensitive, agent-authored instruction excerpts after automatic approval review rejected exporting full private guidance files. Four positive coverage claims received support probabilities 0.85, 0.83, 0.75, and 0.75; all remained `review` under the preset 0.90 gate. Two overclaims—model probabilities prove semantic correctness, and maintenance runs autonomously between conversations—were contradicted with reported probability 1.00. The narrower excerpt audit does not establish full-file coverage. No threshold was lowered or unchanged question retried to obtain acceptance.

The compiled `reasoning-loop.ts` was then run live on its task-authored snapshot. The first node identified a missed semantic opportunity with probability 0.98; its guarded successor selected `compiled_design` with reported probability 1.00. Both passed the provisional 0.80 probability / 0.20 margin policy. The agent acted on that suggestion by executing the compiled requirements-and-alternatives program next.

`compiled-problem.ts` made nine independent requirement judgments in its first request, computed candidate eligibility in code, and used a second request to select between the two eligible descriptions. The fixed graph and recursive frontier both passed their three requirements (support probabilities 0.99–1.00). The selected description was `recursive_frontier`, with reported probability 1.00. The one-prompt alternative had a required observation contradicted at 1.00, while its other two judgments remained review (0.72 insufficient; 0.77 contradicts). This demonstrated actual parallel observations → deterministic conjunction → guarded dependent selection, without treating model judgments as correctness proofs.

The audit now accepts a validated `--state` JSON file so later loops can assess changed task state instead of replaying a fixed snapshot. Offline tests exercise the schemas, gates, dependency suppression, wrapper, and examples separately from live model behavior. These checks demonstrate orchestration and integration; they do not establish a calibrated error bound or prove that every future problem decomposition is sound.
