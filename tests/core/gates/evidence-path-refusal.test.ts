import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkEvidence } from "../../../src/core/gates/check-evidence.js";
import { recordEvidence } from "../../../src/core/gates/evidence-record.js";
import { createCapture } from "../../helpers/capture.js";
import { createGitWorkspace, type GitWorkspace } from "../../helpers/git-workspace.js";

const CHANGE = "add-auth";
const DIR = `lexforge/changes/${CHANGE}`;
const RETRY = `lexforge evidence record --change ${CHANGE} --label tests`;

const created: GitWorkspace[] = [];

afterEach(() => {
  while (created.length > 0) created.pop()!.remove();
});

function workspace(): GitWorkspace {
  const made = createGitWorkspace({
    "lexforge/config.yaml": 'schema: spec-driven\nverification:\n  tests: node -e "process.exit(0)"\n',
    [`${DIR}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${DIR}/proposal.md`]: "## Why\n\nPasswords are stored in the open.\n",
  });
  created.push(made);
  return made;
}

async function record(root: string): Promise<void> {
  const capture = createCapture();
  await recordEvidence({ cwd: root, change: CHANGE, label: "tests", stdout: capture.stdout, stderr: capture.stderr });
}

function caught(run: () => unknown): { code?: string; nextStep?: string } {
  try {
    run();
  } catch (error) {
    return error as { code?: string; nextStep?: string };
  }
  throw new Error("expected a refusal");
}

describe("отказ по небезопасному пути журнала несёт исполнимый следующий шаг", () => {
  it("check evidence на журнале с путём вне проекта предлагает перезаписать штамп метки", async () => {
    const root = workspace().root;
    await record(root);
    const file = path.join(root, DIR, "evidence.json");
    const ledger = JSON.parse(readFileSync(file, "utf8"));
    ledger.records.tests.log = "../outside.log";
    writeFileSync(file, JSON.stringify(ledger));

    const error = caught(() => checkEvidence({ cwd: root, change: CHANGE }));

    expect(error.code).toBe("execution-invalid");
    expect(error.nextStep).toBe(RETRY);
  });

  it("evidence record с каталогом журналов-ссылкой предлагает повторить запись после правки", async () => {
    const root = workspace().root;
    const elsewhere = path.join(root, "elsewhere");
    mkdirSync(elsewhere);
    mkdirSync(path.join(root, DIR, "execution"), { recursive: true });
    symlinkSync(elsewhere, path.join(root, DIR, "execution", "logs"));

    const error = await record(root).then(
      () => ({}) as { code?: string; nextStep?: string },
      (failure: { code?: string; nextStep?: string }) => failure,
    );

    expect(error.code).toBe("execution-invalid");
    expect(error.nextStep).toBe(RETRY);
  });
});
