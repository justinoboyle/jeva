import { Effect, Schema } from "effect";
import { spawnSync } from "node:child_process";
import { mkdir, open, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { globalConfigPath } from "./config.js";

export type SetupOptions = { scope: string; budget: number };
export const setupHelp =
  "Usage: jeva setup --scope <vercel-team> --budget <USD>\nCreates a dedicated Gateway key with the explicitly supplied non-resetting budget.\nRequires an authenticated Vercel CLI. Never prints the key or replaces an existing config.\n";
export class SetupError extends Schema.TaggedError<SetupError>()("SetupError", {
  message: Schema.String,
}) {}

export function parseSetupOptions(args: string[]): SetupOptions {
  let scope: string | undefined;
  let budget: number | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new SetupError({ message: setupHelp });
    if (flag === "--scope" && scope === undefined) scope = value;
    else if (flag === "--budget" && budget === undefined) budget = Number(value);
    else throw new SetupError({ message: setupHelp });
  }
  if (!scope || !/^[a-zA-Z0-9_-]+$/.test(scope))
    throw new SetupError({ message: "Provide --scope with a Vercel team slug." });
  if (budget === undefined || !Number.isFinite(budget) || budget <= 0)
    throw new SetupError({
      message: "Provide an explicit positive --budget in USD; there is no default budget.",
    });
  return { scope, budget };
}

async function provisionKey(scope: string, budget: number): Promise<string> {
  const result = spawnSync(
    "vercel",
    [
      "--scope",
      scope,
      "ai-gateway",
      "api-keys",
      "create",
      "--name",
      "jeva-cli",
      "--limit",
      String(budget),
      "--refresh-period",
      "none",
    ],
    {
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  if (result.error || result.status !== 0)
    throw new SetupError({
      message: "Vercel key provisioning failed; check that its CLI is installed and authenticated.",
    });
  return result.stdout.trim();
}

export const setupKey = Effect.fn("setupKey")(function* (
  options: SetupOptions,
  dependencies: {
    file?: string;
    provision?: (scope: string, budget: number) => Promise<string>;
  } = {},
) {
  // Validate library callers as well as CLI arguments before creating files or spending.
  parseSetupOptions(["--scope", options.scope, "--budget", String(options.budget)]);
  const file = dependencies.file ?? globalConfigPath();
  const folder = dirname(file);
  return yield* Effect.tryPromise({
    try: async () => {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      if (process.platform !== "win32" && ((await stat(folder)).mode & 0o077) !== 0) {
        throw new SetupError({ message: "Global config directory must have permissions 700." });
      }
      let handle;
      try {
        handle = await open(file, "wx", 0o600);
      } catch {
        throw new SetupError({
          message: "Config already exists or cannot be created; left unchanged.",
        });
      }
      let provisioningSucceeded = false;
      try {
        const key = await (dependencies.provision ?? provisionKey)(options.scope, options.budget);
        provisioningSucceeded = true;
        if (!/^[A-Za-z0-9_-]{20,}$/.test(key))
          throw new SetupError({
            message:
              "Unexpected key output; check the newly created key in Vercel. Credentials were not displayed.",
          });
        await handle.writeFile(`AI_GATEWAY_API_KEY=${key}\nJEV_MODEL=typesafe-ai/jev\n`);
        await handle.sync();
        return { file, scope: options.scope, budget: options.budget, refresh: "none" as const };
      } catch (error) {
        // Only undo the exclusively created empty reservation before any key was returned.
        if (!provisioningSucceeded) await unlink(file);
        if (error instanceof SetupError) throw error;
        throw new SetupError({
          message: provisioningSucceeded
            ? "Unable to save the new key; check the config and key in Vercel. Credentials were not displayed."
            : "Key provisioning failed; provider output suppressed to protect credentials.",
        });
      } finally {
        await handle.close();
      }
    },
    catch: (error) =>
      error instanceof SetupError
        ? error
        : new SetupError({ message: "Unable to initialize private global config." }),
  });
});
