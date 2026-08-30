import { makeFinding, type Finding } from "../validation/finding.js";
import { parseDeltaPlan, type DeltaPlan } from "./delta-plan.js";
import {
  blockScenarios,
  parseMainSpec,
  renderMainSpec,
  type MainSpec,
  type RequirementBlock,
} from "./main-spec.js";

/**
 * A conflict of the merge: the same shape as a finding of the checks, so the
 * command prints both lists the same way and counts them the same way.
 */
export type MergeConflict = Finding;

/** How many operations of each kind the merge applied. */
export interface ApplyCounts {
  added: number;
  modified: number;
  removed: number;
  renamed: number;
}

export interface ApplyResult {
  /** The spec as it comes out of the merge, or null when it stays unwritten. */
  spec: MainSpec | null;
  conflicts: MergeConflict[];
  counts: ApplyCounts;
}

/** One capability of the change: its delta and the main spec it merges into. */
export interface CapabilityMerge {
  capability: string;
  /** Path of the delta spec, in the form the reader is shown. */
  deltaFile: string;
  delta: string;
  /** Path of the main spec, in the form the reader is shown. */
  specFile: string;
  /** Text of the main spec, or null when the workspace has none yet. */
  spec: string | null;
}

/** The text one capability gets after the merge. */
export interface MergedSpec {
  capability: string;
  file: string;
  content: string;
  /** False when the text is the one already on disk, word for word. */
  changed: boolean;
}

export interface ApplyChangeResult {
  /** Empty whenever a conflict was found: nothing of the change is written. */
  specs: MergedSpec[];
  conflicts: MergeConflict[];
  counts: ApplyCounts;
}

/**
 * Merges every capability of one change. The whole result is counted before a
 * single file is written, and one conflict anywhere leaves every spec as it
 * was: half the requirements merged and half left behind is the one outcome
 * nobody can read back.
 */
export function applyChange(merges: CapabilityMerge[]): ApplyChangeResult {
  const specs: MergedSpec[] = [];
  const conflicts: MergeConflict[] = [];
  const counts: ApplyCounts = { added: 0, modified: 0, removed: 0, renamed: 0 };

  for (const merge of merges) {
    const plan = parseDeltaPlan(merge.deltaFile, merge.delta);
    conflicts.push(...plan.findings);

    const current = merge.spec === null ? null : parseMainSpec(merge.spec);
    const result = applyPlan(current, plan, merge.capability);

    conflicts.push(...result.conflicts);
    counts.added += result.counts.added;
    counts.modified += result.counts.modified;
    counts.removed += result.counts.removed;
    counts.renamed += result.counts.renamed;

    if (result.spec === null) {
      continue;
    }

    const content = renderMainSpec(result.spec);
    specs.push({
      capability: merge.capability,
      file: merge.specFile,
      content,
      changed: content !== merge.spec,
    });
  }

  if (conflicts.length > 0) {
    return { specs: [], conflicts, counts: { added: 0, modified: 0, removed: 0, renamed: 0 } };
  }

  return { specs, conflicts, counts };
}

/**
 * Applies one delta plan to one main spec. Nothing is written here: the caller
 * gets the result in memory and writes it only when no capability of the change
 * reported a conflict.
 */
