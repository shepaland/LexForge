import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activeEntries,
  addEntry,
  openSession,
  readJournal,
  resolveEntry,
} from "../../../src/core/tasks/journal.js";
import type { TaskRecord } from "../../../src/core/tasks/records.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";
import { CHANGE, planFiles } from "../../helpers/plan-fixture.js";

let ws: GitWorkspace;
let root: string;

beforeEach(() => {
  ws = createGitWorkspace(planFiles());
  root = ws.root;
});
afterEach(() => ws.remove());

function record(id: string, closed: boolean): TaskRecord {
  return {
    id,
    origin: "native",
    executor: "exec-1",
    branch: `lexforge/${CHANGE}/${id}`,
    worktree: "/nowhere",
    base: "abc",
    startedAt: "2026-10-22T10:00:00.000Z",
    red: null,
    green: null,
    reviews: [],
    closed: closed ? { merge: "def", at: "2026-10-22T11:00:00.000Z" } : null,
    attempts: 0,
  };
}

describe("the journal", () => {
  it("is empty until the first entry", () => {
    expect(readJournal(root, CHANGE)).toEqual({ version: 1, session: 0, entries: [] });
  });

  it("a decision needs the owner's quote", () => {
    expect(() => addEntry(root, CHANGE, { kind: "decision", text: "Keep merge --no-ff" })).toThrowError(
      expect.objectContaining({ code: "quote-required" }),
    );
  });

  it("a ruling needs a reason", () => {
    expect(() => addEntry(root, CHANGE, { kind: "ruling", text: "Sort by title" })).toThrowError(
      expect.objectContaining({ code: "reason-required" }),
    );
  });

  it("numbers entries J1, J2 and keeps the quote and the reason", () => {
    const first = addEntry(root, CHANGE, { kind: "decision", text: "Keep it", quote: "да, ровно то" });
    const second = addEntry(root, CHANGE, { kind: "ruling", text: "Sort by title", reason: "titles are unique" });
    expect([first.id, second.id]).toEqual(["J1", "J2"]);
    expect(first).toMatchObject({ quote: "да, ровно то", scope: { kind: "change" }, resolved: null });
    expect(readJournal(root, CHANGE).entries.map((e) => e.id)).toEqual(["J1", "J2"]);
  });

  it("a new session expires the permissions of the last one", () => {
    openSession(root, CHANGE);
    const p = addEntry(root, CHANGE, {
      kind: "permission",
      text: "edit config.yaml",
      quote: "можно",
      scope: "session",
    });
    expect(openSession(root, CHANGE)).toEqual({ session: 2, expired: [p.id] });
    expect(activeEntries(readJournal(root, CHANGE), [])).toEqual([]);
  });

  it("a task permission stops once the task is closed", () => {
    addEntry(root, CHANGE, { kind: "permission", text: "touch src/x.ts", quote: "да", scope: "task:1.1" });
    expect(activeEntries(readJournal(root, CHANGE), [record("1.1", false)]).map((e) => e.id)).toEqual(["J1"]);
    expect(activeEntries(readJournal(root, CHANGE), [record("1.1", true)])).toEqual([]);
  });

  it("refuses a scope on a task the plan lacks", () => {
    expect(() =>
      addEntry(root, CHANGE, { kind: "permission", text: "x", quote: "да", scope: "task:9.9" }),
    ).toThrowError(expect.objectContaining({ code: "task-not-found" }));
  });

  it("a session-scoped permission before any session is refused", () => {
    expect(() =>
      addEntry(root, CHANGE, { kind: "permission", text: "x", quote: "да", scope: "session" }),
    ).toThrowError(
      expect.objectContaining({ code: "session-not-open", nextStep: "lexforge journal session --change demo" }),
    );
  });

  it("resolves an entry once", () => {
    addEntry(root, CHANGE, { kind: "question", text: "Which sort?" });
    expect(resolveEntry(root, CHANGE, "J1", "by title").resolved).toMatchObject({ note: "by title" });
    expect(() => resolveEntry(root, CHANGE, "J1", "again")).toThrowError(
      expect.objectContaining({ code: "entry-already-resolved" }),
    );
    expect(activeEntries(readJournal(root, CHANGE), [])).toEqual([]);
  });

  it("refuses an id the journal lacks", () => {
    expect(() => resolveEntry(root, CHANGE, "J7", "x")).toThrowError(
      expect.objectContaining({ code: "entry-not-found" }),
    );
  });
});
