import { expect, it } from "vitest";
import { writeAt } from "../helpers/git-workspace.js";
import { dir, call, fixture } from "../helpers/execution-workspace.js";

const SPEC = [
  "## ADDED Requirements",
  "",
  "### Requirement: Login",
  "Interaction: web -> api",
  "",
  "```sequence",
  "web -> api: Login",
  "```",
  "",
  "| Message | From | To | Field | Type | Required | Length | Response | Errors |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  "| Login | web | api | email | string | yes | 1..255 | token | 401 |",
  "",
  "### Requirement: Login / Signup",
  "PUNCTUATED SECTION TEXT",
  "",
  "### Requirement: Other",
  "UNRELATED SECTION TEXT",
  "",
].join("\n");

function withTask(root: string, text: string) {
  writeAt(
    root,
    `${dir}/tasks.md`,
    `## 1. Greeting\n\nDepends on: none\n\n- [ ] 1.1 [A] Write \`tests/check.cjs\`. ${text} Check: \`node tests/check.cjs\`\n  -> greet#Hello\n- [ ] 1.2 [A] Implement \`src/message.txt\`. Check: \`node tests/check.cjs\`\n  -> greet#Hello\n`,
  );
  writeAt(root, `${dir}/specs/web/spec.md`, SPEC);
  writeAt(root, `${dir}/specs/web/mockups/login.html`, '<link rel="stylesheet" href="login.css"><p class="card">Login</p>');
  writeAt(root, `${dir}/specs/web/mockups/login.css`, ".card { color: red; }");
}

it("carries the mockup and its CSS file in the context of a task that names the mockup", async () => {
  const root = fixture();
  withTask(root, "Build against specs/web/mockups/login.html.");
  const r = await call(root, ["context", "--task", "1.1"]);
  expect(r.exitCode).toBe(0);
  if (!r.data.materials?.length) expect.fail("\nContext does not carry the diagram or the mockup\n");
  const byPath = Object.fromEntries(r.data.materials.map((m: any) => [m.path.split("/").pop(), m.text]));
  expect(byPath["login.html"]).toContain('class="card"');
  expect(byPath["login.css"]).toBe(".card { color: red; }");
});

it("carries the sequence block and the contract table under a named spec anchor", async () => {
  const root = fixture();
  withTask(root, "Build against specs/web/spec.md#requirement-login.");
  const r = await call(root, ["context", "--task", "1.1"]);
  expect(r.exitCode).toBe(0);
  if (!r.data.materials?.length) expect.fail("\nContext does not carry the diagram or the mockup\n");
  const text = r.data.materials.map((m: any) => m.text).join("\n");
  expect(text).toContain("web -> api: Login");
  expect(text).toContain("| Login | web | api | email |");
  expect(text).not.toContain("UNRELATED SECTION TEXT");
});

it("carries no materials when a task names none", async () => {
  const root = fixture();
  const r = await call(root, ["context", "--task", "1.1"]);
  if (!r.data.materials) expect.fail("\nContext does not carry the diagram or the mockup\n");
  expect(r.data.materials).toEqual([]);
});

it("finds a section whose heading holds punctuation", async () => {
  const root = fixture();
  withTask(root, "Build against specs/web/spec.md#requirement-login-signup.");
  const r = await call(root, ["context", "--task", "1.1"]);
  if (!r.data.materials?.length) expect.fail("\nContext does not carry the diagram or the mockup\n");
  expect(r.data.materials.map((m: any) => m.text).join("\n")).toContain("PUNCTUATED SECTION TEXT");
});

it("skips odd references and stylesheets outside the capability", async () => {
  const root = fixture();
  withTask(root, "See specs/web/mockups/./login.html and specs/web/mockups//x and specs/web/mockups. Also specs/web/mockups/evil.html.");
  writeAt(root, `${dir}/specs/web/mockups/evil.html`, '<link rel="stylesheet" href="../../../package.json"><link rel="stylesheet" href="../spec.md">');
  const r = await call(root, ["context", "--task", "1.1"]);
  expect(r.exitCode).toBe(0);
  if (!r.data.materials?.length) expect.fail("\nContext does not carry the diagram or the mockup\n");
  expect(r.data.materials.map((m: any) => m.path.split("/").pop())).toEqual(["evil.html"]);
});
