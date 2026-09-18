# Jeva npm usage: TypeSafe Jev in your terminal

```sh
npx jeva -o yellow -o blue -i banana
```

`jeva` runs TypeSafe's Jev decision model through Vercel AI Gateway. Use it when code needs a finite semantic answer: one category, a Boolean probability, or a score on an explicit rubric. It is a community CLI, not an official TypeSafe or Vercel package. It does not generate prose or retrieve facts from the web.

The command above requires the runtime and credentials below. Examples are runnable recipes, not recorded live outputs; measured development observations are identified separately in the [evaluation record](skill-evaluation.md).

## Installation

Use Node.js 22 or newer:

```sh
npm install -g jeva
jeva --help
```

For a one-off invocation without a global install:

```sh
npx -y jeva --help
```

For scripts with a project lockfile:

```sh
npm install jeva
npx jeva --help
```

No API key is required for help. Model evaluations require your own gateway credentials and consume gateway usage. The development repository remains private; npm installation does not require GitHub access. Source examples and documentation included in the package can be read locally even when a registry page cannot resolve their relative links.

## Configuration and errors

If you are authenticated with the Vercel CLI, create a dedicated gateway key with an explicit team and budget:

```sh
jeva setup --scope your-team --budget 10
```

The budget is required; setup has no default amount. The created key has a non-resetting limit and is stored in the private global dotenv file. Setup is an account mutation, while `jeva --help` is local. You can skip setup when you already have a gateway key.

Read `AI_GATEWAY_API_KEY` from your existing secret manager/environment, or create a private dotenv file using an editor:

```dotenv
AI_GATEWAY_API_KEY=your_gateway_key
JEV_MODEL=typesafe-ai/jev
```

The global location is `~/.config/jeva/.env`, or `$XDG_CONFIG_HOME/jeva/.env` when that variable is set. `JEV_MODEL` is optional. On Unix, the file must not be accessible to other users; use mode `600` and directory mode `700`. An existing `.env.local` in the working directory also works. Resolution order is environment, `DOTENV_CONFIG_PATH`, local `.env.local`, local `.env`, then global config. Values earlier in that list override later ones. Nothing is written to shell startup files.

An absent key, invalid global-file permissions, network failure, or invalid input exits `1` and writes an error to stderr. These errors are not model judgments. Resolve a common configuration failure before processing a whole dataset. Keep key values and dotenv files out of version control and public reports.

## Atomic decisions: arguments, stdin, files

One question over one supplied input is the basic unit. Choice labels are unordered alternatives; criteria explain their meaning:

```sh
jeva -i 'Please refund my duplicate charge' --json \
  -q 'Which category describes the main request in `input`?' \
  -o billing -c 'billing=Charges, payments, or refund requests' \
  -o technical -c 'technical=Product failures or account access' \
  -o other -c 'other=No clear primary request in either category'
```

Pipe text to stdin, or pass `-i -` explicitly:

```sh
printf '%s' 'Production is down' | jeva --boolean --json \
  -q 'Does `input` explicitly report a production outage?'
```

Read a file without shell interpolation:

```sh
jeva -f ticket.txt -o billing -o technical -o other --json
```

For a rubric, every level describes the same ordered dimension:

```sh
jeva -f incident.txt --score --json \
  -q 'What user impact is reported in `input`?' \
  -l 'Users complete the task normally' \
  -l 'Users complete the task with a workaround' \
  -l 'Users cannot complete the task and have no workaround'
```

Check whether impact is stated before interpreting a score; missing evidence is not automatically low impact. A JSON or JSONL file passed with `-f` is input text, not an automatic batch. For many records, retain IDs and use a bounded worker pool or a compiled program.

## JSON and exit gates

Single-question `--json` emits the provider result with the answer at `.answers.answer`. The relevant fields are:

