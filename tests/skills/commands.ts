import type { Command } from "commander";

import { createCliContext, createProgram } from "../../src/cli/run.js";
import { answerPath } from "../../src/core/answer-path.js";
import { createCapture } from "../helpers/capture.js";
import type { SkillFile } from "../helpers/read-skills.js";
import type { SkillFinding } from "./checks.js";

/** `lexforge` followed by a word: the shape a command takes in the body of a skill. */
const COMMAND_CALL = /(?<![\w-])lexforge[ \t]+([a-z][a-z0-9-]*)/g;

const FENCED_BLOCK = /```[\s\S]*?```/g;

/**
 * The names the CLI answers to, read from the program itself. A list written out
 * in the test would drift away from `src/cli/run.ts` and start lying.
 */
export function knownCommandNames(): string[] {
  const capture = createCapture();
  const program = createProgram(
    createCliContext({ cwd: process.cwd(), stdout: capture.stdout, stderr: capture.stderr }),
  );

  return collectNames(program);
}

function collectNames(command: Command): string[] {
  return command.commands.flatMap((child) => [
    child.name(),
    ...child.aliases(),
    ...collectNames(child),
  ]);
}

/** Fenced blocks are quoted output, so a command inside one is not a call. */
export function namedCommands(body: string): string[] {
  const text = body.replace(FENCED_BLOCK, "");
  const names = [...text.matchAll(COMMAND_CALL)].map((match) => match[1]!);

  return [...new Set(names)];
}

export function checkNamedCommands(
  skill: SkillFile,
  known: string[] = knownCommandNames(),
): SkillFinding[] {
  return namedCommands(skill.body)
    .filter((name) => !known.includes(name))
    .map((name) => ({
      rule: "unknown-command",
      file: answerPath(skill.file),
      message: `${answerPath(skill.file)}: names "lexforge ${name}", and the CLI has no such command; it knows ${known.join(", ")}`,
    }));
}
