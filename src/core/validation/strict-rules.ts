import type { ArtifactStatus } from "../artifact-graph/graph.js";
import { CHANGE_CONFIG_FILE } from "../workspace/paths.js";
import { makeFinding, type Finding } from "./finding.js";

/**
 * A Purpose shorter than this says nothing about the capability: the reader
 * still has to open the requirements to learn what the file is about.
 */
export const MIN_PURPOSE_LENGTH = 50;

const PURPOSE_HEADING = /^##\s+Purpose\s*$/;
const TOP_HEADING = /^##\s+\S/;

const FENCE = /^\s*```/;
const COMMENT_START = "<!--";
const INLINE_CODE = /`([^`]*)`/g;
const PLACEHOLDER = /<[^<>\n]+>/;
const LONE_PLACEHOLDER = /^<[^<>\n]+>$/;

/**
 * Every delta spec carries a Purpose of at least fifty characters. The text is
 * everything between the heading and the next top-level heading.
 */
export function checkPurpose(file: string, content: string): Finding[] {
  const lines = content.split("\n");
  const heading = lines.findIndex((line) => PURPOSE_HEADING.test(line));

  if (heading === -1) {
    return [
      makeFinding(
        file,
        1,
        "purpose-too-short",
        'This delta spec has no "## Purpose" section. Add one and say what the ' +
          `capability is for in ${MIN_PURPOSE_LENGTH} characters or more.`,
      ),
    ];
  }

  const body: string[] = [];
  for (let index = heading + 1; index < lines.length; index += 1) {
    if (TOP_HEADING.test(lines[index]!)) {
      break;
    }
    body.push(lines[index]!);
  }

  const length = body.join("\n").trim().length;
  if (length >= MIN_PURPOSE_LENGTH) {
    return [];
  }

  return [
    makeFinding(
      file,
      heading + 1,
      "purpose-too-short",
      `The Purpose section is ${length} characters long. Say what the capability ` +
        `is for in ${MIN_PURPOSE_LENGTH} characters or more.`,
    ),
  ];
}

/**
 * A handed-in artifact keeps nothing of its template: no `<!-- ... -->`
 * comments and no angle placeholders. Code blocks and commands written in
 * backticks are left alone, so `lexforge new change <name>` stays as it is.
 */
export function checkTemplatePlaceholders(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const text = stripInlineCode(line);

    if (text.includes(COMMENT_START)) {
      findings.push(
        makeFinding(
          file,
          index + 1,
          "template-placeholder-left",
          "A comment from the template is still here. Write the section and delete " +
            "the comment.",
        ),
      );
      continue;
    }

    const placeholder = PLACEHOLDER.exec(text);
    if (placeholder && !placeholder[0].includes("://")) {
      findings.push(
        makeFinding(
          file,
          index + 1,
          "template-placeholder-left",
          `A placeholder from the template is still here: ${placeholder[0]}. ` +
            "Replace it with the real text.",
        ),
      );
    }
  }

  return findings;
}

export interface ArtifactCheck {
  id: string;
  status: ArtifactStatus;
  /** Where the artifact writes its result, in the form the reader is shown. */
  file: string;
}

/**
 * Every artifact the schema asks for is written or declared skipped. Anything
 * else means the change is handed in half-planned.
 */
export function checkArtifactsDone(change: string, artifacts: ArtifactCheck[]): Finding[] {
  return artifacts
    .filter((artifact) => artifact.status !== "done" && artifact.status !== "skipped")
    .map((artifact) =>
      makeFinding(
        artifact.file,
        1,
        "artifact-not-done",
        `Artifact "${artifact.id}" is not written. Write it with ` +
          `lexforge instructions ${artifact.id} --change ${change}, or declare it ` +
          `skipped with skip_${artifact.id}: true in ${CHANGE_CONFIG_FILE}.`,
      ),
    );
}

/**
 * Drops what stands in backticks, because a command is not a placeholder. A
 * span holding nothing but an angle placeholder stays: `<capability-path>` in
 * backticks is still a placeholder.
 */
function stripInlineCode(line: string): string {
  return line.replace(INLINE_CODE, (_, inner: string) =>
    LONE_PLACEHOLDER.test(inner.trim()) ? inner : " ",
  );
}
