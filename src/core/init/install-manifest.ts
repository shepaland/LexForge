import path from "node:path";

import { z } from "zod";

import type { InstallScope } from "./tool-registry.js";

/** The name of the file an installation leaves next to the skills directory. */
export const MANIFEST_FILE = "lexforge-install.json";

/** What one installation wrote, and where. */
export interface InstallManifest {
  /** The package version that wrote these files. */
  version: string;
  /** When the installation ran, as an ISO timestamp. */
  installedAt: string;
  /** The agent whose skills directory was written. */
  tool: string;
  /** Whether the files went into the project or into the user home. */
  scope: InstallScope;
  /** Paths of every written file, relative to the skills directory. */
  files: string[];
}

const ManifestSchema = z.object({
  version: z.string(),
  installedAt: z.string(),
  tool: z.string(),
  scope: z.enum(["project", "user"]),
  files: z.array(z.string()),
});

/**
 * The manifest lives in the directory that contains the skills directory, not
 * inside it: a stray file among the skills is read by the runtime as a skill.
 */
export function manifestPath(skillsDir: string): string {
  return path.join(path.dirname(path.normalize(skillsDir).replace(/[\\/]+$/, "")), MANIFEST_FILE);
}

/**
 * One path as the manifest keeps it: relative to the skills directory and
 * written with forward slashes, so a manifest written on Windows is read on
 * macOS and the other way round.
 */
function manifestEntry(file: string): string {
  return file.split(path.win32.sep).join("/");
}

/**
 * The document an installation writes. The order of `files` is the order the
 * installation wrote them, and the document ends with a newline: the file is
 * read by people too.
 */
export function renderManifest(manifest: InstallManifest): string {
  const document = {
    ...manifest,
    files: manifest.files.map(manifestEntry),
  };

  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * The manifest of the previous installation. A document that is not JSON, or
 * that does not carry the fields this version writes, reads as no manifest at
 * all: the file lives in a directory of someone else's making, and cleanup by
 * a shape nobody recognises would delete what it does not understand.
 */
export function readManifest(text: string): InstallManifest | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }

  const result = ManifestSchema.safeParse(parsed);

  return result.success ? result.data : undefined;
}
