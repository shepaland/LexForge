import { createRequire } from "node:module";
import { SQL_DIALECTS } from "./dialects.js";
import type { Field, Key, Operation } from "./schema-model.js";

export type SqlRead = { operations: Operation[] } | { error: string };

type Node = Record<string, any>;

interface ParserBuild {
  Parser: new () => {
    astify(text: string, options: { database: string }): Node | Node[];
    exprToSQL(node: Node, options: { database: string }): string;
  };
}

class Unmapped extends Error {}

const require = createRequire(import.meta.url);

// Renders an expression default with the dialect's own printer; set by readSql for the call.
let render: (node: Node) => string = () => "";

function loadParser(dialect: string): ParserBuild {
  return require(`node-sql-parser/build/${dialect}.js`) as ParserBuild;
}

function columnName(ref: Node): string {
  const column = ref.column;
  if (typeof column === "string") return column;
  const value = column?.expr?.value;
  return typeof value === "string" ? value : String(value ?? "");
}

function tableName(entry: Node | Node[]): string {
  const node = Array.isArray(entry) ? entry[0] : entry;
  return String(node?.table ?? "");
}

function names(refs: Node[] | undefined): string[] {
  return (refs ?? []).map(columnName);
}

function typeText(definition: Node): string {
  let text = String(definition.dataType ?? "").toLowerCase();
  if (definition.length !== undefined && definition.length !== null) {
    const scale = definition.scale !== undefined && definition.scale !== null ? `,${definition.scale}` : "";
    text += `(${definition.length}${scale})`;
  }
  for (const word of definition.suffix ?? []) text += ` ${String(word).toLowerCase()}`;
  text += "[]".repeat(Number(definition.array?.dimension ?? 0));
  return text;
}

// A literal keeps its source form, NULL means no default, any other node is printed by the dialect.
// `where` names the table and column for the error when a node cannot be printed.
function literal(node: Node | null | undefined, where: string): string | undefined {
  if (node === null || node === undefined) return undefined;
  if (node.type === "default" || node.type === "set default") return literal(node.value, where);
  if (node.type === "null") return undefined;
  const value = node.value;
  const scalar = value !== undefined && value !== null && typeof value !== "object";
  if (node.type !== "function" && node.type !== "cast" && scalar) {
    return String(node.type).includes("string") ? `'${String(value)}'` : String(value);
  }
  let text = "";
  try {
    text = render(node);
  } catch {
    text = "";
  }
  if (text === "") {
    throw new Unmapped(`The default of ${where} is an expression the reader cannot print. Write it as a literal or a function call, or describe the step in Markdown.`);
  }
  return text;
}

function fieldOf(entry: Node, primary: boolean, table: string): Field {
  const field: Field = {
    name: columnName(entry.column),
    type: typeText(entry.definition ?? {}),
    nullable: !(primary || entry.nullable?.type === "not null"),
  };
  const fallback = literal(entry.default_val, `${table}.${field.name}`);
  if (fallback !== undefined) field.default = fallback;
  return field;
}

function constraintKey(entry: Node): Key | undefined {
  const type = String(entry.constraint_type ?? "").toLowerCase();
  const name = typeof entry.constraint === "string" ? entry.constraint : undefined;
  const fields = names(entry.definition);
  let key: Key;
  if (type === "unique" || type === "unique key") key = { kind: "unique", fields };
  else if (type === "foreign key") {
    const reference = entry.reference_definition ?? {};
    key = {
      kind: "foreign",
      fields,
      references: { table: tableName(reference.table), fields: names(reference.definition) },
    };
  } else return undefined;
  if (name) key.name = name;
  return key;
}

// An inline REFERENCES on a column is a foreign key on that column, like the table-level form.
function inlineKeys(entry: Node, table: string): Operation[] {
  const reference = entry.reference_definition;
  if (!reference) return [];
  const key: Key = {
    kind: "foreign",
    fields: [columnName(entry.column)],
    references: { table: tableName(reference.table), fields: names(reference.definition) },
  };
  return [{ op: "addKey", table, key }];
}

function readCreateTable(tree: Node): Operation[] {
  const table = tableName(tree.table);
  const fields: Field[] = [];
  const keys: Operation[] = [];
  let primaryKey: string[] = [];
  for (const entry of tree.create_definitions ?? []) {
    if (entry.resource === "column") {
      const primary = Boolean(entry.primary_key);
      fields.push(fieldOf(entry, primary, table));
      if (primary) primaryKey = [columnName(entry.column)];
      if (entry.unique) keys.push({ op: "addKey", table, key: { kind: "unique", fields: [columnName(entry.column)] } });
      keys.push(...inlineKeys(entry, table));
    } else if (entry.resource === "constraint") {
      if (String(entry.constraint_type).toLowerCase() === "primary key") primaryKey = names(entry.definition);
      else {
        const key = constraintKey(entry);
        if (key) keys.push({ op: "addKey", table, key });
      }
    }
  }
  const create: Operation = { op: "createTable", table, fields };
  if (primaryKey.length > 0) create.primaryKey = primaryKey;
  return [create, ...keys];
}

