import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../../src/cli/run.js";
import { packageVersion } from "../../src/core/package-info.js";
import type { OutputStream } from "../../src/core/types.js";
import { createCapture } from "../helpers/capture.js";
import { createGitWorkspace, git, type GitWorkspace } from "../helpers/git-workspace.js";

// The newlines put the message on a line of its own, so a red run is matched by that line whole.
const EXPECTED = "\n`new change` creates the change while npm reports 99.0.0\n";

const created: GitWorkspace[] = [];
const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

afterEach(() => {
  if (stdinTty) Object.defineProperty(process.stdin, "isTTY", stdinTty);
  else delete (process.stdin as { isTTY?: boolean }).isTTY;
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function workspace(): GitWorkspace {
  const made = createGitWorkspace();
  created.push(made);
  return made;
}

function changeExists(root: string): boolean {
  return existsSync(path.join(root, "lexforge/changes/add-auth"));
}

async function newChange(
  root: string,
  fetchLatestVersion: () => Promise<string>,
  extra: { checkForUpdate?: () => Promise<never> } = {},
  terminal = false,
) {
  const capture = createCapture();
  let stdout: OutputStream = capture.stdout;
  if (terminal) {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    stdout = Object.assign({}, capture.stdout, { isTTY: true }) as OutputStream;
  }
  const exitCode = await run(["new", "change", "add-auth", "--json"], {
    cwd: root,
    stdout,
    stderr: capture.stderr,
    fetchLatestVersion,
    ...extra,
  } as Parameters<typeof run>[1]);
  return { exitCode, capture };
}

describe("шлюз обновления на lexforge new change", () => {
  it("npm держит 99.0.0: отказ update-available, ни каталога, ни ветки", async () => {
    const made = workspace();

    const { exitCode, capture } = await newChange(made.root, async () => "99.0.0");

    expect(exitCode, EXPECTED).toBe(2);
    const error = (JSON.parse(capture.out) as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("update-available");
    expect(error.message).toContain(packageVersion());
    expect(error.message).toContain("99.0.0");
    expect(error.message).toContain("npm install -g lexforge@latest");
    expect(changeExists(made.root)).toBe(false);
    expect(git(made.root, "branch", "--list", "feature/add-auth")).toBe("");
  });

  it("npm на запущенной версии: change создан, код 0", async () => {
    const made = workspace();

    const { exitCode } = await newChange(made.root, async () => packageVersion());

    expect(exitCode, EXPECTED).toBe(0);
    expect(changeExists(made.root)).toBe(true);
  });

  it("запрос к npm упал: change создан, код 0", async () => {
    const made = workspace();

    const { exitCode } = await newChange(made.root, () => Promise.reject(new Error("offline")));

    expect(exitCode, EXPECTED).toBe(0);
    expect(changeExists(made.root)).toBe(true);
  });

  it("ответ npm без версии: change создан, код 0", async () => {
    const made = workspace();

    const { exitCode } = await newChange(
      made.root,
      (async () => undefined) as unknown as () => Promise<string>,
    );

    expect(exitCode, EXPECTED).toBe(0);
    expect(changeExists(made.root)).toBe(true);
  });

  it("npm не отвечает: change создан ровно через три секунды", async () => {
    const made = workspace();
    const capture = createCapture();
    let fetched!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      fetched = resolve;
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const pending = run(["new", "change", "add-auth", "--json"], {
        cwd: made.root,
        stdout: capture.stdout,
        stderr: capture.stderr,
        fetchLatestVersion: () => {
          fetched();
          return new Promise<string>(() => undefined);
        },
      } as Parameters<typeof run>[1]);
      await fetchStarted;

      await vi.advanceTimersByTimeAsync(2_999);
      expect(changeExists(made.root), EXPECTED).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(await pending, EXPECTED).toBe(0);
      expect(changeExists(made.root)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("терминал и --json: checkForUpdate не зовётся, отказ update-available", async () => {
    const made = workspace();
    const checkForUpdate = vi.fn(() => Promise.reject(new Error("must not be called")));

    const { exitCode, capture } = await newChange(
      made.root,
      async () => "99.0.0",
      { checkForUpdate },
      true,
    );

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(exitCode, EXPECTED).toBe(2);
    expect((JSON.parse(capture.out) as { error: { code: string } }).error.code).toBe(
      "update-available",
    );
  });

  it("status --json без терминала не зовёт fetchLatestVersion", async () => {
    const made = workspace();
    const fetchLatestVersion = vi.fn(async () => "99.0.0");
    const capture = createCapture();

    const exitCode = await run(["status", "--json"], {
      cwd: made.root,
      stdout: capture.stdout,
      stderr: capture.stderr,
      fetchLatestVersion,
    } as Parameters<typeof run>[1]);

    expect(fetchLatestVersion).not.toHaveBeenCalled();
    expect(exitCode).toBe(0);
    expect((JSON.parse(capture.out) as { outputVersion: number }).outputVersion).toBe(1);
  });
});
