import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { UsageError } from "../../cli/errors.js";
export function refuse(message: string): never {
  throw new UsageError("execution-invalid", message);
}
export function digest(value: string | Buffer): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}
/** Reject escapes and symlink components, including parents of newly created files. */
export function local(root: string, relative: string): string {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    relative.includes(":") ||
    relative.split("/").some((p) => p === ".." || p === "." || p === "")
  )
    refuse(`Unsafe project path: ${relative}`);
  const base = realpathSync(root);
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep))
    refuse(`Path outside workspace: ${relative}`);
  let cursor = base;
  for (const part of path.relative(base, file).split(path.sep)) {
    cursor = path.join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink())
        refuse(`Symlink paths are not execution inputs: ${relative}`);
      if (realpathSync(cursor) !== cursor)
        refuse(`Noncanonical path: ${relative}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return file;
}
export function hashFile(root: string, relative: string): string {
  const file = local(root, relative);
  if (!existsSync(file)) return "<missing>";
  if (!lstatSync(file).isFile()) refuse(`Expected a regular file: ${relative}`);
  return digest(
    Buffer.concat([
      Buffer.from(String(lstatSync(file).mode) + "\0"),
      readFileSync(file),
    ]),
  );
}
export function hashes(root: string, paths: string[]): Record<string, string> {
  return Object.fromEntries(
    [...new Set(paths)].sort().map((p) => [p, hashFile(root, p)]),
  );
}
export function json<T>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return refuse(`Unreadable JSON: ${file}`);
  }
}
export function save(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + randomUUID() + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  renameSync(tmp, file);
}
export function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
