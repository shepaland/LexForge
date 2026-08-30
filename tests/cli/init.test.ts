import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { answerPath } from "../../src/core/answer-path.js";
import { createCapture } from "../helpers/capture.js";
import { git } from "../helpers/git-workspace.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

/** The version the package carries: the manifest of an installation names it. */
const PACKAGE_VERSION = (
  JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as {
    version: string;
  }
).version;

/** The skills the package carries, read from the directory that ships. */
const SKILLS_DIR = fileURLToPath(new URL("../../skills", import.meta.url));

const created: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

/** A manifest of a previous installation of this package, as `init` writes it. */
function previousManifest(files: string[]): string {
  return JSON.stringify(
    {
      version: "0.9.0",
      installedAt: "2026-08-01T00:00:00.000Z",
      tool: "claude",
      scope: "project",
      files,
    },
    null,
    2,
  );
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

async function init(argv: string[], cwd: string, home?: string) {
  const capture = createCapture();
  const exitCode = await run(argv, {
    cwd,
    home,
    stdout: capture.stdout,
    stderr: capture.stderr,
  });
  return { exitCode, capture };
}

describe("lexforge init", () => {
  it("даёт код 0 и заканчивает вывод следующим шагом", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init", "--tools", "claude"], root);
    const lines = capture.out.trimEnd().split("\n");

    expect(exitCode, capture.err).toBe(0);
    expect(lines.at(-1)).toBe("Next step: lexforge doctor");
    expect(existsSync(path.join(root, "lexforge/config.yaml"))).toBe(true);
  });

  it("с флагом машинного вывода печатает один документ JSON", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init", "--tools", "claude", "--json"], root);
    const data = JSON.parse(capture.out) as Record<string, unknown>;

    expect(exitCode).toBe(0);
    expect(data.outputVersion).toBe(1);
    expect(data.workspaceRoot).toBe(answerPath(root));
    expect(data.created).toEqual(
      expect.arrayContaining([answerPath(path.join(root, "lexforge/config.yaml"))]),
    );
    expect(data.unchanged).toEqual([]);
    expect(data.nextStep).toBe("lexforge doctor");
  });

  it("флаг языка пишется в config.yaml", async () => {
    const root = project();

    const { exitCode } = await init(["init", "--language", "ru"], root);

    expect(exitCode).toBe(0);
    expect(existsSync(path.join(root, "lexforge/config.yaml"))).toBe(true);
  });

  it("с --tools claude раскладывает девять скиллов побайтно как в пакете", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init", "--tools", "claude"], root);
    const installed = path.join(root, ".claude/skills");
    const names = readdirSync(SKILLS_DIR).sort();

    expect(exitCode, capture.err).toBe(0);
    expect(names).toHaveLength(9);
    expect(readdirSync(installed).sort()).toEqual(names);

    for (const name of names) {
      expect(readFileSync(path.join(installed, name, "SKILL.md"), "utf8"), name).toBe(
        readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8"),
      );
    }
  });

  it("неизвестный инструмент даёт код 2 и не пишет ни одного файла", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init", "--tools", "claude,nosuch"], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("nosuch");
    expect(existsSync(path.join(root, "lexforge"))).toBe(false);
    expect(existsSync(path.join(root, ".claude"))).toBe(false);
  });
});

