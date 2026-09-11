import { afterEach, describe, expect, it } from "vitest";

import { CHECK_PLAN_DESCRIPTION } from "../../src/cli/commands/check.js";
import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const SPEC = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

const CLEAN = [
  "## 1. Вход",
  "",
  "Depends on: none",
  "",
  "- [ ] 1.1 Написать хранение пароля в виде хеша в `src/auth/store.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

/** A delta spec carrying one requirement per name given, for section-dependency fixtures. */
function specWithRequirements(names: string[]): string {
  const requirements = names.map(
    (name) =>
      `### Requirement: ${name}\n\nThe system SHALL do what "${name}" says.\n\n` +
      `#### Scenario: It happens\n\n- **WHEN** it is asked to\n- **THEN** it does\n`,
  );

  return `## Purpose\n\nHolds requirements the section-dependency fixtures point at.\n\n` +
    `## ADDED Requirements\n\n${requirements.join("\n")}`;
}

function sectionsWorkspace(tasks: string, requirementNames: string[]): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": specWithRequirements(requirementNames),
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": tasks,
  });
  created.push(root);
  return root;
}

/**
 * A checkbox line long enough to clear `placeholder-rules.ts`'s 30-character
 * floor on its own, so section-dependency fixtures trip no rule but the one
 * under test.
 */
function taskLine(number: string, file: string, requirement: string): string {
  return (
    `- [ ] ${number} Carry out the work this task exists for, editing \`${file}\`.\n` +
    `      -> auth#${requirement}`
  );
}

interface SectionFinding {
  rule: string;
  line: number;
  message: string;
}

async function jsonFindings(root: string): Promise<SectionFinding[]> {
  const { capture } = await call(["check", "plan", "--change", "add-auth", "--json"], root);
  return (JSON.parse(capture.out) as { findings: SectionFinding[] }).findings;
}

function findingsOf(findings: SectionFinding[], rule: string): SectionFinding[] {
  return findings.filter((finding) => finding.rule === rule);
}

describe("lexforge check plan: раздел без «Depends on:»", () => {
  it("раздел без строки «Depends on:» даёт код 1, называет раздел по номеру, на строке заголовка", async () => {
    // A leading blank line so the heading is not on line 1 — a rule that
    // reported a hardcoded line 1 would otherwise pass this test by
    // accident, since that happens to be where this section's heading sits.
    const tasks = ["", "## 9. Only section", "", taskLine("9.1", "src/a.ts", "Req1"), ""].join(
      "\n",
    );
    const root = sectionsWorkspace(tasks, ["Req1"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const missing = findingsOf(findings, "section-missing-depends-on");

    expect(exitCode).toBe(1);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.line).toBe(2);
    expect(missing[0]!.message).toContain('Section 9 carries no "Depends on:" line');
  });
});

describe("lexforge check plan: summary считает находки раздела наравне с остальными", () => {
  it("находка раздела и находка плейсхолдера вместе — summary.sections и summary.placeholders оба растут", async () => {
    const tasks = [
      "## 9. Mixed",
      "",
      taskLine("9.1", "src/a.ts", "Req1"),
      "- [ ] 9.2 Too short",
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1"]);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as {
      findings: SectionFinding[];
      summary: { placeholders: number; coverage: number; identifiers: number; sections: number };
    };

    expect(exitCode, capture.err).toBe(1);
    expect(data.findings.map((finding) => finding.rule).sort()).toEqual(
      ["section-missing-depends-on", "task-too-short"].sort(),
    );
    expect(data.summary).toEqual({ placeholders: 1, coverage: 0, identifiers: 0, sections: 1 });
    expect(
      data.summary.placeholders +
        data.summary.coverage +
        data.summary.identifiers +
        data.summary.sections,
    ).toBe(data.findings.length);
  });
});

describe("lexforge check plan: два раздела none, общий файл", () => {
  it("оба «none» и один файл в задачах — код 1, называет обе строкой с обоими разделами и файлом", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "src/shared.ts", "Req1"),
      "",
      "## 6. Second",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "src/shared.ts", "Req2"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const concurrent = findingsOf(findings, "section-concurrent-file");

    expect(exitCode).toBe(1);
    expect(concurrent).toHaveLength(1);
    // Section 6's own heading, line 8 of this fixture — not the file's
    // first line, and not section 4's heading either.
    expect(concurrent[0]!.line).toBe(8);
    expect(concurrent[0]!.message).toContain("Section 4 and section 6 are concurrent");
    expect(concurrent[0]!.message).toContain("src/shared.ts");
  });
});

