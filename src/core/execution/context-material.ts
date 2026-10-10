import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { local } from "./files.js";
import { changeDir } from "./plan.js";

export type Material = { path: string; text: string };

const REFERENCE =
  /specs\/([\w.-]+)\/(?:spec\.md#([\w-]+)|mockups\/([\w./-]+))/g;

function slug(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function isFile(root: string, rel: string): boolean {
  if (rel.split("/").some((p) => p === "" || p === "." || p === ".." || p.includes(":"))) return false;
  try {
    return statSync(local(root, rel)).isFile();
  } catch {
    return false;
  }
}

/** The change's own file wins over the main specs. */
function resolve(root: string, change: string, rel: string): string | undefined {
  for (const base of [`${changeDir(change)}/`, "lexforge/"]) {
    const file = `${base}${rel}`;
    if (isFile(root, file)) return file;
  }
  return undefined;
}

function section(text: string, anchor: string): string | undefined {
  const lines = text.split(/\r?\n/);
  let fenced = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
    const h = fenced ? null : /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!h) continue;
    if (start >= 0 && h[1].length <= level) return lines.slice(start, i).join("\n").trimEnd();
    if (start < 0 && slug(h[2]) === anchor) {
      start = i;
      level = h[1].length;
    }
  }
  return start < 0 ? undefined : lines.slice(start).join("\n").trimEnd();
}

function stylesheets(html: string, file: string): string[] {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter((l) => /rel\s*=\s*["']?stylesheet/i.test(l[0]))
    .flatMap((l) => /href\s*=\s*["']([^"']+)["']/i.exec(l[0])?.[1] ?? [])
    .filter((href) => !/^([a-z]+:|\/)/i.test(href))
    .map((href) => path.posix.join(path.posix.dirname(file), href.split(/[?#]/)[0]))
    .filter((css) => css.endsWith(".css") && css.startsWith(`${path.posix.dirname(path.posix.dirname(file))}/`));
}

/** Diagrams, contract tables and mockups (with their CSS) that a task names. */
export function taskMaterials(root: string, change: string, text: string): Material[] {
  const found = new Map<string, string>();
  const add = (file: string, body: string) => {
    if (!found.has(file)) found.set(file, body);
  };
  for (const m of text.matchAll(REFERENCE)) {
    if (m[2]) {
      const file = resolve(root, change, `specs/${m[1]}/spec.md`);
      const body = file && section(readFileSync(local(root, file), "utf8"), m[2]);
      if (file && body) add(`${file}#${m[2]}`, body);
    } else {
      const rel = `specs/${m[1]}/mockups/${m[3].replace(/\.+$/, "")}`;
      const file = resolve(root, change, rel);
      if (!file) continue;
      const html = readFileSync(local(root, file), "utf8");
      add(file, html);
      for (const css of stylesheets(html, file))
        if (isFile(root, css)) add(css, readFileSync(local(root, css), "utf8"));
    }
  }
  return [...found].map(([p, t]) => ({ path: p, text: t }));
}
