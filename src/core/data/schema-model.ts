export interface Field {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
}

export interface Key {
  kind: "unique" | "index" | "foreign";
  fields: string[];
  name?: string;
  references?: { store?: string; table: string; fields: string[] };
}

export interface Table {
  name: string;
  fields: Field[];
  primaryKey: string[];
  keys: Key[];
}

export interface Schema {
  tables: Table[];
}

export type Operation =
  | { op: "createTable"; table: string; fields: Field[]; primaryKey?: string[] }
  | { op: "dropTable"; table: string }
  | { op: "addField"; table: string; field: Field }
  | { op: "changeField"; table: string; field: Field }
  | { op: "alterField"; table: string; name: string; type?: string; nullable?: boolean; default?: string | null }
  | { op: "dropField"; table: string; name: string }
  | { op: "setPrimaryKey"; table: string; fields: string[] }
  | { op: "addKey"; table: string; key: Key }
  | { op: "dropKey"; table: string; name?: string; kind?: Key["kind"]; fields?: string[] };

export interface Problem {
  table: string;
  field?: string;
  message: string;
}

export interface Difference {
  kind: string;
  table: string;
  field?: string;
  key?: string;
  expected: string;
  actual: string;
  message: string;
}

export function emptySchema(): Schema {
  return { tables: [] };
}

function cloneTable(table: Table): Table {
  return structuredClone(table);
}

function sameFields(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((name, i) => name === b[i]);
}

export function applyOperations(
  schema: Schema,
  operations: Operation[],
): { schema: Schema; problems: Problem[] } {
  const tables = schema.tables.map(cloneTable);
  const problems: Problem[] = [];
  const find = (name: string) => tables.find((t) => t.name === name);

  for (const operation of operations) {
    const name = operation.table;
    if (operation.op === "createTable") {
      if (find(name)) {
        problems.push({ table: name, message: `The table ${name} already exists.` });
        continue;
      }
      tables.push({
        name,
        fields: structuredClone(operation.fields),
        primaryKey: [...(operation.primaryKey ?? [])],
        keys: [],
      });
      continue;
    }
    if (operation.op === "dropKey" && name === "" && operation.name !== undefined) {
      // A key dropped by name alone (postgresql DROP INDEX): search every table.
      const owner = tables.find((t) => t.keys.some((k) => k.name === operation.name));
      if (owner) owner.keys.splice(owner.keys.findIndex((k) => k.name === operation.name), 1);
      else problems.push({ table: "", message: `The key ${operation.name} does not exist in any table.` });
      continue;
    }
    const table = find(name);
    if (!table) {
      problems.push({ table: name, message: `The table ${name} does not exist.` });
      continue;
    }
    switch (operation.op) {
      case "dropTable":
        tables.splice(tables.indexOf(table), 1);
        break;
      case "addField":
        if (table.fields.some((f) => f.name === operation.field.name)) {
          const field = operation.field.name;
          problems.push({ table: name, field, message: `The field ${field} already exists in the table ${name}.` });
        } else {
          table.fields.push(structuredClone(operation.field));
        }
        break;
      case "changeField": {
        const index = table.fields.findIndex((f) => f.name === operation.field.name);
        if (index < 0) {
          const field = operation.field.name;
          problems.push({ table: name, field, message: `The field ${field} does not exist in the table ${name}.` });
        } else {
          table.fields[index] = structuredClone(operation.field);
        }
        break;
      }
      case "alterField": {
        const field = table.fields.find((f) => f.name === operation.name);
        if (!field) {
          const missing = operation.name;
          problems.push({ table: name, field: missing, message: `The field ${missing} does not exist in the table ${name}.` });
          break;
        }
        if (operation.type !== undefined) field.type = operation.type;
        if (operation.nullable !== undefined) field.nullable = operation.nullable;
        if (operation.default === null) delete field.default;
        else if (operation.default !== undefined) field.default = operation.default;
        break;
      }
      case "dropField": {
        const index = table.fields.findIndex((f) => f.name === operation.name);
        if (index < 0) {
          const field = operation.name;
          problems.push({ table: name, field, message: `The field ${field} does not exist in the table ${name}.` });
        } else {
          table.fields.splice(index, 1);
          // A foreign key goes with its column. Indexes and unique keys stay: the spec makes a rollback that forgets one a finding.
          table.keys = table.keys.filter((key) => key.kind !== "foreign" || !key.fields.includes(operation.name));
        }
        break;
      }
      case "setPrimaryKey":
        table.primaryKey = [...operation.fields];
        break;
      case "addKey":
        table.keys.push(structuredClone(operation.key));
        break;
      case "dropKey": {
        const index = table.keys.findIndex((k) =>
          operation.name !== undefined
            ? k.name === operation.name
            : k.kind === operation.kind && sameFields(k.fields, operation.fields ?? []),
        );
        if (index < 0) {
          const what = operation.name ?? `${operation.kind} (${(operation.fields ?? []).join(", ")})`;
          problems.push({ table: name, message: `The key ${what} does not exist in the table ${name}.` });
        } else {
          table.keys.splice(index, 1);
        }
        break;
      }
    }
  }
  return { schema: { tables }, problems };
}

