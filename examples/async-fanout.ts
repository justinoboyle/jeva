import { Schema } from "effect";
import { defineProgram, runProgram } from "../src/program.js";
import { evaluator, fixtureChoice, gate } from "./support/evaluation.js";

const Evidence = Schema.Struct({ claim: Schema.String, evidence: Schema.String });
const decodeEvidence = Schema.decodeUnknownSync(Evidence);
const sources = {
  request: {
    claim: "Customers may request refunds within 30 days of purchase.",
    evidence: "Customers may request a refund within 30 days of purchase.",
  },
  processing: {
    claim: "Approved refunds are processed within ten business days.",
    evidence: "Approved refunds are processed within 5–10 business days.",
  },
};
const relations = ["supports", "contradicts", "insufficient"];
const sourceIds = ["request", "processing"] as const;

// Replace these local async loaders with signal-aware database/file/HTTP clients.
// Each loader returns an object; dependency results are forwarded explicitly.
const retrieval = sourceIds.map((id) => ({
  id: `load_${id}`,
  input: () => sources[id],
  run: async ({ input, signal }: { input: unknown; signal: AbortSignal }) => {
    signal.throwIfAborted();
    const source = await Promise.resolve(decodeEvidence(input));
    return { source };
  },
}));
const judgments = sourceIds.map((id) => ({
  id: `check_${id}`,
  dependsOn: [`load_${id}`],
  input: ({ answers }: { answers: Readonly<Record<string, { [key: string]: unknown }>> }) =>
    decodeEvidence(answers[`load_${id}`].source),
  question: async () => ({
    type: "choice" as const,
    instructions: `How does the evidence in \`inputs.check_${id}.evidence\` relate to \`inputs.check_${id}.claim\`? Judge only this supplied passage.`,
    criteria: {
      supports: "The evidence establishes the claim",
      contradicts: "The evidence establishes an incompatible fact",
      insufficient: "The evidence does not establish either relation",
    },
  }),
}));
const program = defineProgram({
  nodes: [
    ...retrieval,
    ...judgments,
    {
      id: "report",
      dependsOn: judgments.map((node) => node.id),
      run: ({ answers }) => {
        const checks = sourceIds.map((id) =>
          Object.assign({ id, claim: sources[id].claim }, gate(answers[`check_${id}`], relations)),
        );
        return {
          status: checks.every(
            (check) => check.status === "accepted" && check.choice === "supports",
          )
            ? "supported-summary"
            : "review",
          checks,
        };
      },
    },
  ],
});
const live = process.argv.includes("--live");
const judge = await evaluator(live, async ({ questions }) => ({
  answers: Object.fromEntries(
    Object.keys(questions).map((id) => [id, fixtureChoice("supports", relations)]),
  ),
}));
let calls = 0;
const answers = await runProgram(
  program,
  sources,
  (request) => {
    calls++;
    return judge(request);
  },
  { concurrency: 2, timeoutMs: 45_000 },
);
console.log(
  JSON.stringify(
    {
      mode: live ? "live-model" : "offline-fixture",
      calls,
      report: answers.report,
      boundary:
        "The compiled graph checks routing and forwards typed evidence. Fixture probabilities are synthetic; live model judgments are not proofs.",
    },
    null,
    2,
  ),
);
