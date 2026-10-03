import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  openSync,
  closeSync,
  writeSync,
} from "node:fs";
import { z } from "zod";
import { runLabelCommand } from "../gates/run-command.js";
import {
  changeDir,
  executionPlan,
  contract,
  taskSource,
  type Cycle,
} from "./plan.js";
import { hashFile, hashes, equal, json, local, refuse, save } from "./files.js";
import { codeState, environment, snapshot, snapshotValid } from "./proofs.js";
const report = z
  .object({
    version: z.literal(1),
    origin: z.literal("reconciled"),
    attempt: z.string(),
    reviewer: z.string().trim().min(1),
    executor: z.string().trim().min(1),
    verdict: z.enum(["approved", "changes-requested"]),
    tasks: z.array(z.string()),
    acceptance: z.array(z.string()),
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    origin: z.literal("reconciled"),
    attempt: z.string(),
    cycle: z.string(),
    executor: z.string(),
    tasks: z.array(z.string()),
    acceptance: z.array(z.string()),
    command: z.string(),
    contract: z.string(),
    environment: z.string(),
    state: z.object({ head: z.string(), worktreeDigest: z.string() }).strict(),
    inputs: z.record(z.string(), z.string()),
    snapshot: z.string(),
    snapshotHashes: z.record(z.string(), z.string()),
    log: z.string(),
    logHash: z.string(),
    startedAt: z.string(),
    durationMs: z.number(),
    exitCode: z.number(),
    accepted: z.boolean(),
    review: z
      .object({
        report,
        source: z.string(),
        hash: z.string(),
        reviewedAt: z.string(),
        valid: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Reconciliation = z.infer<typeof schema>;
function directory(change: string, id: string) {
  return `${changeDir(change)}/reconciliation/${id}`;
}
function selected(root: string, change: string, id: string) {
  const c = executionPlan(root, change, true).find((c) => c.id === id);
  if (!c) refuse(`Unknown cycle: ${id}`);
  return c;
}
export function reconciliationPaths(
  root: string,
  change: string,
  id: string,
): string[] {
  const dir = directory(change, id);
  if (!existsSync(local(root, dir))) return [];
  return readdirSync(local(root, dir))
    .filter((n) => /^(attempt|reviewed)-[a-f0-9-]+\.json$/.test(n))
    .sort()
    .map((n) => `${dir}/${n}`);
}
export function readReconciliation(root: string, file: string): Reconciliation {
  const parsed = schema.safeParse(json(local(root, file)));
  if (!parsed.success) refuse(`Invalid reconciliation record: ${file}`);
  return parsed.data;
}
export function reconciliationProof(root: string, r: Reconciliation): boolean {
  return (
    hashFile(root, r.log) === r.logHash &&
    snapshotValid(root, r.snapshot, r.snapshotHashes) &&
    (!r.review ||
      (hashFile(root, r.review.source) === r.review.hash &&
        equal(json(local(root, r.review.source)), r.review.report)))
  );
}
export function reconciliationCurrent(
  root: string,
  change: string,
  c: Cycle,
  r: Reconciliation,
): boolean {
  return (
    equal(r.state, codeState(root)) &&
    r.cycle === c.id &&
    r.command === c.command &&
    r.contract === contract(root, change, c) &&
    r.environment === environment(c) &&
    equal(r.inputs, hashes(root, c.inputs)) &&
    equal(
      r.snapshotHashes,
      hashes(
        root,
        c.files.map((f) => f.path),
      ),
    ) &&
    reconciliationProof(root, r)
  );
}
export function reconciliationApproved(r: Reconciliation): boolean {
  const p = r.review?.report;
  return (
    r.accepted &&
    r.exitCode === 0 &&
    r.review?.valid === true &&
    !!p &&
    p.attempt === r.attempt &&
    p.executor === r.executor &&
    p.reviewer !== r.executor &&
    p.verdict === "approved" &&
    r.tasks.every((t) => p.tasks.includes(t)) &&
    r.acceptance.every((a) => p.acceptance.includes(a))
  );
}
export function reconciliations(root: string, change: string, c: Cycle) {
  return reconciliationPaths(root, change, c.id)
    .map((source) => ({ source, record: readReconciliation(root, source) }))
    .sort(
      (a, b) =>
        a.record.startedAt.localeCompare(b.record.startedAt) ||
        a.source.localeCompare(b.source),
    );
}
export async function reconcile(
  root: string,
  change: string,
  id: string,
  executor: string,
) {
  if (!executor.trim()) refuse("Executor identity is required");
  const c = selected(root, change, id);
  const checked = taskSource(root, change)
    .tasks.filter((t) => t.done && c.tasks.includes(t.number))
    .map((t) => t.number);
  if (!checked.length) refuse("Reconciliation requires checked existing work");
  const attempt = randomUUID();
  const dir = directory(change, id);
  mkdirSync(local(root, dir), { recursive: true });
  const snap = `${dir}/snapshot-${attempt}`;
  const log = `${dir}/${attempt}.log`;
  const before = {
    state: codeState(root),
    contract: contract(root, change, c),
    environment: environment(c),
    inputs: hashes(root, c.inputs),
  };
  const snapshotHashes = snapshot(
    root,
    snap,
    c.files.map((f) => f.path),
  );
  const fd = openSync(local(root, log), "wx");
  let run;
  try {
    run = await runLabelCommand({
      cwd: root,
      command: c.command,
      stdout: {
        write: (s) => {
          writeSync(fd, s);
        },
      },
      stderr: {
        write: (s) => {
          writeSync(fd, s);
        },
      },
    });
  } finally {
    closeSync(fd);
  }
  const r: Reconciliation = {
    version: 1,
    origin: "reconciled",
    attempt,
    cycle: id,
    executor: executor.trim(),
    tasks: checked,
    acceptance: c.acceptance
      .filter((a) => checked.includes(a.task))
      .map((a) => a.id),
    command: c.command,
    ...before,
    snapshot: snap,
    snapshotHashes,
    log,
    logHash: hashFile(root, log),
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    exitCode: run.exitCode,
    accepted: false,
  };
  r.accepted =
    run.exitCode === 0 &&
    equal(before.state, codeState(root)) &&
    reconciliationCurrent(root, change, c, r);
  const source = `${dir}/attempt-${attempt}.json`;
  save(local(root, source), r);
  return {
    outputVersion: 1,
    origin: r.origin,
    attempt,
    source,
    tasks: r.tasks,
    accepted: r.accepted,
    exitCode: r.exitCode,
  };
}
export function reconcileReview(
  root: string,
  change: string,
  id: string,
  file: string,
) {
  const c = selected(root, change, id);
  const parsed = report.safeParse(json(local(root, file)));
  if (!parsed.success) refuse("Invalid reconciliation review");
  const p = parsed.data;
  const matching = reconciliations(root, change, c).filter(
    (x) => x.record.attempt === p.attempt,
  );
  if (matching.some((x) => x.record.review))
    refuse("Reviewed reconciliation attempts are immutable; run a new check");
  const item = matching[0];
  if (!item) refuse("Unknown reconciliation attempt");
  const r = item.record;
  if (r.review)
    refuse("Reviewed reconciliation attempts are immutable; run a new check");
  const source = `${directory(change, id)}/review-${r.attempt}.json`;
  save(local(root, source), p);
  r.review = {
    report: p,
    source,
    hash: hashFile(root, source),
    reviewedAt: new Date().toISOString(),
    valid:
      equal(r.state, codeState(root)) &&
      reconciliationCurrent(root, change, c, r),
  };
  const reviewedSource = `${directory(change, id)}/reviewed-${r.attempt}.json`;
  save(local(root, reviewedSource), r);
  const confirmed =
    reconciliationApproved(r) &&
    equal(r.state, codeState(root)) &&
    reconciliationCurrent(root, change, c, r);
  if (!confirmed)
    refuse(
      "Reconciliation is failed, stale, incomplete, or not independently approved",
    );
  return {
    outputVersion: 1,
    origin: "reconciled",
    confirmed,
    tasks: r.tasks,
    source: reviewedSource,
  };
}
