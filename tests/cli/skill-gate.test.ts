import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { manifestPath, readManifest } from "../../src/core/init/install-manifest.js";
import { packageVersion } from "../../src/core/package-info.js";
import { createCapture } from "../helpers/capture.js";
import { writeInstallation } from "../helpers/install-skills.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

// Matched line by line by `cycle run --phase red`.
const EXPECTED = "\n`status --json` exits `0` on the outdated installation\n";

const created: string[] = [];
let home = "";

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "lexforge-gate-home-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function workspace(): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    "lexforge/changes/archive/": "",
  });
  created.push(root);
  return root;
}

function bareDirectory(): string {
  const root = makeWorkspace();
  created.push(root);
  return root;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, {
    cwd,
    home,
    stdout: capture.stdout,
    stderr: capture.stderr,
    checkForUpdate: async () => ({ kind: "continue", updateAvailable: false }),
  });
  return { exitCode, capture };
}

function refusal(out: string): { code: string; message: string } {
  return (JSON.parse(out) as { error: { code: string; message: string } }).error;
}

describe("шлюз версии скиллов", () => {
  it("старые скиллы проекта отклоняют status --json с кодом skills-outdated", async () => {
    const root = workspace();
    writeInstallation(root, "claude", { scope: "project", version: "3.0.0", skills: ["lexforge-plan"] });

    const { exitCode, capture } = await call(["status", "--json"], root);

    expect(exitCode, EXPECTED).toBe(2);
    const error = refusal(capture.out);
    expect(error.code).toBe("skills-outdated");
    expect(error.message).toContain(".claude/skills");
    expect(error.message).toContain("3.0.0");
    expect(error.message).toContain(packageVersion());
    expect(error.message).toContain("lexforge init --tools claude");
    expect(error.message).not.toContain("--scope user");
  });

  it("старые скиллы в домашнем каталоге называют --scope user", async () => {
    const root = workspace();
    writeInstallation(home, "claude", { scope: "user", version: "3.0.0", skills: ["lexforge-plan"] });

    const { exitCode, capture } = await call(["status", "--json"], root);

    expect(exitCode).toBe(2);
    const error = refusal(capture.out);
    expect(error.code).toBe("skills-outdated");
    expect(error.message).toContain("lexforge init --tools claude --scope user");
  });

  it("манифест новее CLI тоже отклоняется", async () => {
    const root = workspace();
    writeInstallation(root, "claude", { scope: "project", version: "99.0.0", skills: ["lexforge-plan"] });

    const { exitCode, capture } = await call(["status", "--json"], root);

    expect(exitCode).toBe(2);
    expect(refusal(capture.out).code).toBe("skills-outdated");
  });

  it("скиллы без манифеста отклоняются, версия названа unknown", async () => {
    const root = workspace();
    writeInstallation(root, "claude", { scope: "project", version: null, skills: ["lexforge-plan"] });

    const { exitCode, capture } = await call(["status", "--json"], root);

    expect(exitCode).toBe(2);
    const error = refusal(capture.out);
    expect(error.code).toBe("skills-outdated");
    expect(error.message).toContain("unknown");
  });

  it("каталог только с чужим скиллом не проверяется", async () => {
    const root = workspace();
    writeInstallation(home, "claude", { scope: "user", version: null, skills: ["ux-audit"] });

    const { exitCode } = await call(["status", "--json"], root);

    expect(exitCode).toBe(0);
  });

  it("совпадающие версии в обоих областях пропускают команду", async () => {
    const root = workspace();
    writeInstallation(root, "claude", { scope: "project", version: packageVersion(), skills: ["lexforge-plan"] });
    writeInstallation(home, "claude", { scope: "user", version: packageVersion(), skills: ["lexforge-plan"] });

    const { exitCode } = await call(["status", "--json"], root);

    expect(exitCode).toBe(0);
  });

  it("doctor не отклоняется и сообщает о версии установленных скиллов", async () => {
    const root = workspace();
    writeInstallation(root, "claude", { scope: "project", version: "3.0.0", skills: ["lexforge-plan"] });

    const { capture } = await call(["doctor", "--json"], root);

    const report = JSON.parse(capture.out) as {
      error?: unknown;
      checks: Array<{ findings: Array<{ rule: string; path?: string }> }>;
    };
    expect(report.error).toBeUndefined();
    const findings = report.checks.flatMap((check) => check.findings);
    expect(findings.some((f) => f.rule === "skills-version-mismatch" && f.path?.endsWith("/.claude/skills") === true)).toBe(true);
  });

  it("init --tools claude не отклоняется и записывает манифест текущей версии", async () => {
    const root = workspace();
    const skillsDir = writeInstallation(root, "claude", {
      scope: "project",
      version: "3.0.0",
      skills: ["lexforge-plan"],
    });

    const { exitCode, capture } = await call(["init", "--tools", "claude", "--json"], root);

    expect(exitCode).toBe(0);
    expect(capture.err).not.toContain("skills-outdated");
    const manifest = readManifest(readFileSync(manifestPath(skillsDir), "utf8"));
    expect(manifest?.version).toBe(packageVersion());
  });

  it("--help и --version проходят при старых скиллах", async () => {
    const root = workspace();
    writeInstallation(root, "claude", { scope: "project", version: "3.0.0", skills: ["lexforge-plan"] });

    expect((await call(["--help"], root)).exitCode).toBe(0);
    expect((await call(["--version"], root)).exitCode).toBe(0);
    expect((await call(["status", "--help"], root)).exitCode).toBe(0);
  });

  it("каталог без рабочего пространства со старыми скиллами тоже отклоняется", async () => {
    const root = bareDirectory();
    writeInstallation(root, "claude", { scope: "project", version: "3.0.0", skills: ["lexforge-plan"] });

    const { exitCode, capture } = await call(["status", "--json"], root);

    expect(exitCode).toBe(2);
    expect(refusal(capture.out).code).toBe("skills-outdated");
  });
});
