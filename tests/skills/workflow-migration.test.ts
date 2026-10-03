import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  migrationFixture,
  callMigration,
  migrationTree,
} from "../helpers/migration-workspace.js";
it("the installed migration recipe previews without writes and preserves uncertain work for continuation", async () => {
  const guide = readFileSync("skills/lexforge-apply/execution-v2.md", "utf8");
  const commands = [
    ...guide.matchAll(/^lexforge (workflow migrate .*--dry-run.*)$/gm),
  ].map((m) => m[1]);
  expect(
    commands.length,
    "Safe workflow migration guidance is missing",
  ).toBeGreaterThan(0);
  const w = migrationFixture([
    { id: "1.1", checked: true },
    { id: "1.2", checked: false },
  ]);
  try {
    const before = migrationTree(w.root);
    const args = commands[0]
      .replace(" --change <name>", "")
      .replace(" --json", "")
      .split(" ");
    const preview = await callMigration(w.root, args);
    expect(preview.data.summary).toMatchObject({
      needsVerification: 1,
      incomplete: 1,
    });
    expect(migrationTree(w.root)).toEqual(before);
  } finally {
    w.remove();
  }
});
