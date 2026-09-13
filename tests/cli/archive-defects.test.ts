import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readDefectLedger } from "../../src/core/defects/store.js";
import {
  ArchiveDocument,
  CHANGE,
  CLOSED_PLAN,
  OPEN_PLAN,
  call,
  changeFiles,
  cleanWorkspace,
  created,
  today,
} from "./archive-fixtures.js";

// Wraps the real implementation by default, so every test but the one that
// forces a broken-ledger read below sees the genuine store.
vi.mock("../../src/core/defects/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core/defects/store.js")>();
  return { ...actual, readDefectLedger: vi.fn(actual.readDefectLedger) };
});

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

describe("lexforge archive: четвёртое измерение — журнал дефектов", () => {
  async function recordDefect(root: string, level: string, summary: string): Promise<void> {
    await call(
      [
        "defect",
        "record",
        "--change",
        CHANGE,
        "--level",
        level,
        "--file",
        "src/app.ts",
        "--line",
        "1",
        "--summary",
        summary,
      ],
      root,
    );
  }

  it("открытая important запись даёт код 1, не пишет спеку и оставляет каталог change", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));
    await recordDefect(root, "important", "session token not invalidated on logout");

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(1);
    expect(capture.err).toContain("defect-open");
    expect(existsSync(path.join(root, "lexforge/specs/auth/spec.md"))).toBe(false);
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
    expect(existsSync(path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}`))).toBe(
      false,
    );
  });

  it("summary.openDefects считает находки этого измерения, не любую открытую запись проекта", async () => {
    const root = await cleanWorkspace(changeFiles(OPEN_PLAN));
    await recordDefect(root, "minor", "first minor");
    await recordDefect(root, "minor", "second minor");

    const { exitCode, capture } = await call(["archive", CHANGE, "--json"], root);
    const answer = JSON.parse(capture.out) as ArchiveDocument;

    expect(exitCode, capture.err).toBe(1);
    // The one open task is the only finding: two open `minor` entries never
    // become one, whatever the project-wide count of open entries is.
    expect(answer.findings.map((finding) => finding.rule)).toEqual(["task-not-done"]);
    expect(answer.summary.openDefects).toBe(0);
  });

  it("summary.openDefects совпадает со значением verify для того же change", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));
    await recordDefect(root, "critical", "session token not invalidated on logout");

    const verifyRun = await call(["verify", "--change", CHANGE, "--json"], root);
    const verifyAnswer = JSON.parse(verifyRun.capture.out) as { summary: Record<string, number> };

    const { exitCode, capture } = await call(["archive", CHANGE, "--json"], root);
    const answer = JSON.parse(capture.out) as ArchiveDocument;

    expect(exitCode, capture.err).toBe(1);
    expect(answer.summary.openDefects).toBe(1);
    expect(answer.summary.openDefects).toBe(verifyAnswer.summary.openDefects);
  });

  it("две открытые minor записи не мешают: код 0, слияние и перенос каталога", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));
    await recordDefect(root, "minor", "first minor");
    await recordDefect(root, "minor", "second minor");

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
    expect(existsSync(path.join(root, "lexforge/specs/auth/spec.md"))).toBe(true);
    expect(existsSync(path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}`))).toBe(
      true,
    );
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(false);
  });

  it("после удачной архивации журнал дефектов всё ещё держит обе minor-записи открытыми на имя архивированного change", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));
    await recordDefect(root, "minor", "first minor");
    await recordDefect(root, "minor", "second minor");

    const { exitCode, capture } = await call(["archive", CHANGE], root);
    expect(exitCode, capture.err).toBe(0);

    const ledger = readDefectLedger(root);

    expect(ledger.defects).toHaveLength(2);
    for (const entry of ledger.defects) {
      expect(entry.state).toBe("open");
      expect(entry.change).toBe(CHANGE);
    }
    // `defects.json` sits beside `lexforge/config.yaml`, outside every change
    // directory: archiving moves the change, never the ledger.
    expect(existsSync(path.join(root, "lexforge/defects.json"))).toBe(true);
    expect(
      existsSync(path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}/defects.json`)),
    ).toBe(false);
  });

  it("ни одной открытой записи в проекте: строка называет ноль и не отправляет к пустому списку", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
    expect(capture.out).toContain("No defects are open in the project ledger.");
    // At zero, `lexforge defect list --open` answers "No defects recorded
    // yet." (or "No open defects."), which reads as "nothing was ever
    // recorded" — the pointer is dropped rather than sent nowhere useful.
    expect(capture.out).not.toContain("lexforge defect list --open");
  });

  it("журнал дефектов читается до слияния: чтение, упавшее там, не оставляет спеку записанной и каталог перемещённым", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));
    const actualStore = await vi.importActual<typeof import("../../src/core/defects/store.js")>(
      "../../src/core/defects/store.js",
    );
    const mocked = vi.mocked(readDefectLedger);
    // The first call is `verifyChange`'s own, inside `defectFindings`; it has
    // to succeed so `checks` comes back clean. The second is `archiveChange`'s
    // own read for the project-wide count — that is the one this test breaks.
    mocked.mockImplementationOnce((workspaceRoot) => actualStore.readDefectLedger(workspaceRoot));
    mocked.mockImplementationOnce(() => {
      throw new Error("simulated broken ledger");
    });

    const { exitCode } = await call(["archive", CHANGE], root);

    // The read happens before the merge and the move: a throw there stops
    // the command with nothing on disk changed yet, the same as every other
    // refusal this command makes before it writes anything.
    expect(exitCode).not.toBe(0);
    expect(existsSync(path.join(root, "lexforge/specs/auth/spec.md"))).toBe(false);
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
    expect(existsSync(path.join(root, `lexforge/changes/archive/${today()}-${CHANGE}`))).toBe(
      false,
    );
  });

  it("успешный вывод называет число открытых записей и команду, которая их выводит (множественное число)", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));
    await recordDefect(root, "minor", "first minor");
    await recordDefect(root, "minor", "second minor");

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
    expect(capture.out).toContain(
      "2 defects are open in the project ledger. Run: lexforge defect list --open",
    );
  });

  it("успешный вывод согласует число с одной открытой записью (единственное число)", async () => {
    const root = await cleanWorkspace(changeFiles(CLOSED_PLAN));
    await recordDefect(root, "minor", "only minor");

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
    expect(capture.out).toContain(
      "1 defect is open in the project ledger. Run: lexforge defect list --open",
    );
  });
});
