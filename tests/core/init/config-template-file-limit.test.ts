import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import {
  fileLimitYamlBlockText,
  projectConfigText,
} from "../../../src/core/init/config-template.js";
import {
  DEFAULT_FILE_LIMIT_INCLUDE,
  DEFAULT_FILE_LIMIT_LINES,
} from "../../../src/core/workspace/project-config.js";

const EXPECTED_INCLUDE = [...DEFAULT_FILE_LIMIT_INCLUDE, "!src/generated/**"];

describe("projectConfigText, раздел file_limit", () => {
  it("несёт закомментированный блок file_limit с патернами по порядку и не включает его в разобранный YAML", () => {
    const text = projectConfigText();

    expect(text).toContain("# file_limit:");
    expect(text).toContain(`#   lines: ${DEFAULT_FILE_LIMIT_LINES}`);
    expect(text).toContain("#   include:");

    const includeBlock = EXPECTED_INCLUDE.map((pattern) => `#     - "${pattern}"`).join("\n");
    expect(text).toContain(includeBlock);

    const parsed = parseYaml(text) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("file_limit");
  });

  it("раскомментированный блок file_limit — валидный YAML с lines и include по порядку", () => {
    const uncommented = fileLimitYamlBlockText()
      .split("\n")
      .map((line) => line.replace(/^# ?/, ""))
      .join("\n");

    const parsed = parseYaml(uncommented);

    expect(parsed).toEqual({
      lines: DEFAULT_FILE_LIMIT_LINES,
      include: EXPECTED_INCLUDE,
    });
  });
});
