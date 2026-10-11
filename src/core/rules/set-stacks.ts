import { writeFileSync } from "node:fs";
import { isMap, parseDocument } from "yaml";

import { readTextFile } from "../read-text.js";
import type { CommandResult } from "../types.js";
import { workspacePaths } from "../workspace/paths.js";
import { KNOWN_STACKS } from "./stacks.js";

export interface SetStacksData {
  outputVersion: 1;
  stacks: string[];
  nextStep: string;
}

/**
 * Writes `stacks` under `engineering.stacks` of the project config, replacing
 * the list. Every name is checked against the shipped stacks before the config
 * is touched; the file is edited as a YAML document, so its other keys and
 * comments stay.
 */
export function setStacks(root: string, stacks: string[]): CommandResult<SetStacksData> {
  const known = KNOWN_STACKS.map((stack) => stack.name);
  const unknown = stacks.filter((name) => !known.includes(name));

  if (unknown.length > 0) {
    const nextStep = `Pick from the known stacks: ${known.join(", ")}.`;
    const line = `Unknown stack: ${unknown.join(", ")}. The known stacks are ${known.join(", ")}.`;
    return {
      data: { outputVersion: 1, stacks: [], nextStep },
      lines: [line],
      nextStep,
      exitCode: 1,
    };
  }

  const configPath = workspacePaths(root).config;
  const document = parseDocument(readTextFile(configPath));
  if (!isMap(document.get("engineering"))) document.set("engineering", document.createNode({}));
  document.setIn(["engineering", "stacks"], stacks);
  writeFileSync(configPath, document.toString(), "utf8");

  const nextStep = "lexforge new change <name>";
  return {
    data: { outputVersion: 1, stacks, nextStep },
    lines: [stacks.length > 0 ? `engineering.stacks holds ${stacks.join(", ")}.` : "engineering.stacks is empty."],
    nextStep,
    exitCode: 0,
  };
}
