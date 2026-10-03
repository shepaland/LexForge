import { randomUUID } from "node:crypto";
import {
  openSync,
  closeSync,
  fsyncSync,
  writeFileSync,
  renameSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { analyzeMigration } from "./migration-analysis.js";
import {
  canonical,
  makeMigrationState,
  readMigrationState,
} from "./migration-state.js";
import { changeDir, executionPlan, workflow } from "./plan.js";
import { hashFile, local, refuse } from "./files.js";
import { withExecutionLock } from "./lock.js";

/** Flush file data before atomic replacement. Windows does not support directory fsync. */
function durable(file: string, bytes: string) {
  const tmp = file + ".migration-" + randomUUID() + ".tmp";
  const fd = openSync(tmp, "wx");
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  if (process.platform !== "win32") {
    const dir = openSync(path.dirname(file), "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  }
}
function recoverTemps(
  root: string,
  change: string,
  ledger: string,
  pin: string,
  prepared: boolean,
) {
  const dir = local(root, changeDir(change));
  for (const name of readdirSync(dir).filter((n) =>
    /^(migration|workflow)\.json\.migration-.*\.tmp$/.test(n),
  )) {
    const expected = name.startsWith("migration.") ? ledger : pin;
    if (!prepared || readFileSync(path.join(dir, name), "utf8") !== expected)
      refuse(`Migration recovery conflict: unexplained temporary file ${name}`);
    // Matching interrupted staging is retained for inspection; it never replaces a target implicitly.
  }
}
export function applyMigration(root: string, change: string) {
  return withExecutionLock(root, change, () => {
    const pin = workflow(root, change);
    const previous = readMigrationState(root, change);
    const result = (
      mode: string,
      analysis?: ReturnType<typeof analyzeMigration>,
    ) => {
      const tasks = analysis?.tasks ?? previous?.tasks ?? [];
      const count = (classification: string) =>
        tasks.filter((t) => t.classification === classification).length;
      return {
        outputVersion: 1,
        version: 2,
        change,
        mode,
        applied: mode !== "native",
        sourceWorkflow: previous?.sourceWorkflow ?? pin.version,
        targetWorkflow: 2,
        inputDigest: analysis?.inputDigest ?? previous?.inputDigest ?? null,
        summary: {
          tasks: tasks.length,
          historicallyConfirmed: count("historically-confirmed"),
          needsVerification: count("needs-verification"),
          incomplete: count("incomplete"),
          conflicts: count("conflict"),
        },
        completedWrites:
          mode === "applied"
            ? [
                `${changeDir(change)}/migration.json`,
                `${changeDir(change)}/workflow.json`,
              ]
            : mode === "recovered"
              ? [`${changeDir(change)}/workflow.json`]
              : [],
        ledger:
          previous || mode === "applied"
            ? `${changeDir(change)}/migration.json`
            : null,
        nextStep: `lexforge resume --change ${change} --json`,
      };
    };
    if (pin.version === 2 && !previous) return result("native");
    executionPlan(root, change, true);
    const analysis = analyzeMigration(root, change);
    const currentDigest = analysis.inputDigest;
    if (previous && previous.inputDigest !== currentDigest)
      refuse(
        "Migration recovery conflict: analyzed inputs changed; existing ledger is preserved",
      );
    if (pin.version === 2) return result("already-applied", analysis);
    if (
      analysis.findings.length ||
      analysis.tasks.some((t) => t.classification === "conflict")
    )
      refuse(
        "Migration has blocking findings; inspect --dry-run before applying",
      );
    const state = previous ?? makeMigrationState(root, change, analysis);
    const pinPath = `${changeDir(change)}/workflow.json`;
    if (hashFile(root, pinPath) !== state.previousPinHash)
      refuse("Migration recovery conflict: workflow target changed");
    const ledgerPath = `${changeDir(change)}/migration.json`;
    const beforeLedger = hashFile(root, ledgerPath);
    const pinBytes = canonical({
      ...pin,
      version: 2,
      migration: state.integrity,
    });
    recoverTemps(root, change, canonical(state), pinBytes, !!previous);
    const unchanged = () => {
      const current = analyzeMigration(root, change);
      if (
        current.inputDigest !== currentDigest ||
        canonical(current.tasks) !== canonical(analysis.tasks) ||
        current.findings.length > 0 ||
        current.tasks.some((t) => t.classification === "conflict") ||
        hashFile(root, pinPath) !== state.previousPinHash
      )
        refuse("Migration inputs changed before commit");
    };
    unchanged();
    if (hashFile(root, ledgerPath) !== beforeLedger)
      refuse("Migration target changed before commit");
    if (!previous) durable(local(root, ledgerPath), canonical(state));
    unchanged();
    if (readFileSync(local(root, ledgerPath), "utf8") !== canonical(state))
      refuse("Migration ledger changed before pin");
    durable(local(root, pinPath), pinBytes);
    return result(previous ? "recovered" : "applied", analysis);
  });
}
