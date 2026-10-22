import { describe, expect, it } from "vitest";
import {
  changeDir,
  finalReviewPackagePath,
  lockPath,
  taskArtifactPath,
  taskBranchName,
  taskRecordPath,
  taskWorktreePath,
} from "../../../src/core/tasks/paths.js";

describe("task paths", () => {
  it("refuses a change name that is not kebab-case", () => {
    for (const bad of ["../x", "A", "a/b", "", "a--b"]) {
      expect(() => changeDir(bad), bad).toThrowError(
        expect.objectContaining({ code: "execution-invalid", message: "Invalid change name" }),
      );
      expect(() => lockPath("/r", bad), bad).toThrow();
    }
    expect(changeDir("plan-driven-2")).toBe("lexforge/changes/plan-driven-2");
  });
  it("refuses a task id that is not a plan number", () => {
    for (const bad of ["../x", "1", "1.", "a.b", "1.2/../3", ""]) {
      expect(() => taskRecordPath("/r", "demo", bad), bad).toThrow();
      expect(() => taskArtifactPath("/r", "demo", bad, "brief.md"), bad).toThrow();
      expect(() => taskWorktreePath("/r", "demo", bad), bad).toThrow();
      expect(() => taskBranchName("demo", bad), bad).toThrow();
    }
    expect(taskBranchName("demo", "3.1.4")).toBe("lexforge/demo/3.1.4");
  });
  it("refuses a bad change name in worktree and branch helpers", () => {
    expect(() => taskWorktreePath("/r", "../x", "1.1")).toThrow();
    expect(() => taskBranchName("../x", "1.1")).toThrow();
  });
  it("names the final review package", () => {
    expect(finalReviewPackagePath("/r", "demo")).toBe("/r/lexforge/changes/demo/final-review.md");
  });
});
