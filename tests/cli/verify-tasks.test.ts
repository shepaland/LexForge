import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { git } from "../helpers/git-workspace.js";
import { call, CHANGE, changeFiles, CLOSED_PLAN, created, editApp, OPEN_PLAN, workspace } from "./archive-fixtures.js";

afterEach(() => {
  while (created.length > 0) created.pop()!.remove();
});

const CHANGE_DIR = `lexforge/changes/${CHANGE}`;

async function verify(root: string) {
  const { exitCode, capture } = await call(["verify", "--change", CHANGE, "--json"], root);
  return { exitCode, json: JSON.parse(capture.out) };
}

describe("lexforge verify over task records", () => {
  it("folds an open box, a box ticked by hand and a stale stamp into one answer", async () => {
    const root = workspace(changeFiles(OPEN_PLAN)).root;
    editApp(root);
    rmSync(path.join(root, CHANGE_DIR, "tasks", "1.1.json"));

    const { exitCode, json } = await verify(root);

    expect(exitCode).toBe(1);
    expect(json.summary).toMatchObject({ openTasks: 1, tasksWithoutClosedRecord: 1, staleLabels: 1 });
    expect(json.findings).toHaveLength(3);
  });

  it("refuses a change whose workflow.json is version 2 with the migrate command", async () => {
    const root = workspace(changeFiles(CLOSED_PLAN)).root;
    writeFileSync(path.join(root, CHANGE_DIR, "workflow.json"), '{ "version": 2 }\n');

    const { exitCode, json } = await verify(root);

    expect(exitCode).toBe(2);
    expect(json).toMatchObject({
      error: { code: "change-needs-migration" },
      nextStep: `lexforge migrate --change ${CHANGE}`,
    });
  });

  it("reports a commit on the change branch after the final review", async () => {
    const root = workspace(changeFiles(CLOSED_PLAN)).root;
    git(root, "checkout", `feature/${CHANGE}`);
    editApp(root);
    git(root, "add", "src/app.ts");
    git(root, "commit", "--message", "late work");

    const { json } = await verify(root);

    expect(json.findings.map((f: { rule: string }) => f.rule)).toContain("final-review-stale");
    expect(json.summary.finalReview).toBe(1);
  });
});
