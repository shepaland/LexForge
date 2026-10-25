import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const TEMPLATES = [
  fileURLToPath(new URL("../../schemas/spec-driven/templates/tasks.md", import.meta.url)),
  fileURLToPath(new URL("../../schemas/bounded/templates/tasks.md", import.meta.url)),
];

/**
 * Vocabulary 6.0.0 removed from the task contract. A template that still
 * names one of these sends the author back to a mechanism that no longer
 * exists: `execution/<cycle>/journal.md` for history the change journal now
 * holds, the group label the executor used to split work by, or a command
 * the CLI no longer registers.
 */
const REMOVED_VOCABULARY = [
  "execution/",
  "<cycle>",
  "execution-plan.json",
  "lexforge context",
  "lexforge cycle",
  "lexforge workflow",
  "lexforge evidence red",
  "group label",
  "[A]",
  "Link task -> journal -> evidence",
];

describe("шаблоны tasks.md не несут словарь, который убрал 6.0.0", () => {
  it.each(TEMPLATES)("%s не называет убранную команду, execution/, cycle или групповую метку", (template) => {
    const text = readFileSync(template, "utf8");
    const found = REMOVED_VOCABULARY.filter((phrase) => text.includes(phrase));

    expect(found, `${template} ещё несёт: ${found.join(", ")}`).toEqual([]);
  });
});
