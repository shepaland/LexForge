import { readProjectConfig } from "../workspace/project-config.js";
import { hashFile } from "../tasks/files.js";
import { workspacePath } from "../answer-path.js";
import { readHead } from "../git/repository.js";
import { worktreeDigest } from "../git/worktree-digest.js";
import { makeFinding, type Finding } from "../validation/finding.js";
import { evidenceFile, readLedger } from "./evidence-store.js";
import { freshnessFinding, labelState, type CodeState } from "./freshness.js";

/**
 * The third measure: what the ledger says about every check the project
 * describes. No command is run here. A gate that runs the test suite takes
 * minutes, and a check that slow is the one an agent learns to leave out.
 * This reads `evidence.json` only: this dimension answers for the whole tree.
 */
export function evidenceFindings(root: string, change: string, labels: string[]): Finding[] {
  const current: CodeState = { head: readHead(root), worktreeDigest: worktreeDigest(root) };
  const ledger = readLedger(root, change);
  const file = workspacePath(root, evidenceFile(root, change));

  const findings: Finding[] = [];

  for (const label of labels) {
    const record = ledger.records[label];
    const finding = freshnessFinding({
      file,
      change,
      label,
      state: labelState(record, { ...current, command: readProjectConfig(root).verification[label], logValid: !record?.log || hashFile(root, record.log) === record.logHash }),
      record,
      current,
    });

    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}
