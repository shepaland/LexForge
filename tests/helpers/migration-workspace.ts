import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { run } from "../../src/cli/run.js";
import { digest, hashFile } from "../../src/core/execution/files.js";
import { worktreeDigest } from "../../src/core/git/worktree-digest.js";
import { createCapture } from "./capture.js";
import {
  createGitWorkspace,
  writeAt,
  type GitWorkspace,
} from "./git-workspace.js";

export const MIGRATION_CHANGE = "demo";
export const MIGRATION_DIR = `lexforge/changes/${MIGRATION_CHANGE}`;

export interface MigrationTaskFixture {
  id: string;
  checked: boolean;
  words?: string;
  section?: number;
}

export interface LegacyEvidenceFixture {
  label: string;
  task: string;
  exitCode: number;
  command?: string;
  acceptance?: string[];
  review?: {
    reviewer?: string;
    verdict?: "approved" | "changes-requested";
    independent?: boolean;
    acceptance?: string[];
    sourceReviewer?: string;
    sourceVerdict?: "approved" | "changes-requested";
    sourceIndependent?: boolean;
    sourceAcceptance?: string[];
    omitProvenance?: boolean;
    omitAcceptance?: boolean;
  };
}

function defaultCycles(tasks: MigrationTaskFixture[]) {
  return tasks.map(({ id, section = 1 }, index) => ({
    id: `cycle-${index + 1}`,
    tasks: [id],
    dependsOn: section > 1 ? [`cycle-${index}`] : [],
    files: [
      { path: "src/app.ts", symbols: [] },
      { path: "tests/check.cjs", symbols: [] },
    ],
    testFiles: ["tests/check.cjs"],
    inputs: ["package.json"],
    environment: [],
    command: `node tests/check.cjs ${id}`,
    expectedFailure: `missing ${id}`,
    design: [{ path: `${MIGRATION_DIR}/design.md`, heading: "Migration" }],
    acceptance: [{ id: `AC-${id}`, task: id, description: `covers ${id}` }],
    controls: [],
  }));
}

function taskPlan(tasks: MigrationTaskFixture[]): string {
  const sections = new Map<number, MigrationTaskFixture[]>();
  for (const task of tasks) {
    const section = task.section ?? 1;
    sections.set(section, [...(sections.get(section) ?? []), task]);
  }
  return [...sections]
    .sort(([left], [right]) => left - right)
    .map(([section, entries]) => {
      const lines = entries.map(
        ({ id, checked, words = `Implement behavior ${id}` }) =>
          `- [${checked ? "x" : " "}] ${id} [A] ${words} in \`src/app.ts\`. Check: \`node tests/check.cjs\`\n` +
          "  -> demo#Migration behavior",
      );
      return (
        `## ${section}. Migration ${section}\n\n` +
        `Depends on: ${section === 1 ? "none" : section - 1}\n\n` +
        lines.join("\n")
      );
    })
    .join("\n\n");
}

export function migrationFixture(
  tasks: MigrationTaskFixture[],
  cycles: unknown[] = defaultCycles(tasks),
): GitWorkspace {
  return createGitWorkspace({
    "lexforge/config.yaml": "schema: spec-driven\n",
    [`${MIGRATION_DIR}/.lexforge.yaml`]: "schema: spec-driven\n",
    [`${MIGRATION_DIR}/proposal.md`]: "# Why\n\nKeep completed work.\n",
    [`${MIGRATION_DIR}/design.md`]:
      "# Design\n\n## Migration\nAnalyze before writing.\n",
    [`${MIGRATION_DIR}/specs/demo/spec.md`]:
      "## Purpose\n\nPreserve trustworthy task completion during migration.\n\n## ADDED Requirements\n\n### Requirement: Migration behavior\n\n" +
      "Migration SHALL retain task meaning.\n\n#### Scenario: Preview\n\n" +
      "- **WHEN** preview runs\n- **THEN** no file changes\n",
    [`${MIGRATION_DIR}/tasks.md`]: taskPlan(tasks) + "\n",
    [`${MIGRATION_DIR}/execution-plan.json`]: JSON.stringify({
      version: 1,
      cycles,
    }),
    "package.json": "{}\n",
    "tests/check.cjs": "process.exit(0);\n",
  });
}

