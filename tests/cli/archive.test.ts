import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyChange } from "../../src/core/archive/apply-plan.js";
import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import {
  createGitWorkspace,
  createPlainWorkspace,
  writeAt,
  type GitWorkspace,
} from "../helpers/git-workspace.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const CHANGE = "add-auth";

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
`;

/** The delta of the change: one capability written for the first time. */
const DELTA = `## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## ADDED Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

/** A main spec the workspace already carries, untouched by a change without a delta. */
const STANDING_SPEC = `# auth

## Purpose

Holds what the sign-in of the product does and what it refuses to do.

## Requirements

### Requirement: Password is stored hashed

The system SHALL store a password as a hash.

#### Scenario: A password is saved

- **WHEN** a user sets a password
- **THEN** the store holds a hash of it
`;

/** A plan with one open task, so the checks have something to report. */
const OPEN_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "- [ ] 1.2 Написать проверку пароля при входе в `src/app.ts`",
  "",
].join("\n");

/** Every task closed, the requirement named, the file it names edited. */
const CLOSED_PLAN = [
  "## 1. Вход",
  "",
  "- [x] 1.1 Написать хранение пароля в виде хеша в `src/app.ts`",
  "      -> auth#Password is stored hashed",
  "",
].join("\n");

function changeFiles(tasks: string): Record<string, string> {
  return {
    "lexforge/config.yaml": CONFIG,
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
    [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: DELTA,
    [`lexforge/changes/${CHANGE}/design.md`]: "## Context\n\nOne service, one database.\n",
    [`lexforge/changes/${CHANGE}/tasks.md`]: tasks,
  };
}

const created: GitWorkspace[] = [];
/** Temp directories made without the helper: removed the same way afterwards. */
const plain: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
  while (plain.length > 0) {
    removeWorkspace(plain.pop()!);
  }
});

function workspace(files: Record<string, string>): GitWorkspace {
  const made = createGitWorkspace(files);
  created.push(made);
  return made;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

/** The work of the change: a line the base commit does not carry. */
function editApp(root: string): void {
  writeAt(root, "src/app.ts", 'export function app(): string {\n  return "hashed";\n}\n');
}

describe("lexforge archive: предусловия и машинная проверка", () => {
  it("незакрытая задача даёт код 1 и не трогает основные спеки", async () => {
    const root = workspace(changeFiles(OPEN_PLAN)).root;
    editApp(root);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(1);
    expect(capture.err).toContain("1.2");
    expect(existsSync(path.join(root, "lexforge/specs/auth/spec.md"))).toBe(false);
  });

  it("правка после прогона проверок даёт код 1 и оставляет каталог change", async () => {
    const root = workspace(changeFiles(CLOSED_PLAN)).root;
    editApp(root);
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);
    writeAt(root, "src/app.ts", 'export function app(): string {\n  return "later";\n}\n');

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(1);
    expect(capture.err).toContain("evidence-not-fresh");
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
  });

  it("требование без следа в коде даёт код 1", async () => {
    const plan = ["## 1. Вход", "", "- [x] 1.1 Написать вход в `src/app.ts`", ""].join("\n");
    const root = workspace(changeFiles(plan)).root;
    editApp(root);
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(1);
    expect(capture.err).toContain("requirement-without-trace");
  });

  it.each(["--force", "--skip-verify", "--no-check"])(
    "флаг %s даёт код 2 и справку команды",
    async (flag) => {
      const root = workspace(changeFiles(CLOSED_PLAN)).root;

      const { exitCode, capture } = await call(["archive", CHANGE, flag], root);

      expect(exitCode).toBe(2);
      expect(capture.err).toContain("Usage: lexforge archive");
    },
  );

  it("пустой design.md даёт код 2 и называет артефакт design", async () => {
    const files = { ...changeFiles(CLOSED_PLAN), [`lexforge/changes/${CHANGE}/design.md`]: "" };
    const root = workspace(files).root;

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("design");
    expect(capture.err).toContain(`lexforge instructions design --change ${CHANGE}`);
  });

  it("пропуск дельта-спек через конфигурацию предусловие проходит", async () => {
    const files = changeFiles(CLOSED_PLAN);
    delete files[`lexforge/changes/${CHANGE}/specs/auth/spec.md`];
    files[`lexforge/changes/${CHANGE}/.lexforge.yaml`] = "schema: spec-driven\nskip_specs: true\n";

    const root = workspace(files).root;
    editApp(root);
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
  });
});

