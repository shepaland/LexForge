/**
 * The provider catalogue that ships with the package. `lexforge init` writes it
 * into the `config.yaml` of a new project once, and from then on the catalogue
 * belongs to that project: it is never read again, so an upgrade cannot change
 * the names a project already wrote down.
 *
 * The names are read from the documentation of each provider. They are a
 * reading aid and nothing more - a role naming a model that is not here is
 * passed on exactly as the config wrote it.
 */
export const SHIPPED_PROVIDERS: Record<string, string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5"],
  openai: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  google: ["gemini-3.1-pro-preview", "gemini-3.7-flash", "gemini-3.5-flash-lite"],
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
  "z.ai": ["glm-4.7", "glm-4.7-flash"],
};

/** What a new project starts on until its owner chooses otherwise. */
export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "claude-opus-5";

/** The `models` section as `init` writes it: assignment first, catalogue last. */
export function modelsSectionText(): string {
  const catalogue = Object.entries(SHIPPED_PROVIDERS)
    .map(([provider, models]) => `    ${provider}:\n${models.map((m) => `      - ${m}`).join("\n")}`)
    .join("\n");

  return `# models: which model each stage of the pipeline runs on.
# The roles: analysis writes the artifacts, development writes the code,
# review judges the completion. A role left out falls back to the default.
models:
  default:
    provider: ${DEFAULT_PROVIDER}
    model: ${DEFAULT_MODEL}

  # Override a role to lift its stages onto another model.
  # analysis:
  #   provider: ${DEFAULT_PROVIDER}
  #   model: ${DEFAULT_MODEL}
  # development:
  #   provider: ${DEFAULT_PROVIDER}
  #   model: claude-sonnet-5
  # review:
  #   provider: ${DEFAULT_PROVIDER}
  #   model: ${DEFAULT_MODEL}

  # The model names on hand. This list is yours: add a provider or a model and
  # it counts as known here, with no LexForge release.
  providers:
${catalogue}
`;
}
