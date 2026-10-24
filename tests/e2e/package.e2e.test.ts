import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { commitAll, git } from "../helpers/git-workspace.js";
import { npmCall, npxCall, runProcess } from "../helpers/npm.js";
import { STUB_PRELOAD } from "../helpers/run-cli.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The marker sits on a line of its own so that a RED run can match the whole line. */
const EXPECTED = "\nThe archive does not carry the engineering rules\n";

/** The rule files and the guide the archive has to carry. */
const RULE_FILES = [
  "rules/backend.md",
  "rules/frontend.md",
  "rules/testing.md",
  "rules/review.md",
  "rules/node.md",
  "rules/python.md",
  "rules/jvm.md",
  "rules/go.md",
  "rules/dotnet.md",
  "rules/php.md",
  "rules/ruby.md",
  "rules/rust.md",
  "rules/react.md",
  "rules/vue.md",
  "rules/angular.md",
  "rules/svelte.md",
  "docs/engineering-rules.md",
];

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
  ...RULE_FILES,
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
const SKILL_FILES = [
  "lexforge-apply/reviewer-prompt.md",
  "lexforge-apply/executor-prompt.md",
  "lexforge-apply/final-review-prompt.md",
  "lexforge-apply/parallel.md",
  "lexforge-plan/plan-reviewer-prompt.md",
  "lexforge-plan/digest.md",
  "lexforge-spec/data-and-services.md",
];

/** Traces of development: the archive is read by a machine that never builds this package. */
const FORBIDDEN = ["tests", "openspec", ".claude", "node_modules", "src"];

const created: string[] = [];
/** Собран один раз на весь прогон: см. `tests/e2e/pack-tarball.ts`. */
const tarball = inject("tarball");
let unpacked = "";

function tempDir(): string {
  const dir = makeWorkspace();
  created.push(dir);
  return dir;
}

/**
 * The environment of one lexforge call: the registry-stub preload and a throwaway home.
 * `npm install` calls keep the plain environment, or the stub would break the download.
 */
function lexforgeEnv(): NodeJS.ProcessEnv {
  const home = tempDir();
  return { ...process.env, NODE_OPTIONS: `--import=${STUB_PRELOAD}`, HOME: home, USERPROFILE: home };
}

