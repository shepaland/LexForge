import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { bodyOf, section } from "./helpers.js";

const EXPECTED = "\n`skills/lexforge-spec/data-and-services.md` does not exist\n";

const LINKED = fileURLToPath(
  new URL("../../skills/lexforge-spec/data-and-services.md", import.meta.url),
);

/** The file as one lower-case line, so a wrapped sentence matches like a short one. */
function linkedText(): string {
  expect(existsSync(LINKED), EXPECTED).toBe(true);
  return readFileSync(LINKED, "utf8").replace(/\s+/g, " ").toLowerCase();
}

/** The part of the file under one `## ` heading, normalized the same way. */
function part(heading: string): string {
  const text = readFileSync(LINKED, "utf8");
  return section(text, heading).replace(/\s+/g, " ").toLowerCase();
}

describe("spec skill: data stores and services", () => {
  it("the Work section links data-and-services.md for a store or a service", () => {
    const work = section(bodyOf("lexforge-spec"), "Work");
    expect(work).toContain("data-and-services.md");
    expect(work).toMatch(/changes a store/);
    expect(work).toMatch(/introduces a service/);
  });

  it("a project without data_stores gets a search for evidence first", () => {
    linkedText();
    const text = part("The data stores of the project");
    expect(text).toMatch(/has no `data_stores`/);
    expect(text).toMatch(/before the first data requirement/);
    for (const clue of ["images in compose files", "driver dependencies", "orm providers", "connection strings in example configs", "migration folders"]) {
      expect(text, clue).toContain(clue);
    }
  });

  it("each found store is shown with its dialect, file and line, and the skill waits for the user", () => {
    linkedText();
    const text = part("The data stores of the project");
    expect(text).toMatch(/show the user each store you found, with its dialect and the file and line it came from/);
    expect(text).toMatch(/(?<!not )wait for the user to confirm/);
    expect(text).not.toMatch(/do not wait for the user/);
  });

  it("a confirmed store is saved with stores add and never written into the config by hand", () => {
    linkedText();
    const text = part("The data stores of the project");
    expect(text).toContain("`lexforge stores add <name> --dialect <dialect>`");
    expect(text).toMatch(/save each confirmed store with `lexforge stores add/);
    expect(text).toMatch(/never write `data_stores` into `lexforge\/config\.yaml` by hand/);
    expect(text).toMatch(/never save a found store before the user says yes/);
  });

  it("with no evidence the skill asks the user for the stores and the dialects", () => {
    linkedText();
    const text = part("The data stores of the project");
    expect(text).toMatch(/if you find no evidence, ask the user which stores the project uses and with which dialect/);
    expect(text).toMatch(/then run `lexforge stores add` for each answer/);
  });

  it("a requirement that changes a store carries Data: and the files come before validate", () => {
    linkedText();
    const text = part("A requirement that changes a store");
    expect(text).toMatch(/creates, changes or removes a table, a field, a key or an index, or moves stored data/);
    expect(text).toMatch(/write a `data:` line naming the stores it affects/);
    expect(text).toMatch(/write the schema, the up step and the down step of each store before you run `lexforge validate <name> --strict`/);
    expect(text).not.toMatch(/after you run `lexforge validate/);
  });

  it("the files go to data/<store>/ as .sql for a SQL dialect and .md for any other kind", () => {
    linkedText();
    const text = part("A requirement that changes a store");
    expect(text).toMatch(/they go to `data\/<store>\/` in the change, as `schema`, `up` and `down`/);
    expect(text).toMatch(/the extension is `\.sql` for a sql dialect and `\.md` for any other kind/);
  });

  it("up leads from the project schema to the change schema and down leads back", () => {
    linkedText();
    const text = part("A requirement that changes a store");
    expect(text).toMatch(/the up step must take the project schema to the change schema/);
    expect(text).toMatch(/the down step must take the change schema back to the project schema/);
  });

  it("a Markdown store gets table sections, field and key tables, step modes and a data migration", () => {
    const text = linkedText();
    expect(text).toMatch(/## markdown files for a store that is not sql/);
    expect(text).toMatch(/every table needs a primary key, in sql stores too/);
    expect(text).toContain("## table: <name>");
    expect(text).toContain("| field | type | nullable | default |");
    expect(text).toContain("| key | fields |");
    expect(text).toMatch(/key is `primary`, `unique`, `index` or `foreign`/);
    expect(text).toMatch(/nullable is `yes` or `no`/);
    expect(text).toMatch(/`\(create\)`, `\(alter\)` or `\(drop\)`/);
    expect(text).toMatch(/`action` column, and the action is `add`, `change` or `drop`/);
    expect(text).toMatch(/a key cannot be changed\. drop it in one row and add it in another/);
    expect(text).toMatch(/each need a `## data migration` section that is not empty/);
  });

  it("on the first change of a store the user hears that the change schema holds the whole store", () => {
    linkedText();
    const text = part("A requirement that changes a store");
    expect(text).toMatch(/on the first change of a store, tell the user that the schema of the change must hold the whole store/);
  });

  it("the three service questions go one per message, in order, each waited for", () => {
    linkedText();
    const text = part("A new service");
    expect(text).toMatch(/ask the user the three classification questions one per message, in this order/);
    expect(text).not.toMatch(/in one message/);
    expect(text).toMatch(/(?<!not )wait for the user's answer to each question before you send the next/);
    expect(text).toMatch(/owns data that outlives a request.*another instance resumes interrupted work.*instances coordinate with each other/);
    expect(text).toMatch(/send the first question alone\./);
    expect(text).not.toMatch(/together with the others/);
  });

  it("the skill never answers a service question for the user", () => {
    linkedText();
    const text = part("A new service");
    expect(text).toMatch(/never answer a question for the user/);
  });

  it("on I don't know the skill works the question through until the answer is yes or no", () => {
    linkedText();
    const text = part("A new service");
    expect(text).toMatch(/on "i don't know", work through the question with the user until the answer is yes or no/);
    expect(text).toMatch(/write no answer until the user says yes or no/);
    expect(text).toMatch(/for the second question: what happens to an unfinished send when an instance stops\?/);
  });

  it("the answers end in a Service: line and a service.md with the type and its sections", () => {
    linkedText();
    const text = part("A new service");
    expect(text).toMatch(/write a `service: <name>` line in the requirement/);
    expect(text).toContain("services/<name>/service.md");
    expect(text).toMatch(/`type:` line/);
    expect(text).toMatch(/stateful when any answer is yes/);
    expect(text).toMatch(/stateless when all three answers are no/);
  });

  it("service.md holds the Classification rows, the type rule and the sections of that type", () => {
    linkedText();
    const text = part("A new service");
    expect(text).toMatch(/under `## classification`, write one table row per question, with the answer yes or no, and a `type:` line/);
    expect(text).toMatch(/the type is stateful when any answer is yes\. it is stateless when all three answers are no/);
    expect(text).toMatch(/boundary, dependencies, health checks, shutdown, configuration, observability/);
    expect(text).toMatch(/a stateful service also takes state storage, restart and failure, scaling, backup and restore, consistency, concurrency, replication and failover, retention, live migrations and warm-up/);
    expect(text).toMatch(/a stateless service takes no state between requests, request and session data, horizontal scaling, idempotency, cache, retries and deduplication, limits and autoscaling/);
  });

  it("the Stores line sits under Classification and names stores that are saved and have a schema", () => {
    linkedText();
    const text = part("A new service");
    expect(text).toMatch(/add a `stores:` line under `## classification`, next to the `type:` line/);
    expect(text).not.toMatch(/anywhere in service\.md/);
    expect(text).toMatch(/each store it names must already be saved with `lexforge stores add`/);
    expect(text).toMatch(/each must also have a schema in the change under `data\/<store>\/` or in `lexforge\/data\/<store>\/`/);
  });
});