export function applyPlan(
  spec: MainSpec | null,
  plan: DeltaPlan,
  capability: string,
): ApplyResult {
  const conflicts: MergeConflict[] = [];
  const counts: ApplyCounts = { added: 0, modified: 0, removed: 0, renamed: 0 };
  const blocks: RequirementBlock[] = spec ? [...spec.blocks] : [];

  const twice = namedTwice(plan, conflicts);
  const repeat = alreadyApplied(blocks, plan);

  // The order is part of the contract: a rename first lets one change rename a
  // requirement and edit it under the new name, and adding last keeps a new
  // requirement out of the name a rename has just freed.
  for (const pair of plan.renamed) {
    if (twice.has(pair.from) || twice.has(pair.to)) {
      continue;
    }

    if (spec === null) {
      conflicts.push(specMissing(plan, capability, "RENAMED", pair.line));
      continue;
    }

    const at = blocks.findIndex((block) => block.name === pair.from);

    // The old name gone and the new one in place is a rename this merge has
    // already made: a second run finds its own work and leaves it alone.
    if (at === -1 && blocks.some((block) => block.name === pair.to)) {
      continue;
    }

    if (at === -1) {
      conflicts.push(
        missing(
          plan,
          capability,
          "renamed-source-missing",
          "RENAMED FROM",
          pair.from,
          pair.line,
          blocks,
        ),
      );
      continue;
    }

    if (blocks.some((block) => block.name === pair.to)) {
      conflicts.push(
        makeFinding(
          plan.file,
          pair.line,
          "renamed-target-taken",
          `RENAMED TO names requirement "${pair.to}", and capability ` +
            `"${capability}" already has one under that name. Two requirements ` +
            "cannot take one name.",
        ),
      );
      continue;
    }

    blocks[at] = renameBlock(blocks[at]!, pair.to);
    counts.renamed += 1;
  }

  for (const gone of plan.removed) {
    if (twice.has(gone.name)) {
      continue;
    }

    if (spec === null) {
      conflicts.push(specMissing(plan, capability, "REMOVED", gone.line));
      continue;
    }

    const at = blocks.findIndex((block) => block.name === gone.name);

    // The name is gone and the rest of the delta already stands in the spec:
    // this removal went through in a run that broke off before the change was
    // moved. It changes nothing and reports nothing.
    if (at === -1 && repeat) {
      continue;
    }

    if (at === -1) {
      conflicts.push(
        missing(
          plan,
          capability,
          "removed-name-missing",
          "REMOVED",
          gone.name,
          gone.line,
          blocks,
        ),
      );
      continue;
    }

    blocks.splice(at, 1);
    counts.removed += 1;
  }

  for (const incoming of plan.modified) {
    if (twice.has(incoming.name)) {
      continue;
    }

    if (spec === null) {
      conflicts.push(specMissing(plan, capability, "MODIFIED", incoming.line));
      continue;
    }

    const at = blocks.findIndex((block) => block.name === incoming.name);
    if (at === -1) {
      conflicts.push(
        missing(
          plan,
          capability,
          "modified-name-missing",
          "MODIFIED",
          incoming.name,
          incoming.line,
          blocks,
        ),
      );
      continue;
    }

    if (sameBlock(blocks[at]!, incoming)) {
      continue;
    }

    const dropped = droppedScenarios(blocks[at]!, incoming);
    if (dropped.length > 0) {
      for (const scenario of dropped) {
        conflicts.push(
          makeFinding(
            plan.file,
            incoming.line,
            "modified-drops-scenario",
            `MODIFIED replaces requirement "${incoming.name}" of capability ` +
              `"${capability}" with a block that has no scenario "${scenario}". ` +
              "MODIFIED replaces the block whole, so write the scenario into the " +
              "delta, or remove it in a change of its own.",
          ),
        );
      }
      continue;
    }

    blocks[at] = { name: incoming.name, line: incoming.line, raw: incoming.raw };
    counts.modified += 1;
  }

  for (const incoming of plan.added) {
    if (twice.has(incoming.name)) {
      continue;
    }

    const standing = blocks.find((block) => block.name === incoming.name);

    // The same block already in the spec is the second run of a merge that was
    // cut off between writing the specs and moving the change. It changes
    // nothing and reports nothing.
    if (standing && sameBlock(standing, incoming)) {
      continue;
    }

    if (standing) {
      conflicts.push(
        makeFinding(
          plan.file,
          incoming.line,
          "added-name-taken",
          `ADDED names requirement "${incoming.name}", and capability ` +
            `"${capability}" already has one under that name. Move the block to ` +
            "MODIFIED, or give the new requirement a name of its own.",
        ),
      );
      continue;
    }

    blocks.push({ name: incoming.name, line: incoming.line, raw: incoming.raw });
    counts.added += 1;
  }

  if (spec === null && plan.added.length > 0 && plan.purpose.trim() === "") {
    conflicts.push(
      makeFinding(
        plan.file,
        1,
        "purpose-missing",
        `Capability "${capability}" is written for the first time, and the delta ` +
          'spec has no "## Purpose" section. The main spec takes its Purpose from ' +
          "the delta; write one and say what the capability is for.",
      ),
    );
  }

  // A conflict stops the merge whole: half the requirements in the main spec
  // and half in the change is the one outcome nobody can read back.
  if (conflicts.length > 0) {
    return { spec, conflicts, counts: { added: 0, modified: 0, removed: 0, renamed: 0 } };
  }

  const merged: MainSpec = {
    title: spec ? spec.title : capability,
    purpose: spec ? spec.purpose : plan.purpose,
    blocks: separateBlocks(blocks),
  };

  return { spec: merged, conflicts, counts };
}

