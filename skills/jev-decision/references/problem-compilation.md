# Compile the whole problem

Use for substantive multi-part agent decisions, especially when the user asks to move reasoning into formal compiled representations. This is the required shape for complex Jev work; a prose plan plus unrelated CLI calls does not implement it.

Define P = (X, R, C, O, D, G, K, V): typed state X, requirements R, candidate alternatives C, semantic observations O, dependency relation D, uncertainty gate G, deterministic composition K, and verification condition V. Build these in TypeScript. Compile with `tsc`; then execute the compiled JavaScript through the Jev evaluator. Jev consumes the resulting structured state and questions, not TypeScript source or a hidden proof trace.

The compiler checks the host-language representation. It does not prove that natural-language criteria have the intended semantics. State proof obligations and verify deterministic properties with tests or appropriate proof tools. Keep model error and specification error separate.

Use the actual problem state as extensively as practical, not a fixed example substituted for the user's task. `npm run jev:decide -- --state problem.json` loads a validated objective, requirements, and candidates into the compiled controller. Without `--live`, external problem state receives synthetic insufficient observations for safe orchestration testing. The bundled example remains a labeled demonstration.

## Required working procedure

1. Translate the user's actual task into typed inputs and outputs. Record what a usable answer must establish, and which parts remain assumptions or unverified observations.
2. Represent candidate alternatives, constraints, and subproblems explicitly. Use AND for jointly required obligations and OR for alternatives, with IDs and provenance. Candidate generation may come from the agent, retrieval, or code; do not pretend Jev generates arbitrary new programs.
3. Express each unresolved semantic observation as a finite Choice, Boolean, or Score with exact state paths. Put arithmetic, exact constraints, policy, aggregation, and permission checks in code.
4. Encode dependencies in `defineProgram`. Batch independent nodes. A later model node may use earlier answers only through declared dependencies and a guard that handles absent, failed, or review outcomes. Use a bounded frontier controller for dynamically generated structure.
5. Compile before invocation, then run the program. Validate returned IDs, answer schemas, and distributions before consuming them. Preserve intermediate observations so the final decision can be reconstructed.
6. Apply the composition policy. For candidate c with required observations O(c), eligibility requires every member to pass the required label and gate. One passing observation does not discharge the entire conjunction. Unknown observations keep the candidate unresolved; rejected alternatives retain their reason.
7. Verify the returned result at the appropriate boundary. A proposed design satisfying its description is not proof of a working implementation. A selected action still needs the user's authority. Return the information the user requested with evidence and unresolved obligations.

## Runnable example

`examples/compiled-problem.ts` formalizes a design decision: choose a representation for adaptive, multi-part semantic work. It contains typed requirements and candidate descriptions. Nine requirement checks share the first request. Code gates those checks and computes candidate eligibility. If multiple candidates remain, a dependent Choice selects among only those candidates; if one remains, code selects it without another model call. If none remain, the output is review. The returned report includes requirement observations, eligible IDs, the selection gate, and the chosen description.

```sh
npm run demo:decide
npm run jev:decide
```

Both commands compile first using `tsconfig.examples.json`. `demo:decide` is explicitly an offline fixture for control-flow verification. `jev:decide` evaluates only the generic task-authored descriptions embedded in the example; it does not read or transmit repository guidance files. It uses the existing private gateway configuration and disables automatic SDK retries. The candidate judgments are claims about supplied descriptions, not code-correctness proofs.

## Grow complexity deliberately

Compose richer problems through repeated typed stages: retrieve evidence → verify observations → discharge requirements → select eligible alternatives → generate refinements → verify the final artifact. Stages that do not need earlier results should share a frontier. Keep explicit call/node/depth limits and avoid recursion solely to increase apparent sophistication.

When a result fails, identify the layer: formalization, evidence retrieval, semantic judgment, gate, composition, implementation, or final explanation. Follow [self-improvement.md](self-improvement.md), preserving the failing case and the user's actual objective. Future revisions should improve how the problem is compiled and solved, not merely how confidently the model chooses a label.
