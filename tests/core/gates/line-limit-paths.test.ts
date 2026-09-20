import { describe, expect, it } from "vitest";

import { breaksPath } from "../../../src/core/gates/line-limit.js";

const LIMIT = 400;

describe("breaksPath", () => {
  it("refactor: длинный файл ужимается до предела или меньше — не ломает", () => {
    expect(breaksPath({ start: 612, now: 400 }, LIMIT, "refactor")).toBe(false);
  });

  it("refactor: длинный файл остаётся длинным — ломает", () => {
    expect(breaksPath({ start: 612, now: 590 }, LIMIT, "refactor")).toBe(true);
  });

  it("keep: длинный файл не растёт — не ломает", () => {
    expect(breaksPath({ start: 612, now: 605 }, LIMIT, "keep")).toBe(false);
  });

  it("keep: длинный файл остаётся ровно того же размера — не ломает", () => {
    expect(breaksPath({ start: 612, now: 612 }, LIMIT, "keep")).toBe(false);
  });

  it("keep: длинный файл растёт — ломает", () => {
    expect(breaksPath({ start: 612, now: 640 }, LIMIT, "keep")).toBe(true);
  });

  it("короткий файл переходит предел на обоих путях — ломает", () => {
    const counts = { start: 380, now: 420 };
    expect(breaksPath(counts, LIMIT, "refactor")).toBe(true);
    expect(breaksPath(counts, LIMIT, "keep")).toBe(true);
  });

  it("короткий файл остаётся в пределах на обоих путях — не ломает", () => {
    const counts = { start: 380, now: 400 };
    expect(breaksPath(counts, LIMIT, "refactor")).toBe(false);
    expect(breaksPath(counts, LIMIT, "keep")).toBe(false);
  });

  it("новый файл сразу за пределом — ломает на обоих путях", () => {
    const counts = { start: null, now: 401 };
    expect(breaksPath(counts, LIMIT, "refactor")).toBe(true);
    expect(breaksPath(counts, LIMIT, "keep")).toBe(true);
  });

  it("новый файл в пределах — не ломает ни на одном пути", () => {
    const counts = { start: null, now: 400 };
    expect(breaksPath(counts, LIMIT, "refactor")).toBe(false);
    expect(breaksPath(counts, LIMIT, "keep")).toBe(false);
  });
});