/**
 * Names two operations of one delta claim. A requirement the delta takes away
 * twice, or hands over twice, has no order that makes both operations true, so
 * neither of them runs.
 *
 * A rename frees the old name and takes the new one, and that is why renaming
 * `A` to `B` and adding a new `A` is not a clash: `A` is taken once and given
 * up once.
 */
function namedTwice(plan: DeltaPlan, conflicts: MergeConflict[]): Set<string> {
  const taken: Claim[] = [
    ...plan.modified.map((block) => claim(block.name, block.line, "MODIFIED")),
    ...plan.removed.map((entry) => claim(entry.name, entry.line, "REMOVED")),
    ...plan.renamed.map((pair) => claim(pair.from, pair.line, "RENAMED FROM")),
  ];
  const given: Claim[] = [
    ...plan.added.map((block) => claim(block.name, block.line, "ADDED")),
    ...plan.renamed.map((pair) => claim(pair.to, pair.line, "RENAMED TO")),
  ];

  const names = new Set<string>();
  for (const group of [taken, given]) {
    const first = new Map<string, Claim>();

    for (const entry of group) {
      const earlier = first.get(entry.name);
      if (earlier === undefined) {
        first.set(entry.name, entry);
        continue;
      }

      names.add(entry.name);
      conflicts.push(
        makeFinding(
          plan.file,
          entry.line,
          "operation-conflict",
          `Requirement "${entry.name}" stands under ${earlier.operation} on line ` +
            `${earlier.line} and under ${entry.operation} here. Leave one of the ` +
            "two operations.",
        ),
      );
    }
  }

  return names;
}

/**
 * The conflict of an operation that works on a spec the workspace does not
 * have yet. A capability written for the first time takes ADDED and nothing
 * else: there is nothing to change, remove or rename.
 */
function specMissing(
  plan: DeltaPlan,
  capability: string,
  operation: string,
  line: number,
): MergeConflict {
  return makeFinding(
    plan.file,
    line,
    "spec-missing",
    `${operation} works on capability "${capability}", and the workspace has no ` +
      "spec for it yet. A capability written for the first time takes ADDED only.",
  );
}

/** One operation of the delta, seen as a claim on a requirement name. */
interface Claim {
  name: string;
  line: number;
  operation: string;
}

function claim(name: string, line: number, operation: string): Claim {
  return { name, line, operation };
}

/**
 * The conflict of an operation that names a requirement the capability does
 * not have. There is nothing to change, remove or rename under that name.
 */
