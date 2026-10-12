import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const EXPECTED = "\n`validate` exits `0` on the change that names billing\n";
const DIALECT_RED = "\nno `data-store-dialect` finding for PostgreSQL\n";
const GHOST = "\na finding names ghost\n";
const created: string[] = [];

function spec(marker: string): string {
  return `## Purpose

Lets a customer return an order and keeps the return in the database.

## ADDED Requirements

### Requirement: A customer returns an order

The system SHALL record the return of an order.
${marker}

#### Scenario: Return is recorded

- **WHEN** the customer returns an order
- **THEN** the return is stored
`;
}

const MAIN_CONFIG = "schema: spec-driven\ndata_stores:\n  - name: main\n    dialect: postgresql\n";
const EVENTS_CONFIG = "schema: spec-driven\ndata_stores:\n  - name: events\n    dialect: mongodb\n";
const DIR = "lexforge/changes/add-returns/data/";

const SCHEMA_SQL = "CREATE TABLE orders (id integer PRIMARY KEY, note text);\n";
const NO_KEY_SQL = "CREATE TABLE orders (id integer, note text);\n";
const DOWN_SQL = "DROP TABLE orders;\n";

const TABLE_MD = `## Table: user_events

| Field | Type | Nullable | Default |
|---|---|---|---|
| id | string | no | |

| Key | Fields |
|---|---|
| primary | id |
`;
const NO_KEY_MD = TABLE_MD.replace("| primary | id |", "| index | id |");
const upMd = (table: string) => `${table.replace("user_events", "user_events (create)")}
## Data migration

The collection is new, no data moves.
`;
const UP_MD = upMd(TABLE_MD);
const DOWN_MD = "## Table: user_events (drop)\n\n## Data migration\n\nThe collection is dropped, no data moves.\n";

