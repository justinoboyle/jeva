# Async programs: explicit inputs, bounded parallel work, and joins

Jeva programs can combine asynchronous application work with model judgments. A task node returns an object through `run`; a model node constructs a finite question through `question`. Both may await their work. `dependsOn` creates a barrier before a downstream node uses earlier results. An optional `input` callback projects those results into the next node's input.

Run the compiled example from the checkout:

```sh
npm run demo:async
npm run jev:async
```

The first command uses labeled synthetic fixtures. The second invokes Jev with the two public refund-policy passages embedded in `examples/async-fanout.ts`. Both compile before execution. Neither command reads private repository material. The example runs two async source loaders, batches their two evidence judgments, then composes a report from the returned labels and gates. The sample loaders use local data; replace them with signal-aware I/O clients for actual retrieval.

## Node contracts

```ts
import { defineProgram, runProgram } from "../src/program.js";

const program = defineProgram({
  nodes: [
    {
      id: "retrieve",
      run: async ({ signal }) => {
        signal.throwIfAborted();
        return { evidence: "Approved refunds are processed within 5–10 business days." };
      },
    },
    {
      id: "judge",
      dependsOn: ["retrieve"],
      when: async (answers) => answers.retrieve !== undefined,
      input: async ({ answers }) => ({ passage: answers.retrieve.evidence }),
      question: async () => ({
        type: "choice",
        instructions: "Does `inputs.judge.passage` establish processing within ten business days?",
        criteria: {
          supports: "The passage establishes the claim",
          contradicts: "The passage establishes an incompatible fact",
          insufficient: "The passage establishes neither relation",
        },
      }),
    },
  ],
});

// evaluate is your gateway adapter or an explicit offline fixture.
const answers = await runProgram(program, {}, evaluate, {
  concurrency: 4,
  timeoutMs: 30_000,
  signal: callerAbortSignal,
});
```

`when(answers, state)` receives prior-layer answers and the original input; a false guard skips all other callbacks on that node. `input(state)` also receives the original input and prior answers. Its result becomes the `input` seen by that node's `run` or `question` callback. Every callback receives a cooperative `signal` through its state argument.

For a model batch, request state is `{ input, answers, inputs }`: original program input, the prior-layer answers snapshot, and a map of per-node projections. The model question must name `inputs.<nodeId>` when using its projection. Projection does not remove the original input or earlier answers from the request; pass only information suitable for the gateway into the program.

Task outputs must be objects, such as `{ documents }` or `{ total }`. Their types are retained in the returned result map. Model outputs retain the existing `Answer` contract. A skipped node or omitted gateway answer is absent at runtime; guards must handle that even though the compatibility result type does not currently mark each key optional. Unexpected returned IDs are rejected before they can overwrite earlier results. Primitive probability validation and application-specific gates remain consuming-code responsibilities.

## Parallelism and cancellation

The runner validates and topologically layers the graph before any callbacks execute. It prepares each layer with a bounded worker pool, then runs its independent tasks and one model batch through the same concurrency limit. Those tasks can overlap the model request. The next layer starts after every enabled job in the current layer succeeds. A model batch counts as one job regardless of its question count; this limit does not constrain a provider's internal execution.

`concurrency` defaults to four and accepts integers from one to 128. `timeoutMs` is an optional whole-run deadline. `signal` connects caller cancellation to all node callbacks and to the evaluator request. Gateway adapters must forward `request.signal` to their client's cancellation mechanism; the bundled adapters do this.

Timeout or cancellation rejects the caller's promise and stops the scheduler from admitting subsequent work. It cannot interrupt synchronous CPU-bound JavaScript or force an I/O client that ignores its signal to stop. Timers require event-loop progress. An ignoring callback may finish later, but its result is not published into downstream work after cancellation. Callback failures carry a `ProgramError` code, an original cause, and a node ID when attributable to a specific node. No automatic retry is performed.

## Conditional guarantees and verification

Let `L_k` be dependency layer `k`, `A_k` the answer map committed before that layer, and `C` the concurrency limit. Under the stated callback contract:

1. Every node in `L_k` observes the same prior-layer answer map `A_k`. The map is shallow-frozen; nested values remain caller-owned and must not be mutated.
2. Each worker awaits at most one callback/job, and there are at most `C` workers. Consequently, active scheduled callbacks/jobs are at most `C` during each phase.
3. Layer `L_(k+1)` begins only after all enabled jobs in `L_k` succeed. Thus a downstream join cannot consume a partially committed preceding layer.
4. A cyclic graph, missing dependency, duplicate/reserved ID, or graph with more than 128 nodes is rejected before evaluation.
5. After cancellation is observed, the scheduler admits no further jobs or layers. This says nothing about side effects already started by callbacks.

The tests exercise actual task/model overlap with a rendezvous, bounded task activity, projected fan-in, asynchronous skip guards, cancellation, timeout with a callback that ignores cancellation, preserved errors, and unexpected result IDs. These executable checks substantiate the listed cases and the implementation's invariants; they are not an exhaustive proof over arbitrary callbacks, semantic criteria, or provider behavior. Model probabilities are observations used by policy, never proof certificates.
