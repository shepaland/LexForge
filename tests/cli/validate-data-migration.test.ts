import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const EXPECTED = "\n`validate` exits `0` on the rollback that keeps the index\n";
const EXPECTED_FK = "\nan inline REFERENCES gives a foreign key\n";
const EXPECTED_DROP = "\nDROP CONSTRAINT is not supported\n";
const created: string[] = [];

const SPEC = `## Purpose

Lets a customer return an order and keeps the return in the database.

## ADDED Requirements

### Requirement: A customer returns an order

The system SHALL record the return of an order.
Data: STORE

#### Scenario: Return is recorded

- **WHEN** the customer returns an order
- **THEN** the return is stored
`;

const DIR = "lexforge/changes/add-returns/data/";
const PROJECT = "lexforge/data/";
const MAIN_CONFIG = "schema: spec-driven\ndata_stores:\n  - name: main\n    dialect: postgresql\n";
const EVENTS_CONFIG = "schema: spec-driven\ndata_stores:\n  - name: events\n    dialect: mongodb\n";

const ORDERS = "CREATE TABLE orders (id integer PRIMARY KEY);\n";
const ORDERS_NOTE = "CREATE TABLE orders (id integer PRIMARY KEY, note text);\n";
const INDEX = "CREATE INDEX orders_note_idx ON orders (note);\n";
const ADD_NOTE = "ALTER TABLE orders ADD COLUMN note text;\n";
const DROP_NOTE = "ALTER TABLE orders DROP COLUMN note;\n";

const EVENTS_HEAD = "| Field | Type | Nullable | Default |\n|---|---|---|---|\n| id | string | no | |\n";
const EVENTS_KEY = "\n| Key | Fields |\n|---|---|\n| primary | id |\n";
const EVENTS_TABLE = `## Table: events\n\n${EVENTS_HEAD}| note | string | yes | |\n${EVENTS_KEY}`;
const EVENTS_NEW = `## Table: events (create)\n\n${EVENTS_HEAD}${EVENTS_KEY}\n## Data migration\n\nThe collection is new, no data moves.\n`;
const EVENTS_UP = EVENTS_NEW.replace("| id | string | no | |\n", "| id | string | no | |\n| note | string | yes | |\n");
const EVENTS_DOWN_KEEPS = "## Table: events (alter)\n\n| Field | Action | Type | Nullable | Default |\n|---|---|---|---|---|\n| note | drop | | | |\n\n## Data migration\n\nThe note is dropped.\n";

function workspace(config: string, store: string, files: Record<string, string>): string {
  const all: Record<string, string> = {
    "lexforge/config.yaml": config,
    "lexforge/changes/add-returns/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-returns/proposal.md": "## Why\n\nReturns are handled by hand.\n",
    "lexforge/changes/add-returns/specs/returns/spec.md": SPEC.replace("STORE", store),
    "lexforge/changes/add-returns/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-returns/tasks.md": "## 1. Returns\n\n- [ ] 1.1 Write the failing test\n",
  };
  for (const [name, content] of Object.entries(files)) {
    all[(name.startsWith(PROJECT) ? "" : DIR) + name] = content;
  }
  const root = makeWorkspace(all);
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) removeWorkspace(created.pop()!);
});

interface Report {
  findings: { file: string; line: number; rule: string; message: string }[];
}

async function validate(root: string) {
  const capture = createCapture();
  const exitCode = await run(["validate", "add-returns", "--strict", "--json"], {
    cwd: root,
    stdout: capture.stdout,
    stderr: capture.stderr,
  });
  const report = JSON.parse(capture.out) as Report;
  return { exitCode, findings: report.findings.filter((item) => item.rule.startsWith("data-")) };
}

function main(schema: string, up: string, down: string, project: string | null = ORDERS) {
  const files: Record<string, string> = { "main/schema.sql": schema, "main/up.sql": up, "main/down.sql": down };
  if (project !== null) files[`${PROJECT}main/schema.sql`] = project;
  return workspace(MAIN_CONFIG, "main", files);
}

