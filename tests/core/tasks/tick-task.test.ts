import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tickTask } from "../../../src/core/tasks/close.js";

const PLAN = ["## 1. Search", "", "- [ ] 1.1 Search over note text", "- [ ] 1.2 Rank search results", ""].join("\n");

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lexforge-tick-"));
  file = join(dir, "tasks.md");
  writeFileSync(file, PLAN);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("tickTask", () => {
  it("ticks the line that holds the task", () => {
    tickTask({ file, line: 4, number: "1.2" }, "demo");
    expect(readFileSync(file, "utf8").split("\n")[3]).toBe("- [x] 1.2 Rank search results");
  });

  it("refuses a line that holds another task and leaves the plan as it was", () => {
    let thrown: unknown;
    try {
      tickTask({ file, line: 3, number: "1.2" }, "demo");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "plan-line-moved", nextStep: "lexforge status --change demo" });
    expect(readFileSync(file, "utf8")).toBe(PLAN);
  });
});
