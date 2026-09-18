# Invoke the development CLI from any folder

The skill is instructions for the agent to read. Actual judgments happen when the agent calls `jeva` through its terminal tool. Selecting a skill does not itself call Jev or authorize external actions.

## Locate the checkout once

The globally installed skill may be a symlink. Resolve its physical path before following sibling references. Given the `SKILL.md` location from the skill catalog, use `realpath` (or the filesystem tool's equivalent). Its canonical path is `<checkout>/skills/<skill>/SKILL.md`; the checkout is three directories above that file. Do not assume the user's current directory is the checkout. All five skills travel together; shared references live under `skills/jev-decision/`.

Check `command -v jeva`, `node --version`, and `jeva --help`. The development install uses `npm link`: after source changes, run `npm run build` in the checkout to refresh `dist`. Node 22+ is the package's supported runtime. npm global links are specific to the active Node installation. A visible `jeva` linked under Node 20 does not establish runtime compatibility; use an available supported Node binary to execute the resolved CLI entrypoint when necessary.

The CLI reads private user config at `$XDG_CONFIG_HOME/jeva/.env` or `~/.config/jeva/.env` automatically, so callers in other folders need no secret export. Precedence: process environment, explicit `DOTENV_CONFIG_PATH`, current folder's `.env.local`, current folder's `.env`, user config. The global file must have mode 600. Do not display or paste the key. A missing file/key is a setup problem, not a negative model answer. A project budget does not cap arbitrary API-key calls: the key itself needs its own budget.

```sh
jeva -o yellow -o blue -i banana
```

## Inputs and outputs

Run from the folder containing the input files, or pass absolute paths. Quote variable values; pipe data rather than interpolating it into shell code. Use stdin with no `-i`. `-f` is supported for one-question calls. There is no batch/JSONL flag yet. To process several records, iterate in the shell with stable IDs or write a program; never imply one command automatically splits lines.

Use a task-specific directory from `mktemp -d` for scratch inputs rather than scattering files in the caller's working directory. Keep shell argument boundaries intact (prefer argument arrays in a program). In zsh, `path` is tied to `PATH`; use task-specific variable names such as `claim_file`, never `path` for a loop variable. Resolve the installed CLI once per task, not once per item.

```sh
set -o pipefail
printf '%s' "$message" | jeva --boolean \
  -q 'Does `input` explicitly request a refund?' --json
```

Choose one output mode. `--json` exposes `.answers.answer` plus metadata; Choice has `.choice` and optional `.probabilities`, Boolean has `.probability`, Score has `.score` and optional `.probabilities`. The CLI calls the primitive Boolean; TypeSafe's direct SDK calls it Noul.

Use full JSON for automation. The CLI's `--confidence` has a fallback that can report zero when metadata is absent. Missing confidence is unknown, not zero. Selected-option probability is also not the same as provider confidence. `--percentage` on Score means normalized rubric position, not probability of correctness.

## Bash exit gates

`--min-probability 0.9` gates the winning Choice or Boolean answer. For Boolean, the winner is true when P(true) > 0.5 and false when it is below 0.5; a confident false is a valid decision. Add `--expect true` (or an option label) to require a particular answer. Exact ties abstain. The threshold is inclusive. Without either flag, every valid answer exits zero. Score gates are unsupported; use numeric policy on JSON scores.

Exit codes: 0 passed; 1 input/config/provider/invalid-answer error; 3 ambiguous or below threshold; 4 a sufficiently certain answer differs from `--expect`. With only `--expect`, any non-tied winning answer counts: add a probability floor when uncertainty matters. Valid gated results still appear on stdout, so always inspect exit status as well. This Bash example is compatible with `set -e`:

```sh
code=0
jeva -o yellow -o blue -i banana --min-probability 0.9 --expect yellow || code=$?
case "$code" in
  0) printf 'accepted\n' ;;
  3) printf 'needs review\n' ;;
  4) printf 'different answer\n' ;;
  *) printf 'evaluation failed\n' >&2; exit "$code" ;;
esac
```

## Reusable Choice gate

After a single-question `--json` call, pipe into the shared helper with explicit minimum probability and winner/runner-up margin. Example numbers are illustrative and require tuning on labeled data:

```sh
set -o pipefail
jeva -f ticket.txt -o billing -o technical -o other \
  -q 'Which team handles the main request in `input`?' --json |
  node /path/to/jevcli/skills/jev-decision/scripts/gate-choice.mjs 0.9 0.2
```

The helper returns `{status:"accepted"|"review",choice,probability,margin}`. Review is a successful policy result, not a process error. Invalid/missing distributions exit 1 with no stdout; preserve that failure. The helper never executes the label. Handle accepted `other`/`insufficient` with the appropriate fallback, not as a supported action. Do not re-query until a preferred answer appears.

## Availability and recovery

Invoke when the task needs an atomic semantic judgment over supplied state or explicitly asks for a Jev evaluation. Do not replace deterministic checks, retrieval, generative candidate construction, or proof checking with model calls. If the requested question is unsuitable, decompose it where useful and identify the remaining non-Jev work.

Treat the CLI exit status and the semantic result as separate channels. On exit 1, retain the error and item ID; do not parse an empty response or feed it to the Choice gate. Codes 3 and 4 from CLI gating can carry valid distributions: preserve both the answer and the gate outcome. Missing credentials, runtime mismatch, and network errors do not mean `insufficient` or a negative judgment.

If a call fails with a likely sandbox/network restriction, use the environment's escalation mechanism for the same scoped evaluation. A gateway failure alone does not prove its cause; check available diagnostics without exposing credentials. If the same global setup failure repeats, stop launching new items, retain unattempted IDs, and resolve it before continuing. Account for the SDK's own retries before adding bounded outer retries. Never retry simply to obtain a preferred label. When unavailable, continue appropriate offline work and label any source analysis as the agent's, with Jev probabilities unavailable.

One-question CLI calls can run through a bounded worker pool; shared-state programs batch independent questions by dependency layer. Choose based on state size, latency, metadata needs, and failure isolation. No subagents are needed for concurrent tool calls. Read [programs.md](programs.md) for concrete composition and [self-improvement.md](self-improvement.md) after an observed invocation failure warrants a durable correction.

If approval review rejects sending private source files, do not resend the same contents through another transport. A narrower evaluation may use non-sensitive, task-authored excerpts when those suffice; disclose the reduced evidence scope. Otherwise retain the blocked evaluation and seek explicit authorization for the identified data transfer. This is an invocation limitation, not a semantic answer.

## Program boundary

For the included compiled examples, use `npm run demo:audit`, `npm run demo:decide`, or `npm run demo:search` for offline fixtures. The corresponding `jev:audit`, `jev:decide`, and `jev:search` scripts perform live calls. Every workflow compiles first and checks Node 22+. `npm run build:examples` compiles custom files under `examples/`; keep compiler options in `tsconfig.examples.json`, rather than repeating long flag lists. To audit current work, use `npm run jev:audit -- --state task.json`; without a state file the example uses demonstration state. See [reasoning-loop.md](reasoning-loop.md).

`jeva run path/to/program.js` imports trusted compiled JavaScript with Node's full privileges. It is not a sandbox, and it does not type-check TypeScript automatically. Inspect agent-generated code and compile it before running. Current graph answers may omit skipped nodes; guard every access with `?.` even though the exported type currently overstates presence. The program command returns a bare map of answers, unlike one-question `--json`. It discards provider metadata/usage. Read the runtime before relying on other guarantees.
