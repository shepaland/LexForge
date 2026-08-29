/**
 * Where each agent keeps its skills, relative to the project root. Adding an
 * agent is adding a row; `agents` is the shared directory several runtimes read.
 */
export const TOOL_DIRECTORIES: Record<string, string> = {
  claude: ".claude/skills",
  codex: ".codex/skills",
  agents: ".agents/skills",
};

/** Supported tool names, in alphabetical order, for messages and for help text. */
export function knownTools(): string[] {
  return Object.keys(TOOL_DIRECTORIES).sort();
}
