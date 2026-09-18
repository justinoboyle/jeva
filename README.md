# jeva

`jeva` is a small, pipeline-safe CLI for TypeSafe’s Jev decision model through Vercel AI Gateway. It returns declared structured decisions—never generated prose—so shell scripts and TypeScript own control flow.

## Mission

Represent complex problems as executable, inspectable decision programs. Rather than leaving the structure of a task implicit in a conversation, encode its objective, state, requirements, alternatives, dependencies, and stopping conditions in typed TypeScript. Compile that representation, use Jev for semantic observations, and compose the results with deterministic code into an answer the user can interpret.

The research goal is to make this approach useful for agent decision making: evidence checking, triage, comparison, and recursive exploration of problem and solution spaces. Complexity belongs in the whole program; each Jev question addresses one declared property. Model probabilities describe uncertainty, while code owns graph execution, gates, arithmetic, and policy. A complete-solution claim needs a separate verifier.

## How it works

1. **Compile the problem.** Define typed inputs, candidate alternatives, required observations, and the output contract. Compile TypeScript before execution.
2. **Evaluate the graph.** Send independent questions together. Build later questions from accepted earlier results only when a real dependency exists.
3. **Apply policy in code.** Validate answers and probability distributions. Preserve contradictions, missing evidence, uncertainty, and execution failures as different outcomes.
4. **Refine when needed.** An agent or generator proposes finite subproblems; Jev evaluates them; the controller expands selected branches within explicit limits. Independent evaluation batches run with bounded concurrency.
5. **Return and improve.** Project results into the requested conclusions, evidence, and unresolved alternatives. Turn observed failures into focused skill changes and regression cases, committed as validated increments.

The ordinary program runner uses a fixed dependency graph. The recursive search utility constructs new frontiers with a caller-supplied expander; it does not generate arbitrary child descriptions itself. Search currently returns supported local candidates, not a proof of a complete solution. Skill improvement is performed during authorized agent work, not by a background training service.

See the [problem-compilation contract](skills/jev-decision/references/problem-compilation.md), [compiled problem example](examples/compiled-problem.ts), and [recursive search example](examples/recursive-space.ts).

## Run a compiled workflow

From the checkout, these short commands compile the examples before running them:

| Workflow | Offline fixture | Live Jev |
| --- | --- | --- |
| Audit missing semantic observations | `npm run demo:audit` | `npm run jev:audit` |
| Compare designs against requirements | `npm run demo:decide` | `npm run jev:decide` |
| Explore bounded recursive frontiers | `npm run demo:search` | `npm run jev:search` |

Live commands use the configured gateway key. Offline outputs are synthetic and test control flow only. The default inputs are demonstration tasks, including the audit's activity history. For an audit of actual work, provide a current task snapshot:

```sh
npm run jev:audit -- --state task.json
```

The [reasoning-loop contract](skills/jev-decision/references/reasoning-loop.md) includes the JSON shape: objective, requested method, completed work, unresolved decisions, and finite opportunities. The program asks whether a useful opportunity remains, then gates a dependent selection when there is more than one. A single opportunity needs no selection call. The caller executes the selected workflow, verifies its result, updates the snapshot, and re-audits after meaningful changes within a chosen budget. This is a runnable audit step in an agent-managed loop, not an automatic background worker.

## What the typed representation means

The input describes the problem before any model call. For example, the design comparison uses ordinary TypeScript types:

```ts
type Requirement = { id: string; statement: string };
type Candidate = { id: string; description: string };
type Problem = {
  objective: string;
  requirements: Requirement[];
  candidates: Candidate[];
};

const problem: Problem = {
  objective: "Choose a design for adaptive evidence checking",
  requirements: [
    { id: "parallel", statement: "Evaluate independent observations in parallel" },
    { id: "uncertain", statement: "Keep uncertain requirements unresolved" },
  ],
  candidates: [
    { id: "frontier", description: "Batch independent checks in bounded frontiers; keep uncertain checks unresolved" },
  ],
};
```

Each candidate/requirement pair becomes a Choice node with `supports`, `contradicts`, and `insufficient` labels. A question names exact paths such as `input.candidates[0].description` and `input.requirements[1].statement`. These nodes share a dependency layer. The full example has three candidates and three requirements, so nine checks share its first request.

Code then computes eligibility. Let `g(c, r)` be the validated, gated judgment for candidate `c` and requirement `r`:

```text
eligible(c) ⇔ ∀ r ∈ requirements,
                g(c, r).status = accepted ∧ g(c, r).choice = supports
```

This conjunction is deterministic. One accepted support cannot discharge other requirements. A contradicted requirement excludes a candidate under this policy; insufficient or uncertain observations leave it unresolved. If several candidates qualify, a dependent node chooses among them:

```ts
// Fragment of a defineProgram({ nodes }) declaration:
{
  id: "select",
  dependsOn: checks.map(check => check.id),
  when: answers => eligible(answers).length > 1,
  question: ({ answers }) => ({
    type: "choice",
    instructions: "Which eligible description best fits `input.objective`?",
    criteria: Object.fromEntries(
      eligible(answers).map(candidate => [candidate.id, candidate.description]),
    ),
  }),
}
```

The compiler checks the TypeScript representation; graph preflight checks IDs, dependencies, and cycles. Consuming gates validate answer labels and distributions, then require a unique winner, minimum probability, and separation from the runner-up. The design example uses provisional thresholds of 0.90 and 0.20. These checks establish program invariants; they do not prove that the descriptions are true or implementations are correct. See the [complete executable example](examples/compiled-problem.ts) and [formal contracts](skills/jev-decision/references/formal-model.md).

