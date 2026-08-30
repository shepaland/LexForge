import { describe, expect, it } from "vitest";

import type { EvidenceRecord } from "../../../src/core/gates/evidence-store.js";
import {
  freshnessFinding,
  labelState,
  type LabelState,
} from "../../../src/core/gates/freshness.js";

const HEAD = "9f1c0b7a4e1d2c3b5a6f7e8d9c0b1a2f3e4d5c6b";
const OTHER_HEAD = "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567";
const DIGEST = "sha256:1f0a";
const OTHER_DIGEST = "sha256:2b3c";

const CURRENT = { head: HEAD, worktreeDigest: DIGEST };

const GREEN: EvidenceRecord = {
  command: "npm test",
  exitCode: 0,
  startedAt: "2026-08-30T09:12:44.281Z",
  durationMs: 3140,
  head: HEAD,
  worktreeDigest: DIGEST,
  outputTail: "1 passed",
  outputTruncated: false,
};

describe("labelState", () => {
  it("совпадение коммита и отпечатка при нулевом коде даёт fresh", () => {
    expect(labelState(GREEN, CURRENT)).toBe("fresh");
  });

  it("ненулевой код при совпадении даёт failed", () => {
    expect(labelState({ ...GREEN, exitCode: 1 }, CURRENT)).toBe("failed");
  });

  it("другой коммит даёт stale-commit", () => {
    expect(labelState({ ...GREEN, head: OTHER_HEAD }, CURRENT)).toBe("stale-commit");
  });

  it("тот же коммит и другой отпечаток дают stale-worktree", () => {
    expect(labelState({ ...GREEN, worktreeDigest: OTHER_DIGEST }, CURRENT)).toBe("stale-worktree");
  });

  it("отсутствие записи даёт missing", () => {
    expect(labelState(undefined, CURRENT)).toBe("missing");
  });

  it("коммит сравнивается раньше отпечатка", () => {
    const moved = { ...GREEN, head: OTHER_HEAD, worktreeDigest: OTHER_DIGEST };

    expect(labelState(moved, CURRENT)).toBe("stale-commit");
  });

  it("красный прогон на другом коммите остаётся stale-commit", () => {
    const moved = { ...GREEN, exitCode: 1, head: OTHER_HEAD };

    expect(labelState(moved, CURRENT)).toBe("stale-commit");
  });
});

const FILE = "lexforge/changes/add-auth/evidence.json";
const CALL = "lexforge evidence record --change add-auth --label tests";

function finding(state: LabelState, record?: EvidenceRecord) {
  return freshnessFinding({
    file: FILE,
    change: "add-auth",
    label: "tests",
    state,
    record,
    current: CURRENT,
  });
}

describe("freshnessFinding", () => {
  it("состояние fresh находки не даёт", () => {
    expect(finding("fresh", GREEN)).toBeUndefined();
  });

  it("каждое несвежее состояние даёт одну находку evidence-not-fresh", () => {
    const states: LabelState[] = ["failed", "stale-commit", "stale-worktree", "missing"];

    for (const state of states) {
      const found = finding(state, state === "missing" ? undefined : GREEN);

      expect(found, state).toBeDefined();
      expect(found!.rule).toBe("evidence-not-fresh");
      expect(found!.level).toBe("error");
      expect(found!.file).toBe(FILE);
      expect(found!.message).toContain("tests");
      expect(found!.message).toContain(state);
      expect(found!.message).toContain(CALL);
    }
  });

  it("текст stale-commit называет коммит штампа и текущий HEAD", () => {
    const found = finding("stale-commit", { ...GREEN, head: OTHER_HEAD });

    expect(found!.message).toContain(OTHER_HEAD.slice(0, 8));
    expect(found!.message).toContain(HEAD.slice(0, 8));
  });

  it("текст stale-worktree называет правку в рабочем дереве", () => {
    const found = finding("stale-worktree", { ...GREEN, worktreeDigest: OTHER_DIGEST });

    expect(found!.message).toContain("working tree");
  });
});
