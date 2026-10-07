# Contributing

Use Node 22.12+ or a newer supported release for development. The CLI requires Node 22+ and is not yet published to npm.

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

## Local package checks and future publication

The package is intentionally marked `private: true`: `jeva` remains its local package and binary name, but this project cannot publish under that npm registry name. Use checkout links or tarballs as described in the [installation guide](docs/npm.md#installation).

1. Confirm the exact version in `package.json` and the lockfile.
2. Run `npm run verify` and inspect `npm pack --dry-run`.
3. Run `npm run test:package` to pack and install the archive in an isolated consumer directory, check CLI help and exports, and execute offline fixtures.
4. Use `npm pack` to create the installable tarball. This does not publish anything to npm.

Before a future registry release, choose an available name the maintainer can publish, update package metadata, the lockfile, import paths, smoke checks, and documentation, and explicitly remove the private flag. Confirm the exact release commit passed GitHub Actions before publishing through an authorized npm account.

The GitHub repository is private. Never include credentials, private task snapshots, or local execution reports in a shared archive. Receipt and loop report files can expose result labels, state, and predictable hashes; store them privately and share only intentionally authored, reviewed examples.

Live Jev evaluations are opt-in and consume gateway usage. CI uses offline evaluators. Keep fixtures and real provider observations separate, preserve failed or blocked attempts, and never present model confidence as a correctness proof.
