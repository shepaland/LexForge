import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { workspacePath } from "../answer-path.js";
import { readTextFile, splitTextLines } from "../read-text.js";

const REQUIREMENT_HEADING = /^###\s+Requirement:\s*(.*?)\s*$/;
const SECTION_HEADING = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/;
const ANY_SECTION = /^##\s/;
const FENCE = /^\s*```/;

export interface SpecMarker {
  file: string;
  line: number;
  requirement: string;
  value: string;
}

function listSpecs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSpecs(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

/**
 * Every marker line (matched by `pattern`, whose first group is the value) that stands inside an
 * ADDED or MODIFIED requirement of the delta specs. Fenced blocks, lines above the first
 * requirement and requirements under REMOVED or RENAMED are skipped.
 */
export function collectMarkers(root: string, specsDir: string, pattern: RegExp): SpecMarker[] {
  const markers: SpecMarker[] = [];
  for (const file of listSpecs(specsDir)) {
    let requirement = "";
    let live = false;
    let inFence = false;
    splitTextLines(readTextFile(file)).forEach((text, index) => {
      if (FENCE.test(text)) inFence = !inFence;
      if (inFence) return;
      if (ANY_SECTION.test(text)) {
        const section = SECTION_HEADING.exec(text);
        live = section !== null && /^(ADDED|MODIFIED)$/.test(section[1]!);
        requirement = "";
        return;
      }
      const heading = REQUIREMENT_HEADING.exec(text);
      if (heading) requirement = heading[1]!;
      if (!live || requirement === "") return;
      const marker = pattern.exec(text);
      if (marker) markers.push({ file: workspacePath(root, file), line: index + 1, requirement, value: marker[1]! });
    });
  }
  return markers;
}
