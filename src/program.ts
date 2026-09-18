import { Schema } from "effect";

export type Primitive = "choice" | "boolean" | "score";
export type Answer = {
  choice?: string;
  probability?: number;
  score?: number;
  probabilities?: Record<string, number>;
  [key: string]: unknown;
};
export type Question = {
  type: Primitive;
  instructions: string;
  criteria?: Record<string, string> | readonly string[];
};
export type Awaitable<T> = T | PromiseLike<T>;
export type NodeState = {
  readonly input: unknown;
  readonly answers: Readonly<Record<string, Answer>>;
  readonly signal: AbortSignal;
};
type NodeBase = {
  readonly id: string;
  readonly dependsOn?: readonly string[];
  readonly when?: (
    answers: Readonly<Record<string, Answer>>,
    state: NodeState,
  ) => Awaitable<boolean>;
  readonly input?: (state: NodeState) => Awaitable<unknown>;
};
export type DecisionNode = NodeBase &
  (
    | { readonly question: (state: NodeState) => Awaitable<Question>; readonly run?: never }
    | { readonly run: (state: NodeState) => Awaitable<Answer>; readonly question?: never }
  );
export type Program<N extends readonly DecisionNode[] = readonly DecisionNode[]> = {
  readonly nodes: N;
};
export type AnswersOf<P extends Program> = {
  [N in P["nodes"][number] as N["id"]]: N extends { run: (state: NodeState) => infer Result }
    ? Awaited<Result>
    : Answer;
};

/** Keeps literal node IDs and question shapes; templates remain normal TypeScript. */
export const defineProgram = <const N extends readonly DecisionNode[]>(
  program: Program<N>,
): Program<N> => program;
export type Evaluate = (request: {
  state: unknown;
  questions: Record<string, Question>;
  signal?: AbortSignal;
}) => Promise<{ answers: Record<string, Answer> }>;
export type RunOptions = {
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
};
type ErrorCode = "invalid" | "node" | "evaluation" | "aborted" | "timeout";
export class ProgramError extends Error {
  override name = "ProgramError";
  readonly code: ErrorCode;
  readonly nodeId: string | undefined;
  constructor(message: string, options: ErrorOptions & { code?: ErrorCode; nodeId?: string } = {}) {
    super(message, options);
    this.code = options.code ?? "invalid";
    this.nodeId = options.nodeId;
  }
}

const decodeAnswer = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));
const decodeResult = Schema.decodeUnknownSync(
  Schema.Struct({
    answers: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
  }),
);

export function plan(program: Program): readonly (readonly DecisionNode[])[] {
  const nodes = program.nodes;
  if (!Array.isArray(program.nodes) || program.nodes.length === 0)
    throw new ProgramError("A program needs at least one node.");
  if (nodes.length > 128) throw new ProgramError("Programs are limited to 128 nodes per run.");
  const allIds = new Set(nodes.map((node) => node.id));
  if (allIds.size !== nodes.length || allIds.has(""))
    throw new ProgramError("Node IDs must be unique and non-empty.");
  for (const node of nodes) {
    if (Object.hasOwn(Object.prototype, node.id))
      throw new ProgramError(`Reserved node ID ${node.id}`);
    if ((typeof node.question === "function") === (typeof node.run === "function"))
      throw new ProgramError(`${node.id} needs exactly one question or run callback`);
    for (const dep of node.dependsOn ?? [])
      if (!allIds.has(dep)) throw new ProgramError(`${node.id} depends on missing node ${dep}`);
  }
  const waiting = new Map(nodes.map((node) => [node.id, node]));
  const complete = new Set<string>();
  const layers: DecisionNode[][] = [];
  while (waiting.size) {
    const ready = [...waiting.values()].filter((node) =>
      (node.dependsOn ?? []).every((dependency: string) => complete.has(dependency)),
    );
    if (!ready.length)
      throw new ProgramError(`Dependency cycle: ${[...waiting.keys()].join(", ")}`);
    layers.push(ready);
    for (const node of ready) {
      waiting.delete(node.id);
      complete.add(node.id);
    }
  }
  return layers;
}

/**
 * One batch per dependency layer; independent tasks and that batch can overlap.
 * Concurrency counts callbacks/jobs, not questions inside a model batch. Answers
 * are published only at the layer barrier. Snapshots are shallow: nested values
 * remain caller-owned and must not be mutated. Cancellation is cooperative;
 * deadline rejection does not preempt callbacks that ignore their signal.
 */
