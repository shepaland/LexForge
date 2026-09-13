import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createPlainWorkspace, writeAt } from "../helpers/git-workspace.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";
import {
  CHANGE,
  CLOSED_PLAN,
  OPEN_PLAN,
  call,
  changeFiles,
  created,
  editApp,
  errorCode,
  recordRed,
  workspace,
} from "./archive-fixtures.js";

/** Temp directories made without the helper: removed the same way afterwards. */
const plain: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
  while (plain.length > 0) {
    removeWorkspace(plain.pop()!);
  }
});

describe("lexforge archive: предусловия и машинная проверка", () => {
  it("незакрытая задача даёт код 1 и не трогает основные спеки", async () => {
    const root = workspace(changeFiles(OPEN_PLAN)).root;
    editApp(root);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(1);
    expect(capture.err).toContain("1.2");
    expect(existsSync(path.join(root, "lexforge/specs/auth/spec.md"))).toBe(false);
  });

  it("правка после прогона проверок даёт код 1 и оставляет каталог change", async () => {
    const root = workspace(changeFiles(CLOSED_PLAN)).root;
    editApp(root);
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);
    writeAt(root, "src/app.ts", 'export function app(): string {\n  return "later";\n}\n');

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(1);
    expect(capture.err).toContain("evidence-not-fresh");
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
  });

  it("требование без следа в коде даёт код 1", async () => {
    const plan = ["## 1. Вход", "", "- [x] 1.1 Написать вход в `src/app.ts`", ""].join("\n");
    const root = workspace(changeFiles(plan)).root;
    editApp(root);
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(1);
    expect(capture.err).toContain("requirement-without-trace");
  });

  it.each(["--force", "--skip-verify", "--no-check"])(
    "флаг %s даёт код 2 и справку команды",
    async (flag) => {
      const root = workspace(changeFiles(CLOSED_PLAN)).root;

      const { exitCode, capture } = await call(["archive", CHANGE, flag], root);

      expect(exitCode).toBe(2);
      expect(capture.err).toContain("Usage: lexforge archive");
    },
  );

  it("пустой design.md даёт код 2 и называет артефакт design", async () => {
    const files = { ...changeFiles(CLOSED_PLAN), [`lexforge/changes/${CHANGE}/design.md`]: "" };
    const root = workspace(files).root;

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(2);
    expect(capture.err).toContain("design");
    expect(capture.err).toContain(`lexforge instructions design --change ${CHANGE}`);
  });

  it("пропуск дельта-спек через конфигурацию предусловие проходит", async () => {
    const files = changeFiles(CLOSED_PLAN);
    delete files[`lexforge/changes/${CHANGE}/specs/auth/spec.md`];
    files[`lexforge/changes/${CHANGE}/.lexforge.yaml`] = "schema: spec-driven\nskip_specs: true\n";

    const root = workspace(files).root;
    editApp(root);
    await recordRed(root);
    await call(["evidence", "record", "--change", CHANGE, "--label", "tests"], root);

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    expect(exitCode, capture.err).toBe(0);
  });
});

describe("lexforge archive: отказы", () => {
  it("каталог без рабочего пространства даёт код 2", async () => {
    const outside = makeWorkspace({ "README.md": "no workspace here\n" });
    plain.push(outside);

    const { exitCode } = await call(["archive", CHANGE], outside);

    expect(exitCode).toBe(2);
    expect(await errorCode(["archive", CHANGE], outside)).toBe("workspace-not-found");
  });

  it("неизвестный change даёт код 2", async () => {
    const root = workspace(changeFiles(CLOSED_PLAN)).root;

    const { exitCode } = await call(["archive", "nosuch"], root);

    expect(exitCode).toBe(2);
    expect(await errorCode(["archive", "nosuch"], root)).toBe("change-not-found");
  });

  it("каталог без репозитория даёт код 2", async () => {
    const made = createPlainWorkspace(changeFiles(CLOSED_PLAN));
    created.push(made);

    const { exitCode } = await call(["archive", CHANGE], made.root);

    expect(exitCode).toBe(2);
    expect(await errorCode(["archive", CHANGE], made.root)).toBe("git-missing");
  });

  it("пустой раздел verification даёт код 2", async () => {
    const files = { ...changeFiles(CLOSED_PLAN), "lexforge/config.yaml": "schema: spec-driven\n" };
    const root = workspace(files).root;

    const { exitCode } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(2);
    expect(await errorCode(["archive", CHANGE], root)).toBe("verification-empty");
  });
});

