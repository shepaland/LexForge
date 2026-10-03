import {
  changeDir,
  executionPlan,
  taskSource,
  workflow,
  type Cycle,
} from "./plan.js";
import { readState } from "./state.js";
import { historicalValid } from "./proofs.js";
import {
  readMigrationState,
  migrationIntegrityProblems,
} from "./migration-state.js";
import {
  reconciliations,
  reconciliationApproved,
  reconciliationProof,
} from "./reconciliation.js";
import { refuse } from "./files.js";
export function effectiveCompletion(
  root: string,
  change: string,
  cycles: Cycle[] = executionPlan(root, change, true),
) {
  const ledger =
    workflow(root, change).version === 2
      ? readMigrationState(root, change)
      : undefined;
  const integrity = ledger ? migrationIntegrityProblems(root, ledger) : [];
  if (integrity.length) refuse(integrity.join("; "));
  const origins: Record<string, "historical" | "reconciled" | "native"> = {};
  const tasks = taskSource(root, change).tasks;
  for (const t of ledger?.tasks ?? []) if (t.origin) origins[t.id] = t.origin;
  const states = cycles.map((c) => ({ c, s: readState(root, change, c.id) }));
  for (const { c, s } of states) {
    if (ledger)
      for (const { record } of reconciliations(root, change, c)) {
        if (!reconciliationProof(root, record))
          refuse(`Reconciliation integrity failed: ${record.attempt}`);
        if (reconciliationApproved(record))
          for (const id of record.tasks) origins[id] ??= "reconciled";
      }
    if (s && historicalValid(root, change, c, s))
      for (const id of c.tasks) origins[id] ??= "native";
  }
  const completed = tasks.filter((t) => origins[t.number]).map((t) => t.number);
  const open = tasks.filter((t) => !origins[t.number]).map((t) => t.number);
  const resolved = states.map(({ c, s }) => ({
    id: c.id,
    complete: c.tasks.every((t) => completed.includes(t)),
    nativeClosed: !!s && historicalValid(root, change, c, s),
    completed: c.tasks.filter((t) => completed.includes(t)),
    open: c.tasks.filter((t) => open.includes(t)),
  }));
  return {
    ledger,
    origins,
    completed,
    open,
    cycles: resolved,
    details: ledger ? `${changeDir(change)}/migration.json` : null,
  };
}