function workspace(config: string, marker: string | null, data: Record<string, string> = {}): string {
  const files: Record<string, string> = {
    "lexforge/config.yaml": config,
    "lexforge/changes/add-returns/.lexforge.yaml": "schema: spec-driven\n",
    "lexforge/changes/add-returns/proposal.md": "## Why\n\nReturns are handled by hand.\n",
    "lexforge/changes/add-returns/specs/returns/spec.md": spec(marker ?? ""),
    "lexforge/changes/add-returns/design.md": "## Context\n\nOne service, one database.\n",
    "lexforge/changes/add-returns/tasks.md": "## 1. Returns\n\n- [ ] 1.1 Write the failing test\n",
  };
  for (const [name, content] of Object.entries(data)) files[DIR + name] = content;
  const root = makeWorkspace(files);
  created.push(root);
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
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

const MAIN_FILES = { "main/schema.sql": SCHEMA_SQL, "main/up.sql": SCHEMA_SQL, "main/down.sql": DOWN_SQL };
const EVENTS_FILES = { "events/schema.md": TABLE_MD, "events/up.md": UP_MD, "events/down.md": DOWN_MD };

describe("lexforge validate on the data files of a change", () => {
  it("data_stores с main дважды: finding называет main", async () => {
    const config = `${MAIN_CONFIG}  - name: main\n    dialect: mysql\n`;
    const { exitCode, findings } = await validate(workspace(config, "Data: main", MAIN_FILES));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-store-duplicate"]);
    expect(findings[0]!.message).toContain("main");
    expect(findings[0]!.file).toBe("lexforge/config.yaml");
  });

  it("имя хранилища Main_DB: finding называет его", async () => {
    const config = "schema: spec-driven\ndata_stores:\n  - name: Main_DB\n    dialect: postgresql\n";
    const { exitCode, findings } = await validate(workspace(config, "Data: Main_DB"));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-store-name"]);
    expect(findings.find((item) => item.rule === "data-store-name")!.message).toContain("Main_DB");
  });

  it("имя хранилища ../../x: только data-store-name, файлы вне data не читаются", async () => {
    const config = 'schema: spec-driven\ndata_stores:\n  - name: "../../x"\n    dialect: postgresql\n';
    const outside = { "../../x/schema.sql": "ALTER TABLE orders ADD COLUM note text\n" };
    for (const marker of [null, "Data: ../../x"]) {
      const { exitCode, findings } = await validate(workspace(config, marker, outside));

      expect(exitCode, EXPECTED).toBe(1);
      expect(findings.map((item) => item.rule)).toEqual(["data-store-name"]);
      expect(JSON.stringify(findings)).not.toContain("schema.sql");
    }
  });

  it("пустой dialect: finding называет хранилище", async () => {
    const config = 'schema: spec-driven\ndata_stores:\n  - name: main\n    dialect: ""\n';
    const { exitCode, findings } = await validate(workspace(config, null));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-store-dialect"]);
    expect(findings[0]!.message).toContain("main");
  });

  it("dialect PostgreSQL с заглавными: finding просит нижний регистр, формат файлов не проверяется", async () => {
    const config = "schema: spec-driven\ndata_stores:\n  - name: main\n    dialect: PostgreSQL\n";
    const { exitCode, findings } = await validate(workspace(config, "Data: main", MAIN_FILES));
    const dialect = findings.find((item) => item.rule === "data-store-dialect");

    expect(dialect?.rule, DIALECT_RED).toBe("data-store-dialect");
    expect(exitCode).toBe(1);
    expect(dialect!.message).toContain("main");
    expect(dialect!.message).toContain("PostgreSQL");
    expect(dialect!.message).toContain("lower case");
    expect(findings.some((item) => item.rule === "data-file-format")).toBe(false);
  });

  it("Data: billing при одном main: finding называет billing, требование и строку Data:", async () => {
    const { exitCode, findings } = await validate(workspace(MAIN_CONFIG, "Data: billing", MAIN_FILES));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-store-unknown"]);
    expect(findings[0]!.file).toBe("lexforge/changes/add-returns/specs/returns/spec.md");
    expect(findings[0]!.line).toBe(10);
    expect(findings[0]!.message).toContain("billing");
    expect(findings[0]!.message).toContain("A customer returns an order");
    expect(findings[0]!.message).toContain("line 10");
  });

  it("Data: main без data_stores: finding называет data_stores", async () => {
    const { exitCode, findings } = await validate(workspace("schema: spec-driven\n", "Data: main"));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-stores-missing"]);
    expect(findings[0]!.message).toContain("data_stores");
    expect(findings[0]!.line).toBe(10);
  });

  it("postgresql без down.sql: finding называет main и down.sql", async () => {
    const files = { "main/schema.sql": SCHEMA_SQL, "main/up.sql": SCHEMA_SQL };
    const { exitCode, findings } = await validate(workspace(MAIN_CONFIG, "Data: main", files));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-file-missing"]);
    expect(findings[0]!.message).toContain("main");
    expect(findings[0]!.message).toContain("down.sql");
  });

  it("postgresql со schema.md: finding называет main и schema.md", async () => {
    const files = { ...MAIN_FILES, "main/schema.md": TABLE_MD };
    const { exitCode, findings } = await validate(workspace(MAIN_CONFIG, "Data: main", files));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-file-format"]);
    expect(findings[0]!.message).toContain("main");
    expect(findings[0]!.message).toContain("schema.md");
  });

  it("up.sql с ADD COLUM: finding называет data/main/up.sql", async () => {
    const files = { ...MAIN_FILES, "main/up.sql": "ALTER TABLE orders ADD COLUM note text\n" };
    const { exitCode, findings } = await validate(workspace(MAIN_CONFIG, "Data: main", files));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-file-parse"]);
    expect(findings[0]!.message).toContain("data/main/up.sql");
  });

  it("таблица schema.sql без первичного ключа: finding называет таблицу", async () => {
    const files = { "main/schema.sql": NO_KEY_SQL, "main/up.sql": NO_KEY_SQL, "main/down.sql": DOWN_SQL };
    const { exitCode, findings } = await validate(workspace(MAIN_CONFIG, "Data: main", files));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-table-no-primary-key"]);
    expect(findings[0]!.message).toContain("orders");
  });

  it("user_events в schema.md без строки primary: finding называет таблицу", async () => {
    const files = { ...EVENTS_FILES, "events/schema.md": NO_KEY_MD, "events/up.md": upMd(NO_KEY_MD) };
    const { exitCode, findings } = await validate(workspace(EVENTS_CONFIG, "Data: events", files));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-table-no-primary-key"]);
    expect(findings[0]!.message).toContain("user_events");
  });

  it("пустой раздел Data migration в up.md: finding называет up.md", async () => {
    const files = { ...EVENTS_FILES, "events/up.md": UP_MD.replace(/The collection is new, no data moves\.\n/, "") };
    const { exitCode, findings } = await validate(workspace(EVENTS_CONFIG, "Data: events", files));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["data-migration-empty"]);
    expect(findings[0]!.message).toContain("up.md");
  });

  it("change без Data: и без каталога data выходит с 0", async () => {
    const { exitCode, findings } = await validate(workspace(MAIN_CONFIG, null));

    expect(findings).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("верная первая миграция main выходит с 0", async () => {
    const { exitCode, findings } = await validate(workspace(MAIN_CONFIG, "Data: main", MAIN_FILES));

    expect(findings).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("верная первая миграция events на mongodb выходит с 0", async () => {
    const { exitCode, findings } = await validate(workspace(EVENTS_CONFIG, "Data: events", EVENTS_FILES));

    expect(findings).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("Data: ghost над первым требованием и в REMOVED Requirements: выход 0, нет data-store-unknown", async () => {
    const root = workspace(MAIN_CONFIG, null);
    const ghost = spec("").replace("## ADDED Requirements", "Data: ghost\n\n## ADDED Requirements") +
      "\n## REMOVED Requirements\n\n### Requirement: An old return flow\n\nData: ghost\n\n**Reason**: The flow is gone.\n\n**Migration**: Use the new flow.\n\n#### Scenario: Old flow\n\n- **WHEN** a customer returns an order\n- **THEN** nothing happens\n";
    writeFileSync(path.join(root, "lexforge/changes/add-returns/specs/returns/spec.md"), ghost);
    const capture = createCapture();
    const exitCode = await run(["validate", "add-returns", "--strict", "--json"], { cwd: root, stdout: capture.stdout, stderr: capture.stderr });
    const report = JSON.parse(capture.out) as { findings: { rule: string; message: string }[] };

    expect(report.findings.filter((item) => item.message.includes("ghost") || item.rule === "data-store-unknown"), GHOST).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("Data: ghost в MODIFIED Requirements: выход 1, data-store-unknown называет ghost", async () => {
    const root = workspace(MAIN_CONFIG, null);
    mkdirSync(path.join(root, "lexforge/specs/returns"), { recursive: true });
    writeFileSync(path.join(root, "lexforge/specs/returns/spec.md"), "## Purpose\n\nLets a customer return an order.\n\n## Requirements\n\n### Requirement: A customer returns an order\n\nThe system SHALL record the return of an order.\n\n#### Scenario: Return is recorded\n\n- **WHEN** the customer returns an order\n- **THEN** the return is stored\n");
    writeFileSync(path.join(root, "lexforge/changes/add-returns/specs/returns/spec.md"), "## Purpose\n\nLets a customer return an order and keeps the return in the database.\n\n## MODIFIED Requirements\n\n### Requirement: A customer returns an order\n\nThe system SHALL record the return of an order.\nData: ghost\n\n#### Scenario: Return is recorded\n\n- **WHEN** the customer returns an order\n- **THEN** the return is stored\n");
    const capture = createCapture();
    const exitCode = await run(["validate", "add-returns", "--strict", "--json"], { cwd: root, stdout: capture.stdout, stderr: capture.stderr });
    const report = JSON.parse(capture.out) as { findings: { rule: string; message: string }[] };

    expect(report.findings.map((item) => item.rule)).toEqual(["data-store-unknown"]);
    expect(report.findings[0]!.message).toContain("ghost");
    expect(exitCode).toBe(1);
  });
});
