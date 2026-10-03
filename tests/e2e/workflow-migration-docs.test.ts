import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  migrationFixture,
  callMigration,
  migrationTree,
} from "../helpers/migration-workspace.js";
it.each(["README.md", "README.ru.md", "docs/execution-context.md"])(
  "executes the preview command documented in %s without writes",
  async (file) => {
    const prose = readFileSync(file, "utf8");
    const command = prose.match(
      /^lexforge (workflow migrate .*--dry-run.*)$/m,
    )?.[1];
    expect(
      command,
      "Safe workflow migration guidance is missing",
    ).toBeDefined();
    const w = migrationFixture([{ id: "1.1", checked: false }]);
    try {
      const before = migrationTree(w.root);
      const result = await callMigration(
        w.root,
        command!
          .replace(" --change <name>", "")
          .replace(" --json", "")
          .split(" "),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data.summary.incomplete).toBe(1);
      expect(migrationTree(w.root)).toEqual(before);
    } finally {
      w.remove();
    }
  },
);
