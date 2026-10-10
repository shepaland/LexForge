import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMap, parseDocument } from "yaml";

import { UsageError } from "../../cli/errors.js";
import { answerPath } from "../answer-path.js";
import { readTextFile } from "../read-text.js";
import { workspacePaths } from "../workspace/paths.js";

/** Directories the walk never enters, at any depth. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "build", ".git"]);

/** The workspace directory is skipped at the project root only. */
const WORKSPACE_DIRECTORY = "lexforge";

/**
 * Every CSS file of the project outside node_modules, dist, build, .git and
 * lexforge/, as sorted paths relative to `root` with `/` separators.
 */
export function findStyles(root: string): string[] {
  const found: string[] = [];

  const walk = (directory: string, top: boolean): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name) || (top && entry.name === WORKSPACE_DIRECTORY)) {
          continue;
        }
        walk(path.join(directory, entry.name), false);
      } else if (entry.isFile() && entry.name.endsWith(".css")) {
        found.push(answerPath(path.relative(root, path.join(directory, entry.name))));
      }
    }
  };

  walk(root, true);
  return found.sort();
}

/**
 * Writes `paths` under `ui.styles` of the project config, replacing the list.
 * A path that is not an existing CSS file refuses the whole call before the
 * config is touched. The config is edited as a YAML document, so its other
 * keys and comments stay.
 */
export function setStyles(root: string, paths: string[]): string[] {
  for (const given of paths) {
    const absolute = path.resolve(root, given);
    const relative = path.relative(root, absolute);
    const outside = path.isAbsolute(given) || relative.startsWith("..") || path.isAbsolute(relative);
    if (outside || !given.endsWith(".css") || !existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new UsageError(
        "styles-path-invalid",
        `${given} is not an existing CSS file.`,
        "lexforge styles find",
        absolute,
      );
    }
  }

  const configPath = workspacePaths(root).config;
  const document = parseDocument(readTextFile(configPath));
  if (!isMap(document.get("ui"))) document.set("ui", document.createNode({}));
  document.setIn(["ui", "styles"], paths);
  writeFileSync(configPath, document.toString(), "utf8");
  return paths;
}
