import path from "node:path";

export interface WorkspacePaths {
  /** The project root: the directory that holds `lexforge/`. */
  root: string;
  lexforge: string;
  config: string;
  specs: string;
  changes: string;
  archive: string;
  changeDir(name: string): string;
  changeConfig(name: string): string;
}

export const WORKSPACE_DIR = "lexforge";
export const CONFIG_FILE = "config.yaml";
export const CHANGE_CONFIG_FILE = ".lexforge.yaml";

export function workspacePaths(root: string): WorkspacePaths {
  const resolved = path.resolve(root);
  const lexforge = path.join(resolved, WORKSPACE_DIR);
  const changes = path.join(lexforge, "changes");

  return {
    root: resolved,
    lexforge,
    config: path.join(lexforge, CONFIG_FILE),
    specs: path.join(lexforge, "specs"),
    changes,
    archive: path.join(changes, "archive"),
    changeDir: (name: string) => path.join(changes, name),
    changeConfig: (name: string) => path.join(changes, name, CHANGE_CONFIG_FILE),
  };
}
