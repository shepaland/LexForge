/** kebab-case: lowercase letters and digits, single dashes between them. */
export const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isKebabCase(name: string): boolean {
  return KEBAB_CASE.test(name);
}

/**
 * The same name written the way LexForge expects it. Used to show a person the
 * fixed spelling instead of only telling them the name is wrong.
 */
export function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
