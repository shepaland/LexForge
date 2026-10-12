import { describe, expect, it } from "vitest";
import { SQL_DIALECTS } from "../../../src/core/data/dialects.js";
import { applyOperations, emptySchema, type Field, type Operation as ModelOperation, type Schema } from "../../../src/core/data/schema-model.js";

const EXPECTED_DROP = "\nDROP CONSTRAINT is not supported\n";
const EXPECTED_FK = "\nan inline REFERENCES gives a foreign key\n";
const EXPECTED = "\nthe module `src/core/data/read-sql.ts` does not exist\n";

type Operation = Record<string, unknown> & { op: string };
type SqlRead = { operations: Operation[] } | { error: string };
type ReadSql = (text: string, dialect: string) => SqlRead;

async function readSql(): Promise<ReadSql> {
  let mod: { readSql?: ReadSql } | undefined;
  try {
    mod = (await import("../../../src/core/data/read-sql.js")) as { readSql?: ReadSql };
  } catch {
    mod = undefined;
  }
  expect(mod?.readSql, EXPECTED).toBeTypeOf("function");
  return mod!.readSql!;
}

async function operations(text: string, dialect = "postgresql"): Promise<Operation[]> {
  const result = (await readSql())(text, dialect);
  if ("error" in result) throw new Error(`readSql returned an error: ${result.error}`);
  return result.operations;
}

async function failure(text: string, dialect = "postgresql"): Promise<string> {
  const result = (await readSql())(text, dialect);
  if (!("error" in result)) throw new Error("readSql returned operations, an error was expected");
  return result.error;
}

async function applied(texts: string[], dialect = "postgresql"): Promise<Schema> {
  let schema = emptySchema();
  for (const text of texts) {
    const result = applyOperations(schema, (await operations(text, dialect)) as ModelOperation[]);
    expect(result.problems).toEqual([]);
    schema = result.schema;
  }
  return schema;
}

async function fieldAfter(statement: string, create: string, name = "note", dialect = "postgresql"): Promise<Field | undefined> {
  const schema = await applied([create, statement], dialect);
  return schema.tables[0].fields.find((f) => f.name === name);
}

const GUARDED = "CREATE TABLE orders (id bigint PRIMARY KEY, note varchar(200) NOT NULL DEFAULT 'new')";

