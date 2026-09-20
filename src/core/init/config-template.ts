import { modelsSectionText } from "../models/catalogue.js";
import {
  DEFAULT_FILE_LIMIT_INCLUDE,
  DEFAULT_FILE_LIMIT_LINES,
  DEFAULT_SCHEMA,
} from "../workspace/project-config.js";

/**
 * The `lines`/`include` mapping that sits under the `file_limit:` key, one
 * plain `#     - "pattern"` entry per line, `"!src/generated/**"` included as
 * one more list entry. Uncommenting this on its own parses to
 * `{ lines, include }` - no prose line breaks the list's indentation.
 */
export function fileLimitYamlBlockText(): string {
  const patterns = [...DEFAULT_FILE_LIMIT_INCLUDE, "!src/generated/**"];
  const includeLines = patterns.map((pattern) => `#     - "${pattern}"`).join("\n");

  return `#   lines: ${DEFAULT_FILE_LIMIT_LINES}
#   include:
${includeLines}`;
}

/** The commented `file_limit` section: the header sentence, the key, and the uncomment-safe block. */
function fileLimitSectionText(): string {
  return `# file_limit: the line count a file may reach, and the files it covers. A "!" pattern leaves generated or vendored code out of the limit.
# file_limit:
${fileLimitYamlBlockText()}`;
}

/**
 * The `config.yaml` written by the initialisation. `schema` and the `models`
 * section ship live - a project needs a schema and resolves every stage against
 * the default from the first run; every other section ships commented out, so the
 * file shows what can be set without setting it. Without an explicit language the `language` field is left out on
 * purpose: a missing field means the project has not chosen a language yet.
 */
export function projectConfigText(language = "", tools: string[] = []): string {
  const head = language
    ? `schema: ${DEFAULT_SCHEMA}\n\n` +
      `# The language the artifacts of this project are written in.\nlanguage: ${language}\n`
    : `schema: ${DEFAULT_SCHEMA}\n`;

  return `# LexForge project configuration.

# The schema every new change starts from.
${head}

# context: what this project is. Every artifact instruction is given this text.
# context: |
#   A command line tool that keeps the pipeline honest.

# rules: extra rules per artifact id, added to the instruction of that artifact.
# rules:
#   proposal:
#     - Name the user facing change in one sentence.

# operations: commands the pipeline runs for you.
# operations:
#   apply: npm run build

# verification: named checks, one command per label.
# verification:
#   tests: npm test
#   lint: npm run lint

${fileLimitSectionText()}

${modelsSectionText(tools)}`;
}