interface ArchiveDocument {
  outputVersion: number;
  workspaceRoot: string;
  change: string;
  findings: { rule: string }[];
  summary: Record<string, number>;
  archivePath: string;
  nextStep: string;
}

interface ErrorDocument {
  error: { code: string; message: string };
}

async function errorCode(argv: string[], cwd: string): Promise<string> {
  const { capture } = await call([...argv, "--json"], cwd);
  return (JSON.parse(capture.out) as ErrorDocument).error.code;
}

describe("lexforge archive: отказы", () => {
  it("каталог без рабочего пространства даёт код 2", async () => {
    const outside = makeWorkspace({ "README.md": "no workspace here\n" });
    plain.push(outside);

    const { exitCode } = await call(["archive", CHANGE], outside);

    expect(exitCode).toBe(2);
    expect(await errorCode(["archive", CHANGE], outside)).toBe("workspace-not-found");
  });

  it("неизвестный change даёт код 2", async () => {
    const root = workspace(changeFiles(CLOSED_PLAN)).root;

    const { exitCode } = await call(["archive", "nosuch"], root);

    expect(exitCode).toBe(2);
    expect(await errorCode(["archive", "nosuch"], root)).toBe("change-not-found");
  });

  it("каталог без репозитория даёт код 2", async () => {
    const made = createPlainWorkspace(changeFiles(CLOSED_PLAN));
    created.push(made);

    const { exitCode } = await call(["archive", CHANGE], made.root);

    expect(exitCode).toBe(2);
    expect(await errorCode(["archive", CHANGE], made.root)).toBe("git-missing");
  });

  it("пустой раздел verification даёт код 2", async () => {
    const files = { ...changeFiles(CLOSED_PLAN), "lexforge/config.yaml": "schema: spec-driven\n" };
    const root = workspace(files).root;

    const { exitCode } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(2);
    expect(await errorCode(["archive", CHANGE], root)).toBe("verification-empty");
  });
});

/** Local date of the run, the form the archive directory is named with. */
function today(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A change that passes every check: closed plan, edited file, fresh stamp. */
async function cleanWorkspace(files: Record<string, string>): Promise<string> {
  const root = workspace(files).root;
  editApp(root);
  await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);
  return root;
}

