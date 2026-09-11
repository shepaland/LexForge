import { afterEach, describe, expect, it } from "vitest";

import { closeDefect } from "../../../src/core/defects/close.js";
import { withLedgerLock } from "../../../src/core/defects/lock.js";
import { recordDefect } from "../../../src/core/defects/record.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const CHANGE = "add-auth";

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function workspace(): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  });
  created.push(root);
  return root;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Holds the ledger lock for `ms`, so a call started while this is in flight
 * has to wait. Returns the wall-clock time the lock was released.
 */
function holdLock(root: string, ms: number): { released: Promise<number> } {
  let resolveReleased!: (value: number) => void;
  const released = new Promise<number>((resolve) => {
    resolveReleased = resolve;
  });

  const held = withLedgerLock(root, async () => {
    await sleep(ms);
    const at = Date.now();
    resolveReleased(at);
  });

  return { released: held.then(() => released) };
}

describe("recordedAt/closedAt значат «когда запись легла в журнал», а не «когда позвали команду»", () => {
  it("recordDefect ждёт занятый лок, и recordedAt не раньше его освобождения", async () => {
    const root = workspace();
    const { released } = holdLock(root, 300);

    // Give the holder a moment to actually take the lock before this call
    // starts queuing behind it.
    await sleep(30);

    const result = await recordDefect({
      cwd: root,
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "queued behind a held lock",
    });

    const releasedAt = await released;
    const recordedAtMs = new Date(result.data.defect.recordedAt).getTime();

    expect(recordedAtMs).toBeGreaterThanOrEqual(releasedAt - 20);
  });

  it("closeDefect ждёт занятый лок, и closedAt не раньше его освобождения", async () => {
    const root = workspace();
    const recorded = await recordDefect({
      cwd: root,
      change: CHANGE,
      level: "minor",
      file: "src/core/auth/session.ts",
      line: "1",
      summary: "to be closed under contention",
    });
    const id = recorded.data.defect.id;

    const { released } = holdLock(root, 300);

    await sleep(30);

    const result = await closeDefect({ cwd: root, id });

    const releasedAt = await released;
    const closedAtMs = new Date(result.data.defect.closedAt!).getTime();

    expect(closedAtMs).toBeGreaterThanOrEqual(releasedAt - 20);
  });
});
