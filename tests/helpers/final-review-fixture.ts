import { openFeatureBranch } from "../../src/core/git/feature-branch.js";
import { finalReviewPackagePath } from "../../src/core/tasks/paths.js";
import { migrateChange } from "../../src/core/tasks/migrate.js";
import { readTaskRecord } from "../../src/core/tasks/records.js";
import { writeWorkflowFile } from "../../src/core/tasks/workflow-file.js";
import { makeChange5x } from "./change-5x.js";
import { git, writeAt, type GitWorkspace } from "./git-workspace.js";
import {
  approvePlanDirectly,
  CHANGE,
  CHANGE_DIR,
  cli,
  commitIn,
  createTaskWorkspace,
  expectOk,
  FAILING_TEST,
  IMPL,
  report,
  type CliCall,
} from "./task-workspace.js";

/** Two independent tasks: 1.1 searches notes, 1.2 ranks them. */
export const TWO_TASKS = `## 1. Search

Depends on: none

- [ ] 1.1 Search over note text
      -> notes#Search over note text
      Files: \`src/notes.js\`, \`test/notes.test.mjs\`
      Test: \`test/notes.test.mjs\`
      Command: \`node --test test/notes.test.mjs\`
- [ ] 1.2 Rank search results
      -> notes#Search over note text
      Files: \`src/rank.js\`, \`test/rank.test.mjs\`
      Test: \`test/rank.test.mjs\`
      Command: \`node --test test/rank.test.mjs\`
`;

const HEADER = 'import { test } from "node:test";\nimport assert from "node:assert/strict";\n';
const RANK_TEST = `${HEADER}import { rank } from "../src/rank.js";
test("rank", () => assert.deepEqual(rank([2, 1]), [1, 2]));
`;
const RANK_IMPL = "export function rank(list) {\n  return [...list].sort();\n}\n";

const WORK: Record<string, { test: [string, string]; impl: [string, string] }> = {
  "1.1": { test: ["test/notes.test.mjs", FAILING_TEST], impl: ["src/notes.js", IMPL] },
  "1.2": { test: ["test/rank.test.mjs", RANK_TEST], impl: ["src/rank.js", RANK_IMPL] },
};

/** A workflow-3 change of two tasks on `feature/demo`, approved, nothing started. */
export function createTwoTaskChange(): GitWorkspace {
  const ws = createTaskWorkspace(TWO_TASKS, { approved: false });
  writeWorkflowFile(ws.root, CHANGE, { version: 3, schema: "spec-driven", schemaVersion: 1, path: "full" });
  writeAt(ws.root, "src/rank.js", "export function rank() {\n  return [];\n}\n");
  git(ws.root, "add", "--all");
  git(ws.root, "commit", "--message", "workflow 3 and rank stub");
  approvePlanDirectly(ws.root);
  return ws;
}

/** The task commands of the two-task change. */
export function twoTaskSteps(root: string) {
  const call = (verb: string, id: string, extra: string[] = []): Promise<CliCall> =>
    cli(root, ["task", verb, "--change", CHANGE, "--task", id, ...extra]);
  const steps = {
    close: (id: string) => call("close", id),
    /** Started by the executor, red, green and approved by a reviewer; not closed. */
    async approved(id: string, executor = "exec-1"): Promise<void> {
      expectOk(await call("start", id, ["--executor", executor]), `start ${id}`);
      const worktree = readTaskRecord(root, CHANGE, id)!.worktree;
      commitIn(worktree, { [WORK[id].test[0]]: WORK[id].test[1] }, "test");
      expectOk(await call("red", id), `red ${id}`);
      writeAt(root, `${CHANGE_DIR}/tasks/${id}/report.md`, "executor says: done");
      commitIn(worktree, { [WORK[id].impl[0]]: WORK[id].impl[1] }, "impl");
      expectOk(await call("green", id), `green ${id}`);
      expectOk(await call("review", id, ["--file", report({ reviewer: `rev-${id}` })]), `review ${id}`);
    },
    async closed(id: string, executor = "exec-1"): Promise<void> {
      await steps.approved(id, executor);
      expectOk(await steps.close(id), `close ${id}`);
    },
  };
  return steps;
}

/** A 5.x change with every task closed, migrated on `feature/demo`, one commit past its merge-base with dev. */
export function createMigratedChangeAllClosed(): GitWorkspace {
  const ws = makeChange5x({ allClosed: true });
  openFeatureBranch(ws.root, CHANGE);
  migrateChange(ws.root, CHANGE);
  commitIn(ws.root, { "src/search.js": "export const search = 1;\n" }, "work of 5.x");
  return ws;
}

export function finalReviewPackage(root: string): string {
  return finalReviewPackagePath(root, CHANGE);
}
