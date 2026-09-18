import { open, unlink } from "node:fs/promises";

/** Reserve an explicitly requested local artifact before any potentially paid work. */
export async function withArtifact<T>(
  file: string | undefined,
  operation: () => Promise<T>,
  project: (result: T) => unknown = (result) => result,
): Promise<T> {
  if (file === undefined) return operation();
  const handle = await open(file, "wx", 0o600);
  let written = false;
  try {
    const result = await operation();
    const json = JSON.stringify(project(result), null, 2);
    if (json === undefined) throw new Error("Artifact must be JSON serializable");
    await handle.writeFile(`${json}\n`);
    written = true;
    return result;
  } finally {
    await handle.close();
    if (!written) await unlink(file);
  }
}
