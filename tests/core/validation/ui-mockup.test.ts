import { afterEach, describe, expect, it } from "vitest";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const MISSING = "\nThe mockup check is not implemented\n";
const SPEC = "lexforge/changes/c/specs/login/spec.md";
const DIR = "lexforge/changes/c/specs/login/mockups";

type Found = Array<{ file: string; line: number; rule: string; message: string }>;
type Check = (root: string, specFile: string, text: string, styleFiles: string[] | null) => Found;

async function load(): Promise<Check | undefined> {
  try {
    const mod = await import("../../../src/core/validation/ui-mockup.js");
    return mod.checkMockups as Check;
  } catch {
    return undefined;
  }
}

const roots: string[] = [];

async function run(
  files: Record<string, string>,
  body: string[],
  styleFiles: string[] | null = ["src/app.css"],
): Promise<Found> {
  const check = await load();
  expect(check, MISSING).toBeTypeOf("function");
  const root = makeWorkspace({ "src/app.css": ".btn { color: red; }\n.card { margin: 0; }\n", ...files });
  roots.push(root);
  const text = ["## ADDED Requirements", "", "### Requirement: Login", "", ...body, ""].join("\n");
  return check!(root, SPEC, text, styleFiles);
}

afterEach(() => {
  for (const root of roots.splice(0)) removeWorkspace(root);
});

const PAGE = (classes: string, extra = ""): string =>
  [
    "<html><head>",
    '<link rel="stylesheet" href="login.css">',
    extra,
    "</head><body>",
    `<div class="${classes}">x</div>`,
    "</body></html>",
  ].join("\n");

const HTML_REQ = ["Mockup: mockups/login.html"];

