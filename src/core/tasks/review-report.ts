import { UsageError } from "../../cli/errors.js";
import { normalizeLineEndings } from "../read-text.js";
import type { Control } from "../gates/task-fields.js";
import type { Finding } from "./records.js";

export interface ReviewReport {
  reviewer: string;
  verdict: "approved" | "changes-requested";
  controls: Control[];
  findings: Finding[];
}

const CODE = "review-report-unreadable";
const CONTROLS: readonly Control[] = ["authorization", "cryptography", "tenant-isolation", "migrations"];
const LEVELS: readonly Finding["level"][] = ["critical", "important", "minor"];
const FORMAT =
  "A report holds the lines `Reviewer: <name>`, `Verdict: approved|changes-requested`, " +
  "`Controls: none|<control>, ...` and `Findings:` followed by `- critical|important|minor: <text>` lines.";

function unreadable(file: string, reason: string): UsageError {
  return new UsageError(
    CODE,
    `${file} cannot be read as a review report: ${reason}. ${FORMAT}`,
    "rewrite the report in that format, then run the command again",
    file,
  );
}

/**
 * Reads a review report written as plain text. A finding takes its id from its
 * place in the list: F1, F2, and so on.
 */
export function parseReviewReport(text: string, file: string): ReviewReport {
  let reviewer: string | null = null;
  let verdict: string | null = null;
  let controls: Control[] = [];
  const findings: Finding[] = [];
  let inFindings = false;

  for (const raw of normalizeLineEndings(text).split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const head = /^(Reviewer|Verdict|Controls|Findings):\s*(.*)$/.exec(line);

    if (head) {
      const [, key, value] = head as unknown as [string, string, string];
      inFindings = key === "Findings";
      if (key === "Reviewer") reviewer = value;
      else if (key === "Verdict") verdict = value;
      else if (key === "Controls") controls = readControls(value, file);
      else if (value !== "" && value.toLowerCase() !== "none") throw unreadable(file, `"${line}" is not a finding`);
      continue;
    }

    if (!inFindings || !line.startsWith("-")) continue;
    const body = line.replace(/^-\s*/, "");
    if (body.toLowerCase() === "none") continue;
    const finding = /^(critical|important|minor):\s*(\S.*)$/.exec(body);
    if (!finding) throw unreadable(file, `"${line}" is not a finding, and its level is not one of ${LEVELS.join(", ")}`);
    findings.push({ id: `F${findings.length + 1}`, level: finding[1] as Finding["level"], message: finding[2]! });
  }

  if (!reviewer) throw unreadable(file, "it has no `Reviewer:` line");
  if (verdict === null) throw unreadable(file, "it has no `Verdict:` line");
  if (verdict !== "approved" && verdict !== "changes-requested") {
    throw unreadable(file, `its \`Verdict:\` is "${verdict}", not approved or changes-requested`);
  }

  return { reviewer, verdict, controls, findings };
}

function readControls(value: string, file: string): Control[] {
  if (value === "" || value.toLowerCase() === "none") return [];
  return value.split(",").map((part) => {
    const name = part.trim();
    if (!(CONTROLS as readonly string[]).includes(name)) {
      throw unreadable(file, `the control "${name}" is not one of ${CONTROLS.join(", ")}`);
    }
    return name as Control;
  });
}
