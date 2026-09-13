/** A section heading: `## <number>. <name>`. Mirrors the gate's own regex. */
const SECTION_HEADING = /^##\s+(\d+)\.\s*(.*)$/;

/** Path, one segment below `tasks.md`, a converted section's own file gets. */
export function sectionFilePath(number: string): string {
  return `tasks/section-${number}.md`;
}

/**
 * Splits a plan written the old way — every section's heading, `Depends
 * on:` line and tasks together in one string — into the index form
 * `section-tasks-inline` now requires: an index carrying each heading and a
 * lone link to a file of its own, and that file carrying everything the
 * heading used to carry directly. The heading is repeated at the top of its
 * own file, so line numbers inside it start counting from where the heading
 * itself stands, the way a linked file's do in this repository's own plans.
 *
 * Content before the first heading (a leading blank line, in one fixture)
 * stays in the index unchanged, so a heading that already sat on a line
 * other than 1 keeps sitting there.
 */
export function splitPlanIntoIndex(flat: string): {
  index: string;
  sections: Record<string, string>;
} {
  const lines = flat.split("\n");
  const headingLines: number[] = [];
  lines.forEach((line, i) => {
    if (SECTION_HEADING.test(line)) headingLines.push(i);
  });

  const indexLines = lines.slice(0, headingLines[0] ?? lines.length);
  const sections: Record<string, string> = {};

  headingLines.forEach((start, index) => {
    const end = headingLines[index + 1] ?? lines.length;
    const sectionLines = lines.slice(start, end);
    const number = SECTION_HEADING.exec(sectionLines[0]!)![1]!;
    const target = sectionFilePath(number);

    sections[target] = sectionLines.join("\n");
    indexLines.push(sectionLines[0]!, "", `\`${target}\``, "");
  });

  return { index: indexLines.join("\n"), sections };
}

/** Section files, keyed under `prefix`, ready to spread into `makeWorkspace`. */
export function namedSectionFiles(
  prefix: string,
  sections: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sections).map(([target, content]) => [`${prefix}/${target}`, content]),
  );
}