function readCreateIndex(tree: Node): Operation[] {
  const unique = String(tree.index_type ?? "").toLowerCase() === "unique";
  const columns = tree.index_columns ?? tree.definition ?? [];
  const key: Key = { kind: unique ? "unique" : "index", fields: names(columns) };
  if (typeof tree.index === "string") key.name = tree.index;
  return [{ op: "addKey", table: tableName(tree.table), key }];
}

function actionName(action: Node): string {
  const resource = action.resource ?? action.keyword ?? "";
  return `${String(action.action).toUpperCase()} ${String(resource).toUpperCase()}`.trim();
}

function readAlterAction(table: string, action: Node): Operation[] {
  if (action.resource === "column" && String(action.action) === "add") {
    return [{ op: "addField", table, field: fieldOf(action, false, table) }, ...inlineKeys(action, table)];
  }
  return [readAlterChange(table, action)];
}

function readAlterChange(table: string, action: Node): Operation {
  const verb = String(action.action);
  if (action.resource === "column" && verb === "drop") {
    return { op: "dropField", table, name: columnName(action.column) };
  }
  if (action.resource === "column" && verb === "alter") {
    const name = columnName(action.column);
    const change: Operation = { op: "alterField", table, name };
    const where = `${table}.${name}`;
    if (action.definition) {
      change.type = typeText(action.definition);
      // transactsql carries NULL / NOT NULL beside the type; postgresql TYPE carries neither.
      if (action.nullable?.type === "not null") change.nullable = false;
      else if (action.nullable?.type === "null") change.nullable = true;
      if (action.default_val) change.default = literal(action.default_val, where) ?? null;
    } else if (action.nullable?.type === "not null") change.nullable = action.nullable.action !== "set";
    else if (action.default_val?.type === "set default") change.default = literal(action.default_val.value, where) ?? null;
    else if (action.default_val?.type === "drop default") change.default = null;
    else throw new Unmapped(`The ALTER TABLE action ${actionName(action)} is not supported.`);
    return change;
  }
  if (action.resource === "column" && (verb === "modify" || verb === "change") && action.definition) {
    return { op: "changeField", table, field: fieldOf(action, false, table) };
  }
  if (action.resource === "constraint" && verb === "add") {
    const definition: Node = action.create_definitions ?? {};
    if (String(definition.constraint_type).toLowerCase() === "primary key") {
      return { op: "setPrimaryKey", table, fields: names(definition.definition) };
    }
    const key = constraintKey(definition);
    if (key) return { op: "addKey", table, key };
  }
  if (action.resource === "constraint" && verb === "drop") {
    return { op: "dropKey", table, name: String(action.constraint) };
  }
  if (action.resource === "key" && verb === "drop" && String(action.keyword).toLowerCase() === "primary key") {
    return { op: "setPrimaryKey", table, fields: [] };
  }
  throw new Unmapped(`The ALTER TABLE action ${actionName(action)} is not supported. Write the step with one of the changes the reader maps: ADD COLUMN, DROP COLUMN, ALTER COLUMN TYPE, MODIFY COLUMN, ADD CONSTRAINT, DROP CONSTRAINT, DROP PRIMARY KEY (mysql).`);
}

function readStatement(tree: Node): Operation[] {
  if (tree.type === "create" && tree.keyword === "table") return readCreateTable(tree);
  if (tree.type === "create" && tree.keyword === "index") return readCreateIndex(tree);
  if (tree.type === "alter" && (tree.keyword === undefined || tree.keyword === "table")) {
    const table = tableName(tree.table);
    return (tree.expr ?? []).flatMap((action: Node) => readAlterAction(table, action));
  }
  if (tree.type === "drop" && tree.keyword === "table") {
    return (tree.name as Node[]).map((entry) => ({ op: "dropTable" as const, table: tableName(entry) }));
  }
  if (tree.type === "drop" && tree.keyword === "index") {
    return [{ op: "dropKey", table: String(tree.table?.table ?? ""), name: columnName(tree.name) }];
  }
  return [];
}

export function readSql(text: string, dialect: string): SqlRead {
  if (!(SQL_DIALECTS as readonly string[]).includes(dialect)) {
    return { error: `The SQL dialect ${dialect} is not known. Use one of: ${SQL_DIALECTS.join(", ")}.` };
  }
  try {
    const parser = new (loadParser(dialect).Parser)();
    render = (node) => parser.exprToSQL(node, { database: dialect });
    const parsed = parser.astify(text, { database: dialect });
    const trees = Array.isArray(parsed) ? parsed : [parsed];
    return { operations: trees.flatMap(readStatement) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
