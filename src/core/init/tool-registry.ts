import os from "node:os";
import path from "node:path";

/** Where an installation writes: into the project, or into the user home. */
export type InstallScope = "project" | "user";

/** The two skill directories of one agent, and the vendor behind it. */
export interface ToolDirectories {
  /** Relative to the project root. */
  project: string;
  /** Starts with `~/`; the home directory is filled in by `toolDirectory`. */
  user: string;
  /**
   * The provider whose models this runtime runs on, empty for a runtime that
   * fronts several of them. `init` writes a model entry only for a runtime that
   * names one: for the rest the choice belongs to the person, not the installer.
   */
  vendor: string;
}

/**
 * Where each agent keeps its skills. Adding an agent is adding a row here, and
 * this table is the only place these paths are written down.
 *
 * The user path is a column of its own because it does not follow from the
 * project one: OpenCode reads `.opencode/skills` in a project and
 * `~/.config/opencode/skills` for a person.
 *
 * Sources, read on macOS in August 2026:
 *   agents   - `~/.agents/skills`, the cross-runtime alias several agents read;
 *   claude   - `~/.claude/skills`, the personal skill directory of Claude Code;
 *   codex    - `~/.codex/skills`, the directory Codex reads;
 *   cursor   - `~/.cursor/skills` and `.cursor/skills`, from the built-in
 *              skills documentation of Cursor;
 *   opencode - `~/.config/opencode/skills` and `.opencode/skills`, from the
 *              OpenCode part of the superpowers documentation.
 *
 * These directories move with the releases of their runtimes. A path that went
 * stale is fixed in its row, and nowhere else.
 */
export const TOOL_DIRECTORIES: Record<string, ToolDirectories> = {
  agents: { project: ".agents/skills", user: "~/.agents/skills", vendor: "" },
  claude: { project: ".claude/skills", user: "~/.claude/skills", vendor: "anthropic" },
  codex: { project: ".codex/skills", user: "~/.codex/skills", vendor: "openai" },
  cursor: { project: ".cursor/skills", user: "~/.cursor/skills", vendor: "" },
  opencode: {
    project: ".opencode/skills",
    user: "~/.config/opencode/skills",
    vendor: "",
  },
};

/**
 * The provider one runtime runs on, empty for a runtime that fronts several and
 * for a name the registry does not hold. `Object.hasOwn`, not a plain lookup: a
 * name off the object prototype is no runtime.
 */
export function toolVendor(tool: string): string {
  return Object.hasOwn(TOOL_DIRECTORIES, tool) ? TOOL_DIRECTORIES[tool]!.vendor : "";
}

/** Supported tool names, in alphabetical order, for messages and for help text. */
export function knownTools(): string[] {
  return Object.keys(TOOL_DIRECTORIES).sort();
}

/**
 * The skill directory of one agent. The project path stays relative to the
 * project root; the user path comes back absolute, under the home directory
 * given here. An unknown name gives an empty path, and the caller turns that
 * into a refused call.
 */
export function toolDirectory(tool: string, scope: InstallScope, home = os.homedir()): string {
  const directories = TOOL_DIRECTORIES[tool];
  if (!directories) {
    return "";
  }

  if (scope === "project") {
    return path.normalize(directories.project);
  }

  return path.join(home, directories.user.slice("~/".length));
}
