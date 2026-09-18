# Jeva agent guidance

This repository uses Effect. Before writing Effect code, read `node_modules/effect/AGENTS.md` completely.

Use Jev only for fast, atomic judgments over supplied state. Model questions must name the relevant state path, use Choice for unordered categories, Boolean for crisp conditions, and Score for a single ordered rubric. Keep arithmetic, policy, graph routing, and thresholds in TypeScript.

For multi-step work, use `defineProgram()` from `src/program.ts`. Independent nodes are evaluated together; a node may depend only on earlier results and must be guarded with `when` when conditional. Add a test before changing the runner or DSL. Tests must cover normal routing and invalid graphs without live gateway calls.

Never commit `AI_GATEWAY_API_KEY`, `.env.local`, or a token-bearing config file.

## Task skills

Editable sources are in `skills/`; `.agents/skills/jev-*` links expose them for discovery. Global development links may point at the same sources. Load only the skill matching the work:

- `jev-triage`: repeated intent classification into known queues or handling categories.
- `jev-evidence`: supplied-evidence support/contradiction/insufficiency checks.
- `jev-rank`: semantic relevance filtering and explicit rubric scores over input sets.
- `jev-decision`: composing or tuning reusable multi-question programs.
- `jev`: base guidance for writing and improving Jev programs, including formal contracts and recursive exploration.

Skill selection does not invoke the CLI. The selected skill links to the shared invocation contract, including config resolution, exit codes, and current runtime limitations. Avoid routing ordinary coding, arithmetic, or research to Jev merely because it is available.

## Research and skill maintenance

For the owner's ongoing Jev research and skill-improvement workflow, commit coherent, validated increments as work progresses. Include relevant agent instructions, canonical skill sources, and regression cases in version control; keep unrelated changes and private configuration out. Distinguish offline orchestration checks from live model evaluations and measured improvements. Push only when requested or as part of an authorized publishing workflow.

The canonical base skill is `skills/jev/SKILL.md`; installed discovery links should point at this source so improvements are tracked rather than duplicated in a private home-directory copy.

The owner requests aggressive Jev-assisted decision making during this work. At each substantive semantic decision, identify a finite observation Jev can judge from supplied context, invoke it when useful, and compose accepted observations in code. Batch independent questions and chain genuine dependencies. If no Jev call fits, inspect whether the missing step is context retrieval, candidate generation, atomic decomposition, or deterministic work; perform that step and reconsider. Do not manufacture calls for arithmetic, Git state, permissions, or conclusions already established by executable checks. Record an actual reusable omission in the skills through the self-improvement procedure, then return to the user's task.

Represent complex tasks as whole compiled problems, not just a collection of ad hoc prose prompts. Use typed state, explicit requirements and alternatives, observation nodes, data dependencies, deterministic composition, abstention, and verification conditions. Compile the TypeScript representation before executing it. Atomic model questions are components of a potentially complex program, not a restriction that the whole problem must be simple. Read `skills/jev-decision/references/problem-compilation.md` for the contract and runnable example.
