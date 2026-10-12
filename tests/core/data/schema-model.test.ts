import { describe, expect, it } from "vitest";

const EXPECTED = "\nthe module `src/core/data/schema-model.ts` does not exist\n";

interface Field { name: string; type: string; nullable: boolean; default?: string }
interface Key {
  kind: "unique" | "index" | "foreign";
  fields: string[];
  name?: string;
  references?: { store?: string; table: string; fields: string[] };
}
interface Table { name: string; fields: Field[]; primaryKey: string[]; keys: Key[] }
interface Schema { tables: Table[] }
type Operation = Record<string, unknown> & { op: string };
interface Problem { table: string; field?: string; message: string }
interface Difference {
  kind: string; table: string; field?: string; key?: string;
  expected: string; actual: string; message: string;
}
interface Model {
  emptySchema: () => Schema;
  applyOperations: (schema: Schema, operations: Operation[]) => { schema: Schema; problems: Problem[] };
  compareSchemas: (expected: Schema, actual: Schema) => Difference[];
}

async function model(): Promise<Model> {
  let mod: Partial<Model> | undefined;
  try {
    mod = (await import("../../../src/core/data/schema-model.js")) as Partial<Model>;
  } catch {
    mod = undefined;
  }
  expect(mod?.applyOperations, EXPECTED).toBeTypeOf("function");
  return mod as Model;
}

const ID: Field = { name: "id", type: "bigint", nullable: false };
const NOTE: Field = { name: "note", type: "text", nullable: true };
const STATUS: Field = { name: "status", type: "varchar(20)", nullable: false, default: "'new'" };

const CREATE: Operation = {
  op: "createTable",
  table: "orders",
  fields: [ID, NOTE, STATUS],
  primaryKey: ["id"],
};

function orders(extra: Partial<Table> = {}): Table {
  return { name: "orders", fields: [ID, NOTE, STATUS], primaryKey: ["id"], keys: [], ...extra };
}

async function build(operations: Operation[] = []) {
  const { emptySchema, applyOperations } = await model();
  return applyOperations(emptySchema(), [CREATE, ...operations]);
}

