import { open } from "node:fs/promises";

export type CommandFlags = Readonly<Record<string, string | true>>;

export function commandFlags(
  args: readonly string[],
  valued: readonly string[],
  switches: readonly string[] = [],
): CommandFlags {
  const flags: Record<string, string | true> = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (!valued.includes(name) && !switches.includes(name))
      throw new Error(`Unknown flag: ${name}`);
    if (Object.hasOwn(flags, name)) throw new Error(`Duplicate flag: ${name}`);
    if (switches.includes(name)) flags[name] = true;
    else {
      const value = args[++index];
      if (!value || (value.startsWith("-") && value !== "-"))
        throw new Error(`${name} needs a value`);
      flags[name] = value;
    }
  }
  return flags;
}

export function textFlag(flags: CommandFlags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

export function integerFlag(flags: CommandFlags, name: string): number | undefined {
  const text = textFlag(flags, name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} requires a nonnegative integer`);
  return value;
}

export async function readJson(file: string): Promise<unknown> {
  const handle = await open(file, "r");
  try {
    const size = (await handle.stat()).size;
    if (size > 4_000_000) throw new Error("JSON input exceeds the 4 MB command limit");
    const value: unknown = JSON.parse(await handle.readFile("utf8"));
    return value;
  } finally {
    await handle.close();
  }
}
