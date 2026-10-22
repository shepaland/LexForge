import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

/** Reads a JSON state file. Broken JSON and a foreign schema both refuse with `code`. */
export function readJson<T>(file: string, schema: z.ZodType<T>, code: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
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
