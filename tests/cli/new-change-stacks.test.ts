import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { createGitWorkspace, git, type GitWorkspace } from "../helpers/git-workspace.js";

const EXPECTED = "\nThe stacks gate is not implemented\n";

const CONFIG = "schema: spec-driven\nverification:\n  tests: npm test\n";

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(): GitWorkspace {
  const made = createGitWorkspace({ "lexforge/config.yaml": CONFIG });
  created.push(made);
  return made;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge new change without named stacks", () => {
  it("refuses with engineering-stacks-missing and creates nothing", async () => {
    const made = workspace();

    const { exitCode, capture } = await call(["new", "change", "add-auth", "--json"], made.root);
    const out = capture.out + capture.err;
    const parsed = out.trim().startsWith("{") ? (JSON.parse(capture.out || capture.err) as { error?: { code: string }; nextStep?: string }) : {};

    expect(exitCode, EXPECTED).toBe(2);
    expect(parsed.error?.code, EXPECTED).toBe("engineering-stacks-missing");
    expect(existsSync(path.join(made.root, "lexforge/changes/add-auth")), EXPECTED).toBe(false);
    expect(git(made.root, "branch", "--list", "feature/add-auth"), EXPECTED).toBe("");
    expect(parsed.nextStep ?? "", EXPECTED).toContain("lexforge stacks set <stack>...");
    expect(parsed.nextStep ?? "", EXPECTED).toContain("lexforge stacks set --none");
  });

  it("lets the change start after stacks set --none", async () => {
    const made = workspace();

    const refused = await call(["new", "change", "add-auth"], made.root);
    const none = await call(["stacks", "set", "--none"], made.root);
    git(made.root, "add", "--all");
    git(made.root, "-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "--message", "stacks");
    const { exitCode } = await call(["new", "change", "add-auth"], made.root);

    expect(refused.exitCode, EXPECTED).toBe(2);
    expect(none.exitCode, EXPECTED).toBe(0);
    expect(exitCode, EXPECTED).toBe(0);
    expect(existsSync(path.join(made.root, "lexforge/changes/add-auth")), EXPECTED).toBe(true);
  });
});
