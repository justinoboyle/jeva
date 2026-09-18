import { Effect, Schema } from "effect";
import { experimental_evaluate as evaluate } from "ai";
import { loadConfig } from "../src/config.js";
import { searchSpace, type Candidate, type SearchEvaluator } from "../src/search.js";

const evidence = [{ locator: "refund-policy:1-5", text: [
  "Customers may request a refund within 30 days of purchase.",
  "Annual subscriptions qualify only if no premium features have been used.",
  "Monthly subscriptions are non-refundable after the first seven days.",
  "Approved refunds are processed within 5–10 business days.",
  "Enterprise contracts follow their individually negotiated terms.",
].join("\n") }];
const candidate = (id: string, kind: Candidate["kind"], claim: string): Candidate => ({ id, kind, claim, evidence });
const roots = [
  candidate("annual", "problem", "Annual refund eligibility depends on premium feature usage."),
  candidate("monthly", "problem", "Monthly refund eligibility has a seven-day cutoff."),
];
const refinements: Record<string, Candidate[]> = {
  annual: [candidate("annual-used", "solution", "Annual subscribers who used premium features do not qualify for a refund.")],
  monthly: [candidate("monthly-day14", "solution", "A monthly subscription qualifies for a new refund request fourteen days after purchase.")],
};

const live = process.argv.includes("--live");
let judge: SearchEvaluator;
if (live) {
  const config = await Effect.runPromise(loadConfig());
  process.env.AI_GATEWAY_API_KEY = config.apiKey;
  judge = async (request, signal) => {
    const questions = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
      if (question.type !== "choice") throw new Error("This search adapter expects Choice questions");
      return [id, { type: "choice" as const, instructions: question.instructions,
        criteria: Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(question.criteria) }];
    }));
    // searchSpace constructs JSON state; the general runner types it as unknown.
    return evaluate({ model: config.model, questions,
      state: request.state as Parameters<typeof evaluate>[0]["state"],
      abortSignal: signal, maxRetries: 0 });
  };
} else {
  // Offline demonstration of scheduling and projection, not a model evaluation.
  judge = async ({ state, questions }) => {
    const items = (state as { input: { candidates: Candidate[] } }).input.candidates;
    return { answers: Object.fromEntries(Object.keys(questions).map((id, i) => {
      const choice = items[i].id === "monthly-day14" ? "contradicts" : "supports";
      return [id, { type: "choice", choice, probabilities: {
        supports: choice === "supports" ? 0.96 : 0.02,
        contradicts: choice === "contradicts" ? 0.96 : 0.02,
        insufficient: 0.02,
      } }];
    })) };
  };
}
const result = await searchSpace({
  objective: "Check supplied eligibility claims by subscription type.", roots,
  expand: async parent => refinements[parent.id] ?? [],
  // Two independent batches per frontier demonstrate bounded parallel requests.
  limits: { batchSize: 1, concurrency: 2, maxDepth: 1, maxCalls: 4, maxNodes: 4 },
}, judge);
console.log(JSON.stringify({ mode: live ? "live-model" : "offline-fake-evaluator", ...result }, null, 2));
if (result.records.some(record => record.status === "error")) process.exitCode = 1;
