import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { recordEvidence } from "../../../src/core/gates/evidence-record.js";
import { putRedRun } from "../../../src/core/gates/red-run-store.js";
import { verifyChange } from "../../../src/core/gates/verify-change.js";
import { writeAt } from "../../helpers/git-workspace.js";
import { CHANGE, created, RED_RECORD, SILENT, workspace } from "./verify-change-fixtures.js";

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** The work of the change: a line the base commit does not carry. */
function editApp(root: string): void {
  writeAt(root, "src/app.ts", "export function app(): string {\n  return \"hashed\";\n}\n");
}

/** Every task closed, the requirement named, the file it names edited. */
const COVERED_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

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
    putRedRun(root, CHANGE, "1.1", RED_RECORD);
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
    putRedRun(root, CHANGE, "1.1", RED_RECORD);
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
    putRedRun(root, CHANGE, "1.1", RED_RECORD);

    const result = verifyChange({ cwd: root, change: CHANGE });

    expect(result.data.summary).toEqual({
      openTasks: 2,
      requirementsWithoutTrace: 0,
      staleLabels: 1,
      openDefects: 0,
      unrecordedTasks: 0,
    });
    expect(result.data.findings).toHaveLength(3);
  });
});
