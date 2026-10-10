import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { type Finding, makeFinding } from "./finding.js";
import { declaredClasses, usedClasses } from "./mockup-classes.js";

const MOCKUP_LINE = /^\s*Mockup:\s*(\S.*?)\s*$/;
const CLASS_ITEM = /^\s*[-*]\s+`([^`]+)`\s+(new|changed)\s*:/;

function slug(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function hasMockupBlock(lines: string[], anchor: string): boolean {
  const at = lines.findIndex((l) => {
    const h = /^#{1,6}\s+(.*)$/.exec(l);
    return h !== null && slug(h[1]) === anchor;
  });
  if (at < 0) return false;
  for (let i = at + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) {
    if (/^\s*```\s*mockup\s*$/.test(lines[i])) return true;
  }
  return false;
}

function inside(dir: string, file: string): boolean {
  const rel = path.relative(dir, file);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}

function readIfFile(file: string): string | undefined {
  try {
    return statSync(file).isFile() ? readFileSync(file, "utf8") : undefined;
  } catch {
    return undefined;
  }
}

function shown(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function classList(body: string[]): Map<string, "new" | "changed"> {
  const list = new Map<string, "new" | "changed">();
  const at = body.findIndex((l) => /^\s*Classes:\s*$/.test(l));
  if (at < 0) return list;
  for (let i = at + 1; i < body.length; i++) {
    if (body[i].trim() === "") continue;
    const m = CLASS_ITEM.exec(body[i]);
    if (!m) break;
    list.set(m[1], m[2] as "new" | "changed");
  }
  return list;
}

function checkHtml(
  root: string,
  htmlFile: string,
  html: string,
  list: Map<string, "new" | "changed">,
  project: Set<string> | null,
  findings: Finding[],
): void {
  const file = shown(root, htmlFile);
  html.split(/\r?\n/).forEach((l, i) => {
    if (/<style[\s>]/i.test(l) || /\sstyle\s*=/i.test(l)) {
      findings.push(makeFinding(file, i + 1, "mockup-inline-style", `The mockup ${file} holds inline styles: move them to its own CSS file.`));
    }
  });
  const dir = path.dirname(htmlFile);
  const sheets: Array<{ file: string; text: string }> = [];
  const dangling: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (!href || !/\.css(\?.*)?$/i.test(href[1]) || /^[a-z]+:\/\//i.test(href[1])) continue;
    const target = path.resolve(dir, href[1].replace(/\?.*$/, ""));
    if (path.dirname(target) !== dir) continue;
    const text = readIfFile(target);
    if (text === undefined) {
      if (!dangling.includes(target)) dangling.push(target);
    } else if (!sheets.some((s) => s.file === target)) {
      sheets.push({ file: target, text });
    }
  }
  for (const gone of dangling) {
    findings.push(makeFinding(file, 1, "mockup-css-missing", `The mockup ${file} links the CSS file ${shown(root, gone)}, which does not exist.`));
  }
  if (sheets.length > 1 || (sheets.length === 0 && dangling.length === 0)) {
    const why = sheets.length === 0 ? "links no CSS file of its own in its mockups directory" : `links ${sheets.length} CSS files of its own`;
    findings.push(makeFinding(file, 1, "mockup-css-missing", `The mockup ${file} ${why}: exactly one is required.`));
  }
  if (!project) return;
  const reported = new Set<string>();
  for (const use of usedClasses(html)) {
    if (project.has(use.name) || list.has(use.name) || reported.has(use.name)) continue;
    reported.add(use.name);
    findings.push(
      makeFinding(file, use.line, "mockup-class-unagreed", `The class ${use.name} in ${file} is not in the project CSS and not in the class list: ask the user, then list it as new.`),
    );
  }
  for (const css of sheets) {
    const cssShown = shown(root, css.file);
    for (const rule of declaredClasses(css.text)) {
      if (!project.has(rule.name) || list.get(rule.name) === "changed" || reported.has(`${cssShown}:${rule.name}`)) continue;
      reported.add(`${cssShown}:${rule.name}`);
      findings.push(
        makeFinding(cssShown, rule.line, "mockup-class-changed", `The class ${rule.name} is declared in the project CSS and changed in ${cssShown} without being listed as changed.`),
      );
    }
  }
}

function checkRequirement(
  root: string,
  specFile: string,
  title: string,
  start: number,
  body: string[],
  specLines: string[],
  state: { project: Set<string> | null; styleReported: boolean; styleFiles: string[] | null },
): Finding[] {
  const offset = body.findIndex((l) => MOCKUP_LINE.test(l));
  if (offset < 0) return [];
  const target = MOCKUP_LINE.exec(body[offset])![1];
  const at = start + offset;
  const findings: Finding[] = [];
  if (target.startsWith("#")) {
    if (!hasMockupBlock(specLines, target.slice(1))) {
      findings.push(makeFinding(specFile, at, "mockup-target-missing", `The mockup ${target} of "${title}" has no mockup block under that anchor.`));
    }
    return findings;
  }
  const mockups = path.resolve(root, path.dirname(specFile), "mockups");
  const htmlFile = path.resolve(path.dirname(path.resolve(root, specFile)), target);
  const html = inside(mockups, htmlFile) && /\.html$/i.test(htmlFile) ? readIfFile(htmlFile) : undefined;
  if (html === undefined) {
    findings.push(makeFinding(specFile, at, "mockup-target-missing", `The mockup ${target} of "${title}" is not an existing HTML file under mockups/ next to the spec.`));
    return findings;
  }
  if (state.styleFiles === null && !state.styleReported) {
    state.styleReported = true;
    findings.push(makeFinding(specFile, at, "ui-styles-missing", `The change holds the HTML mockup ${target} but lexforge/config.yaml has no ui.styles key: name the project CSS files there.`));
  }
  checkHtml(root, htmlFile, html, classList(body), state.project, findings);
  return findings;
}

/**
 * Checks every `Mockup:` requirement of a spec text: the target resolves, an HTML mockup
 * keeps its styles in its own CSS file and uses only agreed classes.
 * `styleFiles` is `ui.styles` of the config, or `null` when the key is absent.
 */
export function checkMockups(root: string, specFile: string, text: string, styleFiles: string[] | null): Finding[] {
  const lines = text.split(/\r?\n/);
  const project =
    styleFiles === null
      ? null
      : new Set(styleFiles.flatMap((f) => declaredClasses(readIfFile(path.resolve(root, f)) ?? "").map((c) => c.name)));
  const state = { project, styleReported: false, styleFiles };
  const findings: Finding[] = [];
  let title = "";
  let start = 0;
  let body: string[] = [];
  const flush = (): void => {
    if (title !== "") findings.push(...checkRequirement(root, specFile, title, start, body, lines, state));
  };
  lines.forEach((l, index) => {
    const heading = /^###\s+Requirement:\s*(.*?)\s*$/.exec(l);
    if (heading || /^#{1,3}\s/.test(l)) {
      flush();
      title = heading ? heading[1] : "";
      start = index + 2;
      body = [];
    } else if (title !== "") {
      body.push(l);
    }
  });
  flush();
  return findings;
}
