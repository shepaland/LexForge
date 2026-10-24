import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

function skillText(relative: string): string {
  const file = fileURLToPath(new URL(`../../skills/lexforge-plan/${relative}`, import.meta.url));
  return readFileSync(file, "utf8").replace(/\s+/g, " ");
}

it("documents exact task file scope without filesystem guessing", () => {
  const skill = skillText("SKILL.md");
  const sectionReference = skillText("plan-file-per-section.md");
  const required = [
    /canonical workspace-root-relative paths/,
    /one `Files:` continuation line with comma-separated backtick paths/,
    /other task prose contains a backtick route or external path/,
    /Only a task closed under LexForge 5\.x may lack `Files:`/,
    /Never abbreviate a repository path or resolve a basename by searching the workspace/,
  ];

  const missing = required.filter((pattern) => !pattern.test(`${skill} ${sectionReference}`));
  if (missing.length > 0) console.error("PLAN_FILES_CONTRACT_MISSING");
  expect(missing, "PLAN_FILES_CONTRACT_MISSING").toEqual([]);
  expect(skill).toContain("Files: `src/http/routes.ts`");
  expect(`${skill} ${sectionReference}`).not.toMatch(/safe legacy inference/);
  expect(sectionReference).toContain("Files: `src/http/routes.ts`, `tests/http/routes.test.ts`");
});

it("plan-file-per-section.md names today's task record and journal, not the 5.x sidecar", () => {
  const section = skillText("plan-file-per-section.md");

  expect(section).toMatch(
    /The CLI keeps a task's record in `tasks\/<id>\.json` and reads it by the id alone, never by file or line/,
  );
  expect(section).toMatch(
    /goes into the change journal with `lexforge journal add`, never into the plan/,
  );
  expect(section).toMatch(/decisions, questions, promises, permissions, rulings/);
  expect(section).toMatch(
    /an executor reads only the brief `lexforge task start` writes for it/,
  );

  for (const phrase of [
    "red-runs.json",
    "execution/<cycle>/journal.md",
    "scripts/extract-task.mjs",
    "Workflow 2 context map",
    "execution-plan.json",
    "goes into the change journal with `lexforge journal`,",
    "rulings, refusals, sessions",
  ]) {
    expect(section, `«${phrase}» — текст 5.x ещё в plan-file-per-section.md`).not.toContain(phrase);
  }
});
