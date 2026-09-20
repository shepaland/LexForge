import { afterEach, describe, expect, it } from "vitest";

import { startLineCount } from "../../../src/core/git/change-base.js";
import { createGitWorkspace, writeAt, type GitWorkspace } from "../../helpers/git-workspace.js";

const created: GitWorkspace[] = [];

function keep(workspace: GitWorkspace): GitWorkspace {
  created.push(workspace);
  return workspace;
}

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** `count` numbered lines, each ending in `\n`, so `wc -l` reads exactly `count`. */
function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
}

describe("startLineCount", () => {
  it("для файла из базового коммита отдаёт его длину там, не в рабочем дереве", () => {
    const workspace = keep(createGitWorkspace({ "src/billing.ts": lines(612) }));
    const base = workspace.head;

    writeAt(workspace.root, "src/billing.ts", lines(640));

    expect(startLineCount(workspace.root, base, "src/billing.ts")).toBe(612);
  });

  it("для файла, которого не было в базовом коммите, отдаёт null", () => {
    const workspace = keep(createGitWorkspace());
    const base = workspace.head;

    writeAt(workspace.root, "src/billing/refunds.ts", lines(20));

    expect(startLineCount(workspace.root, base, "src/billing/refunds.ts")).toBeNull();
  });
});
