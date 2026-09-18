import { defineProgram, runProgram } from "../src/program.js";
import { evaluator, fixtureChoice, gate } from "./support/evaluation.js";
import { readReasoningState, type ReasoningState } from "./support/reasoning-state.js";

// Sanitized task-authored state: no private repository files are read or transmitted.
const exampleState: ReasoningState = {
  objective:
    "Develop a compiled representation of complex semantic problems and explain the typed workflow.",
  requestedMethod:
    "Actively use Jev in the reasoning loop; batch independent observations and chain genuine dependencies.",
  completed: [
    "Ran a six-claim instruction-excerpt audit in two parallel batches.",
    "Built and tested bounded recursive search.",
    "Drafted the typed problem-compilation contract.",
  ],
  unresolved: [
    "Have not yet run the new compiled requirements-and-alternatives program to compare representations for adaptive tasks.",
  ],
  opportunities: [
    {
      id: "compiled_design",
      description:
        "Run a compiled program that checks candidate representations against requirements in parallel, gates eligibility in code, and selects among eligible designs in a dependent stage.",
    },
    {
      id: "repeat_audit",
      description:
        "Repeat unchanged excerpt judgments until their probabilities rise above the gate.",
    },
    {
      id: "git_permissions",
      description:
        "Ask Jev whether a Git push is authorized instead of using the user's instruction and repository tools.",
    },
  ],
};
const stateIndex = process.argv.indexOf("--state");
if (
  stateIndex >= 0 &&
  (!process.argv[stateIndex + 1] || process.argv[stateIndex + 1].startsWith("--"))
) {
  throw new Error("--state requires a JSON file");
}
const input: ReasoningState =
  stateIndex >= 0 ? await readReasoningState(process.argv[stateIndex + 1]) : exampleState;
const coverageLabels = ["adequate", "missed_opportunity", "insufficient"];
const program = defineProgram({
  nodes: [
    {
      id: "coverage",
      question: () => ({
        type: "choice" as const,
        instructions:
          "Considering `input.objective`, `input.requestedMethod`, `input.completed`, `input.unresolved`, and `input.opportunities`, is a useful task-relevant semantic decision still missing a Jev evaluation? Assess usefulness and coverage, not raw call count.",
        criteria: {
          adequate: "No useful currently actionable Jev opportunity remains",
          missed_opportunity:
            "A supplied opportunity can address an unresolved semantic decision now",
          insufficient:
            "The supplied activity and opportunities are insufficient to assess coverage",
        },
      }),
    },
    {
      id: "next",
      dependsOn: ["coverage"],
      when: (answers) => {
        const audit = gate(answers.coverage, coverageLabels, 0.8);
        return (
          input.opportunities.length > 1 &&
          audit.status === "accepted" &&
          audit.choice === "missed_opportunity"
        );
      },
      question: () => ({
        type: "choice" as const,
        instructions:
          "Which opportunity in `input.opportunities` is the most useful next Jev evaluation for `input.unresolved` and `input.objective`? Select an observation workflow, not an authorization to execute actions.",
        criteria: Object.fromEntries(
          input.opportunities.map((opportunity) => [opportunity.id, opportunity.description]),
        ),
      }),
    },
  ],
});
const live = process.argv.includes("--live");
const judge = await evaluator(live, async ({ questions }) => ({
  answers: Object.fromEntries(
    Object.keys(questions).map((id) => [
      id,
      id === "coverage"
        ? fixtureChoice(
            input.unresolved.length > 0 && input.opportunities.length > 0
              ? "missed_opportunity"
              : "adequate",
            coverageLabels,
          )
        : fixtureChoice(
            input.opportunities[0].id,
            input.opportunities.map((opportunity) => opportunity.id),
          ),
    ]),
  ),
}));
let calls = 0;
const answers = await runProgram(program, input, (request) => {
  calls++;
  return judge(request);
});
const coverage = gate(answers.coverage, coverageLabels, 0.8);
const next = answers.next
  ? gate(
      answers.next,
      input.opportunities.map((opportunity) => opportunity.id),
      0.8,
    )
  : undefined;
const single =
  input.opportunities.length === 1 &&
  coverage.status === "accepted" &&
  coverage.choice === "missed_opportunity";
console.log(
  JSON.stringify(
    {
      mode: live ? "live-model" : "offline-fixture",
      inputSource: stateIndex >= 0 ? "provided-state" : "embedded-example",
      calls,
      coverage,
      next,
      proposedNextStep: single
        ? input.opportunities[0]
        : next?.status === "accepted"
          ? input.opportunities.find((opportunity) => opportunity.id === next.choice)
          : undefined,
      boundary:
        "Advice only; execution and completion verification remain with the caller. Re-audit only after new state or a phase change.",
    },
    null,
    2,
  ),
);
if (coverage.status === "error" || next?.status === "error") process.exitCode = 1;
