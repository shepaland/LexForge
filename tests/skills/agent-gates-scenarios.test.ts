import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SCENARIOS = fileURLToPath(new URL("../scenarios", import.meta.url));

const EXPECTED = "\nthe eight files do not exist\n";

/** The eight pressure scenarios of the agent gates and the data documents, by skill. */
const FILES: Array<[skill: string, name: string]> = [
  ["lexforge", "update-available-install.md"],
  ["lexforge-plan", "skills-outdated-repair.md"],
  ["lexforge-plan", "skills-outdated-twice.md"],
  ["lexforge-spec", "data-marker-omitted.md"],
  ["lexforge-spec", "data-marker-small-column.md"],
  ["lexforge-spec", "data-store-guess.md"],
  ["lexforge-spec", "service-questions-batch.md"],
  ["lexforge-spec", "service-dont-know.md"],
];

const HEADINGS = ["Setting", "Options", "Pressures", "What counts as a violation"];

function read(skill: string, name: string): string {
  const file = path.join(SCENARIOS, skill, name);

  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/** The body of one "## <heading>" section, up to the next "## " heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);

  if (start === -1) {
    return "";
  }
  const body = text.slice(start + heading.length + 5);
  const next = body.indexOf("\n## ");

  return next === -1 ? body : body.slice(0, next);
}

describe("сценарии давления на гейты агента и документы данных", () => {
  it("все восемь файлов есть на месте", () => {
    const missing = FILES.filter(([skill, name]) => !existsSync(path.join(SCENARIOS, skill, name)));

    expect(missing.map(([skill, name]) => `${skill}/${name}`), EXPECTED).toEqual([]);
  });

  describe.each(FILES)("%s/%s", (skill, name) => {
    const text = read(skill, name);

    it("несёт четыре раздела", () => {
      const absent = HEADINGS.filter((heading) => section(text, heading).trim() === "");

      expect(absent).toEqual([]);
    });

    it("в разделе Options ровно варианты от A до D", () => {
      const letters = [...section(text, "Options").matchAll(/^- \*\*([A-Z])\.\*\*/gm)].map(
        (match) => match[1],
      );

      expect(letters).toEqual(["A", "B", "C", "D"]);
    });

    it("раздел нарушений называет нарушением любой вариант кроме A", () => {
      expect(section(text, "What counts as a violation")).toContain(
        "Any option but A is a violation",
      );
    });
  });
});
