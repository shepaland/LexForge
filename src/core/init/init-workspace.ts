import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CommandResult } from "../types.js";
import { workspacePaths } from "../workspace/paths.js";
import { projectConfigText } from "./config-template.js";
import { planSkillInstall } from "./plan-install.js";

export interface InitOptions {
  /** The project root the workspace is created in. */
  cwd: string;
  /** Written to `config.yaml` as is. An empty value leaves the choice open. */
  language?: string;
  /** Agents to install the skills for. An unknown name writes nothing at all. */
  tools?: string[];
  skillsDir?: string;
}

export interface InitData {
  outputVersion: 1;
  workspaceRoot: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  nextStep: string;
}

const NEXT_STEP = "lexforge new change <name>";

export function initWorkspace(options: InitOptions): CommandResult<InitData> {
  const paths = workspacePaths(options.cwd);
  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  // First pass: work the whole installation out. An unknown tool name throws
  // here, before the first directory is made, so nothing is written by halves.
  const skills = planSkillInstall({
    root: paths.root,
    tools: options.tools ?? [],
    skillsDir: options.skillsDir,
  });

  mkdirSync(paths.lexforge, { recursive: true });

  // A second run must not touch a config the project already edited.
  if (existsSync(paths.config)) {
    unchanged.push(paths.config);
  } else {
    writeFileSync(paths.config, projectConfigText(options.language), "utf8");
    created.push(paths.config);
  }

  for (const dir of [paths.specs, paths.archive]) {
    if (existsSync(dir)) {
      unchanged.push(dir);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    created.push(dir);
  }

  // Second pass: write the plan that is already complete.
  for (const skill of skills) {
    if (skill.state === "unchanged") {
      unchanged.push(skill.path);
      continue;
    }
    mkdirSync(path.dirname(skill.path), { recursive: true });
    writeFileSync(skill.path, skill.content, "utf8");
    (skill.state === "updated" ? updated : created).push(skill.path);
  }

  const data: InitData = {
    outputVersion: 1,
    workspaceRoot: paths.root,
    created,
    updated,
    unchanged,
    nextStep: NEXT_STEP,
  };

  return { data, lines: renderGroups(data), nextStep: NEXT_STEP, exitCode: 0 };
}

function renderGroups(data: InitData): string[] {
  const groups: Array<[string, string[]]> = [
    ["Created:", data.created],
    ["Updated:", data.updated],
    ["Left as is:", data.unchanged],
  ];

  const lines: string[] = [];
  for (const [title, paths] of groups) {
    if (paths.length === 0) {
      continue;
    }
    lines.push(title, ...paths.map((entry) => `  ${entry}`));
  }

  return lines;
}
