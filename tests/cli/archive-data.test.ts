import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CHANGE,
  CLOSED_PLAN,
  ErrorDocument,
  call,
  changeFiles,
  cleanWorkspace,
  created,
  today,
} from "./archive-fixtures.js";

const EXPECTED = "\nlexforge/data/main/schema.sql does not exist after the archive\n";

const SCHEMA = "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);\n";
const UP = "ALTER TABLE users ADD COLUMN name TEXT;\n";
const DOWN = "ALTER TABLE users DROP COLUMN name;\n";
const SERVICE = "# notifications\n\nSends a message when an order ships.\n";

function dataFiles(): Record<string, string> {
  const base = `lexforge/changes/${CHANGE}/data/main`;
  return {
    [`${base}/schema.sql`]: SCHEMA,
    [`${base}/up.sql`]: UP,
    [`${base}/down.sql`]: DOWN,
  };
}

function read(root: string, relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

/** Every file under the given directories with its content, sorted by path. */
function snapshot(root: string, directories: string[]): Record<string, string> {
  const found: Record<string, string> = {};
  const visit = (relative: string): void => {
    const full = path.join(root, relative);
    if (!existsSync(full)) return;
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else found[child] = read(root, child);
    }
  };
  directories.forEach(visit);
  return found;
}

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

describe("lexforge archive: схемы, миграции и документы сервисов", () => {
  it("схема изменения заменяет схему проекта, up и down уходят в каталог миграции", async () => {
    const root = await cleanWorkspace({ ...changeFiles(CLOSED_PLAN), ...dataFiles() });

    const { exitCode } = await call(["archive", CHANGE], root);

    const schema = existsSync(path.join(root, "lexforge/data/main/schema.sql"))
      ? read(root, "lexforge/data/main/schema.sql")
      : null;
    expect(schema, EXPECTED).toBe(SCHEMA);
    expect(exitCode).toBe(0);

    const migration = `lexforge/data/main/${today()}-${CHANGE}`;
    expect(read(root, `${migration}/up.sql`)).toBe(UP);
    expect(read(root, `${migration}/down.sql`)).toBe(DOWN);
  });

  it("schema.md проекта удаляется, когда изменение приносит schema.sql", async () => {
    const root = await cleanWorkspace({
      ...changeFiles(CLOSED_PLAN),
      ...dataFiles(),
      "lexforge/data/main/schema.md": "# main\n",
    });

    await call(["archive", CHANGE], root);

    expect(existsSync(path.join(root, "lexforge/data/main/schema.md"))).toBe(false);
    expect(existsSync(path.join(root, "lexforge/data/main/schema.sql"))).toBe(true);
  });

  it("чужие файлы schema.sql.bak и up.sql~ в изменении не попадают в lexforge/data", async () => {
    const base = `lexforge/changes/${CHANGE}/data/main`;
    const root = await cleanWorkspace({
      ...changeFiles(CLOSED_PLAN),
      ...dataFiles(),
      [`${base}/schema.sql.bak`]: "CREATE TABLE stray (id INTEGER);\n",
      [`${base}/up.sql~`]: "-- editor backup\n",
    });

    const { exitCode } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(0);
    expect(read(root, "lexforge/data/main/schema.sql")).toBe(SCHEMA);
    const copied = Object.keys(snapshot(root, ["lexforge/data"])).sort();
    expect(copied).toEqual([
      "lexforge/data/main/schema.sql",
      `lexforge/data/main/${today()}-${CHANGE}/down.sql`,
      `lexforge/data/main/${today()}-${CHANGE}/up.sql`,
    ].sort());
  });

  it("файл schema.notes.md проекта остаётся после archive", async () => {
    const root = await cleanWorkspace({
      ...changeFiles(CLOSED_PLAN),
      ...dataFiles(),
      "lexforge/data/main/schema.notes.md": "# notes\n",
    });

    const { exitCode } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(0);
    expect(read(root, "lexforge/data/main/schema.notes.md")).toBe("# notes\n");
  });

  it("каталог schema.d проекта остаётся, archive завершается кодом 0", async () => {
    const root = await cleanWorkspace({
      ...changeFiles(CLOSED_PLAN),
      ...dataFiles(),
      "lexforge/data/main/schema.d/part.sql": "-- part\n",
    });

    const { exitCode } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(0);
    expect(read(root, "lexforge/data/main/schema.d/part.sql")).toBe("-- part\n");
  });

  it("документ сервиса изменения становится документом сервиса проекта", async () => {
    const root = await cleanWorkspace({
      ...changeFiles(CLOSED_PLAN),
      [`lexforge/changes/${CHANGE}/services/notifications/service.md`]: SERVICE,
    });

    const { exitCode } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(0);
    expect(read(root, "lexforge/services/notifications/service.md")).toBe(SERVICE);
  });

  it("архивация данных и сервисов не попадает в строку Mockups copied", async () => {
    const root = await cleanWorkspace({
      ...changeFiles(CLOSED_PLAN),
      ...dataFiles(),
      [`lexforge/changes/${CHANGE}/services/notifications/service.md`]: SERVICE,
    });

    const { exitCode, capture } = await call(["archive", CHANGE], root);

    const mockupLines = capture.out.split("\n").filter((line) => line.startsWith("Mockups copied"));
    expect(exitCode).toBe(0);
    expect(mockupLines.filter((line) => line.includes("lexforge/data/"))).toEqual([]);
    expect(mockupLines.filter((line) => line.includes("lexforge/services/"))).toEqual([]);
  });

  it("служба без service.md не создаёт каталог в lexforge/services", async () => {
    const root = await cleanWorkspace({
      ...changeFiles(CLOSED_PLAN),
      [`lexforge/changes/${CHANGE}/services/notifications/notes.md`]: "# notes\n",
    });

    const { exitCode } = await call(["archive", CHANGE], root);

    expect(exitCode).toBe(0);
    expect(existsSync(path.join(root, "lexforge/services/notifications"))).toBe(false);
  });

  it("занятый каталог миграции завершает archive кодом 2 и ничего не меняет", async () => {
    const taken = `lexforge/data/main/${today()}-${CHANGE}/up.sql`;
    const root = await cleanWorkspace({
      ...changeFiles(CLOSED_PLAN),
      ...dataFiles(),
      [`lexforge/changes/${CHANGE}/services/notifications/service.md`]: SERVICE,
      "lexforge/data/main/schema.sql": "CREATE TABLE old (id INTEGER);\n",
      [taken]: "-- older step\n",
      "lexforge/services/notifications/service.md": "# old\n",
    });
    const watched = ["lexforge/specs", "lexforge/data", "lexforge/services"];
    const before = snapshot(root, watched);

    const { exitCode, capture } = await call(["archive", CHANGE, "--json"], root);

    const message = (JSON.parse(capture.out) as ErrorDocument).error.message;
    expect(exitCode).toBe(2);
    expect(message).toContain(path.dirname(taken));
    expect(snapshot(root, watched)).toEqual(before);
    expect(existsSync(path.join(root, `lexforge/changes/${CHANGE}`))).toBe(true);
  });
});
