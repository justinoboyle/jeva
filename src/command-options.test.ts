import assert from "node:assert/strict";
import test from "node:test";
import { commandFlags, integerFlag, textFlag } from "./command-options.js";

test("formal commands reject unknown, repeated, and valueless flags", () => {
  assert.throws(() => commandFlags(["--bogus"], ["--policy"]));
  assert.throws(() => commandFlags(["--policy"], ["--policy"]));
  assert.throws(() => commandFlags(["--policy", "a", "--policy", "b"], ["--policy"]));
  assert.throws(() => commandFlags(["--live", "--live"], [], ["--live"]));
  const flags = commandFlags(
    ["--policy", "a.json", "--answer", "-", "--live"],
    ["--policy", "--answer"],
    ["--live"],
  );
  assert.equal(textFlag(flags, "--policy"), "a.json");
  assert.equal(textFlag(flags, "--answer"), "-");
  assert.equal(flags["--live"], true);
});

test("numeric proof requirements cannot silently become NaN or fractions", () => {
  for (const value of ["NaN", "Infinity", "1.5", "-1"]) {
    assert.throws(() => integerFlag({ "--min-calls": value }, "--min-calls"));
  }
  assert.equal(integerFlag({ "--min-calls": "2" }, "--min-calls"), 2);
});