describe("lexforge check plan: два раздела ждут один и тот же третий, общий файл", () => {
  it("оба ждут один и тот же раздел и делят файл — код 1, потому что он выпускает их разом", async () => {
    const tasks = [
      "## 9. Base",
      "",
      "Depends on: none",
      "",
      taskLine("9.1", "src/base.ts", "Req1"),
      "",
      "## 4. First waiter",
      "",
      "Depends on: section 9",
      "",
      taskLine("4.1", "src/shared.ts", "Req2"),
      "",
      "## 6. Second waiter",
      "",
      "Depends on: section 9",
      "",
      taskLine("6.1", "src/shared.ts", "Req3"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2", "Req3"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const concurrent = findingsOf(findings, "section-concurrent-file");

    expect(exitCode).toBe(1);
    expect(concurrent).toHaveLength(1);
    expect(concurrent[0]!.message).toContain("Section 4 and section 6 are concurrent");
    expect(concurrent[0]!.message).toContain("src/shared.ts");
  });
});

describe("lexforge check plan: цепочка зависимостей защищает общий файл", () => {
  it("6 ждёт 4, 4 ждёт 9, 9 и 6 делят файл — находки нет: 6 не начнётся раньше закрытия 9", async () => {
    const tasks = [
      "## 9. Base",
      "",
      "Depends on: none",
      "",
      taskLine("9.1", "src/shared.ts", "Req1"),
      "",
      "## 4. Middle",
      "",
      "Depends on: section 9",
      "",
      taskLine("4.1", "src/middle.ts", "Req2"),
      "",
      "## 6. Top",
      "",
      "Depends on: section 4",
      "",
      taskLine("6.1", "src/shared.ts", "Req3"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2", "Req3"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);

    expect(exitCode).toBe(0);
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });
});

describe("lexforge check plan: направление проверки достижимости", () => {
  it("более ранний по тексту раздел ждёт более поздний — общий файл всё равно не даёт находки", async () => {
    const tasks = [
      "## 4. Earlier in the file, waits for the later one",
      "",
      "Depends on: section 6",
      "",
      taskLine("4.1", "src/shared.ts", "Req1"),
      "",
      "## 6. Later in the file, the one waited for",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "src/shared.ts", "Req2"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);

    expect(exitCode).toBe(0);
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });
});

describe("lexforge check plan: «Depends on:» называет несуществующий раздел", () => {
  it("раздел 42 не существует — код 1, называет раздел 5 и раздел 42", async () => {
    const tasks = [
      "## 5. Section",
      "",
      "Depends on: section 42",
      "",
      taskLine("5.1", "src/a.ts", "Req1"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const unknown = findingsOf(findings, "section-unknown-dependency");

    expect(exitCode).toBe(1);
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.message).toContain(
      'Section 5 names "Depends on: section 42", and the plan has no section 42',
    );
  });
});

describe("lexforge check plan: два раздела ждут друг друга", () => {
  it("раздел 3 и раздел 5 ждут друг друга — код 1, называет обе полной фразой", async () => {
    const tasks = [
      "## 3. A",
      "",
      "Depends on: section 5",
      "",
      taskLine("3.1", "src/a.ts", "Req1"),
      "",
      "## 5. B",
      "",
      "Depends on: section 3",
      "",
      taskLine("5.1", "src/b.ts", "Req2"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const cycle = findingsOf(findings, "section-dependency-cycle");

    expect(exitCode).toBe(1);
    expect(cycle).toHaveLength(1);
    // The DFS can report the pair in either order — "Section 3 and section
    // 5" or "Section 5 and section 3" — so match case-insensitively rather
    // than pin one specific order.
    expect(cycle[0]!.message).toMatch(/wait for each other/);
    expect(cycle[0]!.message).toMatch(/section 3/i);
    expect(cycle[0]!.message).toMatch(/section 5/i);
  });
});

describe("lexforge check plan: раздел ждёт сам себя", () => {
  it("«Depends on: section 9» внутри самого раздела 9 — формулировка в единственном числе", async () => {
    const tasks = [
      "## 9. Self",
      "",
      "Depends on: section 9",
      "",
      taskLine("9.1", "src/a.ts", "Req1"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const cycle = findingsOf(findings, "section-dependency-cycle");

    expect(exitCode).toBe(1);
    expect(cycle).toHaveLength(1);
    expect(cycle[0]!.message).not.toMatch(/section 9 and section 9/i);
    expect(cycle[0]!.message).toContain("Section 9 names itself");
  });
});

describe("lexforge check plan: значение «Depends on:» нечитаемо", () => {
  it.each(["TBD", "nothing", "решим позже"])(
    '«Depends on: %s» — не "none" и не называет раздел, код 1, section-depends-on-unreadable',
    async (value) => {
      const tasks = [
        "## 9. Section",
        "",
        `Depends on: ${value}`,
        "",
        taskLine("9.1", "src/a.ts", "Req1"),
        "",
      ].join("\n");
      const root = sectionsWorkspace(tasks, ["Req1"]);

      const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
      const findings = await jsonFindings(root);
      const unreadable = findingsOf(findings, "section-depends-on-unreadable");

      expect(exitCode).toBe(1);
      expect(unreadable).toHaveLength(1);
      expect(unreadable[0]!.message).toContain("Section 9's \"Depends on:\" line names no section");
    },
  );
});

describe("lexforge check plan: повторная строка «Depends on:»", () => {
  it("«none», затем «section 9» — обе прочитаны, реальная зависимость не пропала", async () => {
    const tasks = [
      "## 9. Base",
      "",
      "Depends on: none",
      "",
      taskLine("9.1", "src/shared.ts", "Req1"),
      "",
      "## 4. Duplicate lines",
      "",
      "Depends on: none",
      "Depends on: section 9",
      "",
      taskLine("4.1", "src/shared.ts", "Req2"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const findings = await jsonFindings(root);

    expect(findingsOf(findings, "section-depends-on-repeated")).toHaveLength(1);
    // Had the second line been dropped, section 4 would look independent of
    // section 9, and sharing `src/shared.ts` would be a false conflict.
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });
});

describe("lexforge check plan: повторный номер раздела", () => {
  it("два заголовка с одним номером — код 1, section-number-repeated, а не путаная находка", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "src/a.ts", "Req1"),
      "",
      "## 4. Also numbered four",
      "",
      "Depends on: none",
      "",
      taskLine("4.2", "src/b.ts", "Req2"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const repeated = findingsOf(findings, "section-number-repeated");

    expect(exitCode).toBe(1);
    expect(repeated).toHaveLength(2);
    for (const finding of repeated) {
      expect(finding.message).toContain("Section number 4 is used by more than one");
    }
  });
});

describe("lexforge check plan: сравнение файлов по краткому и полному имени", () => {
  it("полный путь в одном разделе и краткое имя того же файла в другом — конфликт находится", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "src/core/gates/plan-check.ts", "Req1"),
      "",
      "## 6. Second",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "plan-check.ts", "Req2"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);
    const concurrent = findingsOf(findings, "section-concurrent-file");

    expect(exitCode).toBe(1);
    expect(concurrent).toHaveLength(1);
    expect(concurrent[0]!.message).toContain("Section 4 and section 6 are concurrent");
  });

  it("два разных SKILL.md под разными каталогами не считаются одним файлом", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "skills/lexforge-apply/SKILL.md", "Req1"),
      "",
      "## 6. Second",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "skills/lexforge-verify/SKILL.md", "Req2"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);

    expect(exitCode).toBe(0);
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });

  it("каталог, названный с завершающим /, не считается файлом", async () => {
    const tasks = [
      "## 4. First",
      "",
      "Depends on: none",
      "",
      taskLine("4.1", "src/", "Req1"),
      "",
      "## 6. Second",
      "",
      "Depends on: none",
      "",
      taskLine("6.1", "src/", "Req2"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2"]);

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], root);
    const findings = await jsonFindings(root);

    expect(exitCode).toBe(0);
    expect(findingsOf(findings, "section-concurrent-file")).toEqual([]);
  });
});

describe("lexforge check plan: план без нарушений раздела «Depends on:»", () => {
  it("каждый раздел несёт строку, цикла нет, общих файлов у одновременных разделов нет — находок нет", async () => {
    const tasks = [
      "## 1. First",
      "",
      "Depends on: none",
      "",
      taskLine("1.1", "src/one.ts", "Req1"),
      "",
      "## 2. Second",
      "",
      "Depends on: section 1",
      "",
      taskLine("2.1", "src/two.ts", "Req2"),
      "",
      "## 3. Third",
      "",
      "Depends on: section 1",
      "",
      taskLine("3.1", "src/three.ts", "Req3"),
      "",
    ].join("\n");
    const root = sectionsWorkspace(tasks, ["Req1", "Req2", "Req3"]);

    const { exitCode, capture } = await call(["check", "plan", "--change", "add-auth"], root);

    expect(exitCode, capture.err).toBe(0);
  });
});

const WITH_FINDING = [
  "## 1. Вход",
  "",
  "Depends on: none",
  "",
  "- [ ] 1.1 Написать хранение пароля в виде хеша и оставить TODO на соль",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function workspace(tasks: string, files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-auth/proposal.md": "## Why\n\nPasswords are stored in the open.\n",
    "lexforge/changes/add-auth/specs/auth/spec.md": SPEC,
    "lexforge/changes/add-auth/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-auth/tasks.md": tasks,
    ...files,
  });
  created.push(root);
  return root;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

describe("lexforge check plan", () => {
  it("на плане с находкой печатает один документ JSON и даёт код 1", async () => {
    const root = workspace(WITH_FINDING);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as {
      outputVersion: number;
      change: string;
      findings: { rule: string; line: number }[];
      summary: { placeholders: number; coverage: number; identifiers: number };
      nextStep: string;
    };

    expect(exitCode).toBe(1);
    expect(data.outputVersion).toBe(1);
    expect(data.change).toBe("add-auth");
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0]!.rule).toBe("task-placeholder");
    expect(data.summary.placeholders).toBe(1);
    expect(data.nextStep).toContain("lexforge check plan --change add-auth");
  });

  it("на чистом плане даёт код 0", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      root,
    );

    expect(exitCode).toBe(0);
    expect((JSON.parse(capture.out) as { findings: unknown[] }).findings).toEqual([]);
  });

  it("вызов без --change даёт код 2 и называет обязательный флаг", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(["check", "plan"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--change");
    expect(capture.out).toBe("");
  });
});

describe("lexforge check plan: неизвестный флаг", () => {
  it("флаг-послабление даёт код 2 и печать поддерживаемых флагов", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--allow-placeholders"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--allow-placeholders");
    expect(capture.err).toContain("--change");
    expect(capture.err).toContain("--json");
    expect(capture.out).toBe("");
  });
});

