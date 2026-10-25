import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEV } from "../../src/core/git/feature-branch.js";
import { writeWorkflowFile } from "../../src/core/tasks/workflow-file.js";
import { git, writeAt, type GitWorkspace } from "./git-workspace.js";
import { CHANGE, CHANGE_DIR, createTaskWorkspace } from "./task-workspace.js";

const FIRST_TASK = `## 1. Search

Depends on: none

- [ ] 1.1 Search over note text in \`src/notes.js\`
      -> notes#Search over note text
      Files: \`src/notes.js\`, \`test/notes.test.mjs\`
      Test: \`test/notes.test.mjs\`
      Command: \`node --test test/notes.test.mjs\`
`;

const SECOND_TASK = `- [ ] 1.2 Rank search results in \`src/rank.js\`
      -> notes#Search over note text
      Files: \`src/rank.js\`, \`test/rank.test.mjs\`
      Test: \`test/rank.test.mjs\`
      Command: \`node --test test/rank.test.mjs\`
`;

const VALID_SPEC = `## Purpose

Holds how the notes of the product are searched by the text of a note.

## ADDED Requirements

### Requirement: Search over note text

The system SHALL return the notes whose text holds the query.

#### Scenario: A word in one note

- **WHEN** the query is a word of one note
- **THEN** that note is returned
`;

const SPEC_WITHOUT_SCENARIO = `## Purpose

How notes are searched.

## ADDED Requirements

### Requirement: Search over note text

The system SHALL return the notes whose text holds the query.
`;

/** A change on the short path: one task, the delta changes a capability the project already has. */
export function createShortWorkspace(): GitWorkspace {
  const ws = createTaskWorkspace(FIRST_TASK, { approved: false });
  writeAt(ws.root, `${CHANGE_DIR}/tasks.md`, "## 1. Search\n\n`tasks/section-1.md`\n");
  writeAt(ws.root, `${CHANGE_DIR}/tasks/section-1.md`, FIRST_TASK);
  writeAt(ws.root, `${CHANGE_DIR}/specs/notes/spec.md`, VALID_SPEC);
  writeWorkflowFile(ws.root, CHANGE, { version: 3, schema: "spec-driven", schemaVersion: 1, path: "short" });
  writeAt(ws.root, "lexforge/specs/notes/spec.md", "## Purpose\n\nHow notes are searched.\n\n## Requirements\n");
  git(ws.root, "add", "--all");
  git(ws.root, "commit", "--message", "short change");
  // The project spec belongs to dev, so plan approve does not count it as work before approval.
  git(ws.root, "branch", "--force", DEV, "HEAD");
  return ws;
}

function changeFile(ws: GitWorkspace, file: string): string {
  return path.join(ws.root, CHANGE_DIR, file);
}

export const spoil = {
  addSecondTask(ws: GitWorkspace): void {
    appendFileSync(changeFile(ws, "tasks/section-1.md"), SECOND_TASK);
  },
  addDeltaForNewCapability(ws: GitWorkspace): void {
    const spec = readFileSync(changeFile(ws, "specs/notes/spec.md"), "utf8");
    writeAt(ws.root, `${CHANGE_DIR}/specs/billing/spec.md`, spec);
  },
  addDataLine(ws: GitWorkspace): void {
    const file = changeFile(ws, "specs/notes/spec.md");
    const spec = readFileSync(file, "utf8");
    writeFileSync(file, spec.replace("The system SHALL return the notes whose text holds the query.\n", "The system SHALL return the notes whose text holds the query.\n\nData: main\n"));
  },
  addDataDir(ws: GitWorkspace): void {
    writeAt(ws.root, `${CHANGE_DIR}/data/main/schema.sql`, "CREATE TABLE notes (id integer);\n");
  },
  addMigrationsControl(ws: GitWorkspace): void {
    const file = changeFile(ws, "tasks/section-1.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("      Command:", "      Controls: migrations\n      Command:"));
  },
  breakDeltaScenario(ws: GitWorkspace): void {
    writeFileSync(changeFile(ws, "specs/notes/spec.md"), SPEC_WITHOUT_SCENARIO);
  },
  setSkipSpecs(ws: GitWorkspace): void {
    appendFileSync(changeFile(ws, ".lexforge.yaml"), "skip_specs: true\n");
  },
  removeDeltas(ws: GitWorkspace): void {
    rmSync(changeFile(ws, "specs"), { recursive: true, force: true });
    mkdirSync(changeFile(ws, "specs"), { recursive: true });
  },
};