function missing(
  plan: DeltaPlan,
  capability: string,
  rule: string,
  operation: string,
  name: string,
  line: number,
  blocks: RequirementBlock[],
): MergeConflict {
  const near = nearName(name, blocks);

  return makeFinding(
    plan.file,
    line,
    rule,
    `${operation} names requirement "${name}", and capability "${capability}" ` +
      "has no requirement under that name. " +
      (near === null
        ? "Check the heading in the delta against the main spec."
        : `The spec has "${near}". Write the heading of the delta the same way.`),
  );
}

/**
 * Scenarios the main spec has and the incoming block does not. Names are
 * counted, not just looked up: a block that carries one scenario under a name
 * the spec carries twice loses one of them all the same.
 */
function droppedScenarios(current: RequirementBlock, incoming: RequirementBlock): string[] {
  const left = countNames(blockScenarios(current));
  const right = countNames(blockScenarios(incoming));

  const dropped: string[] = [];
  for (const [name, count] of left) {
    if (count > (right.get(name) ?? 0)) {
      dropped.push(name);
    }
  }

  return dropped;
}

function countNames(names: string[]): Map<string, number> {
  const counted = new Map<string, number>();
  for (const name of names) {
    counted.set(name, (counted.get(name) ?? 0) + 1);
  }
  return counted;
}

/**
 * The name of the spec that differs only in spaces and case. Those two are
 * what a name written by hand a second time gets wrong most of the time.
 */
function nearName(name: string, blocks: RequirementBlock[]): string | null {
  const key = compareKey(name);
  const near = blocks.find((block) => compareKey(block.name) === key);
  return near ? near.name : null;
}

function compareKey(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/**
 * Two blocks that say the same thing. The texts are compared character for
 * character, and only the blank lines at the end are left out: how many of
 * them a block ends with depends on where it stands in the file, not on what
 * it says. A block that only looks alike is what a person has to see.
 */
function sameBlock(left: RequirementBlock, right: RequirementBlock): boolean {
  return left.raw.trimEnd() === right.raw.trimEnd();
}

/**
 * True when the main spec already carries the whole result of this delta: every
 * ADDED and MODIFIED block stands in it word for word, every rename is done, and
 * every REMOVED name is gone. That is the state a run cut off between writing the
 * specs and moving the change leaves behind, and a REMOVED name missing from such
 * a spec is work already done rather than a heading that never matched.
 *
 * One operation has to leave a trace the merge can recognise: a block that stands
 * in the spec, or a rename that has landed. A delta of REMOVED alone leaves
 * nothing to recognise it by, and reading a missing name there as "already
 * removed" would let a misspelled heading through on the very first run.
 */
function alreadyApplied(blocks: RequirementBlock[], plan: DeltaPlan): boolean {
  if (plan.added.length + plan.modified.length + plan.renamed.length === 0) {
    return false;
  }

  const holds = (name: string): boolean => blocks.some((block) => block.name === name);

  for (const incoming of [...plan.added, ...plan.modified]) {
    const standing = blocks.find((block) => block.name === incoming.name);
    if (!standing || !sameBlock(standing, incoming)) {
      return false;
    }
  }

  for (const pair of plan.renamed) {
    if (holds(pair.from) || !holds(pair.to)) {
      return false;
    }
  }

  return !plan.removed.some((gone) => holds(gone.name));
}

/** Writes the new name into the heading and leaves the rest of the block alone. */
function renameBlock(block: RequirementBlock, name: string): RequirementBlock {
  const border = block.raw.indexOf("\n");
  const rest = border === -1 ? "" : block.raw.slice(border);
  return { ...block, name, raw: `### Requirement: ${name}${rest}` };
}

/**
 * Keeps one blank line between blocks. A block that stood last in its file
 * ends without one, and after a merge it can stand in the middle.
 */
function separateBlocks(blocks: RequirementBlock[]): RequirementBlock[] {
  return blocks.map((block, index) => {
    if (index === blocks.length - 1 || block.raw.endsWith("\n\n")) {
      return block;
    }
    return { ...block, raw: `${block.raw}\n` };
  });
}