beforeAll(() => {
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
      expect(existsSync(path.join(root, entry)), RULE_FILES.includes(entry) ? `${EXPECTED}${entry}` : entry).toBe(true);
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

describe("состав пакета, побайтная сверка с репозиторием", () => {
  /** Каталоги, которые упаковка копирует как есть: собранного кода среди них нет. */
  const COPIED = ["bin", "schemas", "skills", "rules"];

  it("каждый поставленный файл совпадает с файлом репозитория побайтно", () => {
    const root = path.join(unpacked, "package");
    const differing: string[] = [];
    let compared = 0;

    for (const directory of COPIED) {
      for (const relative of walk(path.join(root, directory))) {
        const entry = path.join(directory, relative);
        const shipped = readFileSync(path.join(root, entry));
        const repository = path.join(REPO_ROOT, entry);
        compared += 1;

        if (!existsSync(repository) || !shipped.equals(readFileSync(repository))) {
          differing.push(entry);
        }
      }
    }

    expect(readFileSync(path.join(root, "CHANGELOG.md")), "CHANGELOG.md").toEqual(
      readFileSync(path.join(REPO_ROOT, "CHANGELOG.md")),
    );
    expect(readFileSync(path.join(root, "docs", "engineering-rules.md")), "docs/engineering-rules.md").toEqual(
      readFileSync(path.join(REPO_ROOT, "docs", "engineering-rules.md")),
    );
    expect(differing).toEqual([]);
    expect(compared).toBeGreaterThan(SKILL_NAMES.length);
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

  it("несёт в каталоге docs только руководство по инженерным правилам", () => {
    const root = path.join(unpacked, "package");

    const docs = path.join(root, "docs");

    expect(existsSync(docs) ? readdirSync(docs) : [], EXPECTED).toEqual(["engineering-rules.md"]);
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
    async () => {
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
      // Junction, а не символическая ссылка: на Windows каталожный symlink
      // требует прав, которых у обычного прогона нет.
      symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(copy, "node_modules"), "junction");

      expect(existsSync(path.join(copy, "dist"))).toBe(false);

      const destination = tempDir();
      const pack = npmCall(["pack", "--pack-destination", destination, "--loglevel", "error"]);
      const packed = await runProcess(pack, { cwd: copy });
      expect(packed.status, packed.stderr).toBe(0);

      const archive = path.join(destination, packed.stdout.trim().split("\n").at(-1)!);
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
    async () => {
      const project = tempDir();

      const call = npmCall(["install", tarball, "--no-audit", "--no-fund", "--loglevel", "error"]);
      const install = await runProcess(call, { cwd: project });
      expect(install.stderr).toBe("");
      expect(install.status).toBe(0);

      const calls = [
        ["lexforge", "init"],
        ["lexforge", "stacks", "set", "--none"],
        ["lexforge", "new", "change", "smoke"],
        ["lexforge", "status", "--change", "smoke", "--json"],
      ];

      const results = [];
      for (const argv of calls) {
        results.push(await runProcess(npxCall(argv), { cwd: project, env: lexforgeEnv() }));

        if (argv[1] === "stacks") {
          // `new change` opens a branch and needs a committed tree.
          git(project, "init", "--initial-branch=main", "--quiet");
          writeFileSync(path.join(project, ".gitignore"), "node_modules/\n", "utf8");
          commitAll(project, "init");
        }
      }

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
    async () => {
      const project = tempDir();

      const call = npmCall(["install", tarball, "--no-audit", "--no-fund", "--loglevel", "error"]);
      const install = await runProcess(call, { cwd: project });
      expect(install.status).toBe(0);

      const result = await runProcess(npxCall(["lexforge", "init", "--tools", "claude"]), {
        cwd: project,
        env: lexforgeEnv(),
      });

      expect(result.status, result.stderr).toBe(0);
      expect(readdirSync(path.join(project, ".claude", "skills")).sort()).toEqual(SKILL_NAMES);
    },
    300_000,
  );

  it(
    "поставленный пакет читает правила из своего каталога и отдаёт BE и PY",
    async () => {
      const project = tempDir();

      const call = npmCall(["install", tarball, "--no-audit", "--no-fund", "--loglevel", "error"]);
      const install = await runProcess(call, { cwd: project });
      expect(install.status).toBe(0);

      const calls = [
        ["lexforge", "init", "--tools", "claude"],
        ["lexforge", "stacks", "set", "python"],
        ["lexforge", "new", "change", "demo"],
        ["lexforge", "rules", "--change", "demo", "--files", "api/orders.py", "--json"],
      ];

      const results = [];
      for (const argv of calls) {
        results.push(await runProcess(npxCall(argv), { cwd: project, env: lexforgeEnv() }));

        if (argv[1] === "stacks") {
          // `new change` opens a branch and needs a committed tree.
          git(project, "init", "--initial-branch=main", "--quiet");
          writeFileSync(path.join(project, ".gitignore"), "node_modules/\n", "utf8");
          commitAll(project, "init");
        }
      }

      for (const [index, result] of results.entries()) {
        expect(result.status, `${calls[index]!.join(" ")} → ${result.stderr}`).toBe(0);
      }

      const data = JSON.parse(results.at(-1)!.stdout) as { rules?: Array<{ id: string }> };
      const ids = (data.rules ?? []).map((rule) => rule.id);

      expect(
        ids.some((id) => id.startsWith("BE-")),
        EXPECTED,
      ).toBe(true);
      expect(
        ids.some((id) => id.startsWith("PY-")),
        EXPECTED,
      ).toBe(true);
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
