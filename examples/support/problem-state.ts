import { readFile } from "node:fs/promises";
import { Schema } from "effect";

export const ProblemStateSchema = Schema.Struct({
  objective: Schema.String,
  requirements: Schema.Array(Schema.Struct({ id: Schema.String, statement: Schema.String })),
  candidates: Schema.Array(Schema.Struct({ id: Schema.String, description: Schema.String })),
});
export type ProblemState = typeof ProblemStateSchema.Type;

export async function readProblemState(file: string): Promise<ProblemState> {
  const contents = await readFile(file);
  if (contents.byteLength > 64_000) throw new Error("Problem state exceeds 64,000 bytes");
  const state = Schema.decodeUnknownSync(ProblemStateSchema)(JSON.parse(contents.toString("utf8")));
  if (!state.objective.trim() || !state.requirements.length || !state.candidates.length) {
    throw new Error(
      "Problem needs an objective, at least one requirement, and at least one candidate",
    );
  }
  if (state.requirements.length * state.candidates.length > 127)
    throw new Error("Problem exceeds 127 observation nodes plus one selection node");
  for (const items of [state.requirements, state.candidates]) {
    if (
      new Set(items.map((item) => item.id)).size !== items.length ||
      items.some((item) => !item.id.trim())
    ) {
      throw new Error(
        "Problem requirement and candidate IDs must be unique and nonempty within each set",
      );
    }
  }
  if (
    state.requirements.some((item) => !item.statement.trim()) ||
    state.candidates.some((item) => !item.description.trim())
  ) {
    throw new Error("Problem statements and candidate descriptions must be nonempty");
  }
  return state;
}
