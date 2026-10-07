# jeva — run TypeSafe Jev from the command line

Jeva is not yet published to npm. The name `jeva` is a local package and command name, not an available registry install target. [Install from a checkout](#install-and-make-a-decision) before running these examples.

```sh
jeva -o yellow -o blue -i banana
```

`jeva` is a small, pipeline-safe CLI for TypeSafe’s Jev decision model through Vercel AI Gateway. It returns declared structured decisions—never generated prose—so shell scripts and TypeScript own control flow.

Use this TypeSafe Jev CLI for classification, evidence checks, Boolean judgments, rubric scores, and compiled decision workflows. Inputs come from an argument, a file, or stdin; outputs can be plain values or JSON with model probabilities.

Pipe another command's output directly into a decision:

```sh
curl -fsS 'https://wttr.in/New+York?format=4' | jeva -o jacket -o no-jacket
curl -fsS 'https://wttr.in/New+York?format=4' | jeva -o umbrella -o no-umbrella
```

Weather and model results vary. Two labels force a choice even when the weather snippet lacks useful details. When missing evidence matters, name the rule and allow an unknown result:

```sh
curl -fsS 'https://wttr.in/New+York?format=4' | jeva --json \
  -q 'Does `input` explicitly report rain or explicitly report dry conditions?' \
  -o umbrella -c 'umbrella=Rain is explicitly reported' \
  -o no-umbrella -c 'no-umbrella=Dry conditions are explicitly reported' \
  -o unknown -c 'unknown=Neither is established or the report conflicts'
```

This judges the supplied report, not future weather; temperature or wind alone does not establish precipitation. For scripts, enable your shell's `pipefail` so an upstream fetch failure is not hidden by a later command.

## Install and make a decision

Requires Node.js 22 or newer and a Vercel AI Gateway API key for model calls. With credentials configured, the first command asks Jev to choose between `yellow` and `blue`. Examples below are recipes; recorded live observations are labeled in the [evaluation record](docs/skill-evaluation.md).

With access to the repository, build and link the CLI locally:

```sh
git clone git@github.com:justinoboyle/jeva.git
cd jeva
npm ci
npm run build
npm link
jeva --help
```

`npm link` exposes the built checkout as `jeva`; rerun `npm run build` after source changes. To run from the checkout without a global link:

```sh
node dist/cli.js --help
```

For a standalone installation, build a tarball with `npm pack` and install that file; see the [installation guide](docs/npm.md#installation). Do not use `npm install -g jeva` or `npx jeva`: those resolve an npm registry name that this project cannot publish under. The package is marked `private` to prevent accidental publication until a publishable name is chosen.

Help does not need credentials. Provide `AI_GATEWAY_API_KEY` through your environment or private configuration, then run:

```sh
jeva -o billing -o technical -o other -i 'I was charged twice' --json
```

Or create a dedicated gateway key using an installed, authenticated Vercel CLI. Choose the team and a positive budget in USD explicitly; setup has no default budget:

```sh
jeva setup --scope your-team --budget 10
```

Setup creates a key with the requested non-resetting budget and stores it in your private global configuration. It never prints the key or replaces an existing config. It is optional when you already supply `AI_GATEWAY_API_KEY`.

Single-question JSON contains the decision at `.answers.answer`. Choice results include `choice` and, when available, `probabilities`. Model calls send the supplied input to the configured gateway and consume its usage budget. The package is a community CLI, not an official TypeSafe or Vercel release.

See [configuration](#configuration), [one-liners](#one-liners), and the [CLI usage guide](docs/npm.md) for stdin, files, gates, and compiled programs. The GitHub development repository is private; installation requires repository access or a tarball supplied by a maintainer. Documentation, skill instructions, and examples are distributed with the package; relative source links refer to those files or a contributor checkout.

## One-liners

```sh
jeva -o yellow -o blue -i banana

printf 'production is down' | jeva --boolean -q 'Does `input` describe an urgent incident?' --percentage

jeva -f ticket.txt -o billing -o technical -o other \
  -q 'Which category describes the main request in `input`?' --json

jeva --score -i 'Login is broken with no workaround' \
  -q 'How severe is the issue in `input`?' \
  -l 'No user impact' -l 'Workaround exists' -l 'Users are blocked' --probabilities
```

Use `--json` for complete structured output, `--probabilities` for a distribution, `--confidence` for Choice/Score provider confidence or Boolean certainty, and `--verbose` for diagnostics on stderr. Choose one output mode. Normal results are a single value on stdout:

```sh
category=$(jeva -o billing -o technical -i "$ticket")
case "$category" in billing) printf 'billing queue\n';; *) printf 'technical queue\n';; esac
```

Boolean JSON uses `probability` for P(true), while Score uses `score` for position on an ordered rubric. Neither a score nor provider confidence is a calibrated probability that the answer is correct. One invocation consumes one input; a JSONL file is not automatically split into separate decisions.

## Exit thresholds

```sh
jeva -o yellow -o blue -i banana --min-probability 0.9 --expect yellow
```

Exit `0` passes, `1` indicates an error, `3` means uncertain, and `4` means a sufficiently certain answer differs from `--expect`. Gates support Choice and Boolean (use `--expect true` or `false`). A Boolean gate uses the winning answer's probability, so a confident false can pass. Without gates, every valid evaluation exits zero. Results remain on stdout even on exit 3 or 4. These probabilities are model estimates, not measured accuracy.

## Configuration

Supply an existing Vercel AI Gateway key as `AI_GATEWAY_API_KEY`, or create a private dotenv file at `~/.config/jeva/.env`. If `XDG_CONFIG_HOME` is set, use `$XDG_CONFIG_HOME/jeva/.env` instead. The file's contents look like this; replace the placeholder using your editor or secret manager:

```dotenv
AI_GATEWAY_API_KEY=your_gateway_key
JEV_MODEL=typesafe-ai/jev
```

`JEV_MODEL` is optional. On Unix, restrict the global config file to mode `600` and its directory to `700`; the CLI rejects a group/world-accessible global file. You can also use a project's `.env.local` or an explicit `DOTENV_CONFIG_PATH`. Precedence is environment > explicit dotenv path > local `.env.local` > local `.env` > global config. Keep credential files out of version control. Installing Jeva does not create a key or change shell startup files.

Configure a suitable budget on the gateway key. A project budget alone does not cap arbitrary API-key calls. See the [CLI guide](docs/npm.md#configuration-and-errors) for common setup failures.

## Documentation map

| Start here                                                                         | What it covers                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Installation and CLI guide](docs/npm.md)                                          | Install, setup, stdin/files, JSON, gates, and standalone programs        |
| [Typed problem compilation](skills/jev-decision/references/problem-compilation.md) | Requirements, candidates, dependencies, and deterministic composition    |
| [Current-work reasoning loop](skills/jev-decision/references/reasoning-loop.md)    | Supply actual task state, audit useful opportunities, act, and update    |
| [Recursive spaces](skills/jev-decision/references/recursive-spaces.md)             | Bounded parallel frontiers and explicit unresolved obligations           |
| [Formal contracts](skills/jev-decision/references/formal-model.md)                 | Assumptions, invariants, evidence semantics, and limits of confidence    |
| [Building Jeva with Jev](docs/building-jeva-with-jev.md)                           | Recorded development decisions and changes from real use                 |
| [Evaluation record](docs/skill-evaluation.md)                                      | Distinguishes offline checks, live observations, and unmeasured accuracy |

## Mission

For async/await, result forwarding, bounded parallel tasks, and fan-in, see [async programs](docs/async-programs.md). Run `npm run demo:async` offline or `npm run jev:async` with the gateway.

Read [how Jeva is built with Jev](docs/building-jeva-with-jev.md) for the actual development loop, live decision traces, invocation boundaries, and improvements made from observed failures. A runnable [development problem state](docs/development-problem.json) accompanies the account.

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

### Bounded loops and inspectable execution

Jev judgments can be first-class loop exit conditions. Declare which labels mean `complete`, `continue`, or `review`, set probability and margin thresholds, and bind the exit to a successful current-round call. Resource limits and cancellation are separate terminal outcomes, never successful completion.

```sh
npm run demo:loop
npm run jev:loop -- --report loop-report.json
jeva verify-loop loop-report.json --require-live --require-complete
```

The demo uses synthetic observations; the live version refines an authored explanation of uncertainty. Both execute the same compiled controller. The live command requires gateway credentials and sends only that example's authored context. Generated files are private and never overwritten.

For your own trusted compiled programs:

```sh
jeva run program.js --input-json state.json --receipt run.json
jeva verify run.json --require-live --min-calls 1
jeva loop task-loop.js --report loop-report.json
jeva exit --policy policy.json --answer answer.json
```

`jeva exit` replays a supplied Choice gate without calling the model: exit `0` completes, `4` continues, and `3` requests review. The loop controller additionally links that gate to an actual recorded evaluator result. An unsigned local report is evidence under a trusted recorder, not proof of provider identity, hidden reasoning, or semantic correctness. See [agent loops and exit conditions](docs/agent-loops.md), [the typed example](examples/loop-definition.ts), and [contributor/branching workflow](CONTRIBUTING.md).

For contributors in a checkout with development dependencies installed, these short commands compile the examples before running them. They are repository npm scripts, not global `jeva` subcommands:

| Workflow                             | Offline fixture       | Live Jev             |
| ------------------------------------ | --------------------- | -------------------- |
| Audit missing semantic observations  | `npm run demo:audit`  | `npm run jev:audit`  |
| Compare designs against requirements | `npm run demo:decide` | `npm run jev:decide` |
| Explore bounded recursive frontiers  | `npm run demo:search` | `npm run jev:search` |

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
    {
      id: "frontier",
      description:
        "Batch independent checks in bounded frontiers; keep uncertain checks unresolved",
    },
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

## Agent skills

The [skills](skills) contain reusable agent instructions for invoking Jeva and interpreting its results. A tarball install includes the files but does not install them into your agent's skill directory. Contributors may link these canonical sources into `.agents/skills` or their personal skill directory. Names/descriptions match tasks, and detailed instructions load only when selected.

| Skill          | Useful agent task                                                                 |
| -------------- | --------------------------------------------------------------------------------- |
| `jev`          | Base program-design guidance, formal contracts, and bounded recursive exploration |
| `jev-triage`   | Classify tickets, intents, and reported tool failures into known categories       |
| `jev-evidence` | Check atomic claims against supplied evidence or verify extracted candidates      |
| `jev-rank`     | Filter retrieved context and score items on explicit semantic rubrics             |
| `jev-decision` | Compose or tune batches, dependencies, and deterministic decision policies        |

Example prompt in another folder: “Use $jev-triage to classify the tickets in tickets.jsonl into billing, technical, or other. Preserve IDs, return probabilities, and flag ambiguous cases for review. Start with five records and do not modify the source file.”

The skill set includes executable Choice gating and a [behavioral evaluation checklist](docs/skill-evaluation.md). Tests cover deterministic policies; live model judgments and automatic skill selection need separate evaluation.

The [recursive search implementation](src/search.ts) evaluates independent frontier batches with bounded concurrency, preserves evidence paths, and enforces depth/node/call limits. See the [runnable example](examples/recursive-space.ts) and [formal search contract](skills/jev-decision/references/recursive-spaces.md). Local candidates require a separate verifier before being claimed as complete solutions. Skill maintenance follows the [observed-failure improvement procedure](skills/jev-decision/references/self-improvement.md).

## JevScript: compileable decision programs

For a real decision tree, write a normal TypeScript module with `defineProgram`. Each nonempty enabled layer of independent questions shares one Jev evaluation; dependency edges cause a later evaluation only when needed. The runner validates unique IDs, missing dependencies, cycles, and a bounded graph before any gateway call.

See [examples/fruit-decision.ts](examples/fruit-decision.ts). Compile templates under `examples/` with `npm run build:examples`, then run `jeva run dist/templates/examples/fruit-decision.js -i banana`. The runtime API is `runProgram(program, input, evaluate)` in [src/program.ts](src/program.ts); it is Effect-based and deliberately injectable, so graph behavior is testable without spending money.

For your own project, install Jeva locally from a tarball and follow the [standalone typed program recipe](docs/npm.md#typed-programs-in-your-project). `jeva run` loads a compiled JavaScript module with a default-exported program; it does not compile TypeScript or parse stdin JSON into an object automatically.

## Contributor setup

Contributors with repository access can install development dependencies and link the built CLI:

```sh
npm ci
npm run build
npm link
```

```sh
npm test
```

Run `npm run verify` for the full formatting, strict Oxlint, Effect diagnostics, TypeScript, tests, and example-compilation checks. Use `npm run format` to format the repository and `npm run hooks:install` to enable the same verification before commits. CI also runs the full suite; hooks are opt-in and do not replace CI.

The tests exercise deterministic batching/routing, graph preflight, config precedence/privacy, and exit policies. They do not prove model correctness or sandbox execution. Program files are trusted JavaScript modules imported with Node privileges; compile TypeScript and inspect generated code before running it. See [the program recipe](skills/jev-decision/references/programs.md) for a short build-and-run workflow.
