import { afterEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/run.js";
import { createCapture } from "../helpers/capture.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

const EXPECTED = "\n`validate` exits `0` on the change that names notifications\n";
const GHOST = "\na finding names ghost\n";
const created: string[] = [];

const SPEC = `## Purpose

Lets a customer return an order and tells the customer about it.

## ADDED Requirements

### Requirement: A customer is told about a return

The system SHALL tell the customer that the return is recorded.
SERVICE

#### Scenario: Customer is told

- **WHEN** the customer returns an order
- **THEN** a message is sent
`;

const CONFIG = "schema: spec-driven\ndata_stores:\n  - name: main\n    dialect: postgresql\n";
const SCHEMA = "CREATE TABLE orders (id integer PRIMARY KEY);\n";
const CHANGE = "lexforge/changes/add-returns/";
const COMMON = ["Boundary", "Dependencies", "Health checks", "Shutdown", "Configuration", "Observability"];
const STATEFUL = ["State storage", "Restart and failure", "Scaling", "Backup and restore", "Consistency", "Concurrency", "Replication and failover", "Retention", "Live migrations", "Warm-up"];
const STATELESS = ["No state between requests", "Request and session data", "Horizontal scaling", "Idempotency", "Cache", "Retries and deduplication", "Limits", "Autoscaling"];
const Q1 = "Owns data that outlives a request";
const Q2 = "Another instance resumes interrupted work";
const Q3 = "Instances coordinate with each other";

interface Doc {
  name?: string;
  title?: string;
  answers?: string[];
  rows?: number[];
  type?: string | null;
  stores?: string | null;
  sections?: string[];
  without?: string[];
  empty?: string[];
  text?: Record<string, string>;
  classification?: boolean;
}

/** A correct stateless document; the options break one thing at a time. */
function doc(options: Doc = {}): string {
  const name = options.name ?? "notifications";
  const answers = options.answers ?? ["no", "no", "no"];
  const questions = [Q1, Q2, Q3];
  const rows = (options.rows ?? [0, 1, 2]).map((i) => `| ${questions[i]} | ${answers[i]} |`);
  const type = options.type === undefined ? "stateless" : options.type;
  const sections = options.sections ?? [...COMMON, ...STATELESS];
  const classification = [
    "## Classification",
    "",
    "| Question | Answer |",
    "|---|---|",
    ...rows,
    "",
    ...(type === null ? [] : [`Type: ${type}`]),
    ...(options.stores ? [`Stores: ${options.stores}`] : []),
    "",
  ];
  const body = sections
    .filter((section) => !(options.without ?? []).includes(section))
    .flatMap((section) => [`## ${section}`, "", options.empty?.includes(section) ? "" : (options.text?.[section] ?? `The ${section} of the service.`), ""]);
  return [`# Service: ${options.title ?? name}`, "", ...(options.classification === false ? [] : classification), ...body].join("\n");
}

function stateful(options: Doc = {}): string {
  return doc({ answers: ["yes", "no", "no"], type: "stateful", stores: "main", sections: [...COMMON, ...STATEFUL], ...options });
}

function workspace(files: Record<string, string>, service = "Service: notifications", config = CONFIG): string {
  const root = makeWorkspace({
    "lexforge/config.yaml": config,
    [`${CHANGE}.lexforge.yaml`]: "schema: spec-driven\n",
    [`${CHANGE}proposal.md`]: "## Why\n\nCustomers are not told about returns.\n",
    [`${CHANGE}specs/returns/spec.md`]: SPEC.replace("SERVICE", service),
    [`${CHANGE}design.md`]: "## Context\n\nOne service sends the message.\n",
    [`${CHANGE}tasks.md`]: "## 1. Returns\n\n- [ ] 1.1 Write the failing test\n",
    ...files,
  });
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
  return { exitCode, findings: report.findings.filter((item) => item.rule.startsWith("service-")) };
}

const own = (text: string) => ({ [`${CHANGE}services/notifications/service.md`]: text });
const project = (text: string, name = "notifications") => ({ [`lexforge/services/${name}/service.md`]: text });
const schema = { [`${CHANGE}data/main/schema.sql`]: SCHEMA };

function expectNames(findings: { message: string }[], words: string[]) {
  for (const word of words) expect(findings[0]!.message).toContain(word);
}

describe("lexforge validate checks the service documents", () => {
  it("Service: notifications без документа в change и в проекте: выход 1, finding называет notifications и строку", async () => {
    const { exitCode, findings } = await validate(workspace({}));

    expect(exitCode, EXPECTED).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-missing"]);
    expectNames(findings, ["notifications", "A customer is told about a return"]);
    expect(findings[0]!.line).toBe(SPEC.split("\n").indexOf("SERVICE") + 1);
  });

  it("документ orders в проекте и ничего в change: проверяется проектный, выход 0", async () => {
    const { exitCode, findings } = await validate(workspace(project(doc({ name: "orders" }), "orders"), "Service: orders"));

    expect(exitCode).toBe(0);
    expect(findings).toEqual([]);
  });

  it("битый проектный документ: выход 1, finding указывает на файл проекта", async () => {
    const { exitCode, findings } = await validate(workspace(project(doc({ title: "orders" }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-title"]);
    expect(findings[0]!.file).toBe("lexforge/services/notifications/service.md");
  });

  it("документ change перекрывает битый проектный", async () => {
    const { exitCode, findings } = await validate(workspace({ ...own(doc()), ...project(doc({ title: "orders" })) }));

    expect(exitCode).toBe(0);
    expect(findings).toEqual([]);
  });

  it("два требования с одним битым сервисом: finding один", async () => {
    const second = SPEC.replace("SERVICE", "Service: notifications").replace(/## Purpose[\s\S]*?## ADDED Requirements\n/, "");
    const files = { ...project(doc({ title: "orders" })), [`${CHANGE}specs/other/spec.md`]: `## Purpose\n\nSends messages about returns.\n\n## ADDED Requirements\n${second}` };
    const { findings } = await validate(workspace(files));

    expect(findings.map((item) => item.rule)).toEqual(["service-title"]);
  });

  it("Service: в блоке кода не считается маркером", async () => {
    const { exitCode, findings } = await validate(workspace({}, "```\nService: notifications\n```"));

    expect(exitCode).toBe(0);
    expect(findings).toEqual([]);
  });

  it("имя orders_api не kebab-case: finding называет имя", async () => {
    const { exitCode, findings } = await validate(workspace({}, "Service: orders_api"));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-name"]);
    expectNames(findings, ["orders_api"]);
  });

  it("первый ответ yes при Type: stateless: finding называет сервис и тип", async () => {
    const { exitCode, findings } = await validate(workspace({ ...own(doc({ answers: ["yes", "no", "no"], stores: "main" })), ...schema }));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-type-mismatch"]);
    expectNames(findings, ["notifications", "stateless"]);
  });

  it("второй ответ not sure: finding называет вопрос", async () => {
    const { exitCode, findings } = await validate(workspace(own(doc({ answers: ["no", "not sure", "no"], type: "stateful", sections: [...COMMON, ...STATEFUL] }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-answer-invalid"]);
    expectNames(findings, [Q2]);
  });

  it("нет строки третьего вопроса: finding называет вопрос", async () => {
    const { exitCode, findings } = await validate(workspace(own(doc({ rows: [0, 1] }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-answer-missing"]);
    expectNames(findings, [Q3]);
  });

  it("первый ответ not sure, второй yes, Type: stateful: finding только об ответе, без требования Stores:", async () => {
    const { findings } = await validate(workspace(own(doc({ answers: ["not sure", "yes", "no"], type: "stateful", sections: [...COMMON, ...STATEFUL] }))));

    expect(findings.map((item) => item.rule)).toEqual(["service-answer-invalid"]);
    expectNames(findings, [Q1]);
  });

  it("второй ответ yes при первом no и Type: stateful: тип сходится, Stores: не требуется", async () => {
    const { exitCode, findings } = await validate(workspace(own(doc({ answers: ["no", "yes", "no"], type: "stateful", sections: [...COMMON, ...STATEFUL] }))));

    expect(exitCode).toBe(0);
    expect(findings).toEqual([]);
  });

  it("нет заголовка документа: finding называет ожидаемый заголовок", async () => {
    const { findings } = await validate(workspace(own(doc().replace(/^# .*\n/, ""))));

    expect(findings.map((item) => item.rule)).toEqual(["service-title"]);
    expectNames(findings, ["# Service: notifications"]);
  });

  it("нет строки Type: finding называет сервис", async () => {
    const { exitCode, findings } = await validate(workspace(own(doc({ type: null }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-type-missing"]);
    expectNames(findings, ["notifications"]);
  });

  it("Type: maybe: finding называет тип", async () => {
    const { findings } = await validate(workspace(own(doc({ answers: ["no", "yes", "no"], type: "maybe", sections: [...COMMON, ...STATEFUL] }))));

    expect(findings.map((item) => item.rule)).toEqual(["service-type-missing"]);
    expectNames(findings, ["maybe"]);
  });

  it("нет раздела Classification: finding называет раздел", async () => {
    const { exitCode, findings } = await validate(workspace(own(doc({ classification: false }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-section-missing"]);
    expectNames(findings, ["Classification"]);
  });

  it("stateless с разделом Backup and restore: finding называет раздел", async () => {
    const sections = [...COMMON, ...STATELESS, "Backup and restore"];
    const { exitCode, findings } = await validate(workspace(own(doc({ sections }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-section-other-type"]);
    expectNames(findings, ["Backup and restore"]);
  });

  it("нет раздела Shutdown: finding называет раздел", async () => {
    const { exitCode, findings } = await validate(workspace(own(doc({ without: ["Shutdown"] }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-section-missing"]);
    expectNames(findings, ["Shutdown"]);
  });

  it("нет раздела Warm-up у stateful: finding называет раздел", async () => {
    const { exitCode, findings } = await validate(workspace({ ...own(stateful({ without: ["Warm-up"] })), ...schema }));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-section-missing"]);
    expectNames(findings, ["Warm-up"]);
  });

  it("пустой раздел Cache: finding называет раздел", async () => {
    const { exitCode, findings } = await validate(workspace(own(doc({ empty: ["Cache"] }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-section-empty"]);
    expectNames(findings, ["Cache"]);
  });

  it("раздел Cache «No cache: every request reads the orders API»: выход 0", async () => {
    const text = { Cache: "No cache: every request reads the orders API" };
    const { exitCode, findings } = await validate(workspace(own(doc({ text }))));

    expect(exitCode).toBe(0);
    expect(findings).toEqual([]);
  });

  it("корректный stateful с хранилищем и схемой в change: выход 0", async () => {
    const { exitCode, findings } = await validate(workspace({ ...own(stateful()), ...schema }));

    expect(exitCode).toBe(0);
    expect(findings).toEqual([]);
  });

  it("корректный stateful со схемой только в lexforge/data: выход 0", async () => {
    const files = { ...own(stateful()), "lexforge/data/main/schema.sql": SCHEMA };
    const { exitCode, findings } = await validate(workspace(files));

    expect(exitCode).toBe(0);
    expect(findings).toEqual([]);
  });

  it("первый ответ yes без строки Stores:: finding называет сервис и Stores:", async () => {
    const { exitCode, findings } = await validate(workspace(own(stateful({ stores: null }))));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-stores-missing"]);
    expectNames(findings, ["notifications", "Stores:"]);
  });

  it("хранилище не в data_stores: finding называет его, остальные не затронуты", async () => {
    const { exitCode, findings } = await validate(workspace({ ...own(stateful({ stores: "main, events" })), ...schema }));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-store-unknown"]);
    expectNames(findings, ["events"]);
  });

  it("хранилище из data_stores без схемы нигде: finding называет его", async () => {
    const { exitCode, findings } = await validate(workspace(own(stateful())));

    expect(exitCode).toBe(1);
    expect(findings.map((item) => item.rule)).toEqual(["service-store-schema"]);
    expectNames(findings, ["main"]);
  });

  it("Service: ghost над первым требованием и в REMOVED Requirements: выход 0, ни одного finding про ghost", async () => {
    const ghost = SPEC.replace("## ADDED Requirements", "Service: ghost\n\n## ADDED Requirements").replace("SERVICE", "") +
      "\n## REMOVED Requirements\n\n### Requirement: An old return flow\n\nService: ghost\n\n**Reason**: The flow is gone.\n\n**Migration**: Use the new flow.\n\n#### Scenario: Old flow\n\n- **WHEN** a customer returns an order\n- **THEN** nothing happens\n";
    const { exitCode, findings } = await validate(workspace({ [`${CHANGE}specs/returns/spec.md`]: ghost }));

    expect(findings.filter((item) => item.message.includes("ghost")), GHOST).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("Service: ghost в MODIFIED Requirements: выход 1, finding называет ghost", async () => {
    const { exitCode, findings } = await validate(workspace({
      "lexforge/specs/returns/spec.md": "## Purpose\n\nLets a customer return an order.\n\n## Requirements\n\n### Requirement: A customer returns an order\n\nThe system SHALL record the return of an order.\n\n#### Scenario: Return is recorded\n\n- **WHEN** the customer returns an order\n- **THEN** the return is stored\n",
      [`${CHANGE}specs/returns/spec.md`]: "## Purpose\n\nLets a customer return an order and keeps the return in the database.\n\n## MODIFIED Requirements\n\n### Requirement: A customer returns an order\n\nThe system SHALL record the return of an order.\nService: ghost\n\n#### Scenario: Return is recorded\n\n- **WHEN** the customer returns an order\n- **THEN** the return is stored\n",
    }));

    expect(findings.map((item) => item.rule)).toEqual(["service-missing"]);
    expectNames(findings, ["ghost"]);
    expect(exitCode).toBe(1);
  });
});
