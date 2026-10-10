import { readMigrationState } from "./migration-state.js";
import {
  reconciliations,
  reconciliationApproved,
  reconciliationProof,
} from "./reconciliation.js";
import { existsSync } from "node:fs";
import { z } from "zod";
import { UsageError } from "../../cli/errors.js";
import { worktreeDigest, worktreeEntries } from "../git/worktree-digest.js";
import { hashes, json, local, refuse, save } from "./files.js";
import { changeDir, type Cycle } from "./plan.js";
import { historicalValid } from "./proofs.js";
import { readState } from "./state.js";

const baselineSchema = z
  .object({
    files: z.record(z.string(), z.string()),
    outsideDigest: z.string(),
    outside: z.record(z.string(), z.string()).optional(),
  })
  .strict();
function refuseWith(message: string, nextStep: string): never {
  throw new UsageError("execution-invalid", message, nextStep);
}
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
  const outside = { ...worktreeEntries(root, paths) };
  const migration = readMigrationState(root, change);
  const baseline: z.infer<typeof baselineSchema> = existsSync(file)
    ? baselineSchema.parse(json(file))
    : migration
      ? {
          files: Object.fromEntries(
            migration.sourceHashes
              .filter((s) => s.kind === "code")
              .map((s) => [s.path, s.hash]),
          ),
          outsideDigest: migration.outsideDigest,
          outside,
        }
      : { files: hashes(root, paths), outsideDigest, outside };
  const expected = accountedFiles(root, change, all, baseline.files);
  const previous = restart ? readState(root, change, cycle.id) : undefined;
  const current = hashes(
    root,
    cycle.files.map((file) => file.path),
  );
  const noMigrationBaseline: string[] = [];
  const noBaseline: string[] = [];
  const unreviewed: string[] = [];
  for (const [name, hash] of Object.entries(current)) {
    const existingScope = previous?.beforeHashes[name] !== undefined;
    if (
      migration &&
      !existingScope &&
      expected[name] === undefined &&
      hash !== "<missing>"
    )
      noMigrationBaseline.push(name);
    if (
      restart &&
      !existingScope &&
      expected[name] === undefined &&
      hash !== "<missing>"
    )
      noBaseline.push(name);
    if (
      !existingScope &&
      expected[name] !== undefined &&
      expected[name] !== hash
    )
      unreviewed.push(name);
    if (baseline.files[name] === undefined) baseline.files[name] = hash;
  }
  if (noMigrationBaseline.length > 0)
    refuseWith(
      `No proven migration baseline for added scope: ${noMigrationBaseline.join(", ")}`,
      "Plan the added paths as new work in a cycle of their own, then start again",
    );
  if (noBaseline.length > 0)
    refuseWith(
      `No proven baseline for added scope: ${noBaseline.join(", ")}. Preserve this attempt and plan new work before editing these paths`,
      "Preserve this attempt, plan the added paths as new work, then run the cycle start again",
    );
  if (unreviewed.length > 0)
    refuseWith(
      `Unreviewed edits before cycle start: ${unreviewed.join(", ")}. Restore the accounted state before starting`,
      "Restore these paths to their accounted state, then run the cycle start again",
    );
  save(file, baseline);
  return outsideDigest;
}

export function checkRunScope(
  root: string,
  change: string,
  cycle: Cycle,
  all: Cycle[],
): void {
  const file = local(root, `${changeDir(change)}/execution/baseline.json`);
  const baseline = baselineSchema.parse(json(file));
  const expected = accountedFiles(root, change, all, baseline.files);
  const found: string[] = [];
  for (const other of all) {
    if (other.id === cycle.id) continue;
    const state = readState(root, change, other.id);
    if (state) continue; // its captured baseline and independent review own these paths
    const paths = other.files
      .map((file) => file.path)
      .filter((file) => !cycle.files.some((own) => own.path === file));
    const current = hashes(root, paths);
    const changed = paths.filter((path) => current[path] !== expected[path]);
    if (changed.length > 0) found.push(`${other.id}: ${changed.join(", ")}`);
  }
  if (found.length > 0)
    refuseWith(
      `Unstarted cycle files changed: ${found.join("; ")}`,
      "Restore these paths, or start the cycle that owns them, then run this cycle again",
    );
}

/** The paths outside the execution plan that differ from the baseline; empty when none do. */
export function checkFinalScope(
  root: string,
  change: string,
  cycles: Cycle[],
): string[] {
  const file = local(root, `${changeDir(change)}/execution/baseline.json`);
  if (!existsSync(file)) refuse("No execution baseline has been captured");
  const baseline = baselineSchema.parse(json(file));
  const current = worktreeEntries(root, plannedFiles(cycles));
  const recorded = baseline.outside;
  if (!recorded)
    return worktreeDigest(root, plannedFiles(cycles)) === baseline.outsideDigest
      ? []
      : Object.keys(current).sort();
  return [...new Set([...Object.keys(current), ...Object.keys(recorded)])]
    .filter((path) => current[path] !== recorded[path])
    .sort();
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

/** Every path outside the execution plan that is dirty now, whatever the baseline holds. */
export function currentOutside(root: string, cycles: Cycle[]): string[] {
  return Object.keys(worktreeEntries(root, plannedFiles(cycles))).sort();
}
