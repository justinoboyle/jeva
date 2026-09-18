import { readFile } from "node:fs/promises";
import { Schema } from "effect";

export const ReasoningStateSchema = Schema.Struct({
  objective: Schema.String,
  requestedMethod: Schema.String,
  completed: Schema.Array(Schema.String),
  unresolved: Schema.Array(Schema.String),
  opportunities: Schema.Array(Schema.Struct({ id: Schema.String, description: Schema.String })),
});
export type ReasoningState = typeof ReasoningStateSchema.Type;

export async function readReasoningState(file: string): Promise<ReasoningState> {
  const contents = await readFile(file);
  if (contents.byteLength > 64_000) throw new Error("Audit state exceeds 64,000 bytes");
  const state = Schema.decodeUnknownSync(ReasoningStateSchema)(JSON.parse(contents.toString("utf8")));
  if (!state.objective.trim() || !state.requestedMethod.trim()) throw new Error("Audit objective and requestedMethod must be nonempty");
  if (state.opportunities.some(item => !item.id.trim() || !item.description.trim()) ||
    new Set(state.opportunities.map(item => item.id)).size !== state.opportunities.length) {
    throw new Error("Audit opportunities need unique nonempty IDs and descriptions");
  }
  return state;
}