describe("lexforge archive: запись спек и перенос каталога", () => {
  it("удачная архивация пишет основную спеку по каждой capability дельты", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    const merged = applyChange([
      {
        capability: "auth",
        deltaFile: `lexforge/changes/${CHANGE}/specs/auth/spec.md`,
        delta: DELTA,
        specFile: "lexforge/specs/auth/spec.md",
        spec: null,
      },
    ]);

    expect(exitCode, capture.err).toBe(0);
    expect(readFileSync(path.join(root, "lexforge/specs/auth/spec.md"), "utf8")).toBe(
      merged.specs[0]!.content,
    );
  });

  it("каталог change переезжает в архив под датой", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
    expect(existsSync(path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}`))).toBe(
      true,
    );
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(false);
  });

  it("занятый каталог архива даёт код 2 и оставляет change на месте", async () => {
    const taken = `lexforge/changes/archive/${today()}-${CHANGE}`;
    const files = { ...changeFiles(CLOSED_PLAN), [`${taken}/proposal.md`]: "## Why\n\nEarlier.\n" };
    const root = await cleanWorkspace(files);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain(taken);
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
    expect(await errorCode(["archive", CHANGE], root)).toBe("archive-path-taken");
  });

  it("журнал штампов уезжает в архив целиком", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));
    const before = readFileSync(path.join(root, `lexforge/changes/${CHANGE}/evidence.json`), "utf8");

    const { exitCode, capture } = await call(["archive", CHANGE], root);
    const archived = path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}/evidence.json`);

    expect(exitCode, capture.err).toBe(0);
    expect(readFileSync(archived, "utf8")).toBe(before);
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}/evidence.json`))).toBe(false);
  });

  it("change с пропущенной дельтой архивируется без слияния", async () => {
    const files = changeFiles(CLOSED_PLAN);
    delete files[`lexforge/changes/${CHANGE}/specs/auth/spec.md`];
    files[`lexforge/changes/${CHANGE}/.lexforge.yaml`] = "schema: spec-driven\nskip_specs: true\n";
    files["lexforge/specs/auth/spec.md"] = STANDING_SPEC;

    const root = await cleanWorkspace(files);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
    expect(readFileSync(path.join(root, "lexforge/specs/auth/spec.md"), "utf8")).toBe(
      STANDING_SPEC,
    );
    expect(existsSync(path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}`))).toBe(
      true,
    );
  });

  it("пропуск объявлен, а дельта написана — код 2 с текстом о расхождении", async () => {
    const files = changeFiles(CLOSED_PLAN);
    files[`lexforge/changes/${CHANGE}/.lexforge.yaml`] = "schema: spec-driven\nskip_specs: true\n";

    const root = await cleanWorkspace(files);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("skip_specs");
    expect(await errorCode(["archive", CHANGE], root)).toBe("change-config-mismatch");
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
  });

  it("ответ --json несёт семь полей, и archivePath называет каталог архива", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));

    const { exitCode, capture } = await call(["archive", CHANGE, "--json"], root);
    const answer = JSON.parse(capture.out) as ArchiveDocument;

    expect(exitCode, capture.err).toBe(0);
    expect(Object.keys(answer).sort()).toEqual([
      "archivePath",
      "change",
      "findings",
      "nextStep",
      "outputVersion",
      "summary",
      "workspaceRoot",
    ]);
    expect(answer.outputVersion).toBe(1);
    expect(answer.workspaceRoot).toBe(root);
    expect(answer.change).toBe(CHANGE);
    expect(answer.findings).toEqual([]);
    expect(answer.archivePath).toBe(`lexforge/changes/archive/${today()}-${CHANGE}`);
    expect(answer.nextStep).toContain("branch");
  });

  it("повторный вызов после прерывания доводит перенос каталога", async () => {
    const merged = applyChange([
      {
        capability: "auth",
        deltaFile: `lexforge/changes/${CHANGE}/specs/auth/spec.md`,
        delta: DELTA,
        specFile: "lexforge/specs/auth/spec.md",
        spec: null,
      },
    ]);

    // The state a run cut off between writing the specs and moving the change
    // leaves behind: the merge is on disk, the change is still where it was.
    const files = { ...changeFiles(CLOSED_PLAN), "lexforge/specs/auth/spec.md": merged.specs[0]!.content };
    const root = await cleanWorkspace(files);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
    expect(readFileSync(path.join(root, "lexforge/specs/auth/spec.md"), "utf8")).toBe(
      merged.specs[0]!.content,
    );
    expect(existsSync(path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}`))).toBe(
      true,
    );
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(false);
  });

  it("конфликт слияния даёт код 1, и ни одна спека не записана", async () => {
    const delta = DELTA.replace("## ADDED Requirements", "## MODIFIED Requirements");
    const files = { ...changeFiles(CLOSED_PLAN), [`lexforge/changes/${CHANGE}/specs/auth/spec.md`]: delta };
    const root = await cleanWorkspace(files);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(1);
    expect(capture.err).toContain("spec-missing");
    expect(existsSync(path.join(root, "lexforge/specs"))).toBe(false);
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
  });

  it("change без журнала штампов даёт код 1 с находкой измерения штампов", async () => {
    const root = workspace(changeFiles(CLOSED_PLAN)).root;
    editApp(root);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(1);
    expect(capture.err).toContain("evidence-not-fresh");
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
  });
});
