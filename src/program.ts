import { Effect } from "effect";

export type Primitive = "choice" | "boolean" | "score";
export type Answer = { choice?: string; probability?: number; score?: number; probabilities?: Record<string, number>; [key: string]: unknown };
export type Question = { type: Primitive; instructions: string; criteria?: Record<string, string> | readonly string[] };
export type DecisionNode = {
  readonly id: string;
  readonly dependsOn?: readonly string[];
  readonly when?: (answers: Readonly<Record<string, Answer>>) => boolean;
  readonly question: (state: { input: unknown; answers: Readonly<Record<string, Answer>> }) => Question;
};
export type Program<N extends readonly DecisionNode[] = readonly DecisionNode[]> = { readonly nodes: N };
export type AnswersOf<P extends Program> = Record<P["nodes"][number]["id"], Answer>;

/** Keeps literal node IDs and question shapes; templates remain normal TypeScript. */
export const defineProgram = <const N extends readonly DecisionNode[]>(program: Program<N>): Program<N> => program;
export type Evaluate = (request: { state: unknown; questions: Record<string, Question> }) => Promise<{ answers: Record<string, Answer> }>;
export class ProgramError extends Error { override name = "ProgramError"; }

export function plan(program: Program): readonly (readonly DecisionNode[])[] {
  if (!Array.isArray(program.nodes) || program.nodes.length === 0) throw new ProgramError("A program needs at least one node.");
  if (program.nodes.length > 128) throw new ProgramError("Programs are limited to 128 nodes per run.");
  const allIds = new Set(program.nodes.map((node) => node.id));
  if (allIds.size !== program.nodes.length || allIds.has("")) throw new ProgramError("Node IDs must be unique and non-empty.");
  for (const node of program.nodes) for (const dep of node.dependsOn ?? []) if (!allIds.has(dep)) throw new ProgramError(`${node.id} depends on missing node ${dep}`);
  const waiting = new Map(program.nodes.map((node) => [node.id, node]));
  const complete = new Set<string>();
  const layers: DecisionNode[][] = [];
  while (waiting.size) {
    const ready = [...waiting.values()].filter((node) => (node.dependsOn ?? []).every((dependency: string) => complete.has(dependency)));
    if (!ready.length) throw new ProgramError(`Dependency cycle: ${[...waiting.keys()].join(", ")}`);
    layers.push(ready);
    for (const node of ready) { waiting.delete(node.id); complete.add(node.id); }
  }
  return layers;
}

export async function runProgram<P extends Program>(program: P, input: unknown, evaluate: Evaluate): Promise<AnswersOf<P>> {
  const answers: Record<string, Answer> = {};
  for (const layer of plan(program)) {
    const enabled = layer.filter((node) => node.when?.(answers) ?? true);
    if (!enabled.length) continue;
    const questions = Object.fromEntries(enabled.map((node) => [node.id, node.question({ input, answers })]));
    const result = await Effect.runPromise(Effect.tryPromise({ try: () => evaluate({ state: { input, answers }, questions }), catch: (cause) => new ProgramError(`Gateway evaluation failed: ${String(cause)}`) }));
    Object.assign(answers, result.answers);
  }
  return answers as AnswersOf<P>;
}
