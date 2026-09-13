import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { readProjectConfig } from "../../src/core/workspace/project-config.js";
import { answerPath } from "../../src/core/answer-path.js";
import { createCapture } from "../helpers/capture.js";
import { git } from "../helpers/git-workspace.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const created: string[] = [];

function project(files: Record<string, string> = {}): string {
  const root = makeWorkspace(files);
  created.push(root);
  return root;
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

/**
 * The guard for a project installed before the models section existed: seeding
 * writes the section into a new config only, and a repeated run leaves an
 * existing file exactly as its owner wrote it. Adding the section to such a
 * project is an edit made by hand.
 */
describe("lexforge init, проект без раздела models", () => {
  const HAND_WRITTEN = "schema: spec-driven\ncontext: a project set up before models existed\n";

  it("повторный запуск оставляет config.yaml побайтно прежним", async () => {
    const root = project({ "lexforge/config.yaml": HAND_WRITTEN });

    const { exitCode } = await init(["init"], root);

    expect(exitCode).toBe(0);
    expect(readFileSync(path.join(root, "lexforge/config.yaml"), "utf8")).toBe(HAND_WRITTEN);
  });

  it("конвейер такого проекта работает с пустым назначением", async () => {
    const root = project({
      "lexforge/config.yaml": HAND_WRITTEN,
      "lexforge/changes/add-auth/.lexforge.yaml": "schema: spec-driven\n",
    });

    await init(["init"], root);
    const capture = createCapture();
    const exitCode = await run(["status", "--change", "add-auth", "--json"], {
      cwd: root,
      stdout: capture.stdout,
      stderr: capture.stderr,
    });
    const data = JSON.parse(capture.out) as {
      stages: { stage: string; model: string }[];
      artifacts: { model: string }[];
    };

    expect(exitCode).toBe(0);
    expect(data.stages).toHaveLength(8);
    for (const stage of data.stages) {
      expect(stage.model, `стадия ${stage.stage} назвала модель`).toBe("");
    }
    for (const artifact of data.artifacts) {
      expect(artifact.model).toBe("");
    }
  });

  it("каталог, написанный проектом, второй запуск не трогает", async () => {
    const own = "schema: spec-driven\nmodels:\n  providers:\n    acme:\n      - house-model\n";
    const root = project({ "lexforge/config.yaml": own });

    const { exitCode } = await init(["init"], root);

    expect(exitCode).toBe(0);
    expect(readFileSync(path.join(root, "lexforge/config.yaml"), "utf8")).toBe(own);
  });
});

describe("lexforge init, блоки рантаймов в созданном конфиге", () => {
  it("рантайм поверх нескольких вендоров получает каталог без блока и без default", async () => {
    const root = project();

    const { exitCode } = await init(["init", "--tools", "cursor"], root);
    const config = readProjectConfig(root);

    expect(exitCode).toBe(0);
    expect(config.models.tools).toEqual({});
    expect(config.models.default).toBeNull();
    expect(Object.keys(config.models.providers)).toContain("anthropic");
  });

  it("два рантайма со своими вендорами получают по блоку", async () => {
    const root = project();

    const { exitCode } = await init(["init", "--tools", "claude,codex"], root);
    const config = readProjectConfig(root);

    expect(exitCode).toBe(0);
    expect(config.models.tools.claude?.provider).toBe("anthropic");
    expect(config.models.tools.codex?.model).toBe("gpt-5.6-sol");
    expect(config.models.default).toBeNull();
  });
});
