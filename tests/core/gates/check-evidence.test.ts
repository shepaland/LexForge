import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { checkEvidence } from "../../../src/core/gates/check-evidence.js";
import { recordEvidence } from "../../../src/core/gates/evidence-record.js";
import { readLedger } from "../../../src/core/gates/evidence-store.js";
import { worktreeDigest } from "../../../src/core/git/worktree-digest.js";
import { createCapture } from "../../helpers/capture.js";
import {
  commitAll,
  createGitWorkspace,
  writeAt,
  type GitWorkspace,
} from "../../helpers/git-workspace.js";

const CHANGE = "add-auth";

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
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

function workspace(config = CONFIG): GitWorkspace {
  const made = createGitWorkspace({ "lexforge/config.yaml": config, ...CHANGE_FILES });
  created.push(made);
  return made;
}

async function record(root: string, label: string): Promise<void> {
  const capture = createCapture();
  await recordEvidence({
    cwd: root,
    change: CHANGE,
    label,
    stdout: capture.stdout,
    stderr: capture.stderr,
  });
}

function stateOf(root: string, label: string, require?: string) {
  const result = checkEvidence({ cwd: root, change: CHANGE, require });
  const found = result.data.labels.find((item) => item.label === label);
  return { result, state: found?.state };
}

function editApp(root: string): void {
  const file = path.join(root, "src/app.ts");
  writeAt(root, "src/app.ts", `${readFileSync(file, "utf8")}// one more line\n`);
}

describe("checkEvidence: полный круг", () => {
  it("после записи метка свежая и код 0", async () => {
    const root = workspace().root;
    await record(root, "tests");

    const { result, state } = stateOf(root, "tests");

    expect(state).toBe("fresh");
    expect(result.exitCode).toBe(0);
    expect(result.data.findings).toEqual([]);
  });

  it("после правки файла метка в состоянии stale-worktree и код 1", async () => {
    const root = workspace().root;
    await record(root, "tests");

    editApp(root);
    const { result, state } = stateOf(root, "tests");

    expect(state).toBe("stale-worktree");
    expect(result.exitCode).toBe(1);
    expect(result.data.findings).toHaveLength(1);
    expect(result.data.findings[0]!.rule).toBe("evidence-not-fresh");
  });

  it("после коммита правки метка в состоянии stale-commit", async () => {
    const root = workspace().root;
    await record(root, "tests");

    editApp(root);
    commitAll(root, "second commit");
    const { result, state } = stateOf(root, "tests");

    expect(state).toBe("stale-commit");
    expect(result.exitCode).toBe(1);
  });
});

const TWO_LABELS = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
  lint: node -e "process.exit(0)"
`;

describe("checkEvidence: список меток", () => {
  it("без --require проверяются обе метки конфигурации", async () => {
    const root = workspace(TWO_LABELS).root;
    await record(root, "tests");

    const result = checkEvidence({ cwd: root, change: CHANGE });

    expect(result.data.labels.map((item) => item.label)).toEqual(["lint", "tests"]);
    expect(result.data.summary).toEqual({ checked: 2, fresh: 1 });
    expect(result.exitCode).toBe(1);
  });

  it("с --require tests состояние метки lint на код возврата не влияет", async () => {
    const root = workspace(TWO_LABELS).root;
    await record(root, "tests");

    const result = checkEvidence({ cwd: root, change: CHANGE, require: "tests" });

    expect(result.data.labels.map((item) => item.label)).toEqual(["tests"]);
    expect(result.data.summary).toEqual({ checked: 1, fresh: 1 });
    expect(result.exitCode).toBe(0);
  });

  it("метки списка разбираются через запятую", async () => {
    const root = workspace(TWO_LABELS).root;
    await record(root, "tests");
    await record(root, "lint");

    const result = checkEvidence({ cwd: root, change: CHANGE, require: "tests, lint" });

    expect(result.data.labels.map((item) => item.label)).toEqual(["lint", "tests"]);
    expect(result.exitCode).toBe(0);
  });
});

const WITHOUT_VERIFICATION = "schema: spec-driven\n";

function thrownBy(action: () => unknown): UsageError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return error as UsageError;
  }

  throw new Error("the call was expected to fail and did not");
}

describe("checkEvidence: проверять нечего", () => {
  it('--require "" даёт require-empty и называет описанные метки', () => {
    const root = workspace(TWO_LABELS).root;

    const error = thrownBy(() => checkEvidence({ cwd: root, change: CHANGE, require: "" }));

    expect(error.code).toBe("require-empty");
    expect(error.message).toContain("tests");
    expect(error.message).toContain("lint");
  });

  it("пустой раздел verification без флага даёт отказ с примером раздела", () => {
    const root = workspace(WITHOUT_VERIFICATION).root;

    const error = thrownBy(() => checkEvidence({ cwd: root, change: CHANGE }));

    expect(error.message).toContain("verification:");
    expect(error.message).toContain("tests: npm test");
    expect(error.message).toContain("lint: npm run lint");
  });
});

describe("checkEvidence: метка из --require обязана быть описанной", () => {
  it("опечатка в метке даёт label-unknown с неизвестной меткой и списком описанных", () => {
    const root = workspace(TWO_LABELS).root;

    const error = thrownBy(() => checkEvidence({ cwd: root, change: CHANGE, require: "tets" }));

    expect(error.code).toBe("label-unknown");
    expect(error.message).toContain("tets");
    expect(error.message).toContain("tests");
    expect(error.message).toContain("lint");
  });

  it("метка проверяется до чтения журнала", () => {
    const root = workspace(TWO_LABELS).root;
    writeAt(root, `lexforge/changes/${CHANGE}/evidence.json`, "<<<<<<< HEAD\n");

    const error = thrownBy(() => checkEvidence({ cwd: root, change: CHANGE, require: "tets" }));

    expect(error.code).toBe("label-unknown");
  });
});

describe("checkEvidence: поле labels", () => {
  it("несёт по элементу на каждую проверяемую метку, включая свежие", async () => {
    const root = workspace(TWO_LABELS).root;
    await record(root, "tests");

    const { labels, summary } = checkEvidence({ cwd: root, change: CHANGE }).data;
    const fresh = labels.find((item) => item.label === "tests")!;
    const missing = labels.find((item) => item.label === "lint")!;

    expect(Object.keys(fresh).sort()).toEqual([
      "command",
      "head",
      "label",
      "recordedAt",
      "state",
    ]);
    expect(fresh.state).toBe("fresh");
    expect(fresh.command).toBe('node -e "process.exit(0)"');
    expect(fresh.head).toMatch(/^[0-9a-f]{40}$/);
    expect(fresh.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(missing.state).toBe("missing");
    expect(missing.head).toBeNull();
    expect(missing.recordedAt).toBeNull();

    expect(summary).toEqual({ checked: 2, fresh: 1 });
  });
});

describe("checkEvidence: согласие записи и проверки", () => {
  it("запись и проверка подряд без правок дают совпадающий отпечаток", async () => {
    const root = workspace().root;
    await record(root, "tests");

    const stamped = readLedger(root, CHANGE).records.tests!.worktreeDigest;
    const result = checkEvidence({ cwd: root, change: CHANGE });

    expect(stamped).toBe(worktreeDigest(root));
    expect(result.data.labels[0]!.state).toBe("fresh");
    expect(result.exitCode).toBe(0);
  });
});
