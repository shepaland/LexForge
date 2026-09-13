/**
 * Shared low-level helper used by the schema test files split out of the
 * former tests/schemas/templates.test.ts. Collapsing runs of whitespace lets
 * a regex match an instruction paragraph regardless of how it wraps in the
 * source YAML.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
