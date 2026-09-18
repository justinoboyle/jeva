import { runLoop } from "../src/loop.js";
import { withArtifact } from "../src/artifact.js";
import { commandFlags, textFlag } from "../src/command-options.js";
import { evaluator, fixtureChoice } from "./support/evaluation.js";
import definition from "./loop-definition.js";

const flags = commandFlags(process.argv.slice(2), ["--report"], ["--live"]);
const live = flags["--live"] === true;
let fixtureCalls = 0;
const evaluate = await evaluator(live, async () => ({
  answers: {
    exit: fixtureChoice(fixtureCalls++ === 0 ? "contradicts" : "supports", [
      "supports",
      "contradicts",
      "insufficient",
    ]),
  },
}));
const report = await withArtifact(textFlag(flags, "--report"), () =>
  runLoop(definition.initialState, definition.step, {
    ...definition.limits,
    stateSchema: definition.stateSchema,
    exitPolicy: definition.exitPolicy,
    evaluate,
    mode: live ? "live" : "fixture",
  }),
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === "complete" ? 0 : 3;
