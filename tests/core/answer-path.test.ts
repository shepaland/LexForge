import path from "node:path";

import { describe, expect, it } from "vitest";

import { answerPath, workspacePath } from "../../src/core/answer-path.js";

describe("answerPath", () => {
  it("переводит путь Windows на косую черту", () => {
    expect(answerPath("lexforge\\changes\\add-auth\\specs\\auth\\spec.md", "\\")).toBe(
      "lexforge/changes/add-auth/specs/auth/spec.md",
    );
  });

  it("сохраняет букву диска в абсолютном пути Windows", () => {
    expect(answerPath("D:\\a\\LexForge\\skills\\lexforge-plan\\SKILL.md", "\\")).toBe(
      "D:/a/LexForge/skills/lexforge-plan/SKILL.md",
    );
  });

  it("оставляет путь с косой чертой как был", () => {
    expect(answerPath("lexforge/changes/add-auth/tasks.md", "/")).toBe(
      "lexforge/changes/add-auth/tasks.md",
    );
  });

  it("на системе, где обратный слэш разделителем не считается, оставляет его в имени", () => {
    expect(answerPath("notes/a\\b.md", "/")).toBe("notes/a\\b.md");
  });
});

describe("workspacePath", () => {
  it("даёт путь от корня рабочего пространства через косую черту", () => {
    const root = path.resolve("project");
    const file = path.join(root, "lexforge", "changes", "add-auth", "tasks.md");

    expect(workspacePath(root, file)).toBe("lexforge/changes/add-auth/tasks.md");
  });
});
