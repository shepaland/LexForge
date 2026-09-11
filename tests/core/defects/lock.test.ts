import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { withLedgerLock } from "../../../src/core/defects/lock.js";
import { mutateLedger, type DefectEntry } from "../../../src/core/defects/store.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const LOCK_PATH = "lexforge/defects.json.lock";

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function workspace(files: Record<string, string> = {}): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    ...files,
  });
  created.push(root);
  return root;
}

describe("withLedgerLock", () => {
  it("выполняет колбэк и снимает lexforge/defects.json.lock по завершении", async () => {
    const root = workspace();
    const lockFile = path.join(root, LOCK_PATH);

    const result = await withLedgerLock(root, () => {
      expect(existsSync(lockFile)).toBe(true);
      return "done";
    });

    expect(result).toBe("done");
    expect(existsSync(lockFile)).toBe(false);
  });

  it("пишет pid и время начала в файл блокировки, пока держит её", async () => {
    const root = workspace();
    const lockFile = path.join(root, LOCK_PATH);

    await withLedgerLock(root, () => {
      const content = JSON.parse(readFileSync(lockFile, "utf8")) as {
        pid: number;
        startedAt: string;
      };
      expect(content.pid).toBe(process.pid);
      expect(typeof content.startedAt).toBe("string");
      expect(new Date(content.startedAt).toString()).not.toBe("Invalid Date");
    });
  });

  it("повторный вызов, пока файл блокировки существует, падает с путём к нему в сообщении", async () => {
    const holder = { pid: 4242, startedAt: "2026-08-30T09:12:44.281Z" };
    const root = workspace({ [LOCK_PATH]: JSON.stringify(holder) });
    const lockFile = path.join(root, LOCK_PATH);

    let thrown: unknown;
    try {
      await withLedgerLock(root, () => "unreachable", { waitMs: 50, pollMs: 10 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UsageError);
    expect((thrown as UsageError).code).toBe("defect-ledger-locked");
    expect((thrown as UsageError).message).toContain(LOCK_PATH);
    expect((thrown as UsageError).message).toContain(String(holder.pid));
    expect((thrown as UsageError).message).toContain(holder.startedAt);
    // The refusal must not touch the lock it refused to take: the holder's
    // write is still in its critical section, and a `finally` reached by the
    // refusing call would put both writers inside it at once.
    expect(existsSync(lockFile)).toBe(true);
  });

  it("колбэк, который бросает исключение, всё равно освобождает блокировку", async () => {
    const root = workspace();
    const lockFile = path.join(root, LOCK_PATH);

    let thrown: unknown;
    try {
      await withLedgerLock(root, () => {
        throw new Error("callback failed");
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("callback failed");
    expect(existsSync(lockFile)).toBe(false);
  });

  it("берёт блокировку даже когда каталог lexforge ещё не создан", async () => {
    const root = makeWorkspace();
    created.push(root);
    const lockFile = path.join(root, LOCK_PATH);

    const result = await withLedgerLock(root, () => {
      expect(existsSync(lockFile)).toBe(true);
      return "done";
    });

    expect(result).toBe("done");
    expect(existsSync(lockFile)).toBe(false);
  });

  it("два пересекающихся вызова оба выполняются по очереди, ни одна запись не теряется", async () => {
    const root = workspace();
    const order: number[] = [];

    const first = withLedgerLock(root, async () => {
      order.push(1);
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push(2);
    });
    const second = withLedgerLock(root, () => {
      order.push(3);
    });

    await Promise.all([first, second]);

    expect(order).toEqual([1, 2, 3]);
  });
});

const ENTRY_A: DefectEntry = {
  id: "a1b2c3d4",
  change: "add-auth",
  level: "important",
  file: "src/core/auth/session.ts",
  line: 42,
  summary: "session token not invalidated on logout",
  state: "open",
  recordedAt: "2026-08-30T09:12:44.281Z",
};

const ENTRY_B: DefectEntry = {
  id: "e5f6a7b8",
  change: "add-auth",
  level: "minor",
  file: "src/core/auth/login.ts",
  line: 10,
  summary: "duplicated parser",
  state: "open",
  recordedAt: "2026-08-30T09:12:45.000Z",
};

describe("mutateLedger", () => {
  it("два одновременных read-modify-write через mutateLedger не теряют ни одной записи", async () => {
    const root = workspace();

    const first = mutateLedger(root, (ledger) => {
      return { outputVersion: 1, defects: [...ledger.defects, ENTRY_A] };
    });
    const second = mutateLedger(root, (ledger) => {
      return { outputVersion: 1, defects: [...ledger.defects, ENTRY_B] };
    });

    const [, finalLedger] = await Promise.all([first, second]);

    expect(finalLedger.defects).toHaveLength(2);
    expect(finalLedger.defects.map((entry) => entry.id).sort()).toEqual(
      [ENTRY_A.id, ENTRY_B.id].sort(),
    );
  });

  it("не берёт блокировку второй раз внутри себя — заканчивается быстро, а не после полного ожидания", async () => {
    const root = workspace();
    const started = Date.now();

    await mutateLedger(root, (ledger) => ({ outputVersion: 1, defects: [...ledger.defects, ENTRY_A] }));

    expect(Date.now() - started).toBeLessThan(500);
  });
});
