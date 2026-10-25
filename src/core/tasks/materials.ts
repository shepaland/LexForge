import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { local } from "./files.js";
import { changeDir } from "./paths.js";

/** A diagram, a contract table or a mockup a task names, with the path it was read from. */
export interface Material {
  path: string;
  text: string;
}

const REFERENCE = /specs\/([\w.-]+)\/(?:spec\.md#([\w-]+)|mockups\/([\w./-]+))/g;

function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** A regular file inside the project, reached without `.`, `..` or a symlink. */
function isFile(root: string, rel: string): boolean {
  if (rel.split("/").some((part) => part === "" || part === "." || part === ".." || part.includes(":"))) return false;
  try {
    return statSync(local(root, rel, "lexforge status")).isFile();
  } catch {
    return false;
  }
}

/** The change's own file wins over the main specs. */
function resolve(root: string, change: string, rel: string): string | undefined {
  for (const base of [`${changeDir(change)}/`, "lexforge/"]) {
    if (isFile(root, `${base}${rel}`)) return `${base}${rel}`;
  }
  return undefined;
}

function read(root: string, rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

/** The block under the heading whose slug is `anchor`, up to the next heading of its level or higher. */
function section(text: string, anchor: string): string | undefined {
  const lines = text.split(/\r?\n/);
  let fenced = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(```|~~~)/.test(lines[i]!)) fenced = !fenced;
    const heading = fenced ? null : /^(#{1,6})\s+(.*)$/.exec(lines[i]!);
    if (!heading) continue;
    if (start >= 0 && heading[1]!.length <= level) return lines.slice(start, i).join("\n").trimEnd();
    if (start < 0 && slug(heading[2]!) === anchor) {
      start = i;
      level = heading[1]!.length;
    }
  }
  return start < 0 ? undefined : lines.slice(start).join("\n").trimEnd();
}

/** Stylesheets a mockup links, kept only when they sit inside the same capability. */
function stylesheets(html: string, file: string): string[] {
  const capability = path.posix.dirname(path.posix.dirname(file));
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter((link) => /rel\s*=\s*["']?stylesheet/i.test(link[0]))
    .flatMap((link) => /href\s*=\s*["']([^"']+)["']/i.exec(link[0])?.[1] ?? [])
    .filter((href) => !/^([a-z]+:|\/)/i.test(href))
    .map((href) => path.posix.join(path.posix.dirname(file), href.split(/[?#]/)[0]!))
    .filter((css) => css.endsWith(".css") && css.startsWith(`${capability}/`));
}

/** Diagrams, contract tables and mockups, with their CSS, that the text of a task names. */
export function taskMaterials(root: string, change: string, text: string): Material[] {
  const found = new Map<string, string>();
  const add = (file: string, body: string): void => {
    if (!found.has(file)) found.set(file, body);
  };
  for (const match of text.matchAll(REFERENCE)) {
    if (match[2]) {
      const file = resolve(root, change, `specs/${match[1]}/spec.md`);
      const body = file === undefined ? undefined : section(read(root, file), match[2]);
      if (file !== undefined && body !== undefined) add(`${file}#${match[2]}`, body);
      continue;
    }
    const file = resolve(root, change, `specs/${match[1]}/mockups/${match[3]!.replace(/\.+$/, "")}`);
    if (file === undefined) continue;
    const html = read(root, file);
    add(file, html);
    for (const css of stylesheets(html, file)) if (isFile(root, css)) add(css, read(root, css));
  }
  return [...found].map(([file, body]) => ({ path: file, text: body }));
}

/** A fence longer than any run of backticks inside the text, so the text cannot close it. */
function fence(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  return "`".repeat(longest + 1);
}

/** The materials as brief text: each under its path, in a fenced block. */
export function renderMaterials(materials: Material[]): string {
  if (materials.length === 0) return "The task names no diagram, contract table or mockup.";
  return materials
    .map((item) => {
      const mark = fence(item.text);
      const language = item.path.includes("#") ? "markdown" : path.extname(item.path).slice(1);
      return `### ${item.path}\n\n${mark}${language}\n${item.text}\n${mark}`;
    })
    .join("\n\n");
}
