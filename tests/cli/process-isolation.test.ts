import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { writeInstallation } from "../helpers/install-skills.js";
import { BIN_PATH, runCli } from "../helpers/run-cli.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const run = promisify(execFile);

const TESTS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUB_PATH = path.join(TESTS_ROOT, "helpers", "registry-stub.mjs");
const SELF = fileURLToPath(import.meta.url);
const NPM_HELPER = path.join(TESTS_ROOT, "helpers", "npm.ts");

const EXPECTED = "\n`tests/helpers/registry-stub.mjs` does not exist\n";

const FETCH_SCRIPT = [
  'fetch("https://registry.npmjs.org/lexforge/latest")',
  "  .then((response) => response.json())",
  "  .then((body) => console.log(body.version))",
  '  .catch(() => console.log("rejected"));',
].join("\n");

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function typeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : typeScriptFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** True when the file starts the CLI as a process: through `npxCall` or by `BIN_PATH` handed to a spawn. */
function startsCli(source: string): boolean {
  return (
    source.includes("npxCall(") ||
    /\b(execFile|spawn|spawnSync)\s*\([^)]*BIN_PATH/s.test(source)
  );
}

describe("процессы CLI в тестах", () => {
  it("каждый файл, что запускает CLI процессом, подключает registry-stub", () => {
    const missing = typeScriptFiles(TESTS_ROOT)
      .filter((file) => file !== NPM_HELPER && file !== SELF)
      .filter((file) => startsCli(readFileSync(file, "utf8")))
      .filter((file) => !readFileSync(file, "utf8").includes("registry-stub"))
      .map((file) => path.relative(TESTS_ROOT, file));

    expect(missing).toEqual([]);
  });

  it("заглушка отвечает версией из LEXFORGE_TEST_LATEST", async () => {
    expect(existsSync(STUB_PATH), EXPECTED).toBe(true);

    const preload = `--import=${pathToFileURL(STUB_PATH).href}`;
    const result = await run(process.execPath, [preload, "-e", FETCH_SCRIPT], {
      env: { ...process.env, LEXFORGE_TEST_LATEST: "9.9.9" },
    });

    expect(result.stdout.trim()).toBe("9.9.9");
  });

  it("без LEXFORGE_TEST_LATEST заглушка отклоняет запрос", async () => {
    expect(existsSync(STUB_PATH), EXPECTED).toBe(true);

    const preload = `--import=${pathToFileURL(STUB_PATH).href}`;
    const env = { ...process.env };
    delete env.LEXFORGE_TEST_LATEST;
    const result = await run(process.execPath, [preload, "-e", FETCH_SCRIPT], { env });

    expect(result.stdout.trim()).toBe("rejected");
  });

  it("doctor --json в свежем рабочем каталоге не печатает путей из настоящего домашнего", async () => {
    const realHome = process.env.HOME ?? process.env.USERPROFILE ?? "";
    expect(realHome).not.toBe("");

    const dir = makeWorkspace();
    created.push(dir);

    const result = await runCli(["doctor", "--json"], { cwd: dir });
    // The repository itself may sit under the real home; its entry point is not a home-directory scan.
    const output = (result.stdout + result.stderr).split(BIN_PATH).join("<bin>");

    expect(output).not.toContain(realHome);
  });

  it("doctor --json не видит устаревшую установку в домашнем каталоге родителя", async () => {
    const staleHome = mkdtempSync(path.join(os.tmpdir(), "lexforge-stale-home-"));
    const savedHome = process.env.HOME;
    const savedProfile = process.env.USERPROFILE;
    const dir = makeWorkspace();
    created.push(dir);

    try {
      writeInstallation(staleHome, "claude", { scope: "user", version: "0.0.1", skills: ["lexforge"] });
      process.env.HOME = staleHome;
      process.env.USERPROFILE = staleHome;

      const result = await runCli(["doctor", "--json"], { cwd: dir });
      const output = result.stdout + result.stderr;
      const ids = [...result.stdout.matchAll(/"id":\s*"([^"]+)"/g)].map((match) => match[1]);

      expect(ids, "\ndoctor did not report the skills check\n").toContain("skills");
      expect(output, "\nthe child process read the parent's home directory\n").not.toContain(
        path.basename(staleHome),
      );
      expect(output).not.toContain("skills-version-mismatch");
      expect(output).not.toContain("0.0.1");
    } finally {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
      if (savedProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = savedProfile;
      rmSync(staleHome, { recursive: true, force: true });
    }
  });

  it("runCli отклоняется и не оставляет временный домашний каталог, когда execFile бросает до запуска", async () => {
    const keys = ["TMPDIR", "TEMP", "TMP"] as const;
    const saved = keys.map((key) => process.env[key]);
    const fresh = mkdtempSync(path.join(os.tmpdir(), "lexforge-tmp-probe-"));

    try {
      for (const key of keys) process.env[key] = fresh;

      await expect(runCli(["doctor"], { cwd: 5 as unknown as string })).rejects.toThrow();

      expect(readdirSync(fresh)).toEqual([]);
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});
