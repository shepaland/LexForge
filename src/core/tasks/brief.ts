import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PlanTask } from "../gates/task-list.js";
import { loadCatalog } from "../rules/catalog.js";
import { selectRules } from "../rules/select.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { saveText } from "./files.js";
import { readGit } from "../git/repository.js";
import { changeDir, taskArtifactPath } from "./paths.js";
import type { TaskRecord } from "./records.js";

/** The lines of the task as the plan writes them, from its checkbox to its last field. */
function taskLines(task: PlanTask): string {
  const lines = readFileSync(task.file, "utf8").split(/\r?\n/);
  const own = [lines[task.line - 1]!];
  for (let i = task.line; i < lines.length && /^\s+\S/.test(lines[i]!) && !/^\s*-\s*\[/.test(lines[i]!); i += 1) {
    own.push(lines[i]!);
  }
  return own.join("\n");
}

/** A markdown block from its heading to the next heading of the same or a higher level. */
function block(text: string, heading: RegExp, level: number): string | null {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => heading.test(line));
  if (at < 0) return null;
  const stop = new RegExp(`^#{1,${level}} `);
  let end = at + 1;
  while (end < lines.length && !stop.test(lines[end]!)) end += 1;
  return lines.slice(at, end).join("\n").trimEnd();
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requirements(root: string, change: string, task: PlanTask): string {
  const blocks = task.links.map(({ capability, requirement }) => {
    const file = path.join(root, changeDir(change), "specs", capability, "spec.md");
    const found = existsSync(file)
      ? block(readFileSync(file, "utf8"), new RegExp(`^### Requirement:\\s*${escape(requirement)}\\s*$`), 3)
      : null;
    return found ?? `${capability}#${requirement}: no such requirement in the delta specs of this change.`;
  });
  return blocks.length > 0 ? blocks.join("\n\n") : "The task names no requirement.";
}

function decisions(root: string, change: string): string {
  const file = path.join(root, changeDir(change), "design.md");
  const found = existsSync(file) ? block(readFileSync(file, "utf8"), /^## Decisions\s*$/, 2) : null;
  return found === null ? "The design of this change records no decisions." : found.replace(/^## Decisions\s*\n?/, "").trim();
}

function rules(root: string, task: PlanTask, reviewer = false): string {
  const project = readProjectConfig(root);
  const picked = selectRules(loadCatalog({ root, ...project.engineering }), [...task.files, ...task.tests]).filter(
    (rule) => reviewer || rule.audience === "both",
  );
  return picked.length > 0
    ? picked.map((rule) => `- ${rule.id}: ${rule.rule} (${rule.sign})`).join("\n")
    : "No engineering rule applies to the files of this task.";
}

function howToWork(root: string, change: string, id: string, worktree: string): string {
  const report = path.join(changeDir(change), "tasks", id, "report.md");
  return [
    `Work only in ${worktree}. Commit the test alone, then run \`lexforge task red --change ${change} --task ${id}\` from ${root}.`,
    `Then commit the implementation, write what you did and what you doubt to ${report}, and run \`lexforge task green --change ${change} --task ${id}\`.`,
    `Touch only the files in Files and Test. Do not tick checkboxes, do not edit anything under lexforge/changes/ except ${report},`,
    "do not start subagents. If the task needs a file it does not declare, stop and say so.",
  ].join("\n");
}

/** Writes `brief.md` for the executor and returns its path. */
export function writeBrief(root: string, change: string, task: PlanTask, worktree: string): string {
  const file = taskArtifactPath(root, change, task.number, "brief.md");
  const text = [
    `# Task ${task.number} of change ${change}`,
    "## Task",
    taskLines(task),
    "## Requirements",
    requirements(root, change, task),
    "## Decisions",
    decisions(root, change),
    "## Engineering rules",
    rules(root, task),
    "## How to work",
    howToWork(root, change, task.number, worktree),
  ].join("\n\n");
  saveText(file, `${text}\n`);
  return file;
}

function fenced(text: string): string {
  const fence = text.includes("```") ? "~~~~" : "```";
  return `${fence}diff\n${text}\n${fence}`;
}

function reportFormat(task: PlanTask): string {
  const controls = task.controls.length > 0 ? task.controls.join(", ") : "none";
  return [
    "Write the report as plain text with these lines:",
    "",
    "```",
    "Reviewer: <your id, not the executor's>",
    "Verdict: approved|changes-requested",
    `Controls: ${task.controls.length > 0 ? "<the controls you checked, of: " + controls + ">" : "none"}`,
    "Findings:",
    "- critical|important|minor: <file:line and what is wrong>",
    "```",
    "",
    `Controls this task names: ${controls}. Approve only what you checked yourself.`,
  ].join("\n");
}

/**
 * Writes `review.md` for the reviewer of a task: where the brief is, the
 * executor's own report, the diff from the base to the green commit and, when
 * an earlier review saw another green commit, the diff since that commit.
 */
export function writeReviewPackage(root: string, change: string, task: PlanTask, record: TaskRecord): string {
  const green = record.green!.commit;
  const reportFile = taskArtifactPath(root, change, record.id, "report.md");
  const seen = record.reviews.at(-1)?.green;
  const parts = [
    `# Review of task ${record.id} of change ${change}`,
    "## Brief",
    `${changeDir(change)}/tasks/${record.id}/brief.md`,
    `Executor: ${record.executor}. Worktree: ${record.worktree}. Base ${record.base}, green ${green}.`,
    "## Executor report",
    readFileSync(reportFile, "utf8").trim(),
    "## Diff from the base to green",
    fenced(readGit(record.worktree, ["diff", record.base, green])),
  ];
  if (seen !== undefined && seen !== green) {
    parts.push("## Since the last review", fenced(readGit(record.worktree, ["diff", seen, green])));
  }
  parts.push("## Engineering rules", rules(root, task, true), "## Report", reportFormat(task));
  const file = taskArtifactPath(root, change, record.id, "review.md");
  saveText(file, `${parts.join("\n\n")}\n`);
  return file;
}