The final projection is a candidate design or review outcome, with requirement observations, probabilities, and unresolved obligations. For recursive work, the same separation holds: the caller proposes children, Jev judges their supplied claims, and code controls admission and traversal. A supported leaf remains a local candidate until an appropriate verifier establishes the requested result.

## Setup

Requires Node 22+.

```sh
npm install
npm run build
npm link
# Provision a dedicated $100 non-resetting key into your private global config:
node scripts/setup-global-key.mjs <your-vercel-team-slug>
```

The setup script saves the key in `~/.config/jeva/.env` (or `$XDG_CONFIG_HOME/jeva/.env`) with file mode 600, in a directory with mode 700. It never prints the key or overwrites an existing config. `jeva` reads that config from any working directory. You can instead put an existing key in gitignored `.env.local`. Precedence: environment > `DOTENV_CONFIG_PATH` > local `.env.local` > local `.env` > global config. Nothing is added to shell startup files. The dedicated key's $100 cap has no reset; project budgets alone do not limit API-key calls. Gateway budget checks can allow the request crossing the limit to finish.

The development key `jeva-cli` was created in **Justin's projects** (`justins-projects-3aef6e08`) with a $100 non-resetting limit. No key value is stored in this README or tracked files.

## One-liners

```sh
jeva -o yellow -o blue -i banana
# yellow

printf 'production is down' | jeva --boolean -q 'Does `input` describe an urgent incident?' --percentage

jeva --score -i 'Login is broken with no workaround' \
  -q 'How severe is the issue in `input`?' \
  -l 'No user impact' -l 'Workaround exists' -l 'Users are blocked' --probabilities
```

Use `--json` for complete structured output, `--probabilities` for a distribution, `--confidence` for Choice/Score certainty, and `--verbose` for diagnostics on stderr. Normal results are a single value on stdout, which makes this natural:

```sh
category=$(jeva -o billing -o technical -i "$ticket")
case "$category" in billing) printf 'billing queue\n';; *) printf 'technical queue\n';; esac
```

## Exit thresholds

```sh
jeva -o yellow -o blue -i banana --min-probability 0.9 --expect yellow
```

Exit `0` passes, `1` indicates an error, `3` means uncertain, and `4` means a sufficiently certain answer differs from `--expect`. Gates support Choice and Boolean (use `--expect true` or `false`). A Boolean gate uses the winning answer's probability, so a confident false can pass. Without gates, every valid evaluation exits zero. Results remain on stdout even on exit 3 or 4. These probabilities are model estimates, not measured accuracy.

## Agent skills

The editable [skills](skills) are linked into `.agents/skills` for repository discovery and `~/.agents/skills` for development from other folders. Open a fresh agent session to refresh its skill catalog. Names/descriptions match tasks, and the detailed instructions load only when selected, following [the skill discovery model](https://learn.chatgpt.com/docs/build-skills).

| Skill | Useful agent task |
| --- | --- |
| `jev` | Base program-design guidance, formal contracts, and bounded recursive exploration |
| `jev-triage` | Classify tickets, intents, and reported tool failures into known categories |
| `jev-evidence` | Check atomic claims against supplied evidence or verify extracted candidates |
| `jev-rank` | Filter retrieved context and score items on explicit semantic rubrics |
| `jev-decision` | Compose or tune batches, dependencies, and deterministic decision policies |

Example prompt in another folder: “Use $jev-triage to classify the tickets in tickets.jsonl into billing, technical, or other. Preserve IDs, return probabilities, and flag ambiguous cases for review. Start with five records and do not modify the source file.”

The skill set includes executable Choice gating and a [behavioral evaluation checklist](docs/skill-evaluation.md). Tests cover deterministic policies; live model judgments and automatic skill selection need separate evaluation.

The [recursive search implementation](src/search.ts) evaluates independent frontier batches with bounded concurrency, preserves evidence paths, and enforces depth/node/call limits. See the [runnable example](examples/recursive-space.ts) and [formal search contract](skills/jev-decision/references/recursive-spaces.md). Local candidates require a separate verifier before being claimed as complete solutions. Skill maintenance follows the [observed-failure improvement procedure](skills/jev-decision/references/self-improvement.md).

## JevScript: compileable decision programs

For a real decision tree, write a normal TypeScript module with `defineProgram`. Each layer of independent questions is one fast Jev evaluation; dependency edges cause a later evaluation only when needed. The runner validates unique IDs, missing dependencies, cycles, and a bounded graph before any gateway call.

See [examples/fruit-decision.ts](examples/fruit-decision.ts). Compile templates under `examples/` with `npm run build:examples`, then run `jeva run dist/templates/examples/fruit-decision.js -i banana`. The runtime API is `runProgram(program, input, evaluate)` in [src/program.ts](src/program.ts); it is Effect-based and deliberately injectable, so graph behavior is testable without spending money.

```sh
npm test
```

The tests exercise deterministic batching/routing, graph preflight, config precedence/privacy, and exit policies. They do not prove model correctness or sandbox execution. Program files are trusted JavaScript modules imported with Node privileges; compile TypeScript and inspect generated code before running it. See [the program recipe](skills/jev-decision/references/programs.md) for a short build-and-run workflow.
