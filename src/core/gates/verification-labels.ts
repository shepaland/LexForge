import { UsageError } from "../../cli/errors.js";
import { CONFIG_FILE, WORKSPACE_DIR } from "../workspace/paths.js";
import type { ProjectConfig } from "../workspace/project-config.js";

/** Where the check labels are described, as the reader is told to open it. */
const CONFIG_PATH = `${WORKSPACE_DIR}/${CONFIG_FILE}`;

/** What a label line looks like when the project has to write one. */
const PLACE_FOR_COMMAND = "<command that runs this check>";

/** Labels the project describes, alphabetically. */
export function describedLabels(config: ProjectConfig): string[] {
  return Object.keys(config.verification).sort();
}

/**
 * The `verification` section as it would look in a project that has one. It is
 * printed whole when the project has no section at all: telling a reader that
 * a label is missing helps nobody who has never seen the section.
 */
export function verificationExample(): string {
  return ["verification:", "  tests: npm test", "  lint: npm run lint"].join("\n");
}

/** The two lines the project has to add for one named label. */
export function labelExample(label: string): string {
  return ["verification:", `  ${label}: ${PLACE_FOR_COMMAND}`].join("\n");
}

/**
 * The command of a label. A label the project does not describe stops the
 * command: guessing it — "the label is called tests, so it must be npm test" —
 * writes a green stamp for a run the project never asked for.
 */
export function labelCommand(config: ProjectConfig, label: string): string {
  const command = config.verification[label];
  if (command !== undefined) {
    return command;
  }

  throw labelUnknown(config, label);
}

/** The refusal for a label the project does not describe. */
export function labelUnknown(config: ProjectConfig, label: string): UsageError {
  const described = describedLabels(config);

  if (described.length === 0) {
    return new UsageError(
      "label-unknown",
      `this project describes no checks at all, so there is no command behind ` +
        `"${label}". Add a verification section to ${CONFIG_PATH}:\n\n${verificationExample()}`,
      `describe the checks of this project in ${CONFIG_PATH}, then run this command again`,
    );
  }

  return new UsageError(
    "label-unknown",
    `this project describes no check labelled "${label}". It describes: ` +
      `${described.join(", ")}. To add this one, write it in ${CONFIG_PATH}:` +
      `\n\n${labelExample(label)}`,
    `use one of the described labels, or add "${label}" to ${CONFIG_PATH}`,
  );
}

/**
 * The refusal for a call that names no label. The parser would say the flag is
 * required and stop there; the reader still would not know what to write after
 * it, so the labels of this project are named here.
 */
export function labelMissing(config: ProjectConfig): UsageError {
  const described = describedLabels(config);

  if (described.length === 0) {
    return verificationEmpty("label-missing");
  }

  return new UsageError(
    "label-missing",
    `this call needs --label. The checks this project describes are: ` +
      `${described.join(", ")}.`,
    `lexforge evidence record --change <name> --label ${described[0]}`,
  );
}

/** The refusal for a project whose `verification` section is empty. */
export function verificationEmpty(code: string): UsageError {
  return new UsageError(
    code,
    `this project describes no checks: the verification section of ${CONFIG_PATH} is ` +
      `empty. There is nothing to check, and exit code 0 here would read as ` +
      `"the checks passed".\n\n${verificationExample()}`,
    `describe the checks of this project in ${CONFIG_PATH}, then run this command again`,
  );
}
