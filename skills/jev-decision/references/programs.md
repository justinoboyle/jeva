# Batch before chaining

For a support workflow, ask intent, refund-requested, and urgency together. Code can use urgency only for technical tickets without making urgency depend on intent. A genuine second round would use a first-round category to retrieve a different catalog and then choose among the retrieved candidates.

The current runner batches nodes by dependency layer, giving each request `{input, answers}`. Inside one layer, questions cannot see one another's new answers. A skipped node is absent; a downstream `when` must handle that explicitly. A Score measures one dimension; combine normalized scores with explicit weights in code.

Use this template in `<checkout>/examples/support-triage.ts` and adapt its criteria to the user's taxonomy:

```ts
import { defineProgram } from '../src/program.js';

export default defineProgram({ nodes: [
  {
    id: 'intent',
    question: () => ({
      type: 'choice',
      instructions: 'Which category describes the main request in `input`?',
      criteria: {
        billing: 'Charges, invoices, payment errors, or requested refunds',
        technical: 'Product failures, configuration, or account access',
        other: 'No clear primary request in either category',
      },
    }),
  },
  {
    id: 'refund_requested',
    question: () => ({
      type: 'boolean',
      instructions: 'Does `input` explicitly request money back?',
    }),
  },
] });
```

The examples configuration includes `examples/**/*.ts` and emits into the ignored `dist/templates` directory. From the checkout:

```sh
npm run build:examples
jeva run dist/templates/examples/support-triage.js < ticket.txt
```

Do not assume the example file already exists; create it from the template first. Imported sources compile alongside it. The program is ordinary trusted Node code; Effect is used by the existing runner and does not isolate arbitrary module imports. Do not advertise this as restricted execution.

Test the template with `runProgram(program, input, fakeEvaluator)`: verify one request for independent observations, complete output labels, fallback on ambiguous model distributions in consuming policy, and absent/guarded outputs when a conditional node is skipped. Test separately that a true data dependency gets the expected prior answer in its next request. Live labeled examples test judgment quality; fake answers test orchestration only.

## Recursive spaces and parallel frontiers

For bounded recursive problem/solution exploration, read [recursive-spaces.md](recursive-spaces.md). The reusable `src/search.ts` implementation builds each frontier with `defineProgram`, batches independent judgments, and evaluates independent batches with a concurrency limit. Its evaluator and candidate expander are supplied by the caller; model judgments do not generate arbitrary child text. The example and offline tests distinguish accepted local candidates from verified complete solutions.
