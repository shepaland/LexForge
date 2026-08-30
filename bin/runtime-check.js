// The two checks the entry point runs before it loads anything else. They stay
// plain JavaScript and import nothing outside Node: both of them answer the
// question "can this file import the build at all", so neither may depend on
// the build or on a package from node_modules.
import { existsSync } from "node:fs";

/** Reads the three numbers of a version. A part that is not a number reads as zero. */
function parts(version) {
  const numbers = String(version).split(".");

  return [0, 1, 2].map((index) => {
    const value = Number.parseInt(numbers[index] ?? "", 10);
    return Number.isNaN(value) ? 0 : value;
  });
}

/** Compares two versions number by number: -1 if left is older, 1 if newer, 0 if equal. */
function compare(left, right) {
  const a = parts(left);
  const b = parts(right);

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] < b[index] ? -1 : 1;
    }
  }

  return 0;
}

/**
 * The line to print when the runtime is older than the package asks for.
 * Returns nothing when the runtime is new enough.
 */
export function nodeVersionFinding(current, required) {
  const minimum = String(required).replace(/^[^0-9]*/, "");

  if (compare(current, minimum) >= 0) {
    return undefined;
  }

  return `lexforge needs Node ${minimum} or newer, this is Node ${current}. Install a newer Node and run the command again.`;
}

/**
 * The line to print when the built code the entry point imports is not there.
 * Returns nothing when the build is in place.
 */
export function missingBuildFinding(entry) {
  if (existsSync(entry)) {
    return undefined;
  }

  return `lexforge is not built: ${entry} is missing. Run "npm run build" in the package directory, then run the command again.`;
}
