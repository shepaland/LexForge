import { describe, expect, it } from "vitest";

import { parseTaskList } from "../../../src/core/gates/task-list.js";
import { checkTaskFileDeclarations } from "../../../src/core/gates/plan-check-task-files.js";

describe("parseTaskList: Files declaration problems", () => {
  it("turns an unsafe explicit declaration into a plan finding", () => {
    const tasks = parseTaskList(
      "- [ ] 1.1 [api] Изменить маршрут\n      Files: `/etc/nginx/conf.d`\n",
      "tasks/01-api.md",
    );
    const findings = checkTaskFileDeclarations({ file: "tasks.md", tasks });
    if (findings.length !== 1) console.error("TASK_FILE_SCOPE_NOT_DISTINGUISHED");

    expect(findings).toMatchObject([
      { file: "tasks/01-api.md", line: 1, rule: "task-file-declaration" },
    ]);
  });

  it.each([
    ["empty", ["      Files:"]],
    ["malformed", ["      Files: `src/a.ts` and `src/b.ts`"]],
    ["repeated", ["      Files: `src/a.ts`", "      Files: `src/b.ts`"]],
    ["absolute", ["      Files: `/etc/nginx/conf.d`"]],
    ["traversal", ["      Files: `../outside.ts`"]],
    ["windows absolute", ["      Files: `C:/temp/routes.ts`"]],
    ["backslash", ["      Files: `src\\routes.ts`"]],
    ["empty segment", ["      Files: `src//routes.ts`"]],
  ])("records %s instead of falling back to prose inference", (_name, declaration) => {
    const task = parseTaskList(
      [
        "- [ ] 1.1 [api] Изменить `src/fallback.ts`",
        ...declaration,
        "      Check: `npx vitest run tests/http/routes.test.ts`",
      ].join("\n"),
    )[0]!;

    expect(task.files, "TASK_FILE_SCOPE_NOT_DISTINGUISHED").toEqual([]);
    expect(task.namedFiles, "TASK_FILE_SCOPE_NOT_DISTINGUISHED").toEqual([
      "tests/http/routes.test.ts",
    ]);
    expect(task.fileDeclarationProblems, "TASK_FILE_SCOPE_NOT_DISTINGUISHED").toHaveLength(1);
  });

  it("keeps legacy interpreter and command operand handling with canonical filtering", () => {
    const task = parseTaskList(
      '- [ ] 1.1 [test] Check: `node bin/lexforge.js evidence red --command "npx vitest run tests/a.test.ts /api/auth ../outside.ts"`\n',
    )[0]!;

    expect(task.files, "TASK_FILE_SCOPE_NOT_DISTINGUISHED").toEqual([]);
    expect(task.namedFiles, "TASK_FILE_SCOPE_NOT_DISTINGUISHED").toEqual(["tests/a.test.ts"]);
  });
});
