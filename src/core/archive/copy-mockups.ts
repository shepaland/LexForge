import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Copies every file under a `mockups/` directory that sits next to a `spec.md`
 * in the change's `specs/` tree to the same capability path under
 * `lexforge/specs/`, replacing a file of the same name. Capabilities may be
 * nested (`platform/web`). Returns the written paths, relative to the root
 * with forward slashes.
 */
export function copyMockups(root: string, change: string): string[] {
  const source = path.join(root, "lexforge", "changes", change, "specs");
  if (!existsSync(source)) return [];

  const written: string[] = [];
  for (const capability of capabilityDirs(source)) {
    const from = path.join(source, capability, "mockups");
    if (!existsSync(from)) continue;

    for (const file of listFiles(from)) {
      const relative = path.relative(from, file).split(path.sep).join("/");
      const target = path.join(root, "lexforge", "specs", capability, "mockups", relative);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(file, target);
      written.push(path.relative(root, target).split(path.sep).join("/"));
    }
  }

  return written;
}

/** Relative paths of directories under `base` that hold a spec.md. */
function capabilityDirs(base: string, relative = ""): string[] {
  const directory = path.join(base, relative);
  const found: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true });
  if (relative && entries.some((entry) => entry.isFile() && entry.name === "spec.md"))
    found.push(relative);
  for (const entry of entries.filter((e) => e.isDirectory() && e.name !== "mockups").sort((a, b) => a.name.localeCompare(b.name)))
    found.push(...capabilityDirs(base, relative ? `${relative}/${entry.name}` : entry.name));
  return found;
}

function listFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}
