import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Lays out a throwaway project directory. A key ending with `/` makes an empty
 * directory, any other key makes a file with the given content.
 */
export function makeWorkspace(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "lexforge-test-"));

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);

    if (relative.endsWith("/")) {
      mkdirSync(target, { recursive: true });
      continue;
    }

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  return root;
}

export function removeWorkspace(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
