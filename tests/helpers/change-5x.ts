import { createGitWorkspace, type GitWorkspace } from "./git-workspace.js";

export const CHANGE_5X = "demo";
export const DIR_5X = `lexforge/changes/${CHANGE_5X}`;

export interface Change5xOptions {
  /** An open task with no cycle, added in a section of its own at the end of the plan. */
  taskOutsideCycles?: string;
  /** Workflow 1 has no workflow.json, no execution-plan.json and no execution/ directory. */
  workflow?: 1 | 2;
  /** Every task ticked and every cycle closed. */
  allClosed?: boolean;
}

const SPEC = `## Purpose

How notes are searched.

## ADDED Requirements

### Requirement: Search over note text

The system SHALL return the notes whose text holds the query.

#### Scenario: A word in one note

- **WHEN** the query is a word of one note
- **THEN** that note is returned
`;

const LINK = "      -> notes#Search over note text";

/** The plan as an index of section files: section number to its title and task lines. */
function sections(options: Change5xOptions): Array<{ number: number; title: string; lines: string[] }> {
  const box = (id: string, ticked: boolean) => `- [${ticked || options.allClosed ? "x" : " "}] ${id}`;
  const list = [
    {
      number: 1,
      title: "Search",
      lines: [
        `${box("1.1", true)} [A] Search over note text in \`src/search.js\``,
        LINK,
        `${box("1.2", true)} [A] Rank the found notes in \`src/rank.js\``,
        LINK,
      ],
    },
    { number: 2, title: "Notes", lines: [`${box("2.1", false)} [B] Keep the notes of a user in \`src/notes.js\``, LINK] },
    {
      number: 3,
      title: "Layout",
      lines: [`${box("3.1", false)} [C] (move) Move the search helpers out of \`src/helpers.js\``, LINK],
    },
  ];
  if (options.taskOutsideCycles !== undefined) {
    list.push({
      number: 4,
      title: "Export",
      lines: [`- [ ] ${options.taskOutsideCycles} [D] Export the notes of a user to a file`, LINK],
    });
  }
  return list;
}

function planFiles(options: Change5xOptions): Record<string, string> {
  const list = sections(options);
  const files: Record<string, string> = {
    [`${DIR_5X}/tasks.md`]: list.map((s) => `## ${s.number}. ${s.title}\n\n\`tasks/section-${s.number}.md\`\n`).join("\n"),
  };
  for (const s of list) {
    files[`${DIR_5X}/tasks/section-${s.number}.md`] = ["Depends on: none", "", ...s.lines, ""].join("\n");
  }
  return files;
}

function cycle(
  id: string,
  taskIds: string[],
  files: string[],
  test: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    tasks: taskIds,
    files: files.map((path) => ({ path })),
    testFiles: [test],
    command: `node --test ${test}`,
    expectedFailure: "not ok 1",
    acceptance: taskIds.map((task) => ({ id: `${id}-${task}`, task, description: "works" })),
    ...extra,
  };
}

const PLAN = {
  version: 1,
  cycles: [
    cycle("search", ["1.1"], ["src/search.js", "test/search.test.mjs"], "test/search.test.mjs"),
    cycle("rank", ["1.2"], ["src/rank.js", "test/rank.test.mjs"], "test/rank.test.mjs"),
    cycle("notes", ["2.1"], ["src/notes.js", "test/notes.test.mjs", "src/store.js"], "test/notes.test.mjs", {
      dependsOn: ["search"],
    }),
    cycle("layout", ["3.1"], ["src/helpers.js", "src/search-helpers.js"], "test/helpers.test.mjs", { mode: "move" }),
  ],
};

function closedState(id: string): string {
  return JSON.stringify({ version: 1, cycle: id, closedAt: "2026-10-01T10:00:00.000Z" });
}

/**
 * A change as LexForge 5.x left it, committed in a fresh repository: workflow 2,
 * `execution-plan.json` at the change root mapping each task to a cycle, the cycle of task 1.1
 * closed, tasks 1.1 and 1.2 ticked, group labels on every task line.
 */
export function makeChange5x(options: Change5xOptions = {}): GitWorkspace {
  const files: Record<string, string> = {
    "lexforge/config.yaml": "schema: spec-driven\nengineering:\n  stacks: []\n",
    [`${DIR_5X}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${DIR_5X}/proposal.md`]: "## Why\n\nNotes cannot be searched.\n",
    [`${DIR_5X}/design.md`]: "## Context\n\nNotes are strings.\n\n## Decisions\n\nSubstring match.\n",
    [`${DIR_5X}/specs/notes/spec.md`]: SPEC,
    ...planFiles(options),
  };
  if ((options.workflow ?? 2) === 2) {
    files[`${DIR_5X}/workflow.json`] = JSON.stringify({ version: 2, schema: "spec-driven", schemaVersion: 1 });
    files[`${DIR_5X}/execution-plan.json`] = JSON.stringify(PLAN, null, 2);
    files[`${DIR_5X}/execution/search/state.json`] = closedState("search");
    files[`${DIR_5X}/execution/rank/state.json`] = JSON.stringify({ version: 1, cycle: "rank" });
    if (options.allClosed) {
      for (const id of ["rank", "notes", "layout"]) files[`${DIR_5X}/execution/${id}/state.json`] = closedState(id);
    }
  } else if (options.allClosed) {
    files[`${DIR_5X}/red-runs.json`] = JSON.stringify({
      outputVersion: 1,
      records: Object.fromEntries(["1.1", "1.2", "2.1", "3.1"].map((id) => [id, { command: "x" }])),
    });
  }
  return createGitWorkspace(files);
}
