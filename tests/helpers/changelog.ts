/** One release entry parsed from a `CHANGELOG.md` heading: `## <version> — <date>`. */
export interface ChangelogEntry {
  version: string;
  date: string;
}

const ENTRY_HEADING = /^## (\S+) — (\d{4}-\d{2}-\d{2})$/;

/** Every release heading found in a `CHANGELOG.md` body, in file order (newest first). */
export function parseChangelogEntries(text: string): ChangelogEntry[] {
  return text
    .split("\n")
    .map((line) => ENTRY_HEADING.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ version: match[1]!, date: match[2]! }));
}

/**
 * `null` when the top entry's version matches `pkgVersion`; otherwise a
 * message naming both versions, fit to hand straight to an assertion so the
 * failure reads without decoding a diff.
 */
export function changelogVersionMismatch(
  pkgVersion: string,
  entries: ChangelogEntry[],
): string | null {
  const top = entries[0];
  if (top !== undefined && top.version === pkgVersion) {
    return null;
  }

  const found = top === undefined ? "(в CHANGELOG.md нет ни одной записи)" : top.version;
  return `package.json несёт версию ${pkgVersion}, а верхняя запись CHANGELOG.md — ${found}`;
}

/**
 * `null` when entries run from the newest date to the oldest; otherwise a
 * message naming the pair found out of order.
 */
export function changelogOrderViolation(entries: ChangelogEntry[]): string | null {
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1]!;
    const current = entries[index]!;

    if (current.date > previous.date) {
      return `запись ${current.version} (${current.date}) стоит после ${previous.version} (${previous.date}), хотя она новее`;
    }
  }

  return null;
}
