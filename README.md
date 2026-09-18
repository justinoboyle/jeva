# jeva

`jeva` is a small, pipeline-safe CLI for TypeSafe’s Jev decision model through Vercel AI Gateway. It returns declared structured decisions—never generated prose—so shell scripts and TypeScript own control flow.

## Setup

Requires Node 22+.

```sh
npm install
vercel ai-gateway api-keys create --name jeva --budget 100 --refresh-period none
cp .env.example .env.local
# paste the newly created key into .env.local
npm run build
```

`.env.local` is gitignored. The dedicated gateway key’s non-resetting $100 cap stops further requests after the cap is reached.

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
printf '%s' "$category" | jeva -o auto -o review -i -
```

## JevScript: compileable decision programs

For a real decision tree, write a normal TypeScript module with `defineProgram`. Each layer of independent questions is one fast Jev evaluation; dependency edges cause a later evaluation only when needed. The runner validates unique IDs, missing dependencies, cycles, and a bounded graph before any gateway call.

See [examples/fruit-decision.ts](examples/fruit-decision.ts). Compile a template and pass it directly to the CLI: `jeva run dist/my-decision.mjs -i banana`. The runtime API is `runProgram(program, input, evaluate)` in [src/program.ts](src/program.ts); it is Effect-based and deliberately injectable, so graph behavior is testable without spending money.

```sh
npm test
```

The tests prove deterministic batching/routing and preflight rejection of invalid graphs. They do not claim that a probabilistic model is mathematically correct; evaluate question quality against labeled examples before automating consequential actions.
