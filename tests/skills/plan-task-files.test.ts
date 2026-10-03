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
    /may omit `Files:` when safe legacy inference is unambiguous/,
    /Never abbreviate a repository path or resolve a basename by searching the workspace/,
  ];

  const missing = required.filter((pattern) => !pattern.test(`${skill} ${sectionReference}`));
  if (missing.length > 0) console.error("PLAN_FILES_CONTRACT_MISSING");
  expect(missing, "PLAN_FILES_CONTRACT_MISSING").toEqual([]);
  expect(skill).toContain("Files: `src/http/routes.ts`");
  expect(sectionReference).toContain("Files: `src/http/routes.ts`, `tests/http/routes.test.ts`");
});