describe("applyOperations", () => {
  it("создаёт таблицу orders из пустой схемы", async () => {
    const { schema, problems } = await build();
    expect(problems).toEqual([]);
    expect(schema).toEqual({ tables: [orders()] });
  });

  it("добавляет поле в конец таблицы", async () => {
    const field: Field = { name: "total", type: "numeric(10,2)", nullable: false };
    const { schema } = await build([{ op: "addField", table: "orders", field }]);
    expect(schema.tables[0].fields.map((f) => f.name)).toEqual(["id", "note", "status", "total"]);
    expect(schema.tables[0].fields[3]).toEqual(field);
  });

  it("меняет тип поля и оставляет остальное", async () => {
    const { schema } = await build([
      { op: "changeField", table: "orders", field: { ...NOTE, type: "varchar(500)" } },
    ]);
    expect(schema.tables[0].fields[1]).toEqual({ name: "note", type: "varchar(500)", nullable: true });
  });

  it("удаляет поле из таблицы", async () => {
    const { schema, problems } = await build([{ op: "dropField", table: "orders", name: "note" }]);
    expect(problems).toEqual([]);
    expect(schema.tables[0].fields.map((f) => f.name)).toEqual(["id", "status"]);
  });

  it("добавляет уникальный ключ", async () => {
    const key: Key = { kind: "unique", fields: ["status", "note"] };
    const { schema } = await build([{ op: "addKey", table: "orders", key }]);
    expect(schema.tables[0].keys).toEqual([key]);
  });

  it("добавляет индекс с именем orders_note_idx", async () => {
    const key: Key = { kind: "index", fields: ["note"], name: "orders_note_idx" };
    const { schema } = await build([{ op: "addKey", table: "orders", key }]);
    expect(schema.tables[0].keys).toEqual([key]);
  });

  it("добавляет внешний ключ customer_id -> customers.id", async () => {
    const key: Key = {
      kind: "foreign",
      fields: ["customer_id"],
      references: { table: "customers", fields: ["id"] },
    };
    const { schema } = await build([{ op: "addKey", table: "orders", key }]);
    expect(schema.tables[0].keys).toEqual([key]);
  });

  it("убирает ключ по имени", async () => {
    const { schema } = await build([
      { op: "addKey", table: "orders", key: { kind: "index", fields: ["note"], name: "orders_note_idx" } },
      { op: "addKey", table: "orders", key: { kind: "unique", fields: ["status"] } },
      { op: "dropKey", table: "orders", name: "orders_note_idx" },
    ]);
    expect(schema.tables[0].keys).toEqual([{ kind: "unique", fields: ["status"] }]);
  });

  it("убирает ключ по виду и полям", async () => {
    const { schema } = await build([
      { op: "addKey", table: "orders", key: { kind: "unique", fields: ["status"] } },
      { op: "addKey", table: "orders", key: { kind: "index", fields: ["status"] } },
      { op: "dropKey", table: "orders", kind: "unique", fields: ["status"] },
    ]);
    expect(schema.tables[0].keys).toEqual([{ kind: "index", fields: ["status"] }]);
  });

  it("задаёт первичный ключ заново", async () => {
    const { schema } = await build([{ op: "setPrimaryKey", table: "orders", fields: ["id", "status"] }]);
    expect(schema.tables[0].primaryKey).toEqual(["id", "status"]);
  });

  it("удаляет таблицу", async () => {
    const { schema, problems } = await build([{ op: "dropTable", table: "orders" }]);
    expect(problems).toEqual([]);
    expect(schema).toEqual({ tables: [] });
  });

  it("при удалении поля оставляет ключи, которые его называют", async () => {
    const key: Key = { kind: "index", fields: ["note"], name: "orders_note_idx" };
    const { schema, problems } = await build([
      { op: "addKey", table: "orders", key },
      { op: "dropField", table: "orders", name: "note" },
    ]);
    expect(problems).toEqual([]);
    expect(schema.tables[0].keys).toEqual([key]);
  });

  it("не меняет исходную схему", async () => {
    const { emptySchema, applyOperations } = await model();
    const before = emptySchema();
    applyOperations(before, [CREATE]);
    expect(before).toEqual({ tables: [] });
  });

});

function expectProblem(problems: Problem[], table: string, field?: string) {
  expect(problems).toHaveLength(1);
  expect(problems[0].table).toBe(table);
  expect(problems[0].field).toBe(field);
  expect(problems[0].message).toContain(table);
  if (field) expect(problems[0].message).toContain(field);
}

describe("applyOperations: проблемы", () => {
  it.each([
    ["меняют", { op: "addField", table: "ghosts", field: ID }],
    ["удаляют", { op: "dropTable", table: "ghosts" }],
  ])("называет таблицу, когда %s таблицу, которой нет", async (_verb, operation) => {
    const { emptySchema, applyOperations } = await model();
    expectProblem(applyOperations(emptySchema(), [operation as Operation]).problems, "ghosts");
  });

  it("называет таблицу и поле, когда поле уже есть", async () => {
    const { problems } = await build([{ op: "addField", table: "orders", field: NOTE }]);
    expectProblem(problems, "orders", "note");
  });

  it("называет таблицу и поле, когда удаляют поле, которого нет", async () => {
    const { problems } = await build([{ op: "dropField", table: "orders", name: "missing" }]);
    expectProblem(problems, "orders", "missing");
  });

  it("называет таблицу, когда создают таблицу, которая уже есть, и не меняет её", async () => {
    const { schema, problems } = await build([
      { op: "createTable", table: "orders", fields: [ID], primaryKey: ["id"] },
    ]);
    expectProblem(problems, "orders");
    expect(schema).toEqual({ tables: [orders()] });
  });

  it("называет таблицу и поле, когда меняют поле, которого нет, и не меняет таблицу", async () => {
    const { schema, problems } = await build([
      { op: "changeField", table: "orders", field: { name: "missing", type: "text", nullable: true } },
    ]);
    expectProblem(problems, "orders", "missing");
    expect(schema).toEqual({ tables: [orders()] });
  });

  it("называет таблицу и ключ, когда убирают по имени ключ, которого нет", async () => {
    const key: Key = { kind: "unique", fields: ["status"] };
    const { schema, problems } = await build([
      { op: "addKey", table: "orders", key },
      { op: "dropKey", table: "orders", name: "no_such_idx" },
    ]);
    expectProblem(problems, "orders");
    expect(problems[0].message).toContain("no_such_idx");
    expect(schema.tables[0].keys).toEqual([key]);
  });

  it("называет таблицу и ключ, когда убирают по виду и полям ключ, которого нет", async () => {
    const key: Key = { kind: "unique", fields: ["status"] };
    const { schema, problems } = await build([
      { op: "addKey", table: "orders", key },
      { op: "dropKey", table: "orders", kind: "index", fields: ["note"] },
    ]);
    expectProblem(problems, "orders");
    expect(problems[0].message).toContain("index (note)");
    expect(schema.tables[0].keys).toEqual([key]);
  });
});

