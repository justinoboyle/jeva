# Contributing

Use Node 22.12+ or a newer supported release for development. The published CLI requires Node 22+.

```sh
npm ci
npm run hooks:install
npm run verify
```

`npm run format` applies Oxfmt. `npm run lint` enforces strict, type-aware Oxlint; `npm run lint:effect` checks Effect diagnostics and fails incomplete scans. The installed precommit hook and GitHub Actions run the full verification suite. Do not disable checks to make a branch pass.

## Branches and parallel work

Keep `main` releasable. Create `mission/<topic>` branches in separate Git worktrees for independent implementation streams. Assign explicit file ownership before parallel edits; do not share a writable checkout or commit another contributor's unreviewed work.

An `integration/<suite>` branch combines a related set of missions. Merge completed mission branches with `--no-ff` so their boundaries remain visible. Resolve conflicts on the integration branch, run the complete suite, and test the resulting package rather than relying only on each branch's tests. Merge the integrated result into `main` with another explicit merge commit, push, and wait for the Node 22 and Node 26 GitHub Actions jobs before publishing.

Retain useful mission branches until the release is verified. Do not force-push shared history. A local commit is not a remote push; a push is not a successful CI run; a packed tarball is not an npm publication.

## Release checks

1. Confirm the exact version in `package.json` and the lockfile.
2. Run `npm run verify`, inspect `npm pack --dry-run`, and smoke-test the tarball from an isolated consumer directory.
3. Confirm the exact main commit passed GitHub Actions.
4. Publish with `npm publish --access public` using an authorized npm account. Do not bypass account security if npm requests 2FA.
5. Confirm the registry version and test `npx -y jeva@<version> --help` outside the checkout. Tag the verified source commit only after publication is confirmed.

The GitHub repository is private; npm artifacts are public. Never include credentials, private task snapshots, or local execution reports in the package. Receipt and loop report files can expose result labels, state, and predictable hashes; store them privately and publish only intentionally authored, reviewed examples.

Live Jev evaluations are opt-in and consume gateway usage. CI uses offline evaluators. Keep fixtures and real provider observations separate, preserve failed or blocked attempts, and never present model confidence as a correctness proof.
