import { makeFinding } from "../validation/finding.js";
import { type DeltaPlan } from "./delta-plan.js";
import { blockScenarios, type RequirementBlock } from "./main-spec.js";
import { type MergeConflict } from "./apply-plan.js";

/**
 * Names two operations of one delta claim. A requirement the delta takes away
 * twice, or hands over twice, has no order that makes both operations true, so
 * neither of them runs.
 *
 * A rename frees the old name and takes the new one, and that is why renaming
 * `A` to `B` and adding a new `A` is not a clash: `A` is taken once and given
 * up once.
 */
export function namedTwice(plan: DeltaPlan, conflicts: MergeConflict[]): Set<string> {
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
export function specMissing(
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
export function missing(
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
export function droppedScenarios(current: RequirementBlock, incoming: RequirementBlock): string[] {
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
export function sameBlock(left: RequirementBlock, right: RequirementBlock): boolean {
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
export function alreadyApplied(blocks: RequirementBlock[], plan: DeltaPlan): boolean {
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
export function renameBlock(block: RequirementBlock, name: string): RequirementBlock {
  const border = block.raw.indexOf("\n");
  const rest = border === -1 ? "" : block.raw.slice(border);
  return { ...block, name, raw: `### Requirement: ${name}${rest}` };
}

/**
 * Keeps one blank line between blocks. A block that stood last in its file
 * ends without one, and after a merge it can stand in the middle.
 */
export function separateBlocks(blocks: RequirementBlock[]): RequirementBlock[] {
  return blocks.map((block, index) => {
    if (index === blocks.length - 1 || block.raw.endsWith("\n\n")) {
      return block;
    }
    return { ...block, raw: `${block.raw}\n` };
  });
}
