import { Schema } from "effect";
import { decideLoopExit, type LoopDefinition } from "../src/loop.js";

const State = Schema.Struct({ revision: Schema.Number, explanation: Schema.String });
type State = typeof State.Type;
const definition: LoopDefinition<State> = {
  initialState: {
    revision: 0,
    explanation: "A confident unknown result means the task is successfully complete.",
  },
  stateSchema: State,
  limits: { maxRounds: 3, maxCalls: 3, concurrency: 2, timeoutMs: 30_000 },
  exitPolicy: {
    answerId: "exit",
    labels: { supports: "complete", contradicts: "continue", insufficient: "review" },
    minProbability: 0.9,
    minMargin: 0.2,
  },
  step: async (state, context) => {
    const observation = await context.evaluate({
      state: {
        explanation: state.explanation,
        requirement:
          "Explain that a high-confidence unknown observation remains review, not successful completion.",
      },
      questions: {
        exit: {
          type: "choice",
          instructions:
            "Does `explanation` satisfy `requirement`? Judge only those supplied fields.",
          criteria: {
            supports: "The explanation explicitly satisfies the requirement",
            contradicts: "The explanation states an incompatible rule",
            insufficient: "Neither support nor contradiction is established",
          },
        },
      },
    });
    const decision = decideLoopExit(observation.answers.exit, definition.exitPolicy);
    const next =
      decision.status === "continue"
        ? {
            revision: state.revision + 1,
            explanation:
              "A high-confidence unknown observation remains review. It does not establish successful completion.",
          }
        : state;
    return { state: next, consumedCallIds: [observation.callId], exitCallId: observation.callId };
  },
};

export default definition;
