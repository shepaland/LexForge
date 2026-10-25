import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export interface MakeWorkspaceOptions {
  /**
   * Leaves every change this call writes without a `workflow.json`. Set by a
   * fixture that exists to hold an un-migrated change, so `migrate` has
   * something to carry over.
   */
  noWorkflow?: boolean;
}

const CHANGE_CONFIG = /^lexforge\/changes\/([^/]+)\/\.lexforge\.yaml$/;

/**
 * Lays out a throwaway project directory. A key ending with `/` makes an empty
 * directory, any other key makes a file with the given content.
 *
 * Every `lexforge/changes/<name>/.lexforge.yaml` this call is given gets a
 * `workflow.json` of version 3 beside it when the call writes none of its
 * own: every command that reads a change's state refuses one below version
 * 3, and a fixture built from the config alone must not read as one.
 */
export function makeWorkspace(
  files: Record<string, string> = {},
  options: MakeWorkspaceOptions = {},
): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "lexforge-test-"));

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);

    if (relative.endsWith("/")) {
      mkdirSync(target, { recursive: true });
      continue;
    }

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  if (!options.noWorkflow) {
    for (const [relative, content] of Object.entries(files)) {
      const match = CHANGE_CONFIG.exec(relative);
      if (match === undefined || match === null) continue;

      const change = match[1]!;
      const workflowPath = path.join(root, "lexforge/changes", change, "workflow.json");
      if (existsSync(workflowPath)) continue;

      const schema = (parseYaml(content) as { schema?: string } | null)?.schema ?? "spec-driven";
      writeFileSync(
        workflowPath,
        JSON.stringify({ version: 3, schema, schemaVersion: 1, path: "full" }),
        "utf8",
      );
    }
  }

  return root;
}

export function removeWorkspace(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
