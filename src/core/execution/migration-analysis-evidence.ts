import { existsSync, readFileSync } from "node:fs";

import { hashFile, local } from "./files.js";
import { changeDir } from "./plan.js";

export interface LegacyReview {
  reviewer?: string;
  verdict?: string;
  independent?: boolean;
  acceptance?: string[];
  provenance?: { origin?: string; reviewer?: string };
  source?: string;
  sourceHash?: string;
}

export interface LegacyRecord {
  command?: string;
  exitCode?: number;
  head?: string;
  worktreeDigest?: string;
  log?: string;
  logHash?: string;
  tasks?: string[];
  acceptance?: string[];
  review?: LegacyReview;
}

export interface EvidenceIssue {
  code: string;
  reason: string;
  minimumAction: string;
  source: string;
}

export interface EvidenceDecision {
  confirmed: boolean;
  evidence: { source: string; hash: string; exitCode: number | null }[];
  gaps: EvidenceIssue[];
  conflicts: EvidenceIssue[];
}

export interface LegacyEvidence {
  records: [string, LegacyRecord][];
  broken: boolean;
  sources: string[];
}

function readObject(file: string): Record<string, any> | undefined {
  if (!existsSync(file)) return;
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value : undefined;
  } catch {
    return;
  }
}

export function readLegacyEvidence(
  root: string,
  change: string,
): LegacyEvidence {
  const relative = `${changeDir(change)}/evidence.json`;
  const file = local(root, relative);
  if (!existsSync(file)) return { records: [], broken: false, sources: [] };
  const value = readObject(file);
  if (!value || !value.records || typeof value.records !== "object")
    return { records: [], broken: true, sources: [relative] };
  const records = Object.entries(value.records)
    .filter(([, record]) => record && typeof record === "object")
    .sort(([left], [right]) => left.localeCompare(right)) as [
    string,
    LegacyRecord,
  ][];
  return {
    records,
    broken: false,
    sources: [
      relative,
      ...records.flatMap(([, record]) =>
        [record.log, record.review?.source].filter(
          (item): item is string => !!item,
        ),
      ),
    ],
  };
}

function recordIntegrity(root: string, record: LegacyRecord): boolean {
  return !!(
    record.log &&
    record.logHash &&
    hashFile(root, record.log) === record.logHash
  );
}

function sameStrings(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (
    !left.every((item) => typeof item === "string") ||
    !right.every((item) => typeof item === "string")
  )
    return false;
  return (
    [...new Set(left)].sort().join("\0") ===
    [...new Set(right)].sort().join("\0")
  );
}

function reviewStatus(
  root: string,
  record: LegacyRecord,
  acceptance: string[],
): "missing" | "valid" | "conflict" {
  const review = record.review;
  if (!review) return "missing";
  if (!review.source || !review.sourceHash) return "conflict";
  if (hashFile(root, review.source) !== review.sourceHash) return "conflict";
  const source = readObject(local(root, review.source));
  if (!source) return "conflict";
  const sourceMatches =
    source.reviewer === review.reviewer &&
    source.verdict === review.verdict &&
    source.independent === review.independent &&
    source.provenance?.origin === review.provenance?.origin &&
    source.provenance?.reviewer === review.provenance?.reviewer &&
    sameStrings(source.acceptance, review.acceptance);
  if (!sourceMatches) return "conflict";
  if (review.verdict === "changes-requested") return "conflict";
  if (
    review.reviewer &&
    review.verdict === "approved" &&
    review.independent === true &&
    review.provenance?.origin === "legacy" &&
    review.provenance.reviewer === review.reviewer &&
    acceptance.every((id) => review.acceptance?.includes(id))
  )
    return "valid";
  if (
    review.reviewer &&
    review.provenance?.reviewer &&
    review.provenance.reviewer !== review.reviewer
  )
    return "conflict";
  return "missing";
}

export function evaluateLegacyEvidence(options: {
  root: string;
  change: string;
  task: string;
  command?: string;
  acceptance: string[];
  state: { head: string; worktreeDigest: string };
  legacy: LegacyEvidence;
}): EvidenceDecision {
  const { root, change, task, command, acceptance, state, legacy } = options;
  const linked = legacy.records.filter(([, record]) =>
    record.tasks?.includes(task),
  );
  const source = `${changeDir(change)}/evidence.json`;
  const evidence = linked.map(([label, record]) => ({
    source: `${source}#${label}`,
    hash: record.log ? hashFile(root, record.log) : "<missing>",
    exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
  }));
  const conflicts: EvidenceIssue[] = [];
  const gaps: EvidenceIssue[] = [];
  if (legacy.broken) {
    conflicts.push({
      code: "evidence-integrity-failed",
      reason: "the legacy evidence ledger is unreadable",
      minimumAction: "repair evidence.json before migration",
      source,
    });
  }
  if (linked.some(([, record]) => !recordIntegrity(root, record))) {
    conflicts.push({
      code: "evidence-integrity-failed",
      reason: "a task-linked evidence log is missing or changed",
      minimumAction:
        "restore the referenced log or reconcile the current result",
      source,
    });
  }
  const contradictory = linked.some(
    ([, record]) =>
      record.exitCode !== 0 ||
      record.head !== state.head ||
      record.worktreeDigest !== state.worktreeDigest,
  );
  if (contradictory) {
    conflicts.push({
      code: "task-evidence-conflict",
      reason: "task-linked evidence failed or names another code state",
      minimumAction:
        "inspect the linked record and reconcile the current result",
      source,
    });
  }
  const successful = linked.filter(
    ([, record]) =>
      record.exitCode === 0 &&
      record.command === command &&
      record.head === state.head &&
      record.worktreeDigest === state.worktreeDigest &&
      recordIntegrity(root, record) &&
      acceptance.length > 0 &&
      acceptance.every((id) => record.acceptance?.includes(id)),
  );
  if (
    successful.some(
      ([, record]) => reviewStatus(root, record, acceptance) === "conflict",
    )
  ) {
    conflicts.push({
      code: "review-provenance-conflict",
      reason: "review metadata is rejected or contradicts its hashed source",
      minimumAction:
        "restore matching approval provenance or obtain a reconciliation review",
      source,
    });
  }
  const confirmed = successful.some(
    ([, record]) => reviewStatus(root, record, acceptance) === "valid",
  );
  if (!confirmed && conflicts.length === 0) {
    if (successful.length === 0)
      gaps.push({
        code: "task-check-not-linked",
        reason:
          "no successful integrity-checked run matches this task, command, and code state",
        minimumAction: `run ${command ?? "the mapped check"} for reconciliation`,
        source,
      });
    if (
      !successful.some(
        ([, record]) => reviewStatus(root, record, acceptance) === "valid",
      )
    )
      gaps.push({
        code: "review-provenance-missing",
        reason:
          "no independent approving review covers the mapped acceptance criteria",
        minimumAction: "obtain an independent reconciliation review",
        source,
      });
  }
  return { confirmed, evidence, gaps, conflicts };
}