describe("checkMockups", () => {
  it("accepts an ASCII mockup under its anchor", async () => {
    const found = await run({}, ["Mockup: #login-screen", "", "#### Login screen", "", "```mockup", "[ Sign in ]", "```"]);
    expect(found).toEqual([]);
  });

  it("names the requirement, the target and the line of a missing file", async () => {
    const found = await run({}, HTML_REQ);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("mockup-target-missing");
    expect(found[0].line).toBe(5);
    expect(found[0].file).toBe(SPEC);
    expect(found[0].message).toContain("Login");
    expect(found[0].message).toContain("mockups/login.html");
  });

  it("reports an anchor with no mockup block", async () => {
    const found = await run({}, ["Mockup: #login-screen"]);
    expect(found.map((f) => f.rule)).toEqual(["mockup-target-missing"]);
  });

  it("reports a style element and a style attribute with file and line", async () => {
    const html = PAGE("btn", "<style>.btn{}</style>").replace('class="btn"', 'class="btn" style="color:red"');
    const found = await run({ [`${DIR}/login.html`]: html, [`${DIR}/login.css`]: "" }, HTML_REQ);
    const hit = found.filter((f) => f.rule === "mockup-inline-style");
    expect(hit.map((f) => f.line)).toEqual([3, 5]);
    expect(hit[0].file).toBe(`${DIR}/login.html`);
  });

  it("reports an HTML mockup that links no CSS file of its mockups directory", async () => {
    const found = await run({ [`${DIR}/login.html`]: '<div class="btn">x</div>' }, HTML_REQ);
    expect(found.map((f) => f.rule)).toEqual(["mockup-css-missing"]);
    expect(found[0].file).toBe(`${DIR}/login.html`);
  });

  it("accepts a mockup that uses project classes with its own CSS", async () => {
    const found = await run({ [`${DIR}/login.html`]: PAGE("btn card"), [`${DIR}/login.css`]: ".x { top: 0; }" }, HTML_REQ);
    expect(found).toEqual([]);
  });

  it("names a class that nobody agreed to, with file and line", async () => {
    const found = await run({ [`${DIR}/login.html`]: PAGE("btn card--compact"), [`${DIR}/login.css`]: "" }, HTML_REQ);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("mockup-class-unagreed");
    expect(found[0].message).toContain("card--compact");
    expect(found[0].file).toBe(`${DIR}/login.html`);
    expect(found[0].line).toBe(5);
  });

  it("accepts a new class listed after Classes:", async () => {
    const found = await run(
      { [`${DIR}/login.html`]: PAGE("btn card--compact"), [`${DIR}/login.css`]: "" },
      [...HTML_REQ, "", "Classes:", "- `card--compact` new: dense rows"],
    );
    expect(found).toEqual([]);
  });

  it("names a project class redefined in the mockup CSS without consent", async () => {
    const files = { [`${DIR}/login.html`]: PAGE("btn"), [`${DIR}/login.css`]: ".x{}\n.btn { color: blue; }" };
    const found = await run(files, HTML_REQ);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("mockup-class-changed");
    expect(found[0].message).toContain("btn");
    expect(found[0].file).toBe(`${DIR}/login.css`);
    expect(found[0].line).toBe(2);
    const agreed = await run(files, [...HTML_REQ, "Classes:", "- `btn` changed: blue button"]);
    expect(agreed).toEqual([]);
  });

  it("names ui.styles once when the config has no styles", async () => {
    const found = await run({ [`${DIR}/login.html`]: PAGE("btn"), [`${DIR}/login.css`]: "" }, HTML_REQ, null);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe("ui-styles-missing");
    expect(found[0].message).toContain("ui.styles");
  });

  it.each([
    ["traversal", "Mockup: mockups/../../../../../outside.html", { "outside.html": "<p>x</p>" }],
    ["a non-HTML target", "Mockup: mockups/login.png", { [`${DIR}/login.png`]: "png" }],
    ["a target outside mockups/", "Mockup: stray.html", { "lexforge/changes/c/specs/login/stray.html": "<p>x</p>" }],
    ["an absolute path", "Mockup: /etc/hosts", {}],
  ])("refuses %s as a mockup target", async (_name, line, files) => {
    const found = await run(files, [line]);
    expect(found.map((f) => f.rule)).toEqual(["mockup-target-missing"]);
    expect(found[0].line).toBe(5);
  });

  it("requires exactly one own CSS file and checks every linked one", async () => {
    const html = PAGE("btn").replace("</head>", '<link rel="stylesheet" href="more.css">\n</head>');
    const found = await run(
      { [`${DIR}/login.html`]: html, [`${DIR}/login.css`]: ".x{}", [`${DIR}/more.css`]: ".btn { color: blue; }" },
      HTML_REQ,
    );
    const rules = found.map((f) => f.rule).sort();
    expect(rules).toEqual(["mockup-class-changed", "mockup-css-missing"]);
    expect(found.find((f) => f.rule === "mockup-css-missing")!.message).toContain("exactly one");
    expect(found.find((f) => f.rule === "mockup-class-changed")!.file).toBe(`${DIR}/more.css`);
  });

  it("reports a linked own CSS file that is absent even when another one exists", async () => {
    const html = PAGE("btn").replace("</head>", '<link rel="stylesheet" href="gone.css">\n</head>');
    const found = await run({ [`${DIR}/login.html`]: html, [`${DIR}/login.css`]: ".x{}" }, HTML_REQ);
    expect(found.map((f) => f.rule)).toEqual(["mockup-css-missing"]);
    expect(found[0].message).toContain("gone.css");
  });

  it("treats a directory as a missing file, for the target and for a CSS link", async () => {
    const dirTarget = await run({ [`${DIR}/d.html/keep.txt`]: "x" }, ["Mockup: mockups/d.html"]);
    expect(dirTarget.map((f) => f.rule)).toEqual(["mockup-target-missing"]);
    const html = PAGE("btn").replace('href="login.css"', 'href="folder.css"');
    const dirCss = await run({ [`${DIR}/login.html`]: html, [`${DIR}/folder.css/keep.txt`]: "x" }, HTML_REQ);
    expect(dirCss.map((f) => f.rule)).toEqual(["mockup-css-missing"]);
    expect(dirCss[0].message).toContain("folder.css");
  });

  it("accepts a mockup file whose name starts with two dots", async () => {
    const found = await run({ [`${DIR}/..a.html`]: PAGE("btn"), [`${DIR}/login.css`]: ".x{}" }, ["Mockup: mockups/..a.html"]);
    expect(found).toEqual([]);
  });
});
