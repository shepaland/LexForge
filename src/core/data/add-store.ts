import { writeFileSync } from "node:fs";
import { isSeq, parseDocument } from "yaml";

import { UsageError } from "../../cli/errors.js";
import { readTextFile } from "../read-text.js";
import type { CommandResult } from "../types.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { workspacePaths } from "../workspace/paths.js";
import { isStoreName, storeFormat, type StoreFormat } from "./dialects.js";

export interface AddStoreData {
  outputVersion: 1;
  name: string;
  dialect: string;
  format: StoreFormat;
  nextStep: string;
}

const EXTENSION: Record<StoreFormat, string> = { sql: "sql", markdown: "md" };

/**
 * Appends a store to `data_stores` of the project config, creating the list
 * when it is absent. The name, the dialect and the list are checked before the
 * config is touched; the file is edited as a YAML document, so its other keys
 * and comments stay.
 */
export function addStore(root: string, name: string, dialect: string): CommandResult<AddStoreData> {
  if (!isStoreName(name)) {
    throw new UsageError(
      "store-name-invalid",
      `The store name "${name}" is not kebab-case. Use lower-case letters, digits and single hyphens, such as main or user-events.`,
      "Run the command again with a name such as main or user-events.",
    );
  }

  if (readProjectConfig(root).stores.some((store) => store.name === name)) {
    throw new UsageError(
      "store-name-taken",
      `The store "${name}" is already listed in data_stores.`,
      "Pick another store name, or edit the existing entry in lexforge/config.yaml.",
    );
  }

  const lowered = dialect.trim().toLowerCase();
  if (lowered === "") {
    throw new UsageError(
      "store-dialect-empty",
      "The dialect is empty.",
      "Run the command again with --dialect set to a dialect such as postgresql or mongodb.",
    );
  }

  const configPath = workspacePaths(root).config;
  const document = parseDocument(readTextFile(configPath));
  const entry = { name, dialect: lowered };
  const list = document.get("data_stores");
  if (isSeq(list)) {
    list.add(document.createNode(entry));
  } else {
    document.set("data_stores", document.createNode([entry]));
  }
  writeFileSync(configPath, document.toString(), "utf8");

  const format = storeFormat(lowered);
  const extension = EXTENSION[format];
  const nextStep =
    `Write schema.${extension}, up.${extension} and down.${extension} ` +
    `under data/${name} in the change.`;

  return {
    data: { outputVersion: 1, name, dialect: lowered, format, nextStep },
    lines: [`data_stores holds ${name} with the dialect ${lowered}.`],
    nextStep,
    exitCode: 0,
  };
}
