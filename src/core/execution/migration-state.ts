import { existsSync } from "node:fs";
import { z } from "zod";
import { digest, hashFile, json, local, refuse } from "./files.js";
import { changeDir, executionPlan, contract, workflow } from "./plan.js";
import { worktreeDigest } from "../git/worktree-digest.js";
import type { MigrationAnalysis } from "./migration-analysis.js";
const issue = z
  .object({
    code: z.string(),
    reason: z.string(),
    minimumAction: z.string(),
    source: z.string(),
  })
  .strict();
const task = z
  .object({
    id: z.string(),
    source: z
      .object({ path: z.string(), line: z.number(), hash: z.string() })
      .strict(),
    text: z.string(),
    checkbox: z.enum(["checked", "open"]),
    classification: z.enum([
      "historically-confirmed",
      "needs-verification",
      "incomplete",
      "conflict",
    ]),
    origin: z.enum(["historical", "reconciled"]).nullable(),
    cycle: z.string().nullable(),
    acceptance: z.array(z.string()),
    dependencies: z.array(z.string()),
    evidence: z.array(
      z
        .object({
          source: z.string(),
          hash: z.string(),
          exitCode: z.number().nullable(),
        })
        .strict(),
    ),
    gaps: z.array(issue),
    conflicts: z.array(issue),
    resolvedConflicts: z.array(issue).optional(),
  })
  .strict();
const source = z
  .object({ kind: z.string(), path: z.string(), hash: z.string() })
  .strict();
const payload = z
  .object({
    version: z.literal(1),
    change: z.string(),
    createdAt: z.string(),
    inputDigest: z.string(),
    codeState: z
      .object({ head: z.string(), worktreeDigest: z.string() })
      .strict(),
    sourceWorkflow: z.literal(1),
    targetWorkflow: z.literal(2),
    sourceHashes: z.array(source),
    tasks: z.array(task),
    contracts: z.record(z.string(), z.string()),
    outsideDigest: z.string(),
    previousPinHash: z.string(),
    legacyEvidence: z.record(z.string(), z.unknown()),
  })
  .strict();
const schema = payload.extend({ integrity: z.string() }).strict();
export type MigrationState = z.infer<typeof schema>;
export function canonical(value: unknown): string {
  const sort = (v: any): any =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return JSON.stringify(sort(value), null, 2) + "\n";
}
export function inputSources(analysis: MigrationAnalysis) {
  return analysis.sourceHashes.filter(
    (s) => !["migration-state", "workflow-pin"].includes(s.kind),
  );
}
export function sourceDigest(
  sourceHashes: MigrationState["sourceHashes"],
  codeState: MigrationState["codeState"],
) {
  return digest(canonical({ sourceHashes, codeState }));
}
export function makeMigrationState(
  root: string,
  change: string,
  analysis: MigrationAnalysis,
  createdAt = new Date().toISOString(),
): MigrationState {
  const cycles = executionPlan(root, change, true);
  const data = {
    version: 1 as const,
    change,
    createdAt,
    inputDigest: analysis.inputDigest,
    codeState: analysis.codeState,
    sourceWorkflow: 1 as const,
    targetWorkflow: 2 as const,
    sourceHashes: inputSources(analysis),
    tasks: analysis.tasks,
    contracts: Object.fromEntries(
      cycles.map((c) => [c.id, contract(root, change, c)]),
    ),
    outsideDigest: worktreeDigest(
      root,
      cycles.flatMap((c) => c.files.map((f) => f.path)),
    ),
    legacyEvidence: analysis.sourceHashes.some(
      (s) => s.kind === "legacy-evidence" && s.hash !== "<missing>",
    )
      ? json<Record<string, unknown>>(
          local(root, `${changeDir(change)}/evidence.json`),
        )
      : {},
    previousPinHash: hashFile(root, `${changeDir(change)}/workflow.json`),
  };
  return parseMigrationState({ ...data, integrity: digest(canonical(data)) });
}
export function parseMigrationState(value: unknown): MigrationState {
  const result = schema.safeParse(value);
  if (!result.success) refuse("Invalid migration ledger schema");
  const { integrity, ...data } = result.data;
  if (
    integrity !== digest(canonical(data)) ||
    data.inputDigest !== sourceDigest(data.sourceHashes, data.codeState)
  )
    refuse("Migration ledger integrity failed");
  if (
    new Set(data.tasks.map((t) => t.id)).size !== data.tasks.length ||
    data.tasks.some(
      (t) =>
        (t.classification === "historically-confirmed") !==
          (t.origin !== null) ||
        (t.origin !== null &&
          (t.checkbox !== "checked" ||
            t.conflicts.length > 0 ||
            t.gaps.length > 0)),
    )
  )
    refuse("Inconsistent migration decisions");
  return result.data;
}
export function readMigrationState(
  root: string,
  change: string,
): MigrationState | undefined {
  const file = local(root, `${changeDir(change)}/migration.json`);
  const pin = workflow(root, change);
  if (!existsSync(file)) {
    if ("migration" in pin && pin.migration)
      refuse("Migration ledger missing behind migrated workflow pin");
    return;
  }
  const state = parseMigrationState(json(file));
  if (state.change !== change) refuse("Migration ledger names another change");
  if ("migration" in pin && pin.migration && pin.migration !== state.integrity)
    refuse("Migration ledger does not match workflow pin");
  return state;
}
export function migrationIntegrityProblems(
  root: string,
  state: MigrationState,
): string[] {
  return state.sourceHashes
    .filter(
      (s) =>
        ["legacy-red", "evidence-source", "reconciliation"].includes(s.kind) &&
        s.path !== `${changeDir(state.change)}/evidence.json`,
    )
    .filter((s) => hashFile(root, s.path) !== s.hash)
    .map((s) => `Migration evidence integrity failed: ${s.path}`);
}
