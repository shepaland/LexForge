import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { recordEvidence } from "../../../src/core/gates/evidence-record.js";
import { readLedger } from "../../../src/core/gates/evidence-store.js";
import { readHead } from "../../../src/core/git/repository.js";
import { worktreeDigest } from "../../../src/core/git/worktree-digest.js";
import { createCapture } from "../../helpers/capture.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";

const CHANGE = "add-auth";
const LEDGER_PATH = `lexforge/changes/${CHANGE}/evidence.json`;

const CONFIG = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
  lint: node -e "process.exit(1)"
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

export function gitWorkspace(config = CONFIG): GitWorkspace {
  const workspace = createGitWorkspace({ "lexforge/config.yaml": config, ...CHANGE_FILES });
  created.push(workspace);
  return workspace;
}

async function record(root: string, label: string) {
  const capture = createCapture();
  const result = await recordEvidence({
    cwd: root,
    change: CHANGE,
    label,
    stdout: capture.stdout,
    stderr: capture.stderr,
  });
  return { result, capture };
}

describe("recordEvidence: зелёный прогон", () => {
  it("кладёт запись с командой из конфигурации, кодом 0, коммитом и отпечатком дерева", async () => {
    const workspace = gitWorkspace();

    const { result } = await record(workspace.root, "tests");

    expect(result.exitCode).toBe(0);
    expect(result.data.record.command).toBe('node -e "process.exit(0)"');
    expect(result.data.record.exitCode).toBe(0);
    expect(result.data.record.head).toBe(readHead(workspace.root));
    expect(result.data.record.head).toBe(workspace.head);
    expect(result.data.record.worktreeDigest).toBe(worktreeDigest(workspace.root));

    const stored = readLedger(workspace.root, CHANGE).records.tests;

    expect(stored).toEqual(result.data.record);
  });
});

describe("recordEvidence: красный прогон", () => {
  it("команда с кодом 1 пишет штамп с кодом 1 и даёт одну находку evidence-run-failed", async () => {
    const workspace = gitWorkspace();

    const { result } = await record(workspace.root, "lint");

    expect(result.exitCode).toBe(1);
    expect(result.data.record.exitCode).toBe(1);
    expect(readLedger(workspace.root, CHANGE).records.lint!.exitCode).toBe(1);
    expect(result.data.findings).toHaveLength(1);
    expect(result.data.findings[0]!.rule).toBe("evidence-run-failed");
    expect(result.data.findings[0]!.level).toBe("error");
    expect(result.data.findings[0]!.message).toContain("lint");
  });
});

const WITH_MISSING_BINARY = `schema: spec-driven
verification:
  tests: node -e "process.exit(0)"
  ghost: lexforge-no-such-binary-here --run
`;

describe("recordEvidence: команда не запустилась", () => {
  it("несуществующий исполняемый файл даёт evidence-command-failed", async () => {
    const workspace = gitWorkspace(WITH_MISSING_BINARY);
    await record(workspace.root, "tests");
    const before = readFileSync(join(workspace.root, LEDGER_PATH), "utf8");

    let error: unknown;
    try {
      await record(workspace.root, "ghost");
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).code).toBe("evidence-command-failed");
    expect((error as UsageError).message).toContain("ghost");
    expect((error as UsageError).message).toContain("lexforge-no-such-binary-here");
    expect(readFileSync(join(workspace.root, LEDGER_PATH), "utf8")).toBe(before);
  });
});

const WITHOUT_VERIFICATION = "schema: spec-driven\n";

describe("recordEvidence: метка не описана", () => {
  it("метки e2e нет в разделе: перечисляет описанные метки и печатает строки YAML", async () => {
    const workspace = gitWorkspace();

    let error: unknown;
    try {
      await record(workspace.root, "e2e");
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).code).toBe("label-unknown");
    expect((error as UsageError).message).toContain("lint");
    expect((error as UsageError).message).toContain("tests");
    expect((error as UsageError).message).toContain("verification:");
    expect((error as UsageError).message).toContain("e2e: <command that runs this check>");
  });

  it("пустой раздел verification даёт печать примера раздела целиком", async () => {
    const workspace = gitWorkspace(WITHOUT_VERIFICATION);

    let error: unknown;
    try {
      await record(workspace.root, "tests");
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).code).toBe("label-unknown");
    expect((error as UsageError).message).toContain("verification:");
    expect((error as UsageError).message).toContain("tests: npm test");
    expect((error as UsageError).message).toContain("lint: npm run lint");
  });

  it("неописанная метка проверяется до запуска команды", async () => {
    const workspace = gitWorkspace();

    await expect(record(workspace.root, "e2e")).rejects.toBeInstanceOf(UsageError);
    expect(existsSync(join(workspace.root, LEDGER_PATH))).toBe(false);
  });
});

const SECRET_NAME = "LEXFORGE_TEST_TOKEN";
const SECRET_VALUE = "secret-token-42";

describe("recordEvidence: окружение в файл не попадает", () => {
  it("переменная окружения с токеном не оставляет ни имени, ни значения", async () => {
    const workspace = gitWorkspace();
    process.env[SECRET_NAME] = SECRET_VALUE;

    try {
      await record(workspace.root, "tests");
    } finally {
      delete process.env[SECRET_NAME];
    }

    const text = readFileSync(join(workspace.root, LEDGER_PATH), "utf8");

    expect(text).not.toContain(SECRET_VALUE);
    expect(text).not.toContain(SECRET_NAME);
  });
});