describe("lexforge validate compares the migration with the schemas", () => {
  it("down.sql без удаления индекса: finding называет main, down.sql, orders и orders_note_idx", async () => {
    const root = main(ORDERS_NOTE + INDEX, ADD_NOTE + INDEX, DROP_NOTE);
    const { exitCode, findings } = await validate(root);

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-migration-down"]);
    for (const word of ["main", "down.sql", "orders", "orders_note_idx"]) {
      expect(findings[0]!.message).toContain(word);
    }
  });

  it("schema.sql с varchar(200) при up.sql с text: finding называет orders.note и оба типа", async () => {
    const schema = "CREATE TABLE orders (id integer PRIMARY KEY, note varchar(200));\n";
    const { exitCode, findings } = await validate(main(schema, ADD_NOTE, DROP_NOTE));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-migration-up"]);
    for (const word of ["main", "up.sql", "orders.note", "text", "varchar(200)"]) {
      expect(findings[0]!.message).toContain(word);
    }
  });

  it("up, schema и down сходятся: выход 0", async () => {
    const { exitCode, findings } = await validate(main(ORDERS_NOTE + INDEX, ADD_NOTE + INDEX, DROP_NOTE + "DROP INDEX orders_note_idx;\n"));

    expect(findings).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("schema.sql без первичного ключа и up.sql с другим типом: оба finding в одном прогоне", async () => {
    const schema = "CREATE TABLE orders (id integer, note varchar(200));\n";
    const project = "CREATE TABLE orders (id integer);\n";
    const { exitCode, findings } = await validate(main(schema, ADD_NOTE, DROP_NOTE, project));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-table-no-primary-key", "data-migration-up"]);
    expect(findings[1]!.message).toContain("orders.note");
  });

  it("UPDATE в up.sql не меняет сравнения", async () => {
    const up = `${ADD_NOTE}UPDATE orders SET note = 'none';\n`;
    const { exitCode, findings } = await validate(main(ORDERS_NOTE, up, DROP_NOTE));

    expect(findings).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("без lexforge/data/main первая миграция с созданием и удалением orders: выход 0", async () => {
    const { exitCode, findings } = await validate(main(ORDERS, ORDERS, "DROP TABLE orders;\n", null));

    expect(findings).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("без lexforge/data/main down.sql оставляет orders: finding называет down.sql и orders", async () => {
    const { exitCode, findings } = await validate(main(ORDERS_NOTE, ORDERS_NOTE, DROP_NOTE, null));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-migration-down"]);
    expect(findings[0]!.message).toContain("down.sql");
    expect(findings[0]!.message).toContain("orders");
  });

  it("down.sql с DROP INDEX несуществующего индекса: finding называет down.sql и индекс", async () => {
    const down = `${DROP_NOTE}DROP INDEX orders_missing_idx;\n`;
    const { exitCode, findings } = await validate(main(ORDERS_NOTE, ADD_NOTE, down));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-migration-down"]);
    expect(findings[0]!.message).toContain("down.sql");
    expect(findings[0]!.message).toContain("orders_missing_idx");
  });

  it("down.sql с DROP COLUMN несуществующего поля: finding называет down.sql и orders.missing", async () => {
    const down = `${DROP_NOTE}ALTER TABLE orders DROP COLUMN missing;\n`;
    const { exitCode, findings } = await validate(main(ORDERS_NOTE, ADD_NOTE, down));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-migration-down"]);
    expect(findings[0]!.message).toContain("down.sql");
    expect(findings[0]!.message).toContain("orders.missing");
  });

  it("lexforge/data/main/schema.sql не разбирается: один data-file-parse с именем этого файла", async () => {
    const broken = "ALTER TABLE orders ADD COLUM note text\n";
    const { exitCode, findings } = await validate(main(ORDERS_NOTE, ADD_NOTE, DROP_NOTE, broken));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-file-parse"]);
    expect(findings[0]!.message).toContain("lexforge/data/main/schema.sql");
  });

  it("events на mongodb: down.md оставляет таблицу events, finding называет events, down.md и таблицу", async () => {
    const files = { "events/schema.md": EVENTS_TABLE, "events/up.md": EVENTS_UP, "events/down.md": EVENTS_DOWN_KEEPS };
    const { exitCode, findings } = await validate(workspace(EVENTS_CONFIG, "events", files));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-migration-down"]);
    for (const word of ["events", "down.md", "table events"]) {
      expect(findings[0]!.message).toContain(word);
    }
  });

  it("up.sql добавляет внешний ключ, down.sql снимает его через DROP CONSTRAINT: выход 0", async () => {
    const customers = "CREATE TABLE customers (id integer PRIMARY KEY);\n";
    const project = `${customers}CREATE TABLE orders (id integer PRIMARY KEY, customer_id integer);\n`;
    const schema = `${customers}CREATE TABLE orders (id integer PRIMARY KEY, customer_id integer, CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id));\n`;
    const up = "ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id);\n";
    const down = "ALTER TABLE orders DROP CONSTRAINT orders_customer_fk;\n";
    const { exitCode, findings } = await validate(main(schema, up, down, project));

    expect(findings, EXPECTED_DROP).toEqual([]);
    expect(exitCode, EXPECTED_DROP).toBe(0);
  });

  it("REFERENCES на колонке в schema.sql и в up.sql, DROP COLUMN в down.sql: выход 0", async () => {
    const customers = "CREATE TABLE customers (id integer PRIMARY KEY);\n";
    const project = `${customers}CREATE TABLE orders (id integer PRIMARY KEY);\n`;
    const schema = `${customers}CREATE TABLE orders (id integer PRIMARY KEY, customer_id int REFERENCES customers (id));\n`;
    const up = "ALTER TABLE orders ADD COLUMN customer_id int REFERENCES customers (id);\n";
    const down = "ALTER TABLE orders DROP COLUMN customer_id;\n";
    const { exitCode, findings } = await validate(main(schema, up, down, project));

    expect(findings, EXPECTED_FK).toEqual([]);
    expect(exitCode, EXPECTED_FK).toBe(0);
  });
});
