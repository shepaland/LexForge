import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { answerPath } from "../answer-path.js";
import { tryGit } from "../git/repository.js";
import { packageVersion } from "../package-info.js";
import type { CommandResult } from "../types.js";
import { workspacePaths } from "../workspace/paths.js";
import { projectConfigText } from "./config-template.js";
import { detectTools } from "./detect-tools.js";
import { renderManifest } from "./install-manifest.js";
import { planSkillInstall } from "./plan-install.js";
import type { InstallScope } from "./tool-registry.js";
import { knownTools } from "./tool-registry.js";

export interface InitOptions {
  /** The project root the workspace is created in. */
  cwd: string;
  /** Written to `config.yaml` as is. An empty value leaves the choice open. */
  language?: string;
  /** Agents to install the skills for. An unknown name writes nothing at all. */
  tools?: string[];
  /** Into the project by default; `user` writes under the home directory. */
  scope?: InstallScope;
  /** The home directory the user scope writes under. */
  home?: string;
  skillsDir?: string;
}

export interface InitData {
  outputVersion: 1;
  workspaceRoot: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  /** Files of a previous version this run deleted, by its manifest and nothing else. */
  removed: string[];
  /** Skill directories nothing accounts for: they stay, and a person decides. */
  unmanaged: string[];
  /** What this project still lacks. Initialization reports it and fixes nothing. */
  notes: string[];
  nextStep: string;
}

const NEXT_STEP = "lexforge doctor";

/**
 * The gates that read the repository: an evidence record is tied to a commit
 * and to the state of the working tree, and a project without a repository has
 * neither. Initialization says so and creates nothing: whether this directory
 * becomes a repository is not its decision.
 */
const GIT_NOTE =
  "This directory is not a git repository. " +
  "The gates evidence record, check evidence, verify and archive need one.";

/**
 * A run that installed nothing has one thing left to do: install the skills.
 * The names come from the directories already on this machine, and the choice
 * stays with the person — a directory found is not a directory written to.
 */
function installStep(root: string, home: string): string {
  const found = detectTools({ root, home });
  if (found.length > 0) {
    return `lexforge init --tools ${found.join(",")}`;
  }

  return `lexforge init --tools <one of: ${knownTools().join(", ")}>`;
}

export function initWorkspace(options: InitOptions): CommandResult<InitData> {
  const paths = workspacePaths(options.cwd);
  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];

  // First pass: work the whole installation out. An unknown tool name throws
  // here, before the first directory is made, so nothing is written by halves.
  const plan = planSkillInstall({
    root: paths.root,
    tools: options.tools ?? [],
    scope: options.scope,
    home: options.home,
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
  for (const skill of plan.files) {
    if (skill.state === "unchanged") {
      unchanged.push(skill.path);
      continue;
    }
    mkdirSync(path.dirname(skill.path), { recursive: true });
    writeFileSync(skill.path, skill.content, "utf8");
    (skill.state === "updated" ? updated : created).push(skill.path);
  }

  // Files the previous version left and this one does not carry. The list comes
  // from its manifest: what no manifest names is never deleted.
  for (const file of plan.removed) {
    rmSync(file, { force: true });
  }
  for (const directory of plan.emptied) {
    rmSync(directory, { recursive: true, force: true });
  }

  // The record of what this installation wrote. The next one deletes by this
  // list and by nothing else.
  const installedAt = new Date().toISOString();
  for (const manifest of plan.manifests) {
    const state = existsSync(manifest.path) ? "updated" : "created";
    mkdirSync(path.dirname(manifest.path), { recursive: true });
    writeFileSync(
      manifest.path,
      renderManifest({
        version: packageVersion(),
        installedAt,
        tool: manifest.tool,
        scope: manifest.scope,
        files: manifest.files,
      }),
      "utf8",
    );
    (state === "updated" ? updated : created).push(manifest.path);
  }

  const notes = tryGit(paths.root, ["rev-parse", "--show-toplevel"]).ok ? [] : [GIT_NOTE];

  const nextStep =
    plan.files.length > 0
      ? NEXT_STEP
      : installStep(paths.root, options.home ?? paths.root);

  const data: InitData = {
    outputVersion: 1,
    workspaceRoot: answerPath(paths.root),
    created: created.map((file) => answerPath(file)),
    updated: updated.map((file) => answerPath(file)),
    unchanged: unchanged.map((file) => answerPath(file)),
    removed: plan.removed.map((file) => answerPath(file)),
    unmanaged: plan.unmanaged.map((file) => answerPath(file)),
    notes,
    nextStep,
  };

  return { data, lines: renderGroups(data), nextStep, exitCode: 0 };
}

function renderGroups(data: InitData): string[] {
  const groups: Array<[string, string[]]> = [
    ["Created:", data.created],
    ["Updated:", data.updated],
    ["Left as is:", data.unchanged],
    ["Removed:", data.removed],
    ["Left for you to sort out:", data.unmanaged],
  ];

  const lines: string[] = [];
  for (const [title, paths] of groups) {
    if (paths.length === 0) {
      continue;
    }
    lines.push(title, ...paths.map((entry) => `  ${entry}`));
  }

  return [...lines, ...data.notes];
}
