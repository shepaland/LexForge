import { makeWorkspace } from "../../helpers/workspace.js";

/** The change every group-label fixture below builds its workspace under. */
export const CHANGE = "add-groups";

/**
 * One section of an index plan: the heading `tasks.md` carries, the link
 * path under it (one path segment below `tasks.md`, the way a real plan
 * links to its sections), and the file that link resolves to - that
 * section's own `Depends on:` line and tasks, nothing else.
 */
export interface IndexSection {
  heading: string;
  linkPath: string;
  body: string;
}

/** Workspaces `groupsWorkspace` has made, removed in each file's own `afterEach`. */
export const created: string[] = [];

/**
 * A workspace whose plan is an index: `tasks.md` carries each section's
 * heading and a lone link to the file holding that section's `Depends on:`
 * line and its tasks. No delta specs exist under this change, so only the
 * group-label rules of `checkPlan` can fire.
 */
export function groupsWorkspace(sections: IndexSection[]): string {
  const indexLines: string[] = [];
  const files: Record<string, string> = {
    "lexforge/config.yaml": "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nGroup labels need their own checks.\n",
    [`lexforge/changes/${CHANGE}/design.md`]:
      "## Context\n\nOne file per section, linked from an index.\n",
  };

  for (const section of sections) {
    indexLines.push(section.heading, "", `\`${section.linkPath}\``, "");
    files[`lexforge/changes/${CHANGE}/${section.linkPath}`] = section.body;
  }

  files[`lexforge/changes/${CHANGE}/tasks.md`] = indexLines.join("\n");

  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

/** Workspace path of a section's own file, the way a finding names it. */
export function sectionFile(linkPath: string): string {
  return `lexforge/changes/${CHANGE}/${linkPath}`;
}
