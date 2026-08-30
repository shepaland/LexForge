import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, readdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Everything the `files` field of package.json promises to ship. */
const SHIPPED = [
  "bin/lexforge.js",
  "dist/cli/run.js",
  "schemas/spec-driven/schema.yaml",
  "schemas/bounded/schema.yaml",
  "schemas/spec-driven/templates/proposal.md",
  "schemas/spec-driven/templates/spec.md",
  "schemas/spec-driven/templates/design.md",
  "schemas/spec-driven/templates/tasks.md",
  "schemas/bounded/templates/proposal.md",
  "schemas/bounded/templates/spec.md",
  "schemas/bounded/templates/tasks.md",
];

/** The skills the package installs into a project: five planning, four implementation. */
const SKILL_NAMES = [
  "lexforge",
  "lexforge-apply",
  "lexforge-archive",
  "lexforge-debug",
  "lexforge-design",
  "lexforge-plan",
  "lexforge-propose",
  "lexforge-spec",
  "lexforge-verify",
];

/** Material a skill body links to instead of carrying it: it ships with the skill. */
const SKILL_FILES = ["lexforge-apply/reviewer-prompt.md"];

/** Traces of development: the archive is read by a machine that never builds this package. */
const FORBIDDEN = ["tests", "openspec", "docs", ".claude", "node_modules", "src"];

const created: string[] = [];
let tarball = "";
let unpacked = "";

function tempDir(): string {
  const dir = makeWorkspace();
  created.push(dir);
  return dir;
}

beforeAll(() => {
  const destination = tempDir();

  const output = execFileSync(
    "npm",
    ["pack", "--pack-destination", destination, "--loglevel", "error"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );

  tarball = path.join(destination, output.trim().split("\n").at(-1)!);

  unpacked = tempDir();
  execFileSync("tar", ["-xf", tarball, "-C", unpacked], { encoding: "utf8" });
}, 180_000);

afterAll(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

describe("состав пакета", () => {
  it("tarball собирается", () => {
    expect(existsSync(tarball)).toBe(true);
  });

  it("несёт точку входа, сборку, описания схем и семь шаблонов", () => {
    const root = path.join(unpacked, "package");

    for (const entry of SHIPPED) {
      expect(existsSync(path.join(root, entry)), entry).toBe(true);
    }

    const templates = [
      ...readdirSync(path.join(root, "schemas", "spec-driven", "templates")),
      ...readdirSync(path.join(root, "schemas", "bounded", "templates")),
    ];

    expect(templates).toHaveLength(7);
  });

  it("несёт девять файлов скиллов и шаблон задания ревьюеру", () => {
    const root = path.join(unpacked, "package");

    for (const name of SKILL_NAMES) {
      expect(existsSync(path.join(root, "skills", name, "SKILL.md")), name).toBe(true);
    }

    for (const file of SKILL_FILES) {
      expect(existsSync(path.join(root, "skills", file)), file).toBe(true);
    }

    expect(readdirSync(path.join(root, "skills")).sort()).toEqual(SKILL_NAMES);
  });
});

describe("состав пакета, журнал изменений", () => {
  it("несёт CHANGELOG.md в корне архива", () => {
    expect(existsSync(path.join(unpacked, "package", "CHANGELOG.md"))).toBe(true);
  });
});

describe("состав пакета, следы разработки", () => {
  it("не несёт каталогов разработки", () => {
    const root = path.join(unpacked, "package");

    for (const entry of FORBIDDEN) {
      expect(existsSync(path.join(root, entry)), entry).toBe(false);
    }
  });

  it("не несёт карт кода и файлов деклараций", () => {
    const root = path.join(unpacked, "package");
    const unwanted = walk(path.join(root, "dist")).filter(
      (file) => file.endsWith(".js.map") || file.endsWith(".d.ts"),
    );

    expect(unwanted).toEqual([]);
  });
});

describe("сборка перед упаковкой", () => {
  it(
    "упаковка без каталога dist даёт архив со сборкой",
    () => {
      const copy = tempDir();

      // A copy of the sources without `dist/`: the packing has to build them
      // itself. `node_modules` is linked, not copied — the build needs the
      // compiler, and copying a tree of that size proves nothing.
      for (const entry of ["src", "bin", "schemas", "skills"]) {
        cpSync(path.join(REPO_ROOT, entry), path.join(copy, entry), { recursive: true });
      }
      for (const file of ["package.json", "tsconfig.json", "CHANGELOG.md", "README.md"]) {
        copyFileSync(path.join(REPO_ROOT, file), path.join(copy, file));
      }
      symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(copy, "node_modules"));

      expect(existsSync(path.join(copy, "dist"))).toBe(false);

      const destination = tempDir();
      const output = execFileSync(
        "npm",
        ["pack", "--pack-destination", destination, "--loglevel", "error"],
        { cwd: copy, encoding: "utf8" },
      );

      const archive = path.join(destination, output.trim().split("\n").at(-1)!);
      const opened = tempDir();
      execFileSync("tar", ["-xf", archive, "-C", opened], { encoding: "utf8" });

      expect(existsSync(path.join(opened, "package", "dist", "cli", "run.js"))).toBe(true);
    },
    300_000,
  );
});

describe("установка в чужой проект", () => {
  it(
    "поставленный пакет проходит init, new change и status",
    () => {
      const project = tempDir();

      const install = spawnSync(
        "npm",
        ["install", tarball, "--no-audit", "--no-fund", "--loglevel", "error"],
        { cwd: project, encoding: "utf8" },
      );
      expect(install.stderr).toBe("");
      expect(install.status).toBe(0);

      const calls = [
        ["lexforge", "init"],
        ["lexforge", "new", "change", "smoke"],
        ["lexforge", "status", "--change", "smoke", "--json"],
      ];

      const results = calls.map((argv) =>
        spawnSync("npx", argv, { cwd: project, encoding: "utf8" }),
      );

      for (const [index, result] of results.entries()) {
        expect(result.status, `${calls[index]!.join(" ")} → ${result.stderr}`).toBe(0);
      }

      const data = JSON.parse(results.at(-1)!.stdout) as {
        outputVersion: number;
        change: string;
      };

      expect(data.outputVersion).toBe(1);
      expect(data.change).toBe("smoke");
    },
    300_000,
  );

  it(
    "init со списком инструментов раскладывает девять скиллов по каталогу агента",
    () => {
      const project = tempDir();

      const install = spawnSync(
        "npm",
        ["install", tarball, "--no-audit", "--no-fund", "--loglevel", "error"],
        { cwd: project, encoding: "utf8" },
      );
      expect(install.status).toBe(0);

      const result = spawnSync("npx", ["lexforge", "init", "--tools", "claude"], {
        cwd: project,
        encoding: "utf8",
      });

      expect(result.status, result.stderr).toBe(0);
      expect(readdirSync(path.join(project, ".claude", "skills")).sort()).toEqual(SKILL_NAMES);
    },
    300_000,
  );
});

/** Every file under a directory, as paths relative to it. */
function walk(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(path.join(dir, entry.name), relative));
    } else {
      found.push(relative);
    }
  }

  return found;
}
