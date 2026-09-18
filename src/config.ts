import { Effect, Schema } from "effect";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "dotenv";

export const globalConfigPath = (env: NodeJS.ProcessEnv = process.env) =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "jeva", ".env");

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", { message: Schema.String }) {}

const readEnv = Effect.fnUntraced(function*(path: string, privateFile: boolean) {
  return yield* Effect.tryPromise({
    try: async () => {
      try {
        const info = await stat(path);
        if (privateFile && process.platform !== "win32" && (info.mode & 0o077) !== 0) {
          throw new ConfigError({ message: `Global config permissions must be 600: ${path}` });
        }
        return parse(await readFile(path));
      } catch (error) {
        if (Schema.is(Schema.Struct({ code: Schema.Literal("ENOENT") }))(error)) return {};
        throw error;
      }
    },
    catch: (error) => error instanceof ConfigError ? error : new ConfigError({ message: `Unable to read config: ${path}` }),
  });
});

export const loadConfig = Effect.fn("loadConfig")(function*(options: {
  cwd?: string; env?: NodeJS.ProcessEnv; globalFile?: string;
} = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const global = yield* readEnv(options.globalFile ?? globalConfigPath(env), true);
  const project = yield* readEnv(join(cwd, ".env"), false);
  const local = yield* readEnv(join(cwd, ".env.local"), false);
  const explicit = env.DOTENV_CONFIG_PATH ? yield* readEnv(resolve(cwd, env.DOTENV_CONFIG_PATH), false) : {};
  const merged = { ...global, ...project, ...local, ...explicit, ...Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)) };
  const apiKey = merged.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return yield* new ConfigError({ message: "AI_GATEWAY_API_KEY is missing. Set it in the environment, .env.local, or your private ~/.config/jeva/.env." });
  return { apiKey, model: merged.JEV_MODEL || "typesafe-ai/jev" };
});
