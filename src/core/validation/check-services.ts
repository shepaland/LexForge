import { existsSync } from "node:fs";
import path from "node:path";

import { workspacePath } from "../answer-path.js";
import { readTextFile, splitTextLines } from "../read-text.js";
import { workspacePaths } from "../workspace/paths.js";
import type { ProjectConfig } from "../workspace/project-config.js";
import { makeFinding, type Finding } from "./finding.js";
import { collectMarkers } from "./spec-markers.js";

const SERVICE_LINE = /^\s*Service:\s*(.*?)\s*$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const QUESTIONS = [
  "Owns data that outlives a request",
  "Another instance resumes interrupted work",
  "Instances coordinate with each other",
];
const COMMON = ["Boundary", "Dependencies", "Health checks", "Shutdown", "Configuration", "Observability"];
const STATEFUL = [
  "State storage", "Restart and failure", "Scaling", "Backup and restore", "Consistency",
  "Concurrency", "Replication and failover", "Retention", "Live migrations", "Warm-up",
];
const STATELESS = [
  "No state between requests", "Request and session data", "Horizontal scaling", "Idempotency",
  "Cache", "Retries and deduplication", "Limits", "Autoscaling",
];

interface ServiceMarker {
  file: string;
  line: number;
  requirement: string;
  service: string;
}

interface Section {
  line: number;
  body: string[];
}

/** Every `Service:` line of an ADDED or MODIFIED requirement, with its file and line. */
function collectServiceMarkers(root: string, dir: string): ServiceMarker[] {
  return collectMarkers(root, dir, SERVICE_LINE).map(({ value, ...rest }) => ({ ...rest, service: value }));
}

/** The `## ` sections of the document, with their non-blank lines. */
function readSections(lines: string[]): Map<string, Section> {
  const sections = new Map<string, Section>();
  let current: Section | undefined;
  lines.forEach((text, index) => {
    const heading = /^##\s+(.*?)\s*$/.exec(text);
    if (heading) {
      current = { line: index + 1, body: [] };
      sections.set(heading[1]!, current);
    } else if (current && text.trim() !== "") {
      current.body.push(text.trim());
    }
  });
  return sections;
}

function answerOf(body: string[], question: string): string | undefined {
  for (const text of body) {
    const cells = text.split("|").map((cell) => cell.trim());
    if (text.startsWith("|") && cells[1] === question) return cells[2];
  }
  return undefined;
}

function checkClassification(file: string, service: string, classification: Section): { findings: Finding[]; answers: (string | undefined)[]; type?: string } {
  const findings: Finding[] = [];
  const answers: (string | undefined)[] = [];
  for (const question of QUESTIONS) {
    const answer = answerOf(classification.body, question);
    if (answer === undefined) {
      findings.push(makeFinding(file, classification.line, "service-answer-missing", `The Classification of the service "${service}" has no row for the question "${question}". Add the row with the answer yes or no.`));
    } else if (answer !== "yes" && answer !== "no") {
      findings.push(makeFinding(file, classification.line, "service-answer-invalid", `The answer to "${question}" in the service "${service}" is "${answer}". Answer yes or no.`));
    }
    answers.push(answer === "yes" || answer === "no" ? answer : undefined);
  }
  const typeLine = classification.body.map((text) => /^Type:\s*(.*?)\s*$/.exec(text)).find((found) => found !== null && found !== undefined);
  const type = typeLine?.[1];
  if (type !== "stateful" && type !== "stateless") {
    findings.push(makeFinding(file, classification.line, "service-type-missing", `The Classification of the service "${service}" has no valid Type line${type ? ` (it says "${type}")` : ""}. Write Type: stateful or Type: stateless.`));
    return { findings, answers };
  }
  const expected = answers.every((answer) => answer !== undefined) ? (answers.includes("yes") ? "stateful" : "stateless") : type;
  if (type !== expected) {
    findings.push(makeFinding(file, classification.line, "service-type-mismatch", `The service "${service}" says Type: ${type}, but its answers make it ${expected}. Set Type: ${expected}, or fix the answers.`));
  }
  return { findings, answers, type };
}

