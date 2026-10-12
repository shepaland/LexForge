import type { Field, Key, Operation } from "./schema-model.js";

export interface ReadError {
  line: number;
  message: string;
}

export interface SchemaRead {
  operations: Operation[];
  errors: ReadError[];
}

export interface StepRead extends SchemaRead {
  dataMigration: string | null;
}

interface Row {
  line: number;
  cells: Record<string, string>;
}

interface Section {
  line: number;
  title: string;
  body: string[];
  bodyStart: number;
}

const KEY_KINDS = ["primary", "unique", "index", "foreign"];
const ACTIONS = ["add", "change", "drop"];
const HEADING = /^#{1,2}\s/;

function splitSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  lines.forEach((text, index) => {
    const match = /^##\s+(.*?)\s*$/.exec(text);
    if (match) {
      sections.push({ line: index + 1, title: match[1]!, body: [], bodyStart: index + 2 });
    } else if (HEADING.test(text)) {
      sections.push({ line: index + 1, title: "", body: [], bodyStart: index + 2 });
    } else {
      sections.at(-1)?.body.push(text);
    }
  });
  return sections;
}

function splitCells(text: string): string[] {
  return text.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

// Reads the pipe tables of a section as lists of rows keyed by the lower-cased header cell.
function readTables(section: Section): { header: string[]; rows: Row[] }[] {
  const tables: { header: string[]; rows: Row[] }[] = [];
  let current: { header: string[]; rows: Row[] } | undefined;
  section.body.forEach((text, index) => {
    if (!text.trim().startsWith("|")) {
      current = undefined;
      return;
    }
    const cells = splitCells(text);
    if (!current) {
      current = { header: cells.map((c) => c.toLowerCase()), rows: [] };
      tables.push(current);
    } else if (!/^[\s:|-]+$/.test(text)) {
      const row: Row = { line: section.bodyStart + index, cells: {} };
      current.header.forEach((name, i) => (row.cells[name] = cells[i] ?? ""));
      current.rows.push(row);
    }
  });
  return tables;
}

function readField(row: Row, errors: ReadError[]): Field {
  const { field = "", type = "", nullable = "", default: value = "" } = row.cells;
  const answer = nullable.toLowerCase();
  if (answer !== "yes" && answer !== "no") {
    errors.push({ line: row.line, message: `Nullable of the field ${field} is "${nullable}". Write yes or no.` });
  }
  const result: Field = { name: field, type, nullable: answer === "yes" };
  if (value !== "") result.default = value;
  return result;
}

function fieldList(text: string): string[] {
  return text.split(",").map((f) => f.trim()).filter((f) => f !== "");
}

interface KeyRead {
  kind: string;
  fields: string[];
  references?: Key["references"];
}

function readKey(row: Row, errors: ReadError[], allowBareForeign: boolean): KeyRead | undefined {
  const kind = (row.cells["key"] ?? "").toLowerCase();
  const text = row.cells["fields"] ?? "";
  if (!KEY_KINDS.includes(kind)) {
    errors.push({ line: row.line, message: `The key "${row.cells["key"]}" is not known. Use primary, unique, index or foreign.` });
    return undefined;
  }
  if (kind !== "foreign") return { kind, fields: fieldList(text) };
  const [from = "", to] = text.split("->");
  if (to === undefined) {
    if (allowBareForeign) return { kind, fields: fieldList(from) };
    errors.push({ line: row.line, message: `The foreign key "${text}" has no "->". Write it as column -> table.column.` });
    return undefined;
  }
  const parts = to.trim().split(".").map((p) => p.trim());
  const column = parts.pop() ?? "";
  const table = parts.pop() ?? "";
  const references: NonNullable<Key["references"]> = { table, fields: [column] };
  if (parts.length > 0) references.store = parts.join(".");
  return { kind, fields: fieldList(from), references };
}

function toKey(read: KeyRead): Key {
  const key: Key = { kind: read.kind as Key["kind"], fields: read.fields };
  if (read.references) key.references = read.references;
  return key;
}

function createOperations(section: Section, name: string, errors: ReadError[]): Operation[] {
  const tables = readTables(section);
  const fieldTable = tables.find((t) => t.header.includes("field"));
  if (!fieldTable) {
    errors.push({ line: section.line, message: `The table ${name} has no field table. Add a table with the columns Field, Type, Nullable and Default.` });
    return [];
  }
  const fields = fieldTable.rows.map((row) => readField(row, errors));
  const keys = tables.filter((t) => t.header.includes("key")).flatMap((t) => t.rows);
  const operations: Operation[] = [];
  let primaryKey: string[] = [];
  for (const row of keys) {
    const key = readKey(row, errors, false);
    if (!key) continue;
    if (key.kind === "primary") primaryKey = key.fields;
    else operations.push({ op: "addKey", table: name, key: toKey(key) });
  }
  return [{ op: "createTable", table: name, fields, primaryKey }, ...operations];
}

function actionOf(row: Row, errors: ReadError[]): string | undefined {
  const action = (row.cells["action"] ?? "").toLowerCase();
  if (ACTIONS.includes(action)) return action;
  errors.push({ line: row.line, message: `The action "${row.cells["action"] ?? ""}" is not known. Use add, change or drop.` });
  return undefined;
}

function alterOperations(section: Section, name: string, errors: ReadError[]): Operation[] {
  const operations: Operation[] = [];
  for (const table of readTables(section)) {
    for (const row of table.rows) {
      const action = actionOf(row, errors);
      if (!action) continue;
      if (table.header.includes("field")) {
        const fieldName = row.cells["field"] ?? "";
        if (action === "drop") {
          operations.push({ op: "dropField", table: name, name: fieldName });
        } else {
          const op = action === "add" ? "addField" : "changeField";
          operations.push({ op, table: name, field: readField(row, errors) });
        }
      } else if (table.header.includes("key")) {
        if (action === "change") {
          errors.push({ line: row.line, message: "A key cannot be changed. Drop it in one row and add it in another." });
          continue;
        }
        const key = readKey(row, errors, action === "drop");
        if (!key) continue;
        if (key.kind === "primary") {
          const fields = action === "add" ? key.fields : [];
          operations.push({ op: "setPrimaryKey", table: name, fields });
        } else if (action === "add") {
          operations.push({ op: "addKey", table: name, key: toKey(key) });
        } else {
          operations.push({ op: "dropKey", table: name, kind: key.kind as Key["kind"], fields: key.fields });
        }
      }
    }
  }
  return operations;
}

export function readMarkdownSchema(text: string): SchemaRead {
  const errors: ReadError[] = [];
  const operations: Operation[] = [];
  for (const section of splitSections(text.split(/\r?\n/))) {
    const match = /^Table:\s*(.+)$/.exec(section.title);
    if (match) operations.push(...createOperations(section, match[1]!.trim(), errors));
  }
  return { operations, errors };
}

export function readMarkdownStep(text: string): StepRead {
  const errors: ReadError[] = [];
  const operations: Operation[] = [];
  let dataMigration: string | null = null;
  for (const section of splitSections(text.split(/\r?\n/))) {
    if (/^Data migration$/i.test(section.title)) {
      dataMigration = section.body.join("\n").trim();
      continue;
    }
    const match = /^Table:\s*(.+)$/.exec(section.title);
    if (!match) continue;
    const heading = /^(.*?)\s*\((create|alter|drop)\)$/.exec(match[1]!.trim());
    if (!heading) {
      errors.push({ line: section.line, message: `The heading "${section.title}" has no mode. End it with (create), (alter) or (drop).` });
      continue;
    }
    const [, name = "", mode] = heading;
    if (mode === "create") operations.push(...createOperations(section, name, errors));
    else if (mode === "alter") operations.push(...alterOperations(section, name, errors));
    else operations.push({ op: "dropTable", table: name });
  }
  return { operations, dataMigration, errors };
}
