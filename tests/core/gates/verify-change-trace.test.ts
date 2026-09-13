import { afterEach, describe, expect, it } from "vitest";

import { verifyChange } from "../../../src/core/gates/verify-change.js";
import { writeAt } from "../../helpers/git-workspace.js";
import { AUTH_SPEC, CHANGE, created, workspace } from "./verify-change-fixtures.js";

const PLAN_FILE = `lexforge/changes/${CHANGE}/tasks.md`;

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** Two requirements, so a check that reports nothing at all is visible as such. */
const TWO_REQUIREMENTS = `${AUTH_SPEC}
### Requirement: Failed sign-in is logged

The system SHALL write a line for every refused sign-in.

#### Scenario: A sign-in is refused

- **WHEN** a password does not match
- **THEN** the log holds a line about it
`;

/** A plan that closes the first requirement and says nothing of the second. */
const ONE_COVERED = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/** The work of the change: a line the base commit does not carry. */
function editApp(root: string): void {
  writeAt(root, "src/app.ts", "export function app(): string {\n  return \"hashed\";\n}\n");
}

function traceFindings(root: string) {
  return verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
    (finding) => finding.rule === "requirement-without-trace",
  );
}

describe("verifyChange: след требования", () => {
  it("закрытая задача и правка названного файла следом считаются", () => {
    const root = workspace(ONE_COVERED, {
      [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: TWO_REQUIREMENTS,
    }).root;
    editApp(root);

    const found = traceFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("Failed sign-in is logged");
    expect(found.map((finding) => finding.message).join(" ")).not.toContain(
      "Password is stored hashed",
    );
  });
});

/** The one requirement is named by a closed task, and the file is left alone. */
const UNTOUCHED_FILE = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/** The one requirement is named by a task nobody has closed. */
const OPEN_TASK = [
  "## 1. Вход",
  "",
  "- [ ] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/** No task of the plan names the requirement at all. */
const NO_LINK = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "",
].join("\n");

describe("verifyChange: три случая без следа", () => {
  it("задача закрыта, но файл не тронут", () => {
    const found = traceFindings(workspace(UNTOUCHED_FILE).root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("Password is stored hashed");
    expect(found[0]!.message).toContain("auth");
    expect(found[0]!.message).toContain("src/app.ts");
  });

  it("задача не закрыта", () => {
    const root = workspace(OPEN_TASK).root;
    editApp(root);

    const found = traceFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("Password is stored hashed");
    expect(found[0]!.message).toContain("auth");
    expect(found[0]!.file).toBe(PLAN_FILE);
  });

  it("ссылок на требование нет вовсе", () => {
    const root = workspace(NO_LINK).root;
    editApp(root);

    const found = traceFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("Password is stored hashed");
    expect(found[0]!.message).toContain("auth");
  });
});

describe("verifyChange: границы измерения следа", () => {
  it("имя требования в комментарии исходного файла следом не считается", () => {
    const root = workspace(NO_LINK).root;
    writeAt(
      root,
      "src/app.ts",
      "// Password is stored hashed\nexport function app(): string {\n  return \"app\";\n}\n",
    );

    const found = traceFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("Password is stored hashed");
  });

  it("пропущенная дельта находок второго измерения не даёт", () => {
    const root = workspace(NO_LINK, {
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\nskip_specs: true\n",
    }).root;
    editApp(root);

    expect(traceFindings(root)).toEqual([]);
  });
});

/** The index: two sections, each linked out to its own file. */
const TWO_TASK_INDEX = [
  "## 1. Вход",
  "`tasks/01-first.md`",
  "",
  "## 2. Проверка",
  "`tasks/02-second.md`",
  "",
].join("\n");

/** Section 1's own file: the requirement's task is already closed here. */
const TWO_TASK_FIRST_SECTION = [
  "Depends on: none",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/** Section 2's own file: the same requirement's second task is still open. */
const TWO_TASK_SECOND_SECTION = [
  "Depends on: section 1",
  "",
  "- [ ] 2.1 Написать повторную проверку пароля в `src/other.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

describe("verifyChange: две задачи на одно требование, разделы в разных файлах", () => {
  it("первая задача закрыта в чужом файле - находка называет файл и строку открытой задачи", () => {
    const root = workspace(TWO_TASK_INDEX, {
      [`lexforge/changes/${CHANGE}/tasks/01-first.md`]: TWO_TASK_FIRST_SECTION,
      [`lexforge/changes/${CHANGE}/tasks/02-second.md`]: TWO_TASK_SECOND_SECTION,
    }).root;

    const found = traceFindings(root);

    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("task 2.1");
    expect(found[0]!.file).toBe(`lexforge/changes/${CHANGE}/tasks/02-second.md`);
    expect(found[0]!.line).toBe(3);
  });
});
