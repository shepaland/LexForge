import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../../src/cli/run.js";
import { initWorkspace } from "../../../src/core/init/init-workspace.js";
import { createCapture } from "../../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

/** The skills the published package carries, not a fixture copy of them. */
const SKILLS_DIR = fileURLToPath(new URL("../../../skills", import.meta.url));

/** Five planning skills and four implementation skills, in directory order. */
const SKILL_NAMES = [
  "lexforge",
  "lexforge-apply",
  "lexforge-archive",
  "lexforge-debug",
  "lexforge-design",
  "lexforge-plan",
  "lexforge-propose",
  "lexforge-spec",
  "lexforge-verify",
];

const created: string[] = [];

function project(): string {
  const root = makeWorkspace();
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("установка встроенных скиллов", () => {
  it("кладёт девять каталогов в .claude/skills/ и не трогает текст скиллов", () => {
    const root = project();

    const result = initWorkspace({ cwd: root, tools: ["claude"] });
    const installed = path.join(root, ".claude/skills");

    expect(result.exitCode).toBe(0);
    expect(readdirSync(installed).sort()).toEqual(SKILL_NAMES);

    for (const name of SKILL_NAMES) {
      const target = path.join(installed, name, "SKILL.md");
      expect(readFileSync(target, "utf8"), name).toBe(
        readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8"),
      );
      expect(result.data.created, name).toEqual(expect.arrayContaining([target]));
    }
  });
});

describe("неполная установка", () => {
  it("на неизвестное имя инструмента даёт код 2 и не заводит .claude/", async () => {
    const root = project();
    const capture = createCapture();

    const exitCode = await run(["init", "--tools", "claude,nosuch"], {
      cwd: root,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("nosuch");
    expect(existsSync(path.join(root, ".claude"))).toBe(false);
  });
});
