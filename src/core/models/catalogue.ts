import { toolVendor } from "../init/tool-registry.js";

/**
 * The provider catalogue that ships with the package. `lexforge init` writes it
 * into the `config.yaml` of a new project once, and from then on the catalogue
 * belongs to that project: it is never read again, so an upgrade cannot change
 * the names a project already wrote down.
 *
 * The names are read from the documentation of each provider. They are a
 * reading aid and nothing more - a runtime naming a model that is not here is
 * passed on exactly as the config wrote it.
 */
export const SHIPPED_PROVIDERS: Record<string, string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5"],
  openai: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  google: ["gemini-3.1-pro-preview", "gemini-3.7-flash", "gemini-3.5-flash-lite"],
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
  "z.ai": ["glm-4.7", "glm-4.7-flash"],
};

/** The provider and model the commented-out `default` of a new project shows. */
export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "claude-opus-5";

/**
 * The model a runtime of this vendor starts on: the first name the shipped
 * catalogue lists for it. Empty for a provider the catalogue does not hold.
 */
export function headlineModel(provider: string): string {
  return SHIPPED_PROVIDERS[provider]?.[0] ?? "";
}

/**
 * The `models` section as `init` writes it: an entry for each named runtime
 * that has a vendor of its own, then the catalogue.
 *
 * No top-level `default` is written. A runtime nobody named works on the model
 * its own skills name, and choosing one model for the whole project is a
 * decision of its owner, not of the installer.
 */
export function modelsSectionText(tools: string[] = []): string {
  const catalogue = Object.entries(SHIPPED_PROVIDERS)
    .map(
      ([provider, models]) =>
        `    ${provider}:\n${models.map((model) => `      - ${model}`).join("\n")}`,
    )
    .join("\n");

  const entries = tools
    .map((tool) => ({ tool, vendor: toolVendor(tool) }))
    .filter((entry) => headlineModel(entry.vendor) !== "")
    .map(
      (entry) =>
        `    ${entry.tool}:\n      provider: ${entry.vendor}\n` +
        `      model: ${headlineModel(entry.vendor)}`,
    );

  const assignment =
    entries.length > 0
      ? `  tools:\n${entries.join("\n")}\n`
      : "  # tools:\n  #   codex:\n  #     provider: openai\n  #     model: gpt-5.6-sol\n";

  return `# models: which model this project runs on, one entry per runtime.
# A runtime with no entry of its own takes the \`default\` below, and a project
# that names neither leaves every skill on the model its own block names.
models:
${assignment}
  # default:
  #   provider: ${DEFAULT_PROVIDER}
  #   model: ${DEFAULT_MODEL}

  # The model names on hand. This list is yours: add a provider or a model and
  # it counts as known here, with no LexForge release.
  providers:
${catalogue}
`;
}
