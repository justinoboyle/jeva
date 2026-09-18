---
name: jev-triage
description: Classify many tickets, messages, or tool failures into known queues or handling categories using Jev. Use for semantic intent routing and review queues; not for root-cause diagnosis, open-ended planning, or executing the suggested action.
---

# Triage repeated inputs

Use when several inputs must be mapped to an existing taxonomy and the decision needs language understanding. Error codes and exact patterns go through deterministic dispatch first. For one obvious message, an extra model round trip may offer no benefit.

Before calling Jev, read [the invocation contract](../jev-decision/references/invocation.md). It explains how to locate the global development checkout and run the CLI from another folder.

1. Get the actual queues or eligible tools from the task. Give each a stable ID and a contrastive definition. Include `other` for uncovered or mixed requests; do not invent capabilities.
2. Ask which intent the text expresses. Ask separate questions for urgency or missing information if those affect routing. Do not ask a single vague question such as “What should the agent do?”
3. Preserve the original ID and input alongside the judgment. A low-confidence result goes to review. Counts, thresholds, retry limits, and tool selection remain deterministic code.

```sh
jeva -f ticket.txt --json \
  -q 'Which category describes the main request in `input`?' \
  -o billing -c 'billing=Charges, invoices, payment errors, or refund requests' \
  -o technical -c 'technical=Product failures, configuration, or account access' \
  -o other -c 'other=No clear primary request in either category'
```

Pipe the result through the Choice gate described in the invocation reference. Report the selected queue, its probability, and whether policy accepted it or requested review. `other` remains unassigned even when confident. Route IDs through a fixed `case`/lookup table, never shell `eval`.

For tool failures, classify the *reported condition* into known categories, then let code decide retry versus stop. Jev cannot establish a root cause from a symptom or prove that another attempt will succeed. For several observations of the same ticket, use the program reference in `jev-decision` to batch them; only load it when needed.

Before applying across a dataset, try a charge dispute, a login failure, a mixed request, and a message merely quoting someone else's complaint. Report abstentions as well as errors. Keep labeling separate from external assignments or messages unless the user requested those actions.

Model routing as `observation → gate → deterministic queue lookup`, with separate outcomes for `other`, review, and invocation error. A semantic label is evidence for a routing policy, not a proof of root cause or authorization. Use bounded parallelism for independent items and retain original IDs. Read [formal-model.md](../jev-decision/references/formal-model.md) for composition guarantees or graph design.

After an observed misroute, blocked call, or user correction, follow [self-improvement.md](../jev-decision/references/self-improvement.md) within authorized maintenance scope. Keep a nearby correctly routed example with the regression case so that a narrower fix does not silently move the category boundary. Report the requested queues and unresolved items, with probabilities when requested or decision-relevant.
