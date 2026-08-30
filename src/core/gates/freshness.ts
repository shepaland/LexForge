import { makeFinding, type Finding } from "../validation/finding.js";
import type { EvidenceRecord } from "./evidence-store.js";

/** How much of a commit a message shows: enough to tell two apart, short enough to read. */
const SHORT_COMMIT = 8;

/**
 * What a check label is worth right now.
 *
 * - `fresh` — the stamp is there, the run was green, and both the commit and
 *   the working tree are the ones the run stood on;
 * - `failed` — the stamp was taken on this state and the run was red;
 * - `stale-commit` — the stamp was taken on another commit;
 * - `stale-worktree` — same commit, another working tree;
 * - `missing` — the ledger holds no record of this label.
 *
 * There is no sixth state that fails the check softly: a state that returned
 * exit code 0 on a stale stamp is the way around the gate.
 */
export type LabelState = "fresh" | "failed" | "stale-commit" | "stale-worktree" | "missing";

/** The state of the code a stamp is compared against. */
export interface CodeState {
  head: string;
  worktreeDigest: string;
}

/**
 * The state of one label. The commit is compared before the digest: a stamp
 * from another commit is stale whatever the working tree looks like, and
 * naming the commit is what tells the reader how far back the run was.
 */
export function labelState(record: EvidenceRecord | undefined, current: CodeState): LabelState {
  if (!record) {
    return "missing";
  }

  if (record.head !== current.head) {
    return "stale-commit";
  }

  if (record.worktreeDigest !== current.worktreeDigest) {
    return "stale-worktree";
  }

  return record.exitCode === 0 ? "fresh" : "failed";
}

export interface FreshnessFindingOptions {
  /** Path of the ledger, in the form a finding shows it. */
  file: string;
  change: string;
  label: string;
  state: LabelState;
  /** The stamp in the ledger, absent when the state is `missing`. */
  record?: EvidenceRecord;
  current: CodeState;
}

/**
 * The finding a label that is not fresh gives. Every state but `fresh` gives
 * one, and the text says what to run to make it fresh: the reader is one
 * command away from fixing it, and that command is the answer either way.
 */
export function freshnessFinding(options: FreshnessFindingOptions): Finding | undefined {
  if (options.state === "fresh") {
    return undefined;
  }

  const call = `lexforge evidence record --change ${options.change} --label ${options.label}`;

  return makeFinding(
    options.file,
    1,
    "evidence-not-fresh",
    `check "${options.label}" is ${options.state}: ${reason(options)}. Run: ${call}`,
  );
}

/** What put the label in this state, in the words the reader can act on. */
function reason(options: FreshnessFindingOptions): string {
  const record = options.record;

  switch (options.state) {
    case "missing":
      return "the ledger holds no stamp for it";
    case "failed":
      return `the last run finished with exit code ${record?.exitCode ?? "not 0"}`;
    case "stale-commit":
      return (
        `the stamp was taken on commit ${short(record?.head)}, and the working tree ` +
        `stands on ${short(options.current.head)}`
      );
    default:
      return "the commit is the same, but the working tree has been edited since the run";
  }
}

function short(commit: string | undefined): string {
  return commit ? commit.slice(0, SHORT_COMMIT) : "an unknown commit";
}
