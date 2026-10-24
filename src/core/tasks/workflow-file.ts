import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { UsageError } from "../../cli/errors.js";
import { readJson, save } from "./files.js";
import { changeDir } from "./paths.js";

const workflowSchema = z
  .object({
    version: z.literal(3),
    schema: z.string(),
    schemaVersion: z.literal(1),
    path: z.enum(["full", "short"]),
  })
  .strict();

export type WorkflowFile = z.infer<typeof workflowSchema>;

function workflowPath(root: string, change: string): string {
  return path.join(root, changeDir(change), "workflow.json");
}

/** Reads workflow.json of version 3. A version 1 or 2 file is refused with the migrate command. */
export function readWorkflowFile(root: string, change: string): WorkflowFile {
  const file = workflowPath(root, change);
  if (!existsSync(file)) {
    throw needsMigration(change, "it has no workflow.json");
  }
  try {
    const version = (JSON.parse(readFileSync(file, "utf8")) as { version?: unknown }).version;
    if (version === 1 || version === 2) {
      throw needsMigration(change, `its workflow.json is version ${version}`);
    }
  } catch (error) {
    if (error instanceof UsageError) throw error;
    // Unreadable JSON is reported by readJson below.
  }
  return readJson(file, workflowSchema, "workflow-unreadable");
}

export function writeWorkflowFile(root: string, change: string, file: WorkflowFile): void {
  save(workflowPath(root, change), workflowSchema.parse(file));
}

function needsMigration(change: string, reason: string): UsageError {
  return new UsageError(
    "change-needs-migration",
    `change "${change}" predates workflow 3: ${reason}.`,
    `lexforge migrate --change ${change}`,
  );
}
