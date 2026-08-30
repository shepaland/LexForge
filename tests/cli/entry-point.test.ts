import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error the entry point ships as plain JavaScript: it runs before the build exists.
import { nodeVersionFinding } from "../../bin/runtime-check.js";
import { BIN_PATH } from "../helpers/run-cli.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

/** Makes this process report an old Node, so the check sees what a user on Node 18 sees. */
const OLD_NODE = 'Object.defineProperty(process.versions, "node", { value: "18.20.0" });\n';

const PACKAGE_ROOT = path.dirname(path.dirname(BIN_PATH));

const created: string[] = [];

function tempDir(files: Record<string, string> = {}): string {
  const dir = makeWorkspace(files);
  created.push(dir);
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

/** A package that carries the entry point and the manifest, but no build. */
function packageWithoutBuild(engines = ">=20.19.0"): string {
  const dir = tempDir();

  cpSync(path.join(PACKAGE_ROOT, "bin"), path.join(dir, "bin"), { recursive: true });
  copyFileSync(path.join(PACKAGE_ROOT, "package.json"), path.join(dir, "package.json"));

  const manifest = JSON.parse(
    readFileSync(path.join(dir, "package.json"), "utf8"),
  ) as Record<string, unknown>;

  manifest.engines = { node: engines };
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest, null, 2), "utf8");

  return dir;
}

describe("сверка версии рантайма", () => {
  it("на старой версии называет требуемую и текущую", () => {
    const finding = nodeVersionFinding("18.20.0", ">=20.19.0");

    expect(finding).toContain("20.19.0");
    expect(finding).toContain("18.20.0");
  });

  it("на подходящей версии не даёт находки", () => {
    expect(nodeVersionFinding("22.1.0", ">=20.19.0")).toBeUndefined();
  });
});

describe("точка входа на неподходящем рантайме", () => {
  it("печатает одну строку в поток ошибок и даёт код 2", () => {
    const dir = tempDir({ "old-node.mjs": OLD_NODE });
    const preload = pathToFileURL(path.join(dir, "old-node.mjs")).href;

    const result = spawnSync(process.execPath, [`--import=${preload}`, BIN_PATH], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr.trimEnd().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("18.20.0");
    expect(result.stderr).toContain("20.19.0");
  });
});

describe("точка входа без сборки", () => {
  it("печатает одну строку с командой сборки и даёт код 2", () => {
    const dir = packageWithoutBuild();

    const result = spawnSync(process.execPath, [path.join(dir, "bin", "lexforge.js")], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr.trimEnd().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("npm run build");
  });
});

describe("требуемая версия рантайма", () => {
  it("читается из package.json, а не задана вторым значением в коде", () => {
    const dir = packageWithoutBuild(">=99.0.0");

    const result = spawnSync(process.execPath, [path.join(dir, "bin", "lexforge.js")], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("99.0.0");
    expect(result.stderr).toContain(process.versions.node);
  });

  it("не повторена числом в файле точки входа", () => {
    const source = readFileSync(path.join(PACKAGE_ROOT, "bin", "lexforge.js"), "utf8");

    expect(source).not.toMatch(/\d+\.\d+\.\d+/);
    expect(source).toContain("package.json");
  });
});
