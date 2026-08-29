import { DEFAULT_SCHEMA } from "../workspace/project-config.js";

/**
 * The `config.yaml` written by the initialisation. Only `schema` is live; every
 * other section ships commented out, so the file shows what can be set without
 * setting it. Without an explicit language the `language` field is left out on
 * purpose: a missing field means the project has not chosen a language yet.
 */
export function projectConfigText(language = ""): string {
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
`;
}
