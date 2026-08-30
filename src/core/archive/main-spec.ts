/**
 * The long-lived spec of one capability: `lexforge/specs/<capability>/spec.md`.
 * It keeps a title, a Purpose section and a Requirements section holding blocks
 * of the form `### Requirement: <name>`.
 */
export interface MainSpec {
  /** Capability path, taken from the `# <title>` heading. */
  title: string;
  /** Text of the Purpose section, without the blank lines around it. */
  purpose: string;
  blocks: RequirementBlock[];
}

/** One requirement of the main spec, kept as the text it was read from. */
export interface RequirementBlock {
  name: string;
  /** Line of the `### Requirement:` heading, counted from 1. */
  line: number;
  /** The block word for word, from its heading to the line before the next one. */
  raw: string;
}

const FENCE = /^\s*```/;
const TITLE_HEADING = /^#\s+(.*)$/;
const PURPOSE_HEADING = /^##\s+Purpose\s*$/;
const REQUIREMENT_HEADING = /^###\s+Requirement:\s*(.*)$/;
const SCENARIO_HEADING = /^####\s+Scenario:\s*(.*)$/;
const TOP_HEADING = /^##\s+\S/;
/** Where a requirement block ends: the next `###` or `##` heading. */
const BLOCK_BORDER = /^###?\s+\S/;

/**
 * Reads the spec line by line, the way `scanSpec` reads a delta. The text of a
 * block is kept word for word: a diff between two archivings then shows only
 * what the delta really touched.
 */
export function parseMainSpec(content: string): MainSpec {
  const lines = splitLines(content);
  const fenced = fenceMask(lines);

  let title = "";
  const blocks: RequirementBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (fenced[index]) {
      continue;
    }

    if (title === "" && TITLE_HEADING.test(line)) {
      title = TITLE_HEADING.exec(line)![1]!.trim();
      continue;
    }

    const heading = REQUIREMENT_HEADING.exec(line);
    if (heading) {
      const body: string[] = [line];
      let cursor = index + 1;
      while (cursor < lines.length && !isHeading(lines, fenced, cursor, BLOCK_BORDER)) {
        body.push(lines[cursor]!);
        cursor += 1;
      }

      blocks.push({ name: heading[1]!.trim(), line: index + 1, raw: `${body.join("\n")}\n` });
      index = cursor - 1;
    }
  }

  return { title, purpose: readPurpose(content), blocks };
}

/**
 * Text of the Purpose section: everything between its heading and the next
 * top-level heading. A file without the section gives an empty string. Delta
 * specs are read with the same function, because a new capability takes its
 * Purpose from the delta.
 */
export function readPurpose(content: string): string {
  const lines = splitLines(content);
  const fenced = fenceMask(lines);

  for (let index = 0; index < lines.length; index += 1) {
    if (fenced[index] || !PURPOSE_HEADING.test(lines[index]!)) {
      continue;
    }

    const body: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && !isHeading(lines, fenced, cursor, TOP_HEADING)) {
      body.push(lines[cursor]!);
      cursor += 1;
    }

    return trimBlankLines(body).join("\n");
  }

  return "";
}

/**
 * Marks every line that stands inside a fenced code block, the fence lines
 * included. A heading written inside a fence is an example, not a heading.
 */
export function fenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      mask.push(true);
      continue;
    }
    mask.push(inFence);
  }

  return mask;
}

/** True when the line is a heading of the given shape and stands outside a fence. */
function isHeading(
  lines: string[],
  fenced: boolean[],
  index: number,
  pattern: RegExp,
): boolean {
  return !fenced[index] && pattern.test(lines[index]!);
}

/**
 * Names of the scenarios the block carries, in the order they stand. Repeats
 * are kept: MODIFIED counts how many times a name occurs, so that a block
 * holding the same name twice cannot lose one of them unnoticed.
 */
export function blockScenarios(block: RequirementBlock): string[] {
  const lines = splitLines(block.raw);
  const fenced = fenceMask(lines);
  const names: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (fenced[index]) {
      continue;
    }

    const heading = SCENARIO_HEADING.exec(lines[index]!);
    if (heading) {
      names.push(heading[1]!.trim());
    }
  }

  return names;
}

/**
 * Writes the spec back: title, Purpose, the Requirements heading and the blocks
 * word for word. The shape is the one decision 12 fixed, so a spec written by
 * hand in another shape comes out of the first merge in this one.
 */
export function renderMainSpec(spec: MainSpec): string {
  const head = `# ${spec.title}\n\n## Purpose\n\n${spec.purpose}\n\n## Requirements\n\n`;
  return head + spec.blocks.map((block) => block.raw).join("");
}

/**
 * Splits into lines and drops the empty piece a trailing newline leaves behind,
 * so a block never carries a line the file does not hold.
 */
export function splitLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** Drops the blank lines at both ends and keeps the ones inside. */
function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]!.trim() === "") {
    start += 1;
  }
  while (end > start && lines[end - 1]!.trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}