// The group carries `evidence` as well from the stage that writes it; the list
// is built from the subcommands registered on the group, so it grows with them.
describe("lexforge check без подкоманды", () => {
  it("печатает подкоманды с описаниями и даёт код 2", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(["check"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("plan");
    expect(capture.err).toContain(CHECK_PLAN_DESCRIPTION);
    expect(capture.out).toBe("");
  });

  it("неизвестная подкоманда даёт тот же список и код 2", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(["check", "dump"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("plan");
    expect(capture.err).toContain(CHECK_PLAN_DESCRIPTION);
    expect(capture.out).toBe("");
  });
});

describe("lexforge check plan: проверка не состоялась", () => {
  it("несуществующий change даёт код 2 и печатает список активных changes", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-billing"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("add-billing");
    expect(capture.err).toContain("add-auth");
    expect(capture.out).toBe("");
  });

  it("каталог без рабочего пространства даёт код 2 и называет первый шаг", async () => {
    const root = makeWorkspace({ "src/app.ts": "export const app = 1;\n" });
    created.push(root);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("lexforge init");
    expect(capture.out).toBe("");
  });
});

describe("lexforge check plan: репозиторий не нужен", () => {
  it("в каталоге без git-репозитория проверка проходит и даёт код 0", async () => {
    const root = workspace(CLEAN);

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      root,
    );

    expect(exitCode).toBe(0);
    expect(capture.err).not.toContain("git");
    expect((JSON.parse(capture.out) as { findings: unknown[] }).findings).toEqual([]);
  });
});

