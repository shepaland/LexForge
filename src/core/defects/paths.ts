import path from "node:path";

import { workspacePaths } from "../workspace/paths.js";

/**
 * Names and paths shared by `store.ts` and `lock.ts`. Both import from here
 * instead of from each other: `store.ts` needs `withLedgerLock` from
 * `lock.ts` for `mutateLedger`, and a lock file name derived from the ledger
 * file name is exactly the kind of small thing that used to pull the import
 * the other way — which built a cycle that `tsc --noEmit` and vitest's
 * resolver both tolerate but a plain `node` load of the compiled `dist/`
 * does not: a `const` computed from another module's `const` at the top of
 * the file hits the temporal dead zone the moment the cycle is entered from
 * the wrong side.
 */

/** Name of the ledger inside the project root, beside `lexforge/config.yaml`. */
export const DEFECTS_FILE = "defects.json";

/** Name of the lock file next to `lexforge/defects.json`. */
export const DEFECTS_LOCK_FILE = `${DEFECTS_FILE}.lock`;

/** Where the project's defect ledger lives. */
export function defectsFile(root: string): string {
  return path.join(workspacePaths(root).lexforge, DEFECTS_FILE);
}

/** Where the lock file of the project's defect ledger lives. */
export function ledgerLockFile(root: string): string {
  return path.join(path.dirname(defectsFile(root)), DEFECTS_LOCK_FILE);
}