describe("compareSchemas", () => {
  async function diff(expected: Schema, actual: Schema) {
    const { compareSchemas } = await model();
    return compareSchemas(expected, actual);
  }
  function schemaOf(table: Table): Schema {
    return { tables: [table] };
  }
  function withField(change: Partial<Field>, name = "status"): Table {
    return orders({ fields: [ID, NOTE, { ...STATUS, ...change, name }] });
  }

  it("не находит разницы у равных моделей", async () => {
    expect(await diff(schemaOf(orders()), schemaOf(orders()))).toEqual([]);
  });

  it("не находит разницы между VARCHAR (200) и varchar(200)", async () => {
    const a = orders({ fields: [ID, NOTE, { ...STATUS, type: "VARCHAR (200)" }] });
    const b = orders({ fields: [ID, NOTE, { ...STATUS, type: "varchar(200)" }] });
    expect(await diff(schemaOf(a), schemaOf(b))).toEqual([]);
  });

  it("не находит разницы у умолчаний, отличающихся внешними пробелами", async () => {
    const a = withField({ default: " 'new' " });
    expect(await diff(schemaOf(a), schemaOf(orders()))).toEqual([]);
  });

  it("находит лишнюю таблицу", async () => {
    const [d, ...rest] = await diff(schemaOf(orders()), { tables: [orders(), { ...orders(), name: "extra" }] });
    expect(rest).toEqual([]);
    expect(d.kind).toBe("extra-table");
    expect(d.table).toBe("extra");
    expect(d.message).toContain("extra");
  });

  it("находит недостающую таблицу", async () => {
    const [d, ...rest] = await diff(schemaOf(orders()), { tables: [] });
    expect(rest).toEqual([]);
    expect(d.kind).toBe("missing-table");
    expect(d.table).toBe("orders");
    expect(d.message).toContain("orders");
  });

  it("находит разные типы поля и называет оба значения", async () => {
    const [d, ...rest] = await diff(schemaOf(orders()), schemaOf(withField({ type: "varchar(30)" })));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("type");
    expect(d.table).toBe("orders");
    expect(d.field).toBe("status");
    expect(d.expected).toBe("varchar(20)");
    expect(d.actual).toBe("varchar(30)");
    expect(d.message).toContain("orders");
    expect(d.message).toContain("status");
    expect(d.message).toContain("varchar(30)");
  });

  it("находит разницу между int и integer", async () => {
    const a = orders({ fields: [{ ...ID, type: "int" }, NOTE, STATUS] });
    const b = orders({ fields: [{ ...ID, type: "integer" }, NOTE, STATUS] });
    const [d, ...rest] = await diff(schemaOf(a), schemaOf(b));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("type");
    expect(d.field).toBe("id");
    expect(d.expected).toBe("int");
    expect(d.actual).toBe("integer");
  });

  it("находит разную допустимость null", async () => {
    const [d, ...rest] = await diff(schemaOf(orders()), schemaOf(withField({ nullable: true })));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("nullability");
    expect(d.field).toBe("status");
    expect(d.expected).toBe("not null");
    expect(d.actual).toBe("null");
  });

  it("находит разное умолчание", async () => {
    const [d, ...rest] = await diff(schemaOf(orders()), schemaOf(withField({ default: "'old'" })));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("default");
    expect(d.field).toBe("status");
    expect(d.expected).toBe("'new'");
    expect(d.actual).toBe("'old'");
  });

  it("находит умолчание там, где его не должно быть", async () => {
    const [d, ...rest] = await diff(schemaOf(orders()), schemaOf(withField({ default: undefined })));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("default");
    expect(d.expected).toBe("'new'");
    expect(d.actual).toBe("none");
  });

  it("находит недостающее и лишнее поле", async () => {
    const a = orders();
    const b = orders({ fields: [ID, NOTE, { name: "extra", type: "text", nullable: true }] });
    const found = await diff(schemaOf(a), schemaOf(b));
    expect(found.map((d) => [d.kind, d.table, d.field])).toEqual([
      ["missing-field", "orders", "status"],
      ["extra-field", "orders", "extra"],
    ]);
  });

  it("находит разный первичный ключ", async () => {
    const [d, ...rest] = await diff(schemaOf(orders()), schemaOf(orders({ primaryKey: ["id", "status"] })));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("primary-key");
    expect(d.table).toBe("orders");
    expect(d.expected).toBe("id");
    expect(d.actual).toBe("id, status");
  });

  it("находит недостающий уникальный ключ без имени по виду и полям", async () => {
    const a = orders({ keys: [{ kind: "unique", fields: ["status"] }] });
    const [d, ...rest] = await diff(schemaOf(a), schemaOf(orders()));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("unique-key");
    expect(d.table).toBe("orders");
    expect(d.key).toBe("unique (status)");
    expect(d.expected).toBe("unique (status)");
    expect(d.actual).toBe("none");
    expect(d.message).toContain("unique (status)");
  });

  it("находит лишний индекс и называет его по имени", async () => {
    const b = orders({ keys: [{ kind: "index", fields: ["note"], name: "orders_note_idx" }] });
    const [d, ...rest] = await diff(schemaOf(orders()), schemaOf(b));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("index");
    expect(d.key).toBe("orders_note_idx");
    expect(d.expected).toBe("none");
    expect(d.actual).toBe("index (note)");
    expect(d.message).toContain("orders_note_idx");
  });

  it("находит индекс с тем же именем и другими полями", async () => {
    const a = orders({ keys: [{ kind: "index", fields: ["note"], name: "orders_note_idx" }] });
    const b = orders({ keys: [{ kind: "index", fields: ["note", "status"], name: "orders_note_idx" }] });
    const [d, ...rest] = await diff(schemaOf(a), schemaOf(b));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("index");
    expect(d.key).toBe("orders_note_idx");
    expect(d.expected).toBe("index (note)");
    expect(d.actual).toBe("index (note, status)");
  });

  it("находит недостающий внешний ключ и называет обе стороны", async () => {
    const fk: Key = {
      kind: "foreign",
      fields: ["customer_id"],
      references: { table: "customers", fields: ["id"] },
    };
    const [d, ...rest] = await diff(schemaOf(orders({ keys: [fk] })), schemaOf(orders()));
    expect(rest).toEqual([]);
    expect(d.kind).toBe("foreign-key");
    expect(d.table).toBe("orders");
    expect(d.key).toBe("foreign (customer_id)");
    expect(d.expected).toBe("foreign (customer_id) -> customers (id)");
    expect(d.actual).toBe("none");
  });

  it("находит внешний ключ, который ведёт в другую таблицу", async () => {
    const fk = (table: string): Key => ({
      kind: "foreign",
      fields: ["customer_id"],
      references: { table, fields: ["id"] },
    });
    const [d, ...rest] = await diff(
      schemaOf(orders({ keys: [fk("customers")] })),
      schemaOf(orders({ keys: [fk("clients")] })),
    );
    expect(rest).toEqual([]);
    expect(d.kind).toBe("foreign-key");
    expect(d.expected).toBe("foreign (customer_id) -> customers (id)");
    expect(d.actual).toBe("foreign (customer_id) -> clients (id)");
  });
});