describe("lexforge check plan на файлах с переводами строк Windows", () => {
  /** The same text, written the way an editor on Windows writes it. */
  function crlf(text: string): string {
    return text.replace(/\r?\n/g, "\r\n");
  }

  it("находит тот же плейсхолдер на той же строке, что и на файлах с переводами Unix", async () => {
    const windows = workspace(crlf(WITH_FINDING), {
      "lexforge/changes/add-auth/specs/auth/spec.md": crlf(SPEC),
    });

    const { exitCode, capture } = await call(
      ["check", "plan", "--change", "add-auth", "--json"],
      windows,
    );
    const data = JSON.parse(capture.out) as {
      findings: { rule: string; line: number }[];
      summary: { placeholders: number };
    };

    expect(exitCode).toBe(1);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0]!.rule).toBe("task-placeholder");
    expect(data.findings[0]!.line).toBe(5);
    expect(data.summary.placeholders).toBe(1);
  });

  it("на чистом плане с переводами Windows отвечает кодом 0", async () => {
    const windows = workspace(crlf(CLEAN), {
      "lexforge/changes/add-auth/specs/auth/spec.md": crlf(SPEC),
    });

    const { exitCode } = await call(["check", "plan", "--change", "add-auth"], windows);

    expect(exitCode).toBe(0);
  });
});

