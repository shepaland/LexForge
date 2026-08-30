import { accessSync, constants, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** What Windows takes for executable when `PATHEXT` says nothing. */
const DEFAULT_PATH_EXT = ".COM;.EXE;.BAT;.CMD";

export interface ResolveOnPathOptions {
  /** The system the search runs for. Defaults to the one this process runs on. */
  platform?: string;
  /** The `PATHEXT` value. Read on Windows only, where it says what may be run. */
  pathExt?: string;
}

/**
 * Looks for the command `name` in the directories of `pathValue`, a
 * `PATH`-shaped, `path.delimiter`-separated list, in order, and returns the
 * first one found. No process is started: the search reads the directories
 * directly, the same thing a shell does before it runs anything.
 *
 * What counts as a command is asked of the system. On Linux and macOS it is
 * the execute bit, so a file without it and a directory of that name both
 * leave the name unresolved. On Windows there is no such bit at all: the
 * extension decides, `PATHEXT` holds the list of them, and the file npm leaves
 * behind is `lexforge.cmd` — a file of the bare name is not there to be found.
 */
export function resolveOnPath(
  name: string,
  pathValue: string,
  options: ResolveOnPathOptions = {},
): string | undefined {
  const windows = (options.platform ?? process.platform) === "win32";
  const extensions = windows
    ? pathExtensions(options.pathExt ?? process.env.PATHEXT ?? "")
    : [];

  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    const found = windows
      ? findByExtension(directory, name, extensions)
      : findExecutable(directory, name);

    if (found) {
      return found;
    }
  }

  return undefined;
}

/** Extensions of `PATHEXT`, or the list Windows falls back to when it is empty. */
function pathExtensions(pathExt: string): string[] {
  const listed = pathExt
    .split(";")
    .map((extension) => extension.trim())
    .filter((extension) => extension !== "");

  return listed.length > 0 ? listed : DEFAULT_PATH_EXT.split(";");
}

/** A file of that exact name the current user may run. */
function findExecutable(directory: string, name: string): string | undefined {
  const candidate = path.join(directory, name);
  if (!statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
    return undefined;
  }

  try {
    accessSync(candidate, constants.X_OK);
  } catch {
    return undefined;
  }

  return candidate;
}

/**
 * The Windows search: the first extension of `PATHEXT` whose file lies in the
 * directory. Each name is asked for directly rather than by reading the whole
 * directory — this runs over every entry of `PATH`, and some of them hold
 * thousands of files. The directory is read once, on a hit, and only to learn
 * the case the name is written in: Windows answers to any case, and the path
 * in the answer has to be the path that really exists.
 */
function findByExtension(
  directory: string,
  name: string,
  extensions: string[],
): string | undefined {
  for (const extension of extensions) {
    for (const written of [extension, extension.toLowerCase()]) {
      const candidate = path.join(directory, name + written);
      if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
        return path.join(directory, writtenName(directory, name + written));
      }
    }
  }

  return undefined;
}

/** The entry of the directory that matches the name, in the case it is stored in. */
function writtenName(directory: string, name: string): string {
  try {
    return readdirSync(directory).find((entry) => entry.toLowerCase() === name.toLowerCase()) ?? name;
  } catch {
    return name;
  }
}