function checkSections(file: string, service: string, sections: Map<string, Section>, type: string): Finding[] {
  const findings: Finding[] = [];
  const own = [...COMMON, ...(type === "stateful" ? STATEFUL : STATELESS)];
  for (const name of own) {
    const section = sections.get(name);
    if (!section) {
      findings.push(makeFinding(file, 1, "service-section-missing", `The ${type} service "${service}" has no "## ${name}" section. Add it.`));
    } else if (section.body.length === 0) {
      findings.push(makeFinding(file, section.line, "service-section-empty", `The section "## ${name}" of the service "${service}" is empty. Fill it, or say in one line why it does not apply.`));
    }
  }
  for (const name of type === "stateful" ? STATELESS : STATEFUL) {
    const section = sections.get(name);
    if (section) {
      findings.push(makeFinding(file, section.line, "service-section-other-type", `The ${type} service "${service}" carries the section "## ${name}" of the other type. Remove it.`));
    }
  }
  return findings;
}

function checkStores(root: string, file: string, service: string, classification: Section, changeDir: string, config: ProjectConfig): Finding[] {
  const line = classification.body.map((text) => /^Stores:\s*(.*?)\s*$/.exec(text)).find((found) => found);
  const stores = (line?.[1] ?? "").split(",").map((name) => name.trim()).filter((name) => name !== "");
  if (stores.length === 0) {
    return [makeFinding(file, classification.line, "service-stores-missing", `The service "${service}" answers yes to owning data, but its Classification has no Stores: line. Add Stores: <store> with the stores it owns.`)];
  }
  const findings: Finding[] = [];
  const dataRoot = path.join(workspacePaths(root).lexforge, "data");
  for (const store of stores) {
    if (!config.stores.some((item) => item.name === store)) {
      findings.push(makeFinding(file, classification.line, "service-store-unknown", `The service "${service}" names the store "${store}", but data_stores does not list it. Add it to data_stores or fix the name.`));
      continue;
    }
    const schemas = [path.join(changeDir, "data"), dataRoot].flatMap((dir) => ["schema.sql", "schema.md"].map((name) => path.join(dir, store, name)));
    if (!schemas.some((schema) => existsSync(schema))) {
      findings.push(makeFinding(file, classification.line, "service-store-schema", `The service "${service}" names the store "${store}", but no schema for it exists in the change or under lexforge/data/${store}. Write the schema of the store.`));
    }
  }
  return findings;
}

function checkDocument(root: string, docFile: string, service: string, changeDir: string, config: ProjectConfig): Finding[] {
  const file = workspacePath(root, docFile);
  const lines = splitTextLines(readTextFile(docFile));
  const title = lines.map((text) => /^#\s+(.*?)\s*$/.exec(text)).find((found) => found);
  const findings: Finding[] = [];
  if (title?.[1] !== `Service: ${service}`) {
    findings.push(makeFinding(file, 1, "service-title", `The document of the service "${service}" must open with "# Service: ${service}", but its title is "${title?.[1] ?? ""}". Fix the title.`));
  }
  const sections = readSections(lines);
  const classification = sections.get("Classification");
  if (!classification) {
    return [...findings, makeFinding(file, 1, "service-section-missing", `The document of the service "${service}" has no "## Classification" section. Add it with three answers and the Type line.`)];
  }
  const checked = checkClassification(file, service, classification);
  findings.push(...checked.findings);
  if (checked.type) findings.push(...checkSections(file, service, sections, checked.type));
  if (checked.answers[0] === "yes") findings.push(...checkStores(root, file, service, classification, changeDir, config));
  return findings;
}

/**
 * The service checks of one change under strict mode: every `Service:` line of
 * a requirement needs a service document, and each document is checked once.
 */
export function checkServices(root: string, change: string, config: ProjectConfig): Finding[] {
  const paths = workspacePaths(root);
  const changeDir = paths.changeDir(change);
  const findings: Finding[] = [];
  const checked = new Set<string>();
  for (const marker of collectServiceMarkers(root, path.join(changeDir, "specs"))) {
    const { service } = marker;
    if (!KEBAB.test(service)) {
      findings.push(makeFinding(marker.file, marker.line, "service-name", `The service name "${service}" in requirement "${marker.requirement}" is not kebab-case. Use lower-case words joined by hyphens, such as orders-api.`));
      continue;
    }
    const docFile = [path.join(changeDir, "services", service, "service.md"), path.join(paths.lexforge, "services", service, "service.md")].find((file) => existsSync(file));
    if (!docFile) {
      findings.push(makeFinding(marker.file, marker.line, "service-missing", `The service "${service}" is named in requirement "${marker.requirement}", line ${marker.line} of ${marker.file}, but neither the change nor lexforge/services holds a service.md for it. Write services/${service}/service.md in the change.`));
      continue;
    }
    if (checked.has(docFile)) continue;
    checked.add(docFile);
    findings.push(...checkDocument(root, docFile, service, changeDir, config));
  }
  return findings;
}
