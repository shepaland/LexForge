import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { recordEvidence } from "../../../src/core/gates/evidence-record.js";
import { verifyChange } from "../../../src/core/gates/verify-change.js";
import {
  createGitWorkspace,
  writeAt,
  type GitWorkspace,
} from "../../helpers/git-workspace.js";

const CHANGE = "add-auth";
const PLAN_FILE = `lexforge/changes/${CHANGE}/tasks.md`;

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
`;

const AUTH_SPEC = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

/** A plan whose tasks cover the only requirement of the change. */
const TWO_OPEN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 4.2 Написать проверку пароля при входе в `src/app.ts`",
  "- [ ] 7.1 Написать журнал неудачных входов в `src/app.ts`",
  "",
].join("\n");

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(tasks: string, files: Record<string, string> = {}): GitWorkspace {
  const made = createGitWorkspace({
    "lexforge/config.yaml": CONFIG,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: tasks,
    ...files,
  });
  created.push(made);
  return made;
}

describe("verifyChange: незакрытые задачи", () => {
  it("две задачи - [ ] дают две находки с номерами задач и номерами строк", () => {
    const root = workspace(TWO_OPEN).root;

    const open = verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
      (finding) => finding.rule === "task-not-done",
    );

    expect(open).toHaveLength(2);
    expect(open.map((finding) => finding.line)).toEqual([5, 6]);
    expect(open.map((finding) => finding.file)).toEqual([PLAN_FILE, PLAN_FILE]);
    expect(open[0]!.message).toContain("4.2");
    expect(open[0]!.message).toContain("Написать проверку пароля при входе");
    expect(open[1]!.message).toContain("7.1");
  });

  it("отметка в верхнем регистре считается закрытой задачей", () => {
    const root = workspace(TWO_OPEN.replace("- [x] 1.1", "- [X] 1.1")).root;

    const open = verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
      (finding) => finding.rule === "task-not-done",
    );

    expect(open.map((finding) => finding.line)).toEqual([5, 6]);
  });
});

describe("verifyChange: плана нет", () => {
  it("change без tasks.md даёт UsageError с кодом artifact-missing", () => {
    const made = createGitWorkspace({
      "lexforge/config.yaml": CONFIG,
      [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
      [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
      [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: AUTH_SPEC,
      [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    });
    created.push(made);

    let thrown: unknown;
    try {
      verifyChange({ cwd: made.root, change: CHANGE });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as UsageError).code).toBe("artifact-missing");
    expect((thrown as UsageError).nextStep).toBe(`lexforge instructions tasks --change ${CHANGE}`);
  });
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

/** Every task closed, the requirement named, the file it names edited. */
const COVERED_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

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

/** A check whose command leaves a file behind, so a run that happened is visible. */
const CONFIG_WITH_MARKER = `schema: spec-driven
verification:
  tests: node -e "require('fs').writeFileSync('ran.txt', 'x')"
`;

describe("verifyChange: штампы", () => {
  it("метка без штампа даёт находку, а команда метки не выполняется", () => {
    const root = workspace(COVERED_PLAN, {
      "lexforge/config.yaml": CONFIG_WITH_MARKER,
    }).root;
    editApp(root);

    const stale = verifyChange({ cwd: root, change: CHANGE }).data.findings.filter(
      (finding) => finding.rule === "evidence-not-fresh",
    );

    expect(stale).toHaveLength(1);
    expect(stale[0]!.message).toContain("tests");
    expect(existsSync(path.join(root, "ran.txt"))).toBe(false);
  });
});

/** One open task that also leaves its requirement without a trace. */
const ALL_THREE = [
  "## 1. Вход",
  "",
  "- [ ] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/** Swallows the output of the check the ledger stamp is taken from. */
const SILENT = { write: () => true };

describe("verifyChange: три измерения разом", () => {
  it("незакрытая задача, требование без следа и метка без штампа дают три находки", () => {
    const result = verifyChange({ cwd: workspace(ALL_THREE).root, change: CHANGE });

    expect(result.exitCode).toBe(1);
    expect(result.data.findings.map((finding) => finding.rule).sort()).toEqual([
      "evidence-not-fresh",
      "requirement-without-trace",
      "task-not-done",
    ]);
  });

  it("чистый change даёт код 0", async () => {
    const root = workspace(COVERED_PLAN).root;
    editApp(root);
    await recordEvidence({
      cwd: root,
      change: CHANGE,
      label: "tests",
      stdout: SILENT,
      stderr: SILENT,
    });

    const result = verifyChange({ cwd: root, change: CHANGE });

    expect(result.data.findings).toEqual([]);
    expect(result.exitCode).toBe(0);
  });
});

describe("verifyChange: проект без описанных проверок", () => {
  it("пустой раздел verification останавливает проверку и печатает пример", () => {
    const root = workspace(COVERED_PLAN, {
      "lexforge/config.yaml": "schema: spec-driven\n",
    }).root;

    let thrown: unknown;
    try {
      verifyChange({ cwd: root, change: CHANGE });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as UsageError).message).toContain("verification:");
    expect((thrown as UsageError).message).toContain("tests: npm test");
    expect((thrown as UsageError).message).toContain("lint: npm run lint");
  });
});

describe("verifyChange: граница машинной проверки", () => {
  it("ответ несёт три непроверенных пункта, среди них design.md", async () => {
    const root = workspace(COVERED_PLAN).root;
    editApp(root);
    await recordEvidence({
      cwd: root,
      change: CHANGE,
      label: "tests",
      stdout: SILENT,
      stderr: SILENT,
    });

    const result = verifyChange({ cwd: root, change: CHANGE });

    expect(result.exitCode).toBe(0);
    expect(result.data.notChecked).toHaveLength(3);
    expect(result.data.notChecked.join(" ")).toContain("design.md");
    expect(result.lines.join("\n")).toContain("design.md");
  });
});

/** One requirement traced, two tasks left open, no stamp taken. */
const TWO_OPEN_ONE_TRACED = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 2.1 Написать проверку пароля при входе в `src/app.ts`",
  "- [ ] 2.2 Написать журнал неудачных входов в `src/app.ts`",
  "",
].join("\n");

describe("verifyChange: счётчики", () => {
  it("summary считает находки каждого вида", () => {
    const root = workspace(TWO_OPEN_ONE_TRACED).root;
    editApp(root);

    const result = verifyChange({ cwd: root, change: CHANGE });

    expect(result.data.summary).toEqual({
      openTasks: 2,
      requirementsWithoutTrace: 0,
      staleLabels: 1,
    });
    expect(result.data.findings).toHaveLength(3);
  });
});
