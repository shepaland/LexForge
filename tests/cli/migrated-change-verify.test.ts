import { afterEach, describe, expect, it } from "vitest";
import { openFeatureBranch } from "../../src/core/git/feature-branch.js";
import { makeChange5x } from "../helpers/change-5x.js";
import { writeAt, type GitWorkspace } from "../helpers/git-workspace.js";
import { CHANGE, cli, commitIn, report } from "../helpers/task-workspace.js";

let ws: GitWorkspace | undefined;
afterEach(() => ws?.remove());

/**
 * A change 5.x closed in full, carried over by lexforge migrate and taken to
 * the end with the 6.0.0 commands. Its tasks keep no Files line: the trace
 * reads the paths their text names in backticks, as 5.x did.
 */
describe("a change migrated from 5.x with every task closed", { timeout: 60_000 }, () => {
  it("goes through migrate, review final and verify to a clean result", async () => {
    ws = makeChange5x({ allClosed: true });
    const root = ws.root;
    writeAt(root, "lexforge/config.yaml", 'schema: spec-driven\nverification:\n  tests: node -e ""\nengineering:\n  stacks: []\n');
    commitIn(root, {}, "checks described");
    openFeatureBranch(root, CHANGE);

    const migrated = await cli(root, ["migrate", "--change", CHANGE]);
    expect(migrated.json.data.nextStep).toBe("lexforge review final --change demo");
    commitIn(root, { "src/search.js": "export const search = 1;\n" }, "work of 5.x");

    expect((await cli(root, ["review", "final", "--change", CHANGE])).exitCode).toBe(0);
    const final = await cli(root, ["review", "final", "--change", CHANGE, "--file", report({ reviewer: "final-1" })]);
    expect(final.json.data.nextStep).toBe("lexforge verify --change demo");
    expect((await cli(root, ["evidence", "record", "--change", CHANGE, "--label", "tests"])).exitCode).toBe(0);

    const verified = await cli(root, ["verify", "--change", CHANGE]);
    expect(verified.json.data.findings).toEqual([]);
    expect(verified.exitCode).toBe(0);
  });
});