export function runProgram<P extends Program>(
  program: P,
  input: unknown,
  evaluate: Evaluate,
  options?: RunOptions,
): Promise<AnswersOf<P>>;
export async function runProgram(
  program: Program,
  input: unknown,
  evaluate: Evaluate,
  options: RunOptions = {},
): Promise<Record<string, Answer>> {
  const layers = plan(program);
  const concurrency = options.concurrency ?? 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 128)
    throw new ProgramError("Concurrency must be an integer in [1, 128]");
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) ||
      options.timeoutMs <= 0 ||
      options.timeoutMs > 2_147_483_647)
  )
    throw new ProgramError("Timeout must be positive and at most 2,147,483,647 ms");
  const controller = new AbortController();
  const cancel = () =>
    controller.abort(
      new ProgramError("Program cancelled", { code: "aborted", cause: options.signal?.reason }),
    );
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          controller.abort(new ProgramError("Program deadline exceeded", { code: "timeout" }));
        }, options.timeoutMs);
  const check = () => {
    if (controller.signal.aborted) throw controller.signal.reason;
  };
  let rejectOnAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => {
      reject(controller.signal.reason);
    };
    controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    if (controller.signal.aborted) rejectOnAbort();
  });

  async function bounded<T, R>(
    items: readonly T[],
    operation: (item: T) => Promise<R>,
  ): Promise<R[]> {
    let cursor = 0;
    const results: R[] = [];
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (cursor < items.length) {
          check();
          const index = cursor++;
          try {
            // oxlint-disable-next-line no-await-in-loop -- A worker must finish its current job before claiming another slot.
            results[index] = await operation(items[index]);
          } catch (error) {
            controller.abort(error);
            throw error;
          }
        }
      }),
    );
    check();
    return results;
  }

  const answers: Record<string, Answer> = {};
  async function execute() {
    check();
    for (const layer of layers) {
      const snapshot = Object.freeze({ ...answers });
      const base: NodeState = { input, answers: snapshot, signal: controller.signal };
      // oxlint-disable-next-line no-await-in-loop -- Dependency layers execute sequentially; nodes within this layer run concurrently.
      const prepared = await bounded(layer, async (node) => {
        try {
          if (node.when && !(await node.when(snapshot, base))) return undefined;
          check();
          const context: NodeState = {
            ...base,
            input: node.input ? await node.input(base) : input,
          };
          check();
          return {
            node,
            context,
            question: node.question ? await node.question(context) : undefined,
          };
        } catch (cause) {
          if (controller.signal.aborted) throw controller.signal.reason;
          throw new ProgramError(`Node ${node.id} preparation failed: ${String(cause)}`, {
            code: "node",
            nodeId: node.id,
            cause,
          });
        }
      });
      const questions: Record<string, Question> = {};
      const inputs: Record<string, unknown> = {};
      const jobs: (() => Promise<Record<string, Answer>>)[] = [];
      for (const item of prepared) {
        if (!item) continue;
        if (item.question) {
          questions[item.node.id] = item.question;
          inputs[item.node.id] = item.context.input;
        } else if (item.node.run) {
          const run = item.node.run;
          jobs.push(async () => {
            try {
              return { [item.node.id]: decodeAnswer(await run(item.context)) };
            } catch (cause) {
              if (controller.signal.aborted) throw controller.signal.reason;
              throw new ProgramError(`Node ${item.node.id} failed: ${String(cause)}`, {
                code: "node",
                nodeId: item.node.id,
                cause,
              });
            }
          });
        }
      }
      if (Object.keys(questions).length)
        jobs.unshift(async () => {
          try {
            const result = decodeResult(
              await evaluate({
                state: { input, answers: snapshot, inputs },
                questions,
                signal: controller.signal,
              }),
            );
            for (const id of Object.keys(result.answers))
              if (!Object.hasOwn(questions, id)) throw new Error(`Unexpected answer ID ${id}`);
            return result.answers;
          } catch (cause) {
            if (controller.signal.aborted) throw controller.signal.reason;
            throw new ProgramError(`Gateway evaluation failed: ${String(cause)}`, {
              code: "evaluation",
              cause,
            });
          }
        });
      // oxlint-disable-next-line no-await-in-loop -- Publish only after every job in the current dependency layer completes.
      const results = await bounded(jobs, (job) => job());
      for (const result of results) Object.assign(answers, result);
    }
    return answers;
  }
  try {
    return await Promise.race([execute(), cancelled]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
  }
}
