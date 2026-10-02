import { randomUUID } from "node:crypto";
import { checkStartScope, checkRunScope } from "./scope.js";
import { readChangeState } from "../status/change-status.js";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  mkdirSync,
  openSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { commandNeverStarted, runLabelCommand } from "../gates/run-command.js";
import {
  contract,
  changeDir,
  executionPlan,
  workflow,
  type Cycle,
} from "./plan.js";
import { equal, hashFile, hashes, local, refuse, save } from "./files.js";
import {
  codeState,
  currentGreen,
  environment,
  assertInputs,
  redValid,
  snapshot,
  snapshotValid,
  historicalValid,
} from "./proofs.js";
import {
  parseReview,
  readState,
  writeState,
  type CycleState,
  type CycleRun,
} from "./state.js";
function selected(root: string, change: string, id: string): Cycle {
  if (!readChangeState(root, change).state.isPlanningComplete)
    refuse(
      "Planning is incomplete; complete or explicitly skip required artifacts",
    );
  if (workflow(root, change).version !== 2)
    refuse("Cycle commands require explicit workflow 2 migration");
  const c = executionPlan(root, change, true).find((c) => c.id === id);
  if (!c) refuse(`Unknown cycle: ${id}`);
  return c;
}
function active(root: string, change: string, c: Cycle): CycleState {
  const s = readState(root, change, c.id);
  if (!s) refuse("Start the cycle before edits");
  if (s.closedAt)
    refuse(
      "Closed cycles are immutable; create a follow-up cycle for new work",
    );
  if (s.contract !== contract(root, change, c))
    refuse(
      "Cycle contract changed; use cycle restart to preserve history and earn new evidence",
    );
  return s;
}
export function startCycle(
  root: string,
  change: string,
  id: string,
  executor: string,
  restart = false,
): CycleState {
  const c = selected(root, change, id);
  if (!executor.trim()) refuse("Executor identity is required");
  const previous = readState(root, change, id);
  if (previous && !restart) refuse("Cycle already started; resume its state");
  if (restart && !previous) refuse("Nothing to restart");
  const all = executionPlan(root, change, true);
  for (const dep of c.dependsOn) {
    const d = all.find((x) => x.id === dep)!;
    const s = readState(root, change, dep);
    if (!s || !historicalValid(root, change, d, s))
      refuse(`Dependency not closed with valid proof: ${dep}`);
  }
  for (const other of all) {
    const s = readState(root, change, other.id);
    if (
      other.id !== id &&
      s &&
      !s.closedAt &&
      other.files.some((f) => c.files.some((x) => x.path === f.path))
    )
      refuse(`Overlapping active cycle: ${other.id}`);
  }
  const outsideDigest = checkStartScope(root, change, c, all, restart);
  const directory = `${changeDir(change)}/execution/${id}`;
  mkdirSync(local(root, directory), { recursive: true });
  if (previous)
    save(local(root, `${directory}/history-${randomUUID()}.json`), previous);
  const before = `${directory}/before-${randomUUID()}`;
  const beforeHashes = snapshot(
    root,
    before,
    c.files.map((f) => f.path),
  );
  if (previous) {
    if (!snapshotValid(root, previous.before, previous.beforeHashes))
      refuse("Cannot restart with a damaged original baseline");
    if (
      Object.keys(previous.beforeHashes).some(
        (file) => !c.files.some((f) => f.path === file),
      )
    )
      refuse("Restart must preserve the previous file scope");
    for (const [file, hash] of Object.entries(previous.beforeHashes)) {
      const target = local(root, `${before}/${file}`);
      if (hash === "<missing>") rmSync(target, { force: true });
      else {
        const source = local(root, `${previous.before}/${file}`);
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(source, target);
        chmodSync(target, statSync(source).mode);
      }
      beforeHashes[file] = hash;
    }
  }
  const s: CycleState = {
    version: 1,
    cycle: id,
    executor,
    contract: contract(root, change, c),
    base: codeState(root),
    outsideDigest,
    before,
    beforeHashes,
    runs: [],
  };
  writeState(root, change, s);
  return s;
}
export async function runCycle(
  root: string,
  change: string,
  id: string,
  phase: string,
) {
  if (phase !== "red" && phase !== "green")
    refuse("Phase must be red or green");
  const c = selected(root, change, id);
  const s = active(root, change, c);
  if (phase === "red" && c.mode === "move")
    refuse(
      "Pure moves use regression GREEN and independent review, not an invented RED",
    );
  assertInputs(root, c);
  if (!snapshotValid(root, s.before, s.beforeHashes))
    refuse("Original baseline is missing or changed");
  if (phase === "green" && c.mode !== "move" && !redValid(root, change, c, s))
    refuse(
      "RED evidence is absent or stale: test, inputs, environment or contract changed",
    );
  checkRunScope(
    root,
    change,
    c,
    executionPlan(root, change, true),
    s.outsideDigest,
  );
  const beforeState = codeState(root);
  const beforeFiles = hashes(
    root,
    c.files.map((f) => f.path),
  );
  const tests = hashes(root, c.testFiles);
  const inputs = hashes(root, c.inputs);
  const env = environment(c);
  const directory = `${changeDir(change)}/execution/${id}/${randomUUID()}`;
  mkdirSync(local(root, directory));
  const log = `${directory}/run.log`;
  const fd = openSync(local(root, log), "wx");
  let matched = false;
  let pending = "";
  let infrastructureFailure = false;
  const observe = (line: string) => {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
    if (clean === c.expectedFailure.trim()) matched = true;
    if (
      /^(SyntaxError:|Error: Cannot find module|Error \[ERR_MODULE_NOT_FOUND\]|error TS\d+:|fatal error:)/.test(
        clean,
      )
    )
      infrastructureFailure = true;
  };
  const sink = {
    write(chunk: string) {
      writeSync(fd, chunk);
      pending += chunk;
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        observe(pending.slice(0, index));
        pending = pending.slice(index + 1);
      }
      if (pending.length > 16384) pending = pending.slice(-16384);
    },
  };
  let run;
  try {
    run = await runLabelCommand({
      command: c.command,
      cwd: root,
      stdout: sink,
      stderr: sink,
    });
  } finally {
    closeSync(fd);
  }
  observe(pending);
  const state = codeState(root);
  const stable =
    equal(
      beforeFiles,
      hashes(
        root,
        c.files.map((f) => f.path),
      ),
    ) &&
    equal(beforeState, state) &&
    equal(tests, hashes(root, c.testFiles)) &&
    equal(inputs, hashes(root, c.inputs)) &&
    env === environment(c);
  const accepted =
    stable &&
    !commandNeverStarted({ command: c.command, exitCode: run.exitCode }) &&
    (phase === "red"
      ? run.exitCode === 1 && matched && !infrastructureFailure
      : run.exitCode === 0);
  const snapshotPath = `${directory}/source`;
  const snapshotHashes = snapshot(
    root,
    snapshotPath,
    c.files.map((f) => f.path),
  );
  const record: CycleRun = {
    phase,
    command: c.command,
    exitCode: run.exitCode,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    log,
    logHash: hashFile(root, log),
    tail: run.outputTail,
    state,
    tests,
    inputs,
    environment: env,
    contract: s.contract,
    accepted,
    snapshot: snapshotPath,
    snapshotHashes,
  };
  s.runs.push(record);
  delete s.review;
  delete s.patch;
  delete s.patchHash;
  if (phase === "green" && accepted) {
    const patch = `${directory}/cycle.patch`;
    const handle = openSync(local(root, patch), "wx");
    let result;
    try {
      result = spawnSync(
        "git",
        [
          "diff",
          "--no-index",
          "--binary",
          "--no-ext-diff",
          "--no-textconv",
          "--",
          local(root, s.before),
          local(root, snapshotPath),
        ],
        { cwd: root, stdio: ["ignore", handle, "pipe"] },
      );
    } finally {
      closeSync(handle);
    }
    if (result.error || (result.status !== 0 && result.status !== 1))
      refuse("Could not produce cycle patch");
    s.patch = patch;
    s.patchHash = hashFile(root, patch);
  }
  writeState(root, change, s);
  return {
    record,
    reason: accepted
      ? "accepted"
      : !stable
        ? "Inputs changed during run"
        : phase === "red"
          ? "Expected failing assertion was not observed"
          : "Test command failed",
    exitCode: accepted ? 0 : 1,
  };
}
export function reviewCycle(
  root: string,
  change: string,
  id: string,
  file: string,
) {
  const c = selected(root, change, id);
  const s = active(root, change, c);
  const green = currentGreen(root, change, c, s);
  if (!green) refuse("Review requires current GREEN evidence");
  if (!s.patch || hashFile(root, s.patch) !== s.patchHash)
    refuse("Missing or modified cycle patch");
  const report = parseReview(local(root, file));
  if (report.reviewer === s.executor)
    refuse("Review must be independent of the executor");
  if (c.acceptance.some((a) => !report.acceptance.includes(a.id)))
    refuse("Review must account for every acceptance criterion");
  if (c.controls.some((x) => !report.controls.includes(x)))
    refuse("Required specialist review controls are missing");
  const dest = `${changeDir(change)}/execution/${id}/review-${randomUUID()}.json`;
  copyFileSync(local(root, file), local(root, dest));
  s.review = {
    report,
    greenLogHash: green.logHash,
    file: dest,
    fileHash: hashFile(root, dest),
  };
  writeState(root, change, s);
  return s.review;
}
export function closeCycle(root: string, change: string, id: string) {
  const c = selected(root, change, id);
  const s = active(root, change, c);
  const green = currentGreen(root, change, c, s);
  if (
    !green ||
    !s.review ||
    s.review.greenLogHash !== green.logHash ||
    hashFile(root, s.review.file) !== s.review.fileHash
  )
    refuse("Current GREEN and independent review are required");
  if (
    s.review.report.verdict !== "approved" ||
    s.review.report.findings.some(
      (f) => !f.resolved && (f.level === "critical" || f.level === "important"),
    )
  )
    refuse("Blocking review findings remain open");
  if (
    !s.patch ||
    hashFile(root, s.patch) !== s.patchHash ||
    !snapshotValid(root, s.before, s.beforeHashes)
  )
    refuse("Cycle snapshots or patch changed");
  s.closedAt = new Date().toISOString();
  writeState(root, change, s);
  return s;
}
