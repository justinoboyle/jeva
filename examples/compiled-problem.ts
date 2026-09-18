import { defineProgram, runProgram, type Answer } from "../src/program.js";
import { evaluator, fixtureChoice, gate } from "./support/evaluation.js";

type Requirement = { id: string; statement: string };
type Candidate = { id: string; description: string };
type Problem = { objective: string; requirements: Requirement[]; candidates: Candidate[] };
const input: Problem = {
  objective: "Represent complex semantic tasks in compiled programs, especially tasks that discover new subproblems during execution.",
  requirements: [
    { id: "typed", statement: "Represent a multi-part task using typed state and explicit requirements." },
    { id: "parallel", statement: "Evaluate independent semantic observations in parallel." },
    { id: "uncertain", statement: "Preserve uncertain required observations as unresolved." },
  ],
  candidates: [
    { id: "one_prompt", description: "Send the task as one prose prompt and return its winning label, without typed requirements or an uncertainty gate." },
    { id: "fixed_graph", description: "Compile typed state and explicit requirements into a fixed dependency graph. Evaluate independent semantic observations in parallel; preserve uncertain required observations as unresolved. All nodes are known before execution." },
    { id: "recursive_frontier", description: "Compile typed state and explicit requirements into bounded frontiers. Evaluate independent semantic observations in parallel; preserve uncertain required observations as unresolved. A caller proposes new subproblems after accepted observations, and the controller admits them within explicit budgets." },
  ],
};
const relations = ["supports", "contradicts", "insufficient"];
const idOf = (candidate: number, requirement: number) => `c${candidate}_r${requirement}`;
const checks = input.candidates.flatMap((_, ci) => input.requirements.map((_, ri) => ({
  id: idOf(ci, ri),
  question: () => ({ type: "choice" as const,
    instructions: `Does the description in \`input.candidates[${ci}].description\` explicitly satisfy the requirement in \`input.requirements[${ri}].statement\`? Judge only the supplied description, not whether an implementation exists.`,
    criteria: { supports: "The description explicitly satisfies the requirement", contradicts: "The description explicitly conflicts with the requirement", insufficient: "The description does not establish either relation" },
  }),
})));
const eligible = (answers: Readonly<Record<string, Answer>>) => input.candidates.filter((_, ci) =>
  input.requirements.every((_, ri) => {
    const judged = gate(answers[idOf(ci, ri)], relations);
    return judged.status === "accepted" && judged.choice === "supports";
  }));
const program = defineProgram({ nodes: [...checks, {
  id: "select",
  dependsOn: checks.map(check => check.id),
  when: answers => eligible(answers).length > 1,
  question: ({ answers }) => ({ type: "choice" as const,
    instructions: "Which eligible candidate description best fits the adaptive problem-solving objective in `input.objective`? Choose only among the supplied criteria. This selects a design description, not permission to act or a correctness proof.",
    criteria: Object.fromEntries(eligible(answers).map(candidate => [candidate.id, candidate.description])),
  }),
}] });
const live = process.argv.includes("--live");
const judge = await evaluator(live, async ({ questions }) => ({ answers: Object.fromEntries(
  Object.entries(questions).map(([id, question]) => [id,
    id === "select" ? fixtureChoice("recursive_frontier", Object.keys(question.criteria ?? {}))
      : fixtureChoice(id.startsWith("c0_") ? "insufficient" : "supports", relations)]),
) }));
let calls = 0;
const answers = await runProgram(program, input, request => { calls++; return judge(request); });
const candidates = eligible(answers);
const selection = candidates.length > 1 ? gate(answers.select, candidates.map(candidate => candidate.id)) : undefined;
const selected = candidates.length === 1 ? candidates[0] : selection?.status === "accepted"
  ? candidates.find(candidate => candidate.id === selection.choice) : undefined;
const observations = checks.map(check => ({ id: check.id, ...gate(answers[check.id], relations) }));
console.log(JSON.stringify({ mode: live ? "live-model" : "offline-fixture", calls, objective: input.objective,
  observations, eligible: candidates.map(candidate => candidate.id), selection,
  outcome: selected ? { status: "candidate-design", candidate: selected } : { status: "review" },
}, null, 2));
if (observations.some(observation => observation.status === "error") || selection?.status === "error") process.exitCode = 1;
