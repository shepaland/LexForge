import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CHECK_EVIDENCE_DESCRIPTION } from "../../src/cli/commands/check.js";
import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import {
  createGitWorkspace,
  createPlainWorkspace,
  writeAt,
  type GitWorkspace,
} from "../helpers/git-workspace.js";

const CHANGE = "add-auth";

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
  lint: node -e "process.exit(0)"
`;

const CHANGE_FILES = {
  [`lexforge/changes/${CHANGE}/.lexforge.yaml`]: "schema: spec-driven\n",
  [`lexforge/changes/${CHANGE}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
};

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(): GitWorkspace {
  const made = createGitWorkspace({ "lexforge/config.yaml": CONFIG, ...CHANGE_FILES });
  created.push(made);
  return made;
}

async function call(argv: string[], cwd: string) {
  const capture = createCapture();
  const exitCode = await run(argv, { cwd, stdout: capture.stdout, stderr: capture.stderr });
  return { exitCode, capture };
}

interface EvidenceDocument {
  outputVersion: number;
  change: string;
  findings: { rule: string }[];
  labels: { label: string; state: string }[];
  summary: { checked: number; fresh: number };
  nextStep: string;
}

describe("lexforge check evidence", () => {
  it("свежая метка даёт код 0 и один документ JSON", async () => {
    const root = workspace().root;
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);

    const { exitCode, capture } = await call(
      ["check", "evidence", "--change", CHANGE, "--require", "tests", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as EvidenceDocument;

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(data.change).toBe(CHANGE);
    expect(data.labels).toEqual([
      expect.objectContaining({ label: "tests", state: "fresh" }),
    ]);
    expect(data.summary).toEqual({ checked: 1, fresh: 1 });
    expect(data.findings).toEqual([]);
  });

  it("правка кода после записи даёт код 1 и находку", async () => {
    const root = workspace().root;
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);
    const app = path.join(root, "src/app.ts");
    writeAt(root, "src/app.ts", `${readFileSync(app, "utf8")}// one more line\n`);

    const { exitCode, capture } = await call(
      ["check", "evidence", "--change", CHANGE, "--require", "tests", "--json"],
      root,
    );
    const data = JSON.parse(capture.out) as EvidenceDocument;

    expect(exitCode).toBe(1);
    expect(data.labels[0]!.state).toBe("stale-worktree");
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0]!.rule).toBe("evidence-not-fresh");
    expect(data.nextStep).toContain("lexforge check evidence --change add-auth");
  });

  it("метки без штампа дают код 1", async () => {
    const root = workspace().root;

    const { exitCode } = await call(["check", "evidence", "--change", CHANGE], root);

    expect(exitCode).toBe(1);
  });

  it("каталог без репозитория даёт код 2", async () => {
    const plain = createPlainWorkspace({ "lexforge/config.yaml": CONFIG, ...CHANGE_FILES });
    created.push(plain);

    const { exitCode, capture } = await call(["check", "evidence", "--change", CHANGE], plain.root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("git init");
    expect(capture.out).toBe("");
  });

  it("неизвестная метка в --require даёт код 2", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["check", "evidence", "--change", CHANGE, "--require", "tets"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("tets");
    expect(capture.err).toContain("tests");
    expect(capture.out).toBe("");
  });

  it("флаг-послабление даёт код 2 и печать поддерживаемых флагов", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(
      ["check", "evidence", "--change", CHANGE, "--allow-stale"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("--allow-stale");
    expect(capture.err).toContain("--require");
    expect(capture.out).toBe("");
  });
});

describe("lexforge check: список подкоманд", () => {
  it("группа без подкоманды называет и plan, и evidence", async () => {
    const root = workspace().root;

    const { exitCode, capture } = await call(["check"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("evidence");
    expect(capture.err).toContain(CHECK_EVIDENCE_DESCRIPTION);
  });
});
