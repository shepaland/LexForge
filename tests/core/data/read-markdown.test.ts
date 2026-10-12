import { describe, expect, it } from "vitest";

const EXPECTED = "\nthe module `src/core/data/read-markdown.ts` does not exist\n";

interface Field { name: string; type: string; nullable: boolean; default?: string }
type Operation = Record<string, unknown> & { op: string };
interface ReadError { line: number; message: string }
interface SchemaRead { operations: Operation[]; errors: ReadError[] }
interface StepRead extends SchemaRead { dataMigration: string | null }
interface Reader {
  readMarkdownSchema: (text: string) => SchemaRead;
  readMarkdownStep: (text: string) => StepRead;
}

async function reader(): Promise<Reader> {
  let mod: Partial<Reader> | undefined;
  try {
    mod = (await import("../../../src/core/data/read-markdown.js")) as Partial<Reader>;
  } catch {
    mod = undefined;
  }
  expect(mod?.readMarkdownSchema, EXPECTED).toBeTypeOf("function");
  return mod as Reader;
}

const ID: Field = { name: "id", type: "bigint", nullable: false };
const USER_ID: Field = { name: "user_id", type: "bigint", nullable: false };
const SOURCE: Field = { name: "payload.source", type: "varchar(20)", nullable: true, default: "'web'" };

const SCHEMA = `# Schema

## Table: user_events

| Field | Type | Nullable | Default |
| --- | --- | --- | --- |
| id | bigint | no | |
| user_id | bigint | no | |
| payload.source | varchar(20) | yes | 'web' |

| Key | Fields |
| --- | --- |
| primary | id |
| index | user_id |
| foreign | user_id -> main.users.id |
`;

const FOREIGN = {
  kind: "foreign",
  fields: ["user_id"],
  references: { store: "main", table: "users", fields: ["id"] },
};

describe("чтение schema.md", () => {
  it("таблица с полями и ключами даёт одно создание и по операции на ключ", async () => {
    const { readMarkdownSchema } = await reader();
    const read = readMarkdownSchema(SCHEMA);
    expect(read.errors).toEqual([]);
    expect(read.operations).toEqual([
      { op: "createTable", table: "user_events", fields: [ID, USER_ID, SOURCE], primaryKey: ["id"] },
      { op: "addKey", table: "user_events", key: { kind: "index", fields: ["user_id"] } },
      { op: "addKey", table: "user_events", key: FOREIGN },
    ]);
  });

  it("пустой Default значит поле без значения по умолчанию", async () => {
    const { readMarkdownSchema } = await reader();
    const create = readMarkdownSchema(SCHEMA).operations[0] as { fields: Field[] };
    expect(Object.hasOwn(create.fields[0]!, "default")).toBe(false);
  });

  it("ключ unique читается как уникальный", async () => {
    const { readMarkdownSchema } = await reader();
    const text = SCHEMA.replace("| index | user_id |", "| unique | user_id, id |");
    const keys = readMarkdownSchema(text).operations.filter((o) => o.op === "addKey");
    expect(keys[0]).toEqual({
      op: "addKey",
      table: "user_events",
      key: { kind: "unique", fields: ["user_id", "id"] },
    });
  });

  it("внешний ключ без хранилища даёт ссылку без store", async () => {
    const { readMarkdownSchema } = await reader();
    const text = SCHEMA.replace("main.users.id", "users.id");
    const last = readMarkdownSchema(text).operations.at(-1) as { key: { references: object } };
    expect(last.key.references).toEqual({ table: "users", fields: ["id"] });
  });
});

const ALTER = `## Table: user_events (alter)

| Action | Field | Type | Nullable | Default |
| --- | --- | --- | --- | --- |
| add | note | text | yes | |
| change | user_id | uuid | no | |
| drop | payload.source | | | |

| Action | Key | Fields |
| --- | --- | --- |
| add | primary | id |
| add | index | user_id |
| drop | unique | note |
| drop | primary | id |
`;