describe("readSql", () => {
  it.each([...SQL_DIALECTS])("диалект %s: CREATE TABLE t (id int) даёт одно создание таблицы t", async (dialect) => {
    // The BigQuery grammar has no `int`; its name for the type is `int64`.
    const ops = await operations(`CREATE TABLE t (id ${dialect === "bigquery" ? "int64" : "int"})`, dialect);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "createTable", table: "t" });
    expect((ops[0] as { fields: unknown[] }).fields).toHaveLength(1);
  });

  it("postgresql: CREATE TABLE несёт поля, первичный ключ, уникальный и внешний ключ", async () => {
    const ops = await operations(
      "CREATE TABLE orders (id bigint PRIMARY KEY, note varchar(200) NOT NULL DEFAULT 'new', " +
        "customer_id bigint, UNIQUE (note), FOREIGN KEY (customer_id) REFERENCES customers (id))",
    );
    expect(ops).toEqual([
      {
        op: "createTable",
        table: "orders",
        fields: [
          { name: "id", type: "bigint", nullable: false },
          { name: "note", type: "varchar(200)", nullable: false, default: "'new'" },
          { name: "customer_id", type: "bigint", nullable: true },
        ],
        primaryKey: ["id"],
      },
      { op: "addKey", table: "orders", key: { kind: "unique", fields: ["note"] } },
      {
        op: "addKey",
        table: "orders",
        key: { kind: "foreign", fields: ["customer_id"], references: { table: "customers", fields: ["id"] } },
      },
    ]);
  });

  it("postgresql: CREATE INDEX даёт индекс с именем", async () => {
    expect(await operations("CREATE INDEX orders_note_idx ON orders (note)")).toEqual([
      { op: "addKey", table: "orders", key: { kind: "index", fields: ["note"], name: "orders_note_idx" } },
    ]);
  });

  it("postgresql: CREATE UNIQUE INDEX даёт уникальный ключ с именем", async () => {
    expect(await operations("CREATE UNIQUE INDEX orders_note_key ON orders (note)")).toEqual([
      { op: "addKey", table: "orders", key: { kind: "unique", fields: ["note"], name: "orders_note_key" } },
    ]);
  });

  it("postgresql: ALTER TABLE ADD COLUMN даёт добавление поля", async () => {
    expect(await operations("ALTER TABLE orders ADD COLUMN note text NOT NULL")).toEqual([
      { op: "addField", table: "orders", field: { name: "note", type: "text", nullable: false } },
    ]);
  });

  it("postgresql: ALTER TABLE DROP COLUMN даёт удаление поля", async () => {
    expect(await operations("ALTER TABLE orders DROP COLUMN note")).toEqual([
      { op: "dropField", table: "orders", name: "note" },
    ]);
  });

  it("postgresql: ALTER COLUMN TYPE даёт частичное изменение с одним типом", async () => {
    expect(await operations("ALTER TABLE orders ALTER COLUMN note TYPE varchar(300)")).toEqual([
      { op: "alterField", table: "orders", name: "note", type: "varchar(300)" },
    ]);
  });

  it("postgresql: ADD CONSTRAINT PRIMARY KEY даёт установку первичного ключа", async () => {
    expect(await operations("ALTER TABLE orders ADD CONSTRAINT orders_pk PRIMARY KEY (id)")).toEqual([
      { op: "setPrimaryKey", table: "orders", fields: ["id"] },
    ]);
  });

  it("postgresql: DROP INDEX, применённый к модели с этим индексом, убирает его без замечаний", async () => {
    const schema = await applied(["CREATE TABLE orders (note text)", "CREATE INDEX orders_note_idx ON orders (note)"]);
    expect(schema.tables[0].keys).toHaveLength(1);
    const result = applyOperations(schema, await operations("DROP INDEX orders_note_idx"));
    expect(result.problems).toEqual([]);
    expect(result.schema.tables[0].keys).toEqual([]);
  });

  it("postgresql: DROP INDEX неизвестного индекса даёт замечание с его именем", async () => {
    const schema = await applied(["CREATE TABLE orders (note text)"]);
    const result = applyOperations(schema, await operations("DROP INDEX orders_note_idx"));
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].message).toContain("orders_note_idx");
  });

  it("postgresql: DROP TABLE даёт удаление таблицы", async () => {
    expect(await operations("DROP TABLE orders")).toEqual([{ op: "dropTable", table: "orders" }]);
  });

  it("mysql: ALTER TABLE MODIFY COLUMN даёт изменение поля", async () => {
    const ops = await operations("ALTER TABLE orders MODIFY COLUMN note varchar(300) NOT NULL", "mysql");
    expect(ops).toEqual([
      { op: "changeField", table: "orders", field: { name: "note", type: "varchar(300)", nullable: false } },
    ]);
  });

  it("INSERT, UPDATE и DELETE не дают операций", async () => {
    const text = "INSERT INTO orders (id) VALUES (1); UPDATE orders SET id = 2; DELETE FROM orders";
    expect(await operations(text)).toEqual([]);
  });

  it("CREATE VIEW не даёт операций", async () => {
    expect(await operations("CREATE VIEW v AS SELECT 1")).toEqual([]);
  });

  it("опечатка в тексте даёт ошибку с сообщением разборщика", async () => {
    const error = await failure("ALTER TABLE orders ADD COLUM note text");
    expect(error).toContain("Expected");
    expect(error).toContain("found");
  });

  it("действие ALTER TABLE без отображения даёт ошибку с его названием", async () => {
    const error = await failure("ALTER TABLE orders RENAME COLUMN a TO b", "mysql");
    expect(error).toContain("RENAME COLUMN");
  });

  it("postgresql: ALTER COLUMN TYPE сохраняет NOT NULL и значение по умолчанию и меняет тип", async () => {
    expect(await fieldAfter("ALTER TABLE orders ALTER COLUMN note TYPE text", GUARDED)).toEqual({
      name: "note",
      type: "text",
      nullable: false,
      default: "'new'",
    });
  });

  it("postgresql: ALTER COLUMN SET NOT NULL делает поле обязательным и не трогает остальное", async () => {
    const create = "CREATE TABLE orders (note varchar(200) DEFAULT 'new')";
    expect(await operations("ALTER TABLE orders ALTER COLUMN note SET NOT NULL")).toEqual([
      { op: "alterField", table: "orders", name: "note", nullable: false },
    ]);
    expect(await fieldAfter("ALTER TABLE orders ALTER COLUMN note SET NOT NULL", create)).toEqual({
      name: "note",
      type: "varchar(200)",
      nullable: false,
      default: "'new'",
    });
  });

  it("postgresql: ALTER COLUMN DROP NOT NULL снимает обязательность и не трогает остальное", async () => {
    expect(await operations("ALTER TABLE orders ALTER COLUMN note DROP NOT NULL")).toEqual([
      { op: "alterField", table: "orders", name: "note", nullable: true },
    ]);
    expect(await fieldAfter("ALTER TABLE orders ALTER COLUMN note DROP NOT NULL", GUARDED)).toEqual({
      name: "note",
      type: "varchar(200)",
      nullable: true,
      default: "'new'",
    });
  });

  it("postgresql: ALTER COLUMN SET DEFAULT ставит значение и не трогает остальное", async () => {
    expect(await operations("ALTER TABLE orders ALTER COLUMN note SET DEFAULT 'old'")).toEqual([
      { op: "alterField", table: "orders", name: "note", default: "'old'" },
    ]);
    expect(await fieldAfter("ALTER TABLE orders ALTER COLUMN note SET DEFAULT 'old'", GUARDED)).toEqual({
      name: "note",
      type: "varchar(200)",
      nullable: false,
      default: "'old'",
    });
  });

  it("postgresql: ALTER COLUMN DROP DEFAULT убирает значение и не трогает остальное", async () => {
    expect(await operations("ALTER TABLE orders ALTER COLUMN note DROP DEFAULT")).toEqual([
      { op: "alterField", table: "orders", name: "note", default: null },
    ]);
    expect(await fieldAfter("ALTER TABLE orders ALTER COLUMN note DROP DEFAULT", GUARDED)).toEqual({
      name: "note",
      type: "varchar(200)",
      nullable: false,
    });
  });

  it("частичное изменение отсутствующего поля даёт то же замечание, что полное", () => {
    const schema = applyOperations(emptySchema(), [{ op: "createTable", table: "orders", fields: [] }]).schema;
    const partial = applyOperations(schema, [{ op: "alterField", table: "orders", name: "note", type: "text" }]);
    const full = applyOperations(schema, [
      { op: "changeField", table: "orders", field: { name: "note", type: "text", nullable: true } },
    ]);
    expect(partial.problems).toEqual(full.problems);
    expect(partial.problems).toHaveLength(1);
  });

  it("mysql: тип int unsigned читается с суффиксом", async () => {
    const ops = await operations("CREATE TABLE t (a int unsigned)", "mysql");
    expect((ops[0] as { fields: Field[] }).fields[0].type).toBe("int unsigned");
  });

  it("postgresql: тип timestamp with time zone читается целиком", async () => {
    const ops = await operations("CREATE TABLE t (a timestamp with time zone)");
    expect((ops[0] as { fields: Field[] }).fields[0].type).toBe("timestamp with time zone");
  });

  it("postgresql: тип с массивом читается со скобками по числу измерений", async () => {
    const ops = await operations("CREATE TABLE t (a int[], b numeric(10,2)[][])");
    const types = (ops[0] as { fields: Field[] }).fields.map((f) => f.type);
    expect(types).toEqual(["int[]", "numeric(10,2)[][]"]);
  });

  it("postgresql: DEFAULT now() остаётся текстом", async () => {
    const ops = await operations("CREATE TABLE t (a timestamp DEFAULT now())");
    expect((ops[0] as { fields: Field[] }).fields[0].default).toBe("now()");
  });

  it("postgresql: DEFAULT с приведением типа остаётся текстом", async () => {
    const ops = await operations("CREATE TABLE t (a text DEFAULT 'x'::text)");
    expect((ops[0] as { fields: Field[] }).fields[0].default).toBe("'x'::TEXT");
  });

  it("mysql: DEFAULT now() и CURRENT_TIMESTAMP остаются текстом", async () => {
    const ops = await operations("CREATE TABLE t (a timestamp DEFAULT now(), b timestamp DEFAULT CURRENT_TIMESTAMP)", "mysql");
    const defaults = (ops[0] as { fields: Field[] }).fields.map((f) => f.default);
    expect(defaults).toEqual(["now()", "CURRENT_TIMESTAMP"]);
  });

  it("transactsql: ALTER COLUMN ... NOT NULL делает поле обязательным и меняет тип", async () => {
    const field = await fieldAfter("ALTER TABLE orders ALTER COLUMN note varchar(10) NOT NULL", "CREATE TABLE orders (note varchar(200))", "note", "transactsql");
    expect(field).toMatchObject({ type: "varchar(10)", nullable: false });
  });

  it("transactsql: ALTER COLUMN ... NULL снимает обязательность", async () => {
    const field = await fieldAfter("ALTER TABLE orders ALTER COLUMN note varchar(10) NULL", "CREATE TABLE orders (note varchar(200) NOT NULL)", "note", "transactsql");
    expect(field).toMatchObject({ type: "varchar(10)", nullable: true });
  });

  it("transactsql: ALTER COLUMN без NULL и NOT NULL не трогает обязательность", async () => {
    const field = await fieldAfter("ALTER TABLE orders ALTER COLUMN note varchar(10)", "CREATE TABLE orders (note varchar(200) NOT NULL)", "note", "transactsql");
    expect(field).toMatchObject({ type: "varchar(10)", nullable: false });
  });

  it("postgresql: SET DEFAULT NULL читается как снятие значения по умолчанию", async () => {
    expect(await operations("ALTER TABLE orders ALTER COLUMN note SET DEFAULT NULL")).toEqual([
      { op: "alterField", table: "orders", name: "note", default: null },
    ]);
    expect(await fieldAfter("ALTER TABLE orders ALTER COLUMN note SET DEFAULT NULL", GUARDED)).toEqual({
      name: "note",
      type: "varchar(200)",
      nullable: false,
    });
  });

  it("DEFAULT NULL в CREATE TABLE не даёт значения по умолчанию", async () => {
    const ops = await operations("CREATE TABLE t (a int DEFAULT NULL)");
    expect((ops[0] as { fields: Field[] }).fields[0]).toEqual({ name: "a", type: "int", nullable: true });
  });

  it("DEFAULT (1+1) в CREATE TABLE остаётся напечатанным выражением", async () => {
    const ops = await operations("CREATE TABLE t (a int DEFAULT (1+1))");
    expect((ops[0] as { fields: Field[] }).fields[0].default).toBe("(1 + 1)");
  });

  it("postgresql: SET DEFAULT с выражением остаётся напечатанным выражением", async () => {
    expect(await operations("ALTER TABLE orders ALTER COLUMN note SET DEFAULT (1+1)")).toEqual([
      { op: "alterField", table: "orders", name: "note", default: "(1 + 1)" },
    ]);
  });

  it.each(["../../x", "oracle"])("неизвестный диалект %s даёт ошибку с его именем и списком известных", async (dialect) => {
    const error = await failure("CREATE TABLE t (id int)", dialect);
    expect(error).toContain(dialect);
    for (const known of SQL_DIALECTS) expect(error).toContain(known);
  });

  it("postgresql: DROP CONSTRAINT даёт dropKey с именем ограничения", async () => {
    const result = (await readSql())("ALTER TABLE orders DROP CONSTRAINT orders_fk", "postgresql");
    expect("error" in result ? result.error : result.operations, EXPECTED_DROP).toEqual([
      { op: "dropKey", table: "orders", name: "orders_fk" },
    ]);
  });

  it("mysql: DROP PRIMARY KEY даёт setPrimaryKey без полей", async () => {
    const result = (await readSql())("ALTER TABLE orders DROP PRIMARY KEY", "mysql");
    expect("error" in result ? result.error : result.operations, EXPECTED_DROP).toEqual([
      { op: "setPrimaryKey", table: "orders", fields: [] },
    ]);
  });

  it("mysql: RENAME COLUMN даёт ошибку без совета писать Markdown", async () => {
    const error = await failure("ALTER TABLE orders RENAME COLUMN a TO b", "mysql");
    expect(error, EXPECTED_DROP).not.toContain("Markdown");
  });

  const foreignKey = {
    op: "addKey",
    table: "orders",
    key: { kind: "foreign", fields: ["customer_id"], references: { table: "customers", fields: ["id"] } },
  };

  it("CREATE TABLE с REFERENCES на колонке даёт внешний ключ после createTable", async () => {
    const result = await operations("CREATE TABLE orders (id int PRIMARY KEY, customer_id int REFERENCES customers (id))");
    expect(result.map((item) => item.op), EXPECTED_FK).toEqual(["createTable", "addKey"]);
    expect(result[1], EXPECTED_FK).toEqual(foreignKey);
  });

  it("ADD COLUMN с REFERENCES даёт addField и внешний ключ после него", async () => {
    const result = await operations("ALTER TABLE orders ADD COLUMN customer_id int REFERENCES customers (id)");
    expect(result.map((item) => item.op), EXPECTED_FK).toEqual(["addField", "addKey"]);
    expect(result[1], EXPECTED_FK).toEqual(foreignKey);
  });

  it("DROP COLUMN убирает внешний ключ, записанный на колонке", async () => {
    const schema = await applied([
      "CREATE TABLE orders (id int PRIMARY KEY, customer_id int REFERENCES customers (id))",
      "ALTER TABLE orders DROP COLUMN customer_id",
    ]);
    expect(schema.tables.find((table) => table.name === "orders")?.keys, EXPECTED_FK).toEqual([]);
  });
});
