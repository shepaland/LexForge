import { readMigrationState } from "./migration-state.js";
import {
  reconciliations,
  reconciliationApproved,
  reconciliationProof,
} from "./reconciliation.js";
import { existsSync } from "node:fs";
import { z } from "zod";
import { worktreeDigest } from "../git/worktree-digest.js";
import { hashes, json, local, refuse, save } from "./files.js";
import { changeDir, type Cycle } from "./plan.js";
import { historicalValid } from "./proofs.js";
import { readState } from "./state.js";

const baselineSchema = z
  .object({
    files: z.record(z.string(), z.string()),
    outsideDigest: z.string(),
  })
  .strict();
export function plannedFiles(cycles: Cycle[]): string[] {
  return [
    ...new Set(cycles.flatMap((cycle) => cycle.files.map((file) => file.path))),
  ].sort();
}

/** Reserve every declared path before the first cycle; future work cannot hide in its baseline. */
export function checkStartScope(
  root: string,
  change: string,
  cycle: Cycle,
  all: Cycle[],
  restart: boolean,
): string {
  const file = local(root, `${changeDir(change)}/execution/baseline.json`);
  const paths = plannedFiles(all);
  const outsideDigest = worktreeDigest(root, paths);
  const migration = readMigrationState(root, change);
  const baseline = existsSync(file)
    ? baselineSchema.parse(json(file))
    : migration
      ? {
          files: Object.fromEntries(
            migration.sourceHashes
              .filter((s) => s.kind === "code")
              .map((s) => [s.path, s.hash]),
          ),
          outsideDigest: migration.outsideDigest,
        }
      : { files: hashes(root, paths), outsideDigest };
  if (baseline.outsideDigest !== outsideDigest)
    refuse("Unaccounted changes outside the execution plan");
  const expected = accountedFiles(root, change, all, baseline.files);
  const previous = restart ? readState(root, change, cycle.id) : undefined;
  const current = hashes(
    root,
    cycle.files.map((file) => file.path),
  );
  for (const [name, hash] of Object.entries(current)) {
    const existingScope = previous?.beforeHashes[name] !== undefined;
    if (
      migration &&
      !existingScope &&
      expected[name] === undefined &&
      hash !== "<missing>"
    )
      refuse(`No proven migration baseline for added scope: ${name}`);
    if (
      restart &&
      !existingScope &&
      expected[name] === undefined &&
      hash !== "<missing>"
    ) {
      refuse(
        `No proven baseline for added scope: ${name}. Preserve this attempt and plan new work before editing that path`,
      );
    }
    if (
      !existingScope &&
      expected[name] !== undefined &&
      expected[name] !== hash
    ) {
      refuse(
        `Unreviewed edits before cycle start: ${name}. Restore the accounted state before starting`,
      );
    }
    if (baseline.files[name] === undefined) baseline.files[name] = hash;
  }
  save(file, baseline);
  return outsideDigest;
}

export function checkRunScope(
  root: string,
  change: string,
  cycle: Cycle,
  all: Cycle[],
  outsideDigest: string,
): void {
  if (worktreeDigest(root, plannedFiles(all)) !== outsideDigest)
    refuse("Files outside the execution plan changed");
  const file = local(root, `${changeDir(change)}/execution/baseline.json`);
  const baseline = baselineSchema.parse(json(file));
  const expected = accountedFiles(root, change, all, baseline.files);
  for (const other of all) {
    if (other.id === cycle.id) continue;
    const state = readState(root, change, other.id);
    if (state) continue; // its captured baseline and independent review own these paths
    const paths = other.files
      .map((file) => file.path)
      .filter((file) => !cycle.files.some((own) => own.path === file));
    const current = hashes(root, paths);
    if (paths.some((path) => current[path] !== expected[path]))
      refuse(`Unstarted cycle files changed: ${other.id}`);
  }
}

export function checkFinalScope(
  root: string,
  change: string,
  cycles: Cycle[],
): void {
  const file = local(root, `${changeDir(change)}/execution/baseline.json`);
  if (!existsSync(file)) refuse("No execution baseline has been captured");
  const baseline = baselineSchema.parse(json(file));
  if (worktreeDigest(root, plannedFiles(cycles)) !== baseline.outsideDigest)
    refuse("Unreviewed changes outside the execution plan");
}

/** Replay accepted snapshots over the immutable migration or native baseline. */
function accountedFiles(
  root: string,
  change: string,
  all: Cycle[],
  baseline: Record<string, string>,
) {
  const snapshots: { time: string; files: Record<string, string> }[] = [];
  for (const c of all) {
    const state = readState(root, change, c.id);
    if (state && historicalValid(root, change, c, state))
      snapshots.push({
        time: state.closedAt!,
        files: state.runs.at(-1)!.snapshotHashes,
      });
    if (readMigrationState(root, change))
      for (const { record } of reconciliations(root, change, c))
        if (reconciliationApproved(record) && reconciliationProof(root, record))
          snapshots.push({
            time: record.review!.reviewedAt,
            files: record.snapshotHashes,
          });
  }
  const expected = { ...baseline };
  for (const snapshot of snapshots.sort((a, b) => a.time.localeCompare(b.time)))
    Object.assign(expected, snapshot.files);
  return expected;
}
