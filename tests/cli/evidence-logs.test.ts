import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { run } from "../../src/cli/run.js";
import { createGitWorkspace } from "../helpers/git-workspace.js";
import { createCapture } from "../helpers/capture.js";
it("keeps full command output on disk and returns bounded JSON with a log link", async () => {
  const ws = createGitWorkspace({
    "lexforge/config.yaml":
      "schema: bounded\nverification:\n  tests: node -e \"console.log('START');console.log('x'.repeat(20000));console.log('END')\"\n",
    "lexforge/changes/demo/.lexforge.yaml": "schema: bounded\n",
  });
  try {
    const c = createCapture();
    expect(
      await run(
        [
          "evidence",
          "record",
          "--change",
          "demo",
          "--label",
          "tests",
          "--json",
        ],
        { cwd: ws.root, stdout: c.stdout, stderr: c.stderr },
      ),
    ).toBe(0);
    const r = JSON.parse(c.out).record;
    expect(c.err.length).toBeLessThan(500);
    expect(c.out.length).toBeLessThan(12000);
    expect(readFileSync(path.join(ws.root, r.log), "utf8")).toContain("START");
    expect(readFileSync(path.join(ws.root, r.log), "utf8")).toContain("END");
  } finally {
    ws.remove();
  }
});
it("changing the configured command invalidates a previously green label", async () => {
  const ws = createGitWorkspace({
    "lexforge/config.yaml":
      'schema: bounded\nverification:\n  tests: node -e "process.exit(0)"\n',
    "lexforge/changes/demo/.lexforge.yaml": "schema: bounded\n",
  });
  try {
    const c = createCapture();
    await run(
      ["evidence", "record", "--change", "demo", "--label", "tests", "--json"],
      { cwd: ws.root, stdout: c.stdout, stderr: c.stderr },
    );
    const { writeAt } = await import("../helpers/git-workspace.js");
    writeAt(
      ws.root,
      "lexforge/config.yaml",
      'schema: bounded\nverification:\n  tests: node -e "process.exit(1)"\n',
    );
    const after = createCapture();
    expect(
      await run(["check", "evidence", "--change", "demo", "--json"], {
        cwd: ws.root,
        stdout: after.stdout,
        stderr: after.stderr,
      }),
    ).toBe(1);
  } finally {
    ws.remove();
  }
});
