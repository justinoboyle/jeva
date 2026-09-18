import { defineProgram, runProgram, type Answer } from "../src/program.js";
import { evaluator, fixtureChoice, gate } from "./support/evaluation.js";
import { readProblemState, type ProblemState } from "./support/problem-state.js";

const exampleState: ProblemState = {
  objective:
    "Represent complex semantic tasks in compiled programs, especially tasks that discover new subproblems during execution.",
  requirements: [
    {
      id: "typed",
      statement: "Represent a multi-part task using typed state and explicit requirements.",
    },
    { id: "parallel", statement: "Evaluate independent semantic observations in parallel." },
    { id: "uncertain", statement: "Preserve uncertain required observations as unresolved." },
  ],
  candidates: [
    {
      id: "one_prompt",
      description:
        "Send the task as one prose prompt and return its winning label, without typed requirements or an uncertainty gate.",
    },
    {
      id: "fixed_graph",
      description:
        "Compile typed state and explicit requirements into a fixed dependency graph. Evaluate independent semantic observations in parallel; preserve uncertain required observations as unresolved. All nodes are known before execution.",
    },
    {
      id: "recursive_frontier",
      description:
        "Compile typed state and explicit requirements into bounded frontiers. Evaluate independent semantic observations in parallel; preserve uncertain required observations as unresolved. A caller proposes new subproblems after accepted observations, and the controller admits them within explicit budgets.",
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
const input: ProblemState =
  stateIndex >= 0 ? await readProblemState(process.argv[stateIndex + 1]) : exampleState;
const relations = ["supports", "contradicts", "insufficient"];
const idOf = (candidate: number, requirement: number) => `c${candidate}_r${requirement}`;
const checks = input.candidates.flatMap((_candidate, ci) =>
  input.requirements.map((_requirement, ri) => ({
    id: idOf(ci, ri),
    question: () => ({
      type: "choice" as const,
      instructions: `Does the description in \`input.candidates[${ci}].description\` explicitly satisfy the requirement in \`input.requirements[${ri}].statement\`? Judge only the supplied description, not whether an implementation exists.`,
      criteria: {
        supports: "The description explicitly satisfies the requirement",
        contradicts: "The description explicitly conflicts with the requirement",
        insufficient: "The description does not establish either relation",
      },
    }),
  })),
);
const eligible = (answers: Readonly<Record<string, Answer>>) =>
  input.candidates.filter((_candidate, ci) =>
    input.requirements.every((_requirement, ri) => {
      const judged = gate(answers[idOf(ci, ri)], relations);
      return judged.status === "accepted" && judged.choice === "supports";
    }),
  );
const program = defineProgram({
  nodes: [
    ...checks,
    {
      id: "select",
      dependsOn: checks.map((check) => check.id),
      when: (answers) => eligible(answers).length > 1,
      question: ({ answers }) => ({
        type: "choice" as const,
        instructions:
          "Which eligible candidate description best fits the adaptive problem-solving objective in `input.objective`? Choose only among the supplied criteria. This selects a design description, not permission to act or a correctness proof.",
        criteria: Object.fromEntries(
          eligible(answers).map((candidate) => [candidate.id, candidate.description]),
        ),
      }),
    },
  ],
});
const live = process.argv.includes("--live");
const judge = await evaluator(live, async ({ questions }) => ({
  answers: Object.fromEntries(
    Object.entries(questions).map(([id, question]) => [
      id,
      id === "select"
        ? fixtureChoice(
            stateIndex < 0 ? "recursive_frontier" : Object.keys(question.criteria ?? {})[0],
            Object.keys(question.criteria ?? {}),
          )
        : fixtureChoice(
            stateIndex >= 0 || id.startsWith("c0_") ? "insufficient" : "supports",
            relations,
          ),
    ]),
  ),
}));
let calls = 0;
const answers = await runProgram(program, input, (request) => {
  calls++;
  return judge(request);
});
const candidates = eligible(answers);
const selection =
  candidates.length > 1
    ? gate(
        answers.select,
        candidates.map((candidate) => candidate.id),
      )
    : undefined;
const selected =
  candidates.length === 1
    ? candidates[0]
    : selection?.status === "accepted"
      ? candidates.find((candidate) => candidate.id === selection.choice)
      : undefined;
// oxlint-disable-next-line oxc/no-map-spread -- Each report owns its gated fields; source observations remain immutable.
const observations = checks.map((check, index) => ({
  id: check.id,
  candidateId: input.candidates[Math.floor(index / input.requirements.length)].id,
  requirementId: input.requirements[index % input.requirements.length].id,
  ...gate(answers[check.id], relations),
}));
console.log(
  JSON.stringify(
    {
      mode: live ? "live-model" : "offline-fixture",
      inputSource: stateIndex >= 0 ? "provided-state" : "embedded-example",
      calls,
      objective: input.objective,
      observations,
      eligible: candidates.map((candidate) => candidate.id),
      selection,
      outcome: selected
        ? { status: "candidate-design", candidate: selected }
        : { status: "review" },
    },
    null,
    2,
  ),
);
if (
  observations.some((observation) => observation.status === "error") ||
  selection?.status === "error"
)
  process.exitCode = 1;
