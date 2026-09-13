import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyChange } from "../../src/core/archive/apply-plan.js";
import { answerPath } from "../../src/core/answer-path.js";
import {
  ArchiveDocument,
  CHANGE,
  CLOSED_PLAN,
  DELTA,
  call,
  changeFiles,
  cleanWorkspace,
  created,
  editApp,
  errorCode,
  today,
  workspace,
} from "./archive-fixtures.js";

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

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

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
    expect(answer.workspaceRoot).toBe(answerPath(root));
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
