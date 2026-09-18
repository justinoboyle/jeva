import { Effect, Schema } from "effect";
import { experimental_evaluate as evaluate } from "ai";
import { loadConfig } from "../../src/config.js";
import { decisionExitCode } from "../../src/policy.js";
import type { Answer, Evaluate } from "../../src/program.js";

export function gate(answer: Answer | undefined, labels: readonly string[], minimum = 0.9, separation = 0.2) {
  try {
    const exit = decisionExitCode(answer, { minProbability: minimum });
    const distribution = answer?.probabilities;
    const choice = answer?.choice;
    if (!distribution || !choice || Object.keys(distribution).length !== labels.length ||
      !labels.every(label => Object.hasOwn(distribution, label))) throw new Error("Unexpected answer labels");
    const probability = distribution[choice];
    const margin = probability - Math.max(...labels.filter(label => label !== choice).map(label => distribution[label]));
    return { status: exit === 0 && margin > 0 && margin >= separation ? "accepted" as const : "review" as const,
      choice, probability, margin, probabilities: distribution };
  } catch {
    return { status: "error" as const };
  }
}

export async function evaluator(live: boolean, fixture: Evaluate): Promise<Evaluate> {
  if (!live) return fixture;
  const config = await Effect.runPromise(loadConfig());
  process.env.AI_GATEWAY_API_KEY = config.apiKey;
  return request => {
    const questions = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
      if (question.type !== "choice") throw new Error("These examples require Choice questions");
      return [id, { type: "choice" as const, instructions: question.instructions,
        criteria: Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(question.criteria) }];
    }));
    return evaluate({ model: config.model, questions,
      state: request.state as Parameters<typeof evaluate>[0]["state"],
      abortSignal: AbortSignal.timeout(30_000), maxRetries: 0 });
  };
}

export const fixtureChoice = (choice: string, labels: readonly string[]): Answer => ({
  type: "choice", choice,
  probabilities: Object.fromEntries(labels.map(label => [label, label === choice ? 0.98 : 0.02 / (labels.length - 1)])),
});