function describeKey(key: Key): string {
  const base = `${key.kind} (${key.fields.join(", ")})`;
  if (!key.references) return base;
  const { store, table, fields } = key.references;
  return `${base} -> ${store ? `${store}.` : ""}${table} (${fields.join(", ")})`;
}

function keyId(key: Key): string {
  return key.name ?? `${key.kind} (${key.fields.join(", ")})`;
}

const KEY_KIND = { unique: "unique-key", index: "index", foreign: "foreign-key" } as const;

function normalizeType(type: string): string {
  return type.toLowerCase().replace(/\s+/g, "");
}

function normalizeDefault(value: string | undefined): string {
  return value === undefined ? "none" : value.trim();
}

function compareFields(table: string, expected: Field[], actual: Field[], out: Difference[]): void {
  for (const want of expected) {
    const got = actual.find((f) => f.name === want.name);
    if (!got) {
      out.push({
        kind: "missing-field",
        table,
        field: want.name,
        expected: want.type,
        actual: "none",
        message: `The table ${table} lacks the field ${want.name}.`,
      });
      continue;
    }
    const at = `the field ${want.name} of the table ${table}`;
    if (normalizeType(want.type) !== normalizeType(got.type)) {
      out.push({
        kind: "type",
        table,
        field: want.name,
        expected: normalizeType(want.type),
        actual: normalizeType(got.type),
        message: `The type of ${at} is ${normalizeType(got.type)}, expected ${normalizeType(want.type)}.`,
      });
    }
    if (want.nullable !== got.nullable) {
      const [e, a] = [want, got].map((f) => (f.nullable ? "null" : "not null"));
      out.push({
        kind: "nullability",
        table,
        field: want.name,
        expected: e,
        actual: a,
        message: `The nullability of ${at} is ${a}, expected ${e}.`,
      });
    }
    const [wd, gd] = [normalizeDefault(want.default), normalizeDefault(got.default)];
    if (wd !== gd) {
      out.push({
        kind: "default",
        table,
        field: want.name,
        expected: wd,
        actual: gd,
        message: `The default of ${at} is ${gd}, expected ${wd}.`,
      });
    }
  }
  for (const got of actual) {
    if (expected.some((f) => f.name === got.name)) continue;
    out.push({
      kind: "extra-field",
      table,
      field: got.name,
      expected: "none",
      actual: got.type,
      message: `The table ${table} has the extra field ${got.name}.`,
    });
  }
}

function compareKeys(table: string, expected: Key[], actual: Key[], out: Difference[]): void {
  const seen = new Set<Key>();
  const push = (key: Key, want: Key | undefined, got: Key | undefined) => {
    const [e, a] = [want, got].map((k) => (k ? describeKey(k) : "none"));
    out.push({
      kind: KEY_KIND[key.kind],
      table,
      key: keyId(key),
      expected: e,
      actual: a,
      message: `The key ${keyId(key)} of the table ${table} is ${a}, expected ${e}.`,
    });
  };
  for (const want of expected) {
    const got = actual.find((k) => !seen.has(k) && keyId(k) === keyId(want) && k.kind === want.kind);
    if (got) seen.add(got);
    if (!got || describeKey(got) !== describeKey(want)) push(want, want, got);
  }
  for (const got of actual) {
    if (!seen.has(got)) push(got, undefined, got);
  }
}

export function compareSchemas(expected: Schema, actual: Schema): Difference[] {
  const out: Difference[] = [];
  for (const want of expected.tables) {
    const got = actual.tables.find((t) => t.name === want.name);
    if (!got) {
      out.push({
        kind: "missing-table",
        table: want.name,
        expected: "present",
        actual: "none",
        message: `The table ${want.name} is missing.`,
      });
      continue;
    }
    compareFields(want.name, want.fields, got.fields, out);
    if (!sameFields(want.primaryKey, got.primaryKey)) {
      const [e, a] = [want.primaryKey.join(", "), got.primaryKey.join(", ")];
      out.push({
        kind: "primary-key",
        table: want.name,
        expected: e,
        actual: a,
        message: `The primary key of the table ${want.name} is (${a}), expected (${e}).`,
      });
    }
    compareKeys(want.name, want.keys, got.keys, out);
  }
  for (const got of actual.tables) {
    if (expected.tables.some((t) => t.name === got.name)) continue;
    out.push({
      kind: "extra-table",
      table: got.name,
      expected: "none",
      actual: "present",
      message: `The table ${got.name} is extra.`,
    });
  }
  return out;
}
