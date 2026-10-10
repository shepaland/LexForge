import { type Finding, makeFinding } from "./finding.js";

const COLUMNS = ["Message", "From", "To", "Field", "Type", "Required", "Length", "Response", "Errors"];
const LENGTH_TYPES = new Set(["string", "array"]);
const LENGTH_FORM = /^(\d+\.\.\d+|<=\s*\d+)$/;
const ARROW = /^\s*(\S+?)\s*->\s*(\S+?)\s*(?::\s*(\S.*?))?\s*$/;
const ARROW_SHAPE = /-+>/;
const SEPARATOR_CELL = /^:?-+:?$/;

interface Arrow {
  line: number;
  from: string;
  to: string;
  message: string;
}

interface Row {
  line: number;
  cells: string[];
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** The `Interaction:` line names pairs `a -> b` separated by commas. */
function declaredParticipants(line: string): string[] {
  const names: string[] = [];
  for (const pair of line.replace(/^\s*Interaction:/, "").split(",")) {
    for (const name of pair.split("->")) {
      const trimmed = name.trim();
      if (trimmed !== "" && !names.includes(trimmed)) names.push(trimmed);
    }
  }
  return names;
}

function checkTable(file: string, rows: Row[], arrows: Arrow[], findings: Finding[]): void {
  for (const row of rows) {
    const [message, from, to, field, rawType, , length] = row.cells;
    const type = (rawType ?? "").toLowerCase();
    const where = `message ${message}, field ${field}`;
    const filled = length !== undefined && length !== "";
    if (LENGTH_TYPES.has(type)) {
      if (!filled) {
        findings.push(
          makeFinding(file, row.line, "contract-length-missing", `The ${where} has type ${type} and an empty Length: state a range such as 1..255.`),
        );
      } else if (!LENGTH_FORM.test(length)) {
        findings.push(
          makeFinding(file, row.line, "contract-length-form", `The ${where} has Length "${length}": write a range such as 1..255 or an upper bound such as <=100.`),
        );
      }
    } else if (filled) {
      findings.push(
        makeFinding(file, row.line, "contract-length-forbidden", `The ${where} has type ${type}, so the field has no length: leave Length empty.`),
      );
    }
    if (!arrows.some((a) => a.message === message && a.from === from && a.to === to)) {
      findings.push(
        makeFinding(file, row.line, "contract-row-without-arrow", `The message ${message} is a contract without an arrow from ${from} to ${to} in the diagram.`),
      );
    }
  }
  for (const arrow of arrows) {
    if (!rows.some((r) => r.cells[0] === arrow.message && r.cells[1] === arrow.from && r.cells[2] === arrow.to)) {
      findings.push(
        makeFinding(file, arrow.line, "contract-arrow-without-row", `The message ${arrow.message} from ${arrow.from} to ${arrow.to} is an arrow without a contract row.`),
      );
    }
  }
}

function checkRequirement(file: string, title: string, start: number, body: string[]): Finding[] {
  const offset = body.findIndex((l) => /^\s*Interaction:/.test(l));
  if (offset < 0) return [];
  const at = start + offset;
  const findings: Finding[] = [];
  const open = body.findIndex((l) => /^\s*```\s*sequence\s*$/.test(l));
  const close = open < 0 ? -1 : body.findIndex((l, i) => i > open && /^\s*```\s*$/.test(l));
  if (open < 0 || close < 0) {
    findings.push(makeFinding(file, at, "interaction-diagram-missing", `The interaction requirement "${title}" has no sequence diagram.`));
    return findings;
  }
  const arrows: Arrow[] = [];
  const diagram = body.slice(open + 1, close);
  const named = new Set<string>();
  diagram.forEach((l, idx) => {
    const m = ARROW.exec(l);
    const line = start + open + 1 + idx;
    if (!m) {
      if (ARROW_SHAPE.test(l)) {
        findings.push(makeFinding(file, line, "interaction-arrow-unlabelled", `The line "${l.trim()}" is not an arrow in the form a -> b: message.`));
      }
      return;
    }
    named.add(m[1]);
    named.add(m[2]);
    if (m[3] === undefined) {
      findings.push(makeFinding(file, line, "interaction-arrow-unlabelled", `The arrow ${m[1]} -> ${m[2]} needs a message name in the form a -> b: message.`));
    } else {
      arrows.push({ line, from: m[1], to: m[2], message: m[3] });
    }
  });
  const text = diagram.join("\n");
  for (const name of declaredParticipants(body[offset])) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!named.has(name) && !new RegExp(`(^|[^\\w-])${escaped}($|[^\\w-])`).test(text)) {
      findings.push(makeFinding(file, at, "interaction-participant-missing", `The participant ${name} of "${title}" is absent from the diagram.`));
    }
  }
  let i = close + 1;
  while (i < body.length && body[i].trim() === "") i++;
  const tableLines: Row[] = [];
  for (; i < body.length && body[i].trim().startsWith("|"); i++) {
    tableLines.push({ line: start + i, cells: splitCells(body[i]) });
  }
  if (tableLines.length === 0) {
    findings.push(makeFinding(file, at, "contract-table-missing", `The interaction requirement "${title}" has no contract table after the diagram.`));
    return findings;
  }
  const header = tableLines[0];
  if (header.cells.join("|") !== COLUMNS.join("|")) {
    findings.push(makeFinding(file, header.line, "contract-columns", `The contract table of "${title}" must have the columns ${COLUMNS.join(", ")} in this order.`));
    return findings;
  }
  const data = tableLines.slice(1).filter((r) => !r.cells.every((c) => SEPARATOR_CELL.test(c)));
  checkTable(file, data, arrows, findings);
  return findings;
}

/** Checks the diagram and the contract table of every interaction requirement in a spec text. */
export function checkInteractions(file: string, text: string): Finding[] {
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  let title = "";
  let start = 0;
  let body: string[] = [];
  const flush = (): void => {
    if (title !== "") findings.push(...checkRequirement(file, title, start, body));
  };
  lines.forEach((l, index) => {
    const heading = /^###\s+Requirement:\s*(.*?)\s*$/.exec(l);
    if (heading || /^#{1,3}\s/.test(l)) {
      flush();
      title = heading ? heading[1] : "";
      start = index + 2;
      body = [];
    } else if (title !== "") {
      body.push(l);
    }
  });
  flush();
  return findings;
}
