import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "lexforge-context-"));
  roots.push(dir);
  return dir;
}
function run(script: string, args: string[], cwd: string) {
  return spawnSync(process.execPath, [resolve("skills/lexforge-apply/scripts", script), ...args],
    { cwd, encoding: "utf8" });
}
afterEach(() => roots.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

it("extracts only the exact task, preserving criteria and ignoring fenced checkbox examples", () => {
  const dir = fixture();
  writeFileSync(join(dir, "tasks.md"), "# Plan\n- [x] 1.1 [A] old\n  old log\n- [ ] 1.10 [A] current\n  -> cap#requirement\n  Check: test\n```md\n- [ ] 9.1 example\n```\n- [ ] 1.11 [A] next\n");
  const result = run("extract-task.mjs", ["tasks.md", "1.10"], dir);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("cap#requirement");
  expect(result.stdout).toContain("Check: test");
  expect(result.stdout).toContain("9.1 example");
  expect(result.stdout).not.toContain("old log");
  expect(result.stdout).not.toContain("1.11");
});

it("rejects missing and ambiguous task IDs without emitting a partial brief", () => {
  const dir = fixture();
  writeFileSync(join(dir, "tasks.md"), "- [ ] 1.1 one\n- [x] 1.1 duplicate\n");
  for (const id of ["2.1", "1.1"]) {
    const result = run("extract-task.mjs", ["tasks.md", id], dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  }
});

it("reviews only this cycle, including additions and deletions, without touching the index", () => {
  const dir = fixture();
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/file.txt"), "cycle A\nbase\n");
  writeFileSync(join(dir, "src/deleted.txt"), "deleted\n");
  const start = run("cycle-diff.mjs", ["start", "evidence", "src/file.txt", "src/deleted.txt", "src/new.txt"], dir);
  expect(start.status, start.stderr).toBe(0);
  writeFileSync(join(dir, "src/file.txt"), "cycle A\ncycle B\n");
  rmSync(join(dir, "src/deleted.txt"));
  writeFileSync(join(dir, "src/new.txt"), "new\n");
  const end = run("cycle-diff.mjs", ["finish", "evidence"], dir);
  expect(end.status, end.stderr).toBe(0);
  const patch = readFileSync(join(dir, "evidence/cycle.patch"), "utf8");
  expect(patch).toContain("+cycle B");
  expect(patch).not.toContain("+cycle A");
  expect(patch).toContain("deleted file mode");
  expect(patch).toContain("new file mode");
  expect(run("cycle-diff.mjs", ["start", "evidence", "src/file.txt"], dir).status).toBe(1);
});
