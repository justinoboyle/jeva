# Jeva agent guidance

This repository uses Effect. Before writing Effect code, read `node_modules/effect/AGENTS.md` completely.

Use Jev only for fast, atomic judgments over supplied state. Model questions must name the relevant state path, use Choice for unordered categories, Boolean for crisp conditions, and Score for a single ordered rubric. Keep arithmetic, policy, graph routing, and thresholds in TypeScript.

For multi-step work, use `defineProgram()` from `src/program.ts`. Independent nodes are evaluated together; a node may depend only on earlier results and must be guarded with `when` when conditional. Add a test before changing the runner or DSL. Tests must cover normal routing and invalid graphs without live gateway calls.

Never commit `AI_GATEWAY_API_KEY`, `.env.local`, or a token-bearing config file.
