---
name: jev-rank
description: Filter retrieved passages for relevance or score many supplied items against explicit semantic rubrics using Jev. Use for context selection, queue prioritization, and per-dimension quality ratings; not numeric sorting, free-form recommendations, or consequential eligibility decisions.
---

# Filter and score a set of inputs

Use Jev when a semantic property must be assessed repeatedly. Filter by IDs, dates, sizes, and keywords in code first. Preserve IDs so the final selection can recover original inputs. Do not ask Jev to sort a whole list or count its members.

Read [the invocation contract](../jev-decision/references/invocation.md) before calling the CLI. For an unfamiliar task, test a small labeled sample before processing the whole set.

## Relevance filtering

For each retrieved passage, supply a labeled QUERY and PASSAGE in `input`. Ask a Boolean: does this passage contain information useful for answering this query? Relevance is not truth or entailment; use `jev-evidence` when checking an actual claim.

```sh
jeva -f passage-query.txt --boolean --json \
  -q 'Does PASSAGE in `input` contain information useful for answering QUERY, beyond merely sharing topic words?'
```

Read `.answers.answer.probability`. Pick keep/review/drop thresholds based on the cost of missing useful context; for retrieval, uncertain items often belong in review or the retained set. State the thresholds explicitly and tune recall on labeled examples. An uncertain result is not evidence that the passage is irrelevant.

## Rubric scoring

Use Score for a degree, such as reported user impact. Each level must describe a stand-alone situation on the same dimension. Score and uncertainty are different quantities.

```sh
jeva -f incident.txt --score --json \
  -q 'What user impact is reported in `input`?' \
  -l 'Cosmetic issue; users can complete the task normally' \
  -l 'Task is degraded; an available workaround lets users complete it' \
  -l 'Users cannot complete the task and no workaround is available'
```

Check whether impact is stated before scoring; missing evidence is not “cosmetic.” If necessary batch a Boolean for stated impact alongside the Score. Use the weighted-mean `.score` to rank only comparable rubrics; inspect `.probabilities` to distinguish a central rating from uncertainty between extremes. Break ties by stable ID in code. Normalize by `levels.length - 1` only when combining dimensions, and keep the weights in code.

For a JSONL set, retain each original ID and attach the result to it. The current CLI handles one input per call; use a quoted shell loop for small samples, or a program with one question per item and exact state paths for modest shared-context sets. Bound the batch size and state size; do not put an unlimited corpus into one request. Calculate sorting, top-k, counts, and weighted sums deterministically afterward.

Return the ordered IDs, raw scores/probabilities, rubric version, policy, and unresolved items. Changing the option set or rubric changes score meaning: rerun comparisons rather than mixing old and new scales.

For parallel execution and composition guarantees, use [formal-model.md](../jev-decision/references/formal-model.md). Execution independence does not imply independent errors. Relevance is a selection predicate, not a proof of truth; a score is a rubric position, not an error probability. Preserve failed-item IDs and distinguish them from dropped items. Use bounded concurrency or bounded shared-state batches, then sort deterministically.

When a miss or user correction exposes a reusable improvement, apply [self-improvement.md](../jev-decision/references/self-improvement.md) within authorized maintenance scope. For retrieval changes, preserve examples of useful passages that the filter wrongly discarded; measure recall as well as retained-set size. Return the selection the user needs rather than an unsolicited account of every internal decision.
