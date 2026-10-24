import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { Command } from "commander";

import { createCliContext, createProgram } from "../../src/cli/run.js";
import { answerPath } from "../../src/core/answer-path.js";
import { createCapture } from "../helpers/capture.js";
import type { SkillFile } from "../helpers/read-skills.js";
import type { SkillFinding } from "./findings.js";

/**
 * `lexforge` followed by one or two words: a command and, when the text gives one, its
 * subcommand. The gap before the subcommand allows a newline: a markdown paragraph wraps
 * a long call across the line, and the two words still read as one call - `lexforge task\nstart`
 * is `lexforge task start`, not `task` alone with its subcommand dropped on the floor.
 */
const COMMAND_CALL = /(?<![\w-])lexforge[ \t]+([a-z][a-z0-9-]*)(?:[ \t\n]+([a-z][a-z0-9-]*))?/g;

const FENCED_BLOCK = /```[\s\S]*?```/g;

export interface CommandCall {
  command: string;
  /** The word right after `command`, when the text gives one that reads as a name. */
  subcommand?: string;
}

/**
 * The names the CLI answers to, read from the program itself. A list written out
 * in the test would drift away from `src/cli/run.ts` and start lying.
 */
export function knownCommandNames(): string[] {
  return collectNames(inspectedProgram());
}

/**
 * The subcommand names registered under each top-level command, read from the
 * program itself. A command with no group below it (`archive`, `status`, `unlock`,
 * ...) maps to an empty list, so a second word that follows it in a skill reads
 * as an argument, not as a subcommand to check against.
 */
export function knownSubcommands(): Map<string, string[]> {
  const program = inspectedProgram();
  const tree = new Map<string, string[]>();

  for (const child of program.commands) {
    const subcommands = collectNames(child);
    for (const name of [child.name(), ...child.aliases()]) {
      tree.set(name, subcommands);
    }
  }

  return tree;
}

function inspectedProgram(): Command {
  const capture = createCapture();
  return createProgram(
    createCliContext({ cwd: process.cwd(), stdout: capture.stdout, stderr: capture.stderr }),
  );
}

function collectNames(command: Command): string[] {
  return command.commands.flatMap((child) => [
    child.name(),
    ...child.aliases(),
    ...collectNames(child),
  ]);
}

function extractCalls(text: string): CommandCall[] {
  return [...text.matchAll(COMMAND_CALL)].map((match) => ({
    command: match[1]!,
    subcommand: match[2],
  }));
}

/** Fenced blocks are quoted output, so a command inside one is not a call. */
export function namedCommands(body: string): CommandCall[] {
  return extractCalls(body.replace(FENCED_BLOCK, ""));
}

/**
 * The files beside `skillFile`, other than `SKILL.md` itself: prose a skill
 * ships alongside its entry point, such as `parallel.md`, that an agent reads
 * and acts on exactly as it would the skill's own body. A directory that does
 * not exist (a fixture built from an in-memory `SkillFile`) has no companions.
 */
function companionFiles(skillFile: string): { file: string; body: string }[] {
  const dir = path.dirname(skillFile);
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== "SKILL.md" && entry.name.endsWith(".md"))
    .map((entry) => {
      const file = path.join(dir, entry.name);
      return { file, body: readFileSync(file, "utf8") };
    });
}

export function checkNamedCommands(
  skill: SkillFile,
  known: string[] = knownCommandNames(),
  subcommands: Map<string, string[]> = knownSubcommands(),
): SkillFinding[] {
  const findings: SkillFinding[] = [];
  const reportedUnknownCommands = new Set<string>();
  const reportedUnknownPairs = new Set<string>();

  // A skill's own body quotes example output in a fenced block, so that fence is
  // stripped before reading calls (`namedCommands`). A companion beside it - the
  // whole prompt handed to an executor, a reviewer or a plan reviewer, such as
  // `executor-prompt.md` or `plan-reviewer-prompt.md` - is often itself one fence
  // from end to end: that fence is not quoted output, it is the instructions sent
  // to the subagent, and stripping it would hide the very commands the prompt
  // tells the subagent to run. So a companion is scanned whole, unstripped.
  const sources: { file: string; calls: CommandCall[] }[] = [
    { file: skill.file, calls: namedCommands(skill.body) },
    ...companionFiles(skill.file).map((companion) => ({
      file: companion.file,
      calls: extractCalls(companion.body),
    })),
  ];

  for (const source of sources) {
    const file = answerPath(source.file);

    for (const call of source.calls) {
      if (!known.includes(call.command)) {
        const key = `${file}\u0000${call.command}`;
        if (reportedUnknownCommands.has(key)) continue;
        reportedUnknownCommands.add(key);
        findings.push({
          rule: "unknown-command",
          file,
          message: `${file}: names "lexforge ${call.command}", and the CLI has no such command; it knows ${known.join(", ")}`,
        });
        continue;
      }

      const allowed = subcommands.get(call.command) ?? [];
      if (call.subcommand === undefined || allowed.length === 0 || allowed.includes(call.subcommand)) {
        continue;
      }

      const key = `${file}\u0000${call.command}\u0000${call.subcommand}`;
      if (reportedUnknownPairs.has(key)) continue;
      reportedUnknownPairs.add(key);
      findings.push({
        rule: "unknown-command",
        file,
        message: `${file}: names "lexforge ${call.command} ${call.subcommand}", and "${call.command}" has no such subcommand; it knows ${allowed.join(", ")}`,
      });
    }
  }

  return findings;
}