describe("чтение up.md и down.md", () => {
  it("alter с колонкой Action даёт add, change и drop для полей", async () => {
    const { readMarkdownStep } = await reader();
    const read = readMarkdownStep(ALTER);
    expect(read.errors).toEqual([]);
    expect(read.operations.slice(0, 3)).toEqual([
      { op: "addField", table: "user_events", field: { name: "note", type: "text", nullable: true } },
      { op: "changeField", table: "user_events", field: { name: "user_id", type: "uuid", nullable: false } },
      { op: "dropField", table: "user_events", name: "payload.source" },
    ]);
  });

  it("alter с колонкой Action даёт операции над ключами", async () => {
    const { readMarkdownStep } = await reader();
    expect(readMarkdownStep(ALTER).operations.slice(3)).toEqual([
      { op: "setPrimaryKey", table: "user_events", fields: ["id"] },
      { op: "addKey", table: "user_events", key: { kind: "index", fields: ["user_id"] } },
      { op: "dropKey", table: "user_events", kind: "unique", fields: ["note"] },
      { op: "setPrimaryKey", table: "user_events", fields: [] },
    ]);
  });

  it("create даёт создание таблицы с ключами, как в schema.md", async () => {
    const { readMarkdownStep } = await reader();
    const text = SCHEMA.replace("## Table: user_events", "## Table: user_events (create)");
    const read = readMarkdownStep(text);
    expect(read.errors).toEqual([]);
    expect(read.operations).toHaveLength(3);
    expect(read.operations[0]).toEqual({
      op: "createTable",
      table: "user_events",
      fields: [ID, USER_ID, SOURCE],
      primaryKey: ["id"],
    });
  });

  it("drop даёт удаление таблицы без таблицы полей", async () => {
    const { readMarkdownStep } = await reader();
    const read = readMarkdownStep("## Table: user_events (drop)\n");
    expect(read.errors).toEqual([]);
    expect(read.operations).toEqual([{ op: "dropTable", table: "user_events" }]);
  });

  it("раздел Data migration с текстом отдаёт этот текст", async () => {
    const { readMarkdownStep } = await reader();
    const text = `${ALTER}\n## Data migration\n\nCopy source into note.\nThen drop it.\n`;
    expect(readMarkdownStep(text).dataMigration).toBe("Copy source into note.\nThen drop it.");
  });

  it("заголовок Data migration без текста даёт пустую строку", async () => {
    const { readMarkdownStep } = await reader();
    expect(readMarkdownStep(`${ALTER}\n## Data migration\n`).dataMigration).toBe("");
  });

  it("раздел Data migration, закрытый другим заголовком, не забирает его текст", async () => {
    const { readMarkdownStep } = await reader();
    const text = `## Data migration\nBackfill.\n\n${ALTER}`;
    expect(readMarkdownStep(text).dataMigration).toBe("Backfill.");
  });

  it("без раздела Data migration значение null", async () => {
    const { readMarkdownStep } = await reader();
    expect(readMarkdownStep(ALTER).dataMigration).toBeNull();
  });
});

describe("ошибки чтения Markdown", () => {
  it("ключ вне primary, unique, index и foreign даёт ошибку со строкой", async () => {
    const { readMarkdownSchema } = await reader();
    const read = readMarkdownSchema(SCHEMA.replace("| index | user_id |", "| fulltext | user_id |"));
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.line).toBe(14);
    expect(read.errors[0]!.message).toContain("fulltext");
  });

  it("внешний ключ без -> даёт ошибку со строкой", async () => {
    const { readMarkdownSchema } = await reader();
    const read = readMarkdownSchema(SCHEMA.replace("user_id -> main.users.id", "user_id"));
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.line).toBe(15);
    expect(read.errors[0]!.message).toContain("->");
  });

  it("Action вне add, change и drop даёт ошибку со строкой", async () => {
    const { readMarkdownStep } = await reader();
    const read = readMarkdownStep(ALTER.replace("| add | note |", "| rename | note |"));
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.line).toBe(5);
    expect(read.errors[0]!.message).toContain("rename");
  });

  it("Action вне add, change и drop в таблице ключей даёт ошибку со строкой", async () => {
    const { readMarkdownStep } = await reader();
    const read = readMarkdownStep(ALTER.replace("| add | index |", "| move | index |"));
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.line).toBe(12);
  });

  it("Action change в таблице ключей даёт одну ошибку на строке и не даёт операции", async () => {
    const { readMarkdownStep } = await reader();
    const read = readMarkdownStep(ALTER.replace("| add | index |", "| change | index |"));
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.line).toBe(12);
    expect(read.operations.filter((op) => op.op === "addKey" || op.op === "dropKey" || op.op === "changeKey")).toEqual([
      { op: "dropKey", table: "user_events", kind: "unique", fields: ["note"] },
    ]);
  });

  it("drop внешнего ключа с -> и без него даёт dropKey с видом foreign", async () => {
    const { readMarkdownStep } = await reader();
    const step = (fields: string) => `## Table: user_events (alter)\n\n| Action | Key | Fields |\n| --- | --- | --- |\n| drop | foreign | ${fields} |\n`;
    const expected = [{ op: "dropKey", table: "user_events", kind: "foreign", fields: ["user_id"] }];
    for (const fields of ["user_id", "user_id -> main.users.id"]) {
      const read = readMarkdownStep(step(fields));
      expect(read.errors, fields).toEqual([]);
      expect(read.operations, fields).toEqual(expected);
    }
  });

  it("заголовок таблицы в шаге без create, alter или drop даёт ошибку со строкой", async () => {
    const { readMarkdownStep } = await reader();
    const read = readMarkdownStep("# Step\n\n## Table: user_events\n");
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.line).toBe(3);
    expect(read.errors[0]!.message).toContain("create");
  });

  it("таблица без таблицы полей даёт ошибку со строкой её заголовка", async () => {
    const { readMarkdownSchema } = await reader();
    const read = readMarkdownSchema("# Schema\n\n## Table: user_events\n\nNothing here.\n");
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.line).toBe(3);
    expect(read.errors[0]!.message).toContain("user_events");
  });

  it("create без таблицы полей даёт ошибку со строкой", async () => {
    const { readMarkdownStep } = await reader();
    const read = readMarkdownStep("## Table: user_events (create)\n");
    expect(read.errors).toEqual([{ line: 1, message: expect.stringContaining("user_events") }]);
  });

  it("значение Nullable вне yes и no даёт ошибку со строкой", async () => {
    const { readMarkdownSchema } = await reader();
    const read = readMarkdownSchema(SCHEMA.replace("| id | bigint | no |", "| id | bigint | maybe |"));
    expect(read.errors).toHaveLength(1);
    expect(read.errors[0]!.line).toBe(7);
  });
});