export async function callMigration(root: string, args: string[]) {
  const capture = createCapture();
  const exitCode = await run(
    [...args, ...(args[0] === "archive" ? [] : ["--change", MIGRATION_CHANGE]), "--json"],
    { cwd: root, stdout: capture.stdout, stderr: capture.stderr },
  );
  return {
    exitCode,
    data: capture.out ? JSON.parse(capture.out) : undefined,
    error: capture.err,
  };
}

export function migrationTree(root: string): Record<string, string> {
  const base = path.join(root, MIGRATION_DIR);
  const result: Record<string, string> = {};
  function visit(directory: string): void {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      if (statSync(file).isDirectory()) visit(file);
      else result[path.relative(base, file)] = digest(readFileSync(file));
    }
  }
  visit(base);
  return result;
}

export function addLegacyEvidence(
  workspace: GitWorkspace,
  fixture: LegacyEvidenceFixture,
): void {
  const { root, head } = workspace;
  const evidencePath = `${MIGRATION_DIR}/evidence.json`;
  const existing = (() => {
    try {
      return JSON.parse(readFileSync(path.join(root, evidencePath), "utf8"));
    } catch {
      return { outputVersion: 1, records: {} };
    }
  })();
  const log = `${MIGRATION_DIR}/legacy/${fixture.label}.log`;
  writeAt(root, log, fixture.exitCode === 0 ? "PASS\n" : "FAIL\n");
  let review;
  if (fixture.review) {
    const source = `${MIGRATION_DIR}/legacy/${fixture.label}-review.json`;
    const reviewer = fixture.review.reviewer ?? "independent";
    const verdict = fixture.review.verdict ?? "approved";
    const independent = fixture.review.independent ?? true;
    const acceptance = fixture.review.omitAcceptance
      ? undefined
      : (fixture.review.acceptance ?? [`AC-${fixture.task}`]);
    const provenance = fixture.review.omitProvenance
      ? undefined
      : { origin: "legacy", reviewer };
    writeAt(
      root,
      source,
      JSON.stringify({
        reviewer: fixture.review.sourceReviewer ?? reviewer,
        verdict: fixture.review.sourceVerdict ?? verdict,
        independent: fixture.review.sourceIndependent ?? independent,
        acceptance: fixture.review.omitAcceptance
          ? undefined
          : (fixture.review.sourceAcceptance ?? acceptance),
        provenance: fixture.review.omitProvenance
          ? undefined
          : {
              origin: "legacy",
              reviewer: fixture.review.sourceReviewer ?? reviewer,
            },
      }),
    );
    review = {
      reviewer,
      verdict,
      independent,
      acceptance,
      provenance,
      source,
      sourceHash: hashFile(root, source),
    };
  }
  existing.records[fixture.label] = {
    command: fixture.command ?? `node tests/check.cjs ${fixture.task}`,
    exitCode: fixture.exitCode,
    startedAt: "2026-09-01T10:00:00.000Z",
    durationMs: 20,
    head,
    worktreeDigest: worktreeDigest(root),
    outputTail: fixture.exitCode === 0 ? "PASS" : "FAIL",
    outputTruncated: false,
    log,
    logHash: hashFile(root, log),
    tasks: [fixture.task],
    acceptance: fixture.acceptance ?? [`AC-${fixture.task}`],
    ...(review ? { review } : {}),
  };
  writeAt(root, evidencePath, JSON.stringify(existing));
}

export function writeMigrationFile(
  root: string,
  relative: string,
  content: string,
): void {
  writeAt(root, relative, content);
}