describe("lexforge init, манифест установки", () => {
  it("с --tools cursor кладёт девять скиллов и пишет .cursor/lexforge-install.json", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init", "--tools", "cursor"], root);
    const manifestFile = path.join(root, ".cursor/lexforge-install.json");

    expect(exitCode, capture.err).toBe(0);
    expect(readdirSync(path.join(root, ".cursor/skills")).sort()).toHaveLength(9);
    expect(existsSync(manifestFile)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as {
      version: string;
      installedAt: string;
      tool: string;
      scope: string;
      files: string[];
    };

    expect(manifest.tool).toBe("cursor");
    expect(manifest.scope).toBe("project");
    expect(manifest.version).toBe(PACKAGE_VERSION);
    expect(manifest.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(manifest.files).toContain("lexforge/SKILL.md");
    expect(manifest.files).toContain("lexforge-apply/reviewer-prompt.md");
    for (const file of manifest.files) {
      expect(existsSync(path.join(root, ".cursor/skills", file))).toBe(true);
    }
  });
});

describe("lexforge init, область установки", () => {
  it("с --scope user пишет под домашним каталогом и не трогает проект", async () => {
    const root = project();
    const home = project();

    const { exitCode, capture } = await init(
      ["init", "--tools", "claude", "--scope", "user"],
      root,
      home,
    );

    expect(exitCode, capture.err).toBe(0);
    expect(readdirSync(path.join(home, ".claude/skills")).sort()).toHaveLength(9);
    expect(existsSync(path.join(home, ".claude/lexforge-install.json"))).toBe(true);
    expect(existsSync(path.join(root, ".claude"))).toBe(false);
  });

  it("без флага области ставит в проект", async () => {
    const root = project();
    const home = project();

    const { exitCode } = await init(["init", "--tools", "claude"], root, home);

    expect(exitCode).toBe(0);
    expect(existsSync(path.join(root, ".claude/skills"))).toBe(true);
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
  });
});

describe("lexforge init, неизвестная область", () => {
  it("даёт код 2, называет project и user и ничего не пишет", async () => {
    const root = project();

    const { exitCode, capture } = await init(
      ["init", "--tools", "claude", "--scope", "global"],
      root,
    );

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("project");
    expect(capture.err).toContain("user");
    expect(existsSync(path.join(root, "lexforge"))).toBe(false);
    expect(existsSync(path.join(root, ".claude"))).toBe(false);
  });
});

describe("lexforge init, вывод путей", () => {
  it("после установки в пользовательской области называет каждый путь целиком", async () => {
    const root = project();
    const home = project();

    const { exitCode, capture } = await init(
      ["init", "--tools", "claude", "--scope", "user"],
      root,
      home,
    );

    const paths = capture.out
      .split("\n")
      .filter((line) => line.startsWith("  "))
      .map((line) => line.trim());

    expect(exitCode, capture.err).toBe(0);
    expect(paths.length).toBeGreaterThan(0);
    for (const entry of paths) {
      expect(path.isAbsolute(entry), entry).toBe(true);
    }
    expect(paths.some((entry) => entry.startsWith(answerPath(home)))).toBe(true);
  });
});

describe("lexforge init, уборка прошлой версии", () => {
  it("удаляет каталог снятого скилла и называет его в разделе об удалённом", async () => {
    const root = project({
      ".claude/lexforge-install.json": previousManifest([
        "lexforge/SKILL.md",
        "lexforge-retired/SKILL.md",
      ]),
      ".claude/skills/lexforge-retired/SKILL.md": "a skill this version dropped\n",
    });

    const { exitCode, capture } = await init(["init", "--tools", "claude"], root);

    expect(exitCode, capture.err).toBe(0);
    expect(existsSync(path.join(root, ".claude/skills/lexforge-retired"))).toBe(false);
    expect(capture.out).toContain("Removed:");
    expect(capture.out).toContain(
      answerPath(path.join(root, ".claude/skills/lexforge-retired/SKILL.md")),
    );
    expect(readdirSync(path.join(root, ".claude/skills")).sort()).toHaveLength(9);
  });

  it("оставляет на месте каталог, которого прошлый манифест не называл", async () => {
    const root = project({
      ".claude/skills/lexforge-retired/SKILL.md": "a skill of a version without a manifest\n",
      ".claude/skills/my-own-skill/SKILL.md": "a skill of my own\n",
    });

    const { exitCode, capture } = await init(["init", "--tools", "claude"], root);

    expect(exitCode, capture.err).toBe(0);
    expect(existsSync(path.join(root, ".claude/skills/lexforge-retired/SKILL.md"))).toBe(true);
    expect(existsSync(path.join(root, ".claude/skills/my-own-skill/SKILL.md"))).toBe(true);
    expect(capture.out).toContain("Left for you to sort out:");
    expect(capture.out).toContain(answerPath(path.join(root, ".claude/skills/lexforge-retired")));
    expect(capture.out).not.toContain(answerPath(path.join(root, ".claude/skills/my-own-skill")));
  });
});

describe("lexforge init, правленый скилл", () => {
  it("возвращает изменённый руками SKILL.md к поставляемому тексту", async () => {
    const root = project();
    await init(["init", "--tools", "claude"], root);

    const installed = path.join(root, ".claude/skills/lexforge/SKILL.md");
    writeFileSync(installed, "a skill someone rewrote by hand\n", "utf8");

    const { exitCode, capture } = await init(["init", "--tools", "claude"], root);

    expect(exitCode, capture.err).toBe(0);
    expect(readFileSync(installed, "utf8")).toBe(
      readFileSync(path.join(SKILLS_DIR, "lexforge/SKILL.md"), "utf8"),
    );
    expect(capture.out).toContain("Updated:");
    expect(capture.out).toContain(answerPath(installed));
  });
});

describe("lexforge init без списка инструментов", () => {
  it("заводит рабочее пространство, скиллов не ставит и называет найденный рантайм", async () => {
    const root = project({ ".claude/settings.json": "{}\n" });
    const home = project();

    const { exitCode, capture } = await init(["init"], root, home);
    const lines = capture.out.trimEnd().split("\n");

    expect(exitCode, capture.err).toBe(0);
    expect(existsSync(path.join(root, "lexforge/config.yaml"))).toBe(true);
    expect(existsSync(path.join(root, ".claude/skills"))).toBe(false);
    expect(lines.at(-1)).toBe("Next step: lexforge init --tools claude");
  });

  it("находит рантайм и по каталогу в домашнем каталоге пользователя", async () => {
    const root = project();
    const home = project({ ".config/opencode/opencode.json": "{}\n" });

    const { exitCode, capture } = await init(["init"], root, home);
    const lines = capture.out.trimEnd().split("\n");

    expect(exitCode, capture.err).toBe(0);
    expect(lines.at(-1)).toBe("Next step: lexforge init --tools opencode");
  });

  it("без единого знакомого каталога перечисляет известные имена", async () => {
    const root = project();
    const home = project();

    const { exitCode, capture } = await init(["init"], root, home);
    const lines = capture.out.trimEnd().split("\n");

    expect(exitCode, capture.err).toBe(0);
    expect(lines.at(-1)).toBe(
      "Next step: lexforge init --tools <one of: agents, claude, codex, cursor, opencode>",
    );
  });
});

describe("lexforge init без репозитория", () => {
  it("даёт код 0, репозитория не создаёт и называет ворота, которым он нужен", async () => {
    const root = project();

    const { exitCode, capture } = await init(["init", "--tools", "claude"], root);

    expect(exitCode, capture.err).toBe(0);
    expect(existsSync(path.join(root, ".git"))).toBe(false);
    for (const gate of ["evidence record", "check evidence", "verify", "archive"]) {
      expect(capture.out).toContain(gate);
    }
  });

  it("в репозитории о воротах не говорит", async () => {
    const root = project();
    git(root, "init", "--quiet");

    const { exitCode, capture } = await init(["init", "--tools", "claude"], root);

    expect(exitCode, capture.err).toBe(0);
    expect(capture.out).not.toContain("check evidence");
  });
});

describe("lexforge init повторно", () => {
  it("сохраняет правку конфигурации и не трогает работу в lexforge/changes", async () => {
    const root = project();
    await init(["init", "--tools", "claude"], root);

    const config = path.join(root, "lexforge/config.yaml");
    const edited = `${readFileSync(config, "utf8")}verification:\n  command: npm test\n`;
    writeFileSync(config, edited, "utf8");
    mkdirSync(path.join(root, "lexforge/changes/add-auth"), { recursive: true });
    writeFileSync(path.join(root, "lexforge/changes/add-auth/proposal.md"), "# Why\n", "utf8");

    const { exitCode, capture } = await init(["init", "--tools", "claude"], root);

    expect(exitCode, capture.err).toBe(0);
    expect(readFileSync(config, "utf8")).toBe(edited);
    expect(readFileSync(path.join(root, "lexforge/changes/add-auth/proposal.md"), "utf8")).toBe(
      "# Why\n",
    );
    expect(capture.out).toContain("Left as is:");
    expect(capture.out).toContain(answerPath(config));
  });
});

describe("lexforge init: форма путей в ответе", () => {
  it("пути, сложенные командой, записаны через косую черту", async () => {
    const root = project();

    const { capture } = await init(["init", "--json"], root);
    const data = JSON.parse(capture.out) as {
      created: string[];
      unchanged: string[];
      workspaceRoot: string;
    };

    for (const file of [...data.created, ...data.unchanged, data.workspaceRoot]) {
      expect(file.includes("\\")).toBe(false);
    }
  });

  it("каталог, переданный команде, назван в ответе тем же каталогом", async () => {
    const root = project();

    const { capture } = await init(["init", "--json"], root);
    const data = JSON.parse(capture.out) as { workspaceRoot: string };

    expect(path.resolve(data.workspaceRoot)).toBe(path.resolve(root));
  });
});
