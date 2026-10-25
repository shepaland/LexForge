import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { UsageError } from "../../cli/errors.js";

/** Atomic write: a temporary file next to the target, then rename. */
export function save(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + randomUUID() + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  renameSync(tmp, file);
}

/** Atomic write of a text file, the same way `save` writes JSON. */
export function saveText(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + randomUUID() + ".tmp";
  writeFileSync(tmp, text, { flag: "wx" });
  renameSync(tmp, file);
}

/** Reads a JSON state file. Broken JSON and a foreign schema both refuse with `code`. */
export function readJson<T>(file: string, schema: z.ZodType<T>, code: string): T {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw unreadable(file, code, `it cannot be read (${(error as NodeJS.ErrnoException).code ?? "read error"})`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw unreadable(file, code, "it is not valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw unreadable(file, code, issue ? `${issue.path.join(".") || "(root)"}: ${issue.message}` : "it does not match its schema");
  }
  return parsed.data;
}

function unreadable(file: string, code: string, reason: string): UsageError {
  const change = /lexforge\/changes\/([^/\\]+)/.exec(file.replace(/\\/g, "/"))?.[1] ?? "<change>";
  return new UsageError(
    code,
    `${file} cannot be read: ${reason}.`,
    `lexforge resume --change ${change}`,
    file,
  );
}

/** `nextStep` is the command that is safe to run once the path is fixed: each caller knows it. */
function refuse(message: string, nextStep: string): never {
  throw new UsageError("execution-invalid", message, nextStep);
}

export function digest(value: string | Buffer): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}

/** Reject escapes and symlink components, including parents of newly created files. */
export function local(root: string, relative: string, nextStep: string): string {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    relative.includes(":") ||
    relative.split("/").some((p) => p === ".." || p === "." || p === "")
  )
    refuse(`Unsafe project path: ${relative}`, nextStep);
  const base = realpathSync(root);
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep))
    refuse(`Path outside workspace: ${relative}`, nextStep);
  let cursor = base;
  for (const part of path.relative(base, file).split(path.sep)) {
    cursor = path.join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink())
        refuse(`Symlink paths are not execution inputs: ${relative}`, nextStep);
      if (realpathSync(cursor) !== cursor)
        refuse(`Noncanonical path: ${relative}`, nextStep);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return file;
}

export function hashFile(root: string, relative: string, nextStep: string): string {
  const file = local(root, relative, nextStep);
  if (!existsSync(file)) return "<missing>";
  if (!lstatSync(file).isFile()) refuse(`Expected a regular file: ${relative}`, nextStep);
  return digest(
    Buffer.concat([
      Buffer.from(String(lstatSync(file).mode) + "\0"),
      readFileSync(file),
    ]),
  );
}
