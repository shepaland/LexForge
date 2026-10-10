import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { readHead } from "../git/repository.js";
import { createHash } from "node:crypto";
import { worktreeEntries } from "../git/worktree-digest.js";
import { digest, equal, hashFile, hashes, local, refuse } from "./files.js";
import { contract, executionPlan, type Cycle } from "./plan.js";
import { plannedFiles } from "./scope.js";
import type { CycleRun, CycleState } from "./state.js";

/**
 * The head and a digest of the working tree. With `planned`, only those
 * paths are digested, so an edit elsewhere leaves the state as it was.
 */
export function codeState(root: string, planned?: string[]) {
  const entries = worktreeEntries(root);
  const only = planned && new Set(planned);
  const hash = createHash("sha256");
  for (const name of Object.keys(entries).sort()) {
    if (only && !only.has(name)) continue;
    hash.update(`${name}\0${entries[name]}\n`);
  }
  return { head: readHead(root), worktreeDigest: `sha256:${hash.digest("hex")}` };
}

export function plannedState(root: string, change: string) {
  return codeState(root, plannedFiles(executionPlan(root, change, true)));
}

export function environment(cycle: Cycle): string {
  return digest(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      env: cycle.environment.map((key) => [key, process.env[key] ?? null]),
    }),
  );
}

export function snapshot(
  root: string,
  directory: string,
  files: string[],
): Record<string, string> {
  mkdirSync(local(root, directory), { recursive: false });
  const values = hashes(root, files);
  for (const file of files) {
    if (values[file] === "<missing>") continue;
    const from = local(root, file);
    const to = local(root, `${directory}/${file}`);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    chmodSync(to, statSync(from).mode);
  }
  return values;
}

export function snapshotValid(
  root: string,
  directory: string,
  values: Record<string, string>,
): boolean {
  return Object.entries(values).every(
    ([file, hash]) => hashFile(root, `${directory}/${file}`) === hash,
  );
}

export function proofValid(root: string, run: CycleRun): boolean {
  return (
    hashFile(root, run.log) === run.logHash &&
    snapshotValid(root, run.snapshot, run.snapshotHashes)
  );
}

export function redValid(
  root: string,
  change: string,
  cycle: Cycle,
  state: CycleState,
): boolean {
  const red = state.runs.findLast((run) => run.phase === "red");
  return (
    !!red &&
    red.accepted &&
    proofValid(root, red) &&
    red.command === cycle.command &&
    red.contract === contract(root, change, cycle) &&
    equal(red.tests, hashes(root, cycle.testFiles)) &&
    equal(red.inputs, hashes(root, cycle.inputs)) &&
    red.environment === environment(cycle) &&
    red.state.head === readHead(root)
  );
}

export function currentGreen(
  root: string,
  change: string,
  cycle: Cycle,
  state: CycleState,
): CycleRun | undefined {
  const green = state.runs.at(-1);
  const valid =
    green?.phase === "green" &&
    green.accepted &&
    proofValid(root, green) &&
    (cycle.mode === "move" || redValid(root, change, cycle, state)) &&
    equal(green.tests, hashes(root, cycle.testFiles)) &&
    equal(green.inputs, hashes(root, cycle.inputs)) &&
    green.environment === environment(cycle) &&
    green.contract === contract(root, change, cycle) &&
    equal(green.state, plannedState(root, change)) &&
    equal(
      green.snapshotHashes,
      hashes(
        root,
        cycle.files.map((file) => file.path),
      ),
    );
  return valid ? green : undefined;
}

/** Historical approval proves that version; final gates separately check the latest files. */
export function historicalValid(
  root: string,
  change: string,
  cycle: Cycle,
  state: CycleState,
): boolean {
  const red = state.runs.findLast((run) => run.phase === "red");
  const green = state.runs.at(-1);
  const review = state.review;
  if (!state.closedAt || green?.phase !== "green" || !green.accepted || !review)
    return false;
  return (
    state.contract === contract(root, change, cycle) &&
    (cycle.mode === "move" ||
      (!!red?.accepted &&
        proofValid(root, red) &&
        equal(red.tests, green.tests) &&
        equal(red.inputs, green.inputs) &&
        red.environment === green.environment &&
        red.contract === green.contract)) &&
    proofValid(root, green) &&
    review.greenLogHash === green.logHash &&
    hashFile(root, review.file) === review.fileHash &&
    review.report.reviewer !== state.executor &&
    review.report.verdict === "approved" &&
    !review.report.findings.some(
      (finding) => !finding.resolved && finding.level !== "minor",
    ) &&
    cycle.acceptance.every((item) =>
      review.report.acceptance.includes(item.id),
    ) &&
    cycle.controls.every((control) =>
      review.report.controls.includes(control),
    ) &&
    !!state.patch &&
    hashFile(root, state.patch) === state.patchHash &&
    snapshotValid(root, state.before, state.beforeHashes)
  );
}

export function assertInputs(root: string, cycle: Cycle): void {
  for (const file of [...cycle.testFiles, ...cycle.inputs]) {
    if (!existsSync(local(root, file)))
      refuse(`Missing test/material input: ${file}`);
  }
}