| Primitive | Answer fields | Meaning |
| --- | --- | --- |
| Choice | `choice`, optional `probabilities` | Declared label and distribution |
| Boolean | `probability` | Estimated P(true) |
| Score | `score`, optional `probabilities` | Position on an ordered rubric and level distribution |

Use one output mode per command: `--json`, `--probabilities`, `--percentage`, or `--confidence`. Missing metadata is not proof of zero uncertainty. Score percentages describe normalized rubric position, not accuracy. Provider confidence and selected-label probability are different quantities.

Gate a Choice or Boolean using a probability floor and, optionally, a required answer:

```sh
jeva -f message.txt --boolean --json \
  -q 'Does `input` explicitly request a refund?' \
  --min-probability 0.9 --expect true
```

| Exit | Meaning |
| --- | --- |
| `0` | Gate passed, or a valid ungated result |
| `1` | Input, configuration, provider, or invalid-answer error |
| `3` | Tie or confidence below the chosen threshold |
| `4` | A sufficiently certain answer differs from `--expect` |

Valid results remain on stdout for exits `3` and `4`. Capture status as well as JSON. Without `--expect`, a confident false Boolean passes the floor; without a floor, `--expect` only requires a non-tied winning answer. Score exit gates are unsupported. Thresholds are policy choices, not guarantees of semantic accuracy.

## Typed programs in your project

Compile a complex problem into a graph of finite observations. TypeScript describes inputs, requirements, candidates, dependencies, and the consuming policy. Jev evaluates the resulting questions and structured state; it does not interpret TypeScript as a proof.

The shortest standalone program needs no package imports. Save this as `decision.mjs`:

```js
export default {
  nodes: [
    {
      id: "refund_requested",
      question: () => ({
        type: "boolean",
        instructions: "Does `input` explicitly request a refund?",
      }),
    },
    {
      id: "outage_reported",
      question: () => ({
        type: "boolean",
        instructions: "Does `input` explicitly report a service outage?",
      }),
    },
  ],
};
```

```sh
jeva run decision.mjs -i 'The service is down; please refund this month'
```

Both independent questions share one request. `jeva run` returns a bare answer map keyed by node ID, rather than the single-question `.answers.answer` wrapper. Skipped conditional nodes are absent. The CLI passes `-i` or stdin as text; structured typed inputs require a programmatic `runProgram` caller that parses and validates them.

For TypeScript, use the packaged program types and your project's compiler configuration. The [full design example](../examples/compiled-problem.ts) defines typed requirements and candidates, generates candidate/requirement checks, validates distributions, gates eligibility, and then selects among eligible candidates. The [program recipe](../skills/jev-decision/references/programs.md) covers contributor builds. Public API imports and compiler configuration should match the installed package version; inspect its `package.json` exports rather than assuming a repository-relative path exists in your project.

Declare `dependsOn` when a later question or guard reads earlier answers. Independent nodes share a layer; a guarded successor handles accepted, uncertain, and absent predecessors explicitly. Recursive search uses a caller-supplied proposer plus bounded frontiers; Jev selects among supplied possibilities and does not invent executable subproblems.

Program modules execute as trusted JavaScript with normal Node privileges. Review a module before running it. The CLI does not compile TypeScript, sandbox modules, or certify correctness. Compiler checks, graph invariants, and executable tests establish different properties from model judgments; a supported candidate still needs the appropriate verifier.

## Package users and contributors

The npm CLI is ready to run and does not need a local compiler for one-question calls or already-compiled programs. Installing it globally does not expose repository npm scripts in your current directory or install agent skills automatically.

The bundled `examples/`, `skills/`, and `docs/` provide design references. A contributor checkout with development dependencies supports `npm run build:examples`, `npm run demo:audit`, `npm run jev:audit -- --state task.json`, and the decision/search workflows documented in the README. Offline fixtures check orchestration; live results must be labeled separately. The [development account](building-jeva-with-jev.md) documents actual Jev-assisted improvements and their limits.
