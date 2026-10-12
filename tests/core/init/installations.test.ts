import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeInstallation } from "../../helpers/install-skills.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const EXPECTED = "\nthe module `src/core/init/installations.ts` does not exist\n";

interface Installation {
  tool: string;
  scope: "project" | "user";
  skillsDir: string;
  manifest: { version: string } | undefined;
}
type Find = (options: { root: string; home: string }) => Installation[];

async function load(): Promise<Find | undefined> {
  try {
    const mod = await import("../../../src/core/init/installations.js");
    return mod.findInstallations as Find;
  } catch {
    return undefined;
  }
}

const made: string[] = [];

function workspace(): string {
  const root = makeWorkspace();
  made.push(root);
  return root;
}

afterEach(() => {
  for (const root of made.splice(0)) {
    removeWorkspace(root);
  }
});

describe("findInstallations", () => {
  it("находит проектную установку claude с версией из манифеста", async () => {
    const find = await load();
    expect(find, EXPECTED).toBeTypeOf("function");
    const root = workspace();
    const home = workspace();
    const skillsDir = writeInstallation(root, "claude", {
      scope: "project",
      version: "3.0.0",
      skills: ["lexforge"],
    });

    const found = find!({ root, home });

    expect(found).toHaveLength(1);
    expect(found[0]!.tool).toBe("claude");
    expect(found[0]!.scope).toBe("project");
    expect(found[0]!.skillsDir).toBe(path.resolve(skillsDir));
    expect(found[0]!.manifest?.version).toBe("3.0.0");
  });

  it("находит пользовательскую установку под home", async () => {
    const find = await load();
    expect(find, EXPECTED).toBeTypeOf("function");
    const root = workspace();
    const home = workspace();
    writeInstallation(home, "claude", { scope: "user", version: "3.0.0", skills: ["lexforge"] });

    const found = find!({ root, home });

    expect(found.map((entry) => [entry.tool, entry.scope])).toEqual([["claude", "user"]]);
  });

  it("отдаёт запись без манифеста, если в каталоге лежит скилл семейства lexforge", async () => {
    const find = await load();
    expect(find, EXPECTED).toBeTypeOf("function");
    const root = workspace();
    const home = workspace();
    writeInstallation(root, "claude", { scope: "project", version: null, skills: ["lexforge-plan"] });

    const found = find!({ root, home });

    expect(found).toHaveLength(1);
    expect(found[0]!.manifest).toBeUndefined();
  });

  it("пропускает каталог, где лежит только чужой скилл и нет манифеста", async () => {
    const find = await load();
    expect(find, EXPECTED).toBeTypeOf("function");
    const root = workspace();
    const home = workspace();
    writeInstallation(root, "claude", { scope: "project", version: null, skills: ["ux-audit"] });

    expect(find!({ root, home })).toEqual([]);
  });

  it("пропускает инструмент, чьего каталога нет", async () => {
    const find = await load();
    expect(find, EXPECTED).toBeTypeOf("function");

    expect(find!({ root: workspace(), home: workspace() })).toEqual([]);
  });

  it("отдаёт записи в порядке knownTools, проектную раньше пользовательской", async () => {
    const find = await load();
    expect(find, EXPECTED).toBeTypeOf("function");
    const root = workspace();
    const home = workspace();
    const options = { version: "3.0.0", skills: ["lexforge"] };
    writeInstallation(home, "claude", { ...options, scope: "user" });
    writeInstallation(root, "codex", { ...options, scope: "project" });
    writeInstallation(root, "claude", { ...options, scope: "project" });
    writeInstallation(home, "agents", { ...options, scope: "user" });

    const found = find!({ root, home });

    expect(found.map((entry) => [entry.tool, entry.scope])).toEqual([
      ["agents", "user"],
      ["claude", "project"],
      ["claude", "user"],
      ["codex", "project"],
    ]);
  });
});
