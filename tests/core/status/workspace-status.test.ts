import { afterEach, describe, expect, it } from "vitest";

import { workspaceStatus } from "../../../src/core/status/workspace-status.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const created: string[] = [];

function workspace(files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/archive/": "",
    ...files,
  });
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("workspaceStatus", () => {
  it("перечисляет активные changes и не берёт архив", () => {
    const root = workspace({
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
      "lexforge/changes/add-auth/proposal.md": "why\n",
      "lexforge/changes/rename-menu/.lexforge.yaml": "schema: bounded\n",
      "lexforge/changes/archive/2026-01-01-old/.lexforge.yaml": "schema: spec-driven\n",
    });

    const result = workspaceStatus({ cwd: root });

    expect(result.exitCode).toBe(0);
    expect(Object.keys(result.data)).toEqual([
      "outputVersion",
      "workspaceRoot",
      "changes",
      "nextStep",
    ]);
    expect(result.data).not.toHaveProperty("artifacts");
    expect(result.data.changes).toEqual([
      {
        name: "add-auth",
        schema: "spec-driven",
        artifactsDone: 1,
        artifactsTotal: 4,
        isPlanningComplete: false,
      },
      {
        name: "rename-menu",
        schema: "bounded",
        artifactsDone: 0,
        artifactsTotal: 3,
        isPlanningComplete: false,
      },
    ]);
    expect(result.data.changes.map((change) => change.name)).not.toContain("archive");
  });

  it("без активных changes сообщает об этом и зовёт завести первый", () => {
    const root = workspace();

    const result = workspaceStatus({ cwd: root });

    expect(result.exitCode).toBe(0);
    expect(result.data.changes).toEqual([]);
    expect(result.lines.join("\n")).toContain("no active changes");
    expect(result.data.nextStep).toBe("lexforge new change <name>");
  });
});
