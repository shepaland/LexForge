import { makeFinding, type Finding } from "../validation/finding.js";
import { fenceMask, readPurpose, splitLines } from "./main-spec.js";

/** One requirement the delta hands over, kept as the text it was written in. */
export interface DeltaBlock {
  name: string;
  /** Line of the `### Requirement:` heading, counted from 1. */
  line: number;
  /** The block word for word, from its heading to the line before the next one. */
  raw: string;
}

/** A requirement the delta takes away. Only the name is needed to find it. */
export interface RemovedRequirement {
  name: string;
  line: number;
}

/** The two halves of a rename, read from the `FROM` and `TO` lines. */
export interface RenamePair {
  from: string;
  to: string;
  /** Line of the `FROM` half. */
  line: number;
}

/** What one delta spec asks the merge to do with one capability. */
export interface DeltaPlan {
  /** Path to the delta spec, in the form the reader is shown. */
  file: string;
  /** Text of the Purpose section, empty when the delta carries none. */
  purpose: string;
  added: DeltaBlock[];
  modified: DeltaBlock[];
  removed: RemovedRequirement[];
  renamed: RenamePair[];
  /** Defects of the rename section: a half-written pair, an empty name, a repeat. */
  findings: Finding[];
}

const OPERATION_HEADING = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/;
/** One half of a rename: `- FROM: ` or `- TO: `, with or without the dash. */
const RENAME_HALF = /^\s*-?\s*(FROM|TO):\s*(.*)$/;
const BACKTICKED = /^`(.*)`$/;
const REQUIREMENT_HEADING = /^###\s+Requirement:\s*(.*)$/;
const TOP_HEADING = /^##\s+\S/;
/** Where a requirement block ends: the next `###` or `##` heading. */
const BLOCK_BORDER = /^###?\s+\S/;

/**
 * Reads one delta spec into the four lists the merge works from. The text is
 * kept word for word: what the delta wrote is what the main spec gets.
 */
export function parseDeltaPlan(file: string, content: string): DeltaPlan {
  const lines = splitLines(content);
  const fenced = fenceMask(lines);

  const blocks: Record<string, DeltaBlock[]> = {
    ADDED: [],
    MODIFIED: [],
    REMOVED: [],
    RENAMED: [],
  };

  const halves: RenameHalf[] = [];
  let operation: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    if (fenced[index]) {
      continue;
    }

    const line = lines[index]!;

    const operationHeading = OPERATION_HEADING.exec(line);
    if (operationHeading) {
      operation = operationHeading[1]!;
      continue;
    }

    if (TOP_HEADING.test(line)) {
      operation = null;
      continue;
    }

    if (operation === "RENAMED") {
      const half = RENAME_HALF.exec(line);
      if (half) {
        halves.push({
          half: half[1] as "FROM" | "TO",
          name: requirementName(half[2]!),
          line: index + 1,
        });
        continue;
      }
    }

    const heading = REQUIREMENT_HEADING.exec(line);
    if (heading && operation) {
      const body: string[] = [line];
      let cursor = index + 1;
      while (cursor < lines.length && (fenced[cursor] || !BLOCK_BORDER.test(lines[cursor]!))) {
        body.push(lines[cursor]!);
        cursor += 1;
      }

      blocks[operation]!.push({
        name: heading[1]!.trim(),
        line: index + 1,
        raw: `${body.join("\n")}\n`,
      });
      index = cursor - 1;
    }
  }

  const findings: Finding[] = [];

  for (const block of blocks.RENAMED!) {
    findings.push(
      makeFinding(
        file,
        block.line,
        "renamed-requirement-block",
        `Requirement "${block.name}" stands under the rename section. A rename ` +
          "takes only its FROM and TO lines; move the block to ADDED or MODIFIED.",
      ),
    );
  }

  const renamed = pairHalves(file, halves, findings);

  return {
    file,
    purpose: readPurpose(content),
    added: blocks.ADDED!,
    modified: blocks.MODIFIED!,
    removed: blocks.REMOVED!.map((block) => ({ name: block.name, line: block.line })),
    renamed,
    findings,
  };
}

/** One `FROM` or `TO` line, read but not yet matched with its other half. */
interface RenameHalf {
  half: "FROM" | "TO";
  name: string;
  line: number;
}

/**
 * Walks the halves in file order and takes them two at a time: FROM, then TO.
 * A half left on its own, an empty name and a name used twice are defects of
 * form, and they are reported here so `lexforge validate --strict` shows them
 * long before the archiving.
 */
function pairHalves(file: string, halves: RenameHalf[], findings: Finding[]): RenamePair[] {
  const pairs: RenamePair[] = [];

  for (let index = 0; index < halves.length; index += 1) {
    const current = halves[index]!;
    const next = halves[index + 1];

    if (current.half !== "FROM" || next?.half !== "TO") {
      findings.push(
        makeFinding(
          file,
          current.line,
          "renamed-pair-broken",
          `The ${current.half} line has no other half. A rename takes two lines: ` +
            "`- FROM: `### Requirement: <old name>`` and " +
            "`- TO: `### Requirement: <new name>``.",
        ),
      );
      continue;
    }

    if (current.name === "" || next.name === "") {
      findings.push(
        makeFinding(
          file,
          current.name === "" ? current.line : next.line,
          "renamed-name-empty",
          "A rename line names no requirement. Write the name after the colon: " +
            "`### Requirement: <name>`.",
        ),
      );
      index += 1;
      continue;
    }

    pairs.push({ from: current.name, to: next.name, line: current.line });
    index += 1;
  }

  findings.push(...duplicatePairs(file, pairs));

  return pairs;
}

/** Two pairs that start from one name, or end at one name, cannot both hold. */
function duplicatePairs(file: string, pairs: RenamePair[]): Finding[] {
  const findings: Finding[] = [];
  const sources = new Map<string, number>();
  const targets = new Map<string, number>();

  for (const pair of pairs) {
    const source = sources.get(pair.from);
    if (source === undefined) {
      sources.set(pair.from, pair.line);
    } else {
      findings.push(
        makeFinding(
          file,
          pair.line,
          "renamed-duplicate-source",
          `Requirement "${pair.from}" is renamed twice: here and on line ${source}. ` +
            "Leave one rename and delete the other.",
        ),
      );
    }

    const target = targets.get(pair.to);
    if (target === undefined) {
      targets.set(pair.to, pair.line);
    } else {
      findings.push(
        makeFinding(
          file,
          pair.line,
          "renamed-duplicate-target",
          `Two renames end at "${pair.to}": here and on line ${target}. ` +
            "Two requirements cannot take one name.",
        ),
      );
    }
  }

  return findings;
}

/**
 * The name a rename half points at. The half carries the heading of the
 * requirement in backticks, so the backticks and the heading come off.
 */
function requirementName(text: string): string {
  const inner = BACKTICKED.exec(text.trim());
  const heading = (inner ? inner[1]! : text).trim();
  const parsed = REQUIREMENT_HEADING.exec(heading);
  return (parsed ? parsed[1]! : heading).trim();
}
