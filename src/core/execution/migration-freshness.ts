import { contract, type Cycle } from "./plan.js";
import { hashFile, hashes } from "./files.js";
import { codeState, historicalValid } from "./proofs.js";
import { readState } from "./state.js";
import { readLedger } from "../gates/evidence-store.js";
import { labelState } from "../gates/freshness.js";
import { worktreeDigest } from "../git/worktree-digest.js";
import {
  reconciliations,
  reconciliationApproved,
  reconciliationCurrent,
  reconciliationProof,
} from "./reconciliation.js";
import type { MigrationState } from "./migration-state.js";

/** History stays immutable; this report describes only coverage of the current material. */
export function migrationFreshness(
  root: string,
  change: string,
  cycles: Cycle[],
  ledger: MigrationState,
): string[] {
  const issues: string[] = [];
  const allPaths = cycles.flatMap((c) => c.files.map((f) => f.path));
  if (worktreeDigest(root, allPaths) !== ledger.outsideDigest)
    issues.push("Unreviewed changes outside the execution plan");
  const records = Object.values(readLedger(root, change).records);
  const latest = new Map<string, { hash: string; time: string }>();
  for (const s of ledger.sourceHashes.filter((s) => s.kind === "code"))
    latest.set(s.path, { hash: s.hash, time: ledger.createdAt });
  const approved = new Map(
    cycles.map((c) => [
      c.id,
      reconciliations(root, change, c)
        .map((x) => x.record)
        .filter(
          (r) => reconciliationApproved(r) && reconciliationProof(root, r),
        ),
    ]),
  );
  for (const c of cycles) {
    for (const record of approved.get(c.id)!) {
      for (const [file, hash] of Object.entries(record.snapshotHashes)) {
        const time = record.review!.reviewedAt;
        if (!latest.has(file) || latest.get(file)!.time < time)
          latest.set(file, { hash, time });
      }
    }
    const native = readState(root, change, c.id);
    if (native && historicalValid(root, change, c, native)) {
      for (const [file, hash] of Object.entries(
        native.runs.at(-1)!.snapshotHashes,
      )) {
        if (!latest.has(file) || latest.get(file)!.time < native.closedAt!)
          latest.set(file, { hash, time: native.closedAt! });
      }
    }
  }
  for (const c of cycles) {
    const native = readState(root, change, c.id);
    const closed = !!native && historicalValid(root, change, c, native);
    const confirmed =
      ledger.tasks.some((t) => t.origin && c.tasks.includes(t.id)) ||
      approved
        .get(c.id)!
        .some((r) => r.tasks.some((id) => c.tasks.includes(id)));
    if (!confirmed && !closed) continue;
    const reconciled = reconciliations(root, change, c).some(
      ({ record }) =>
        reconciliationApproved(record) &&
        reconciliationCurrent(root, change, c, record) &&
        c.tasks.every((t) => record.tasks.includes(t)),
    );
    const latestApproval = [...approved.get(c.id)!]
      .sort((a, b) => a.review!.reviewedAt.localeCompare(b.review!.reviewedAt))
      .at(-1);
    const sameContract =
      (latestApproval?.contract ?? ledger.contracts[c.id]) ===
      contract(root, change, c);
    if (!sameContract && !closed && !reconciled)
      issues.push(
        `Migration stale-input: cycle mapping, acceptance or command changed: ${c.id}`,
      );
    const freshCheck =
      sameContract &&
      records.some(
        (r) =>
          r.startedAt >= ledger.createdAt &&
          !!r.log &&
          labelState(r, {
            ...codeState(root),
            command: c.command,
            logValid: hashFile(root, r.log) === r.logHash,
          }) === "fresh",
      );
    for (const [file, hash] of Object.entries(
      hashes(
        root,
        c.files.map((f) => f.path),
      ),
    )) {
      if (latest.get(file)?.hash !== hash && !reconciled && !freshCheck)
        issues.push(`Migration stale-code: Unreviewed current file ${file}`);
    }
    for (const file of c.inputs) {
      const baseline =
        latestApproval?.inputs[file] ??
        ledger.sourceHashes.find((s) => s.kind === "input" && s.path === file)
          ?.hash;
      const nativeHash = closed ? native!.runs.at(-1)!.inputs[file] : undefined;
      if (
        hashFile(root, file) !== (nativeHash ?? baseline) &&
        !reconciled &&
        !(freshCheck && !file.startsWith("lexforge/"))
      )
        issues.push(`Migration stale-input: ${file}`);
    }
  }
  return [...new Set(issues)];
}
