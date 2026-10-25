import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { git, writeAt, type GitWorkspace } from "../helpers/git-workspace.js";
import { approvePlanDirectly, CHANGE_DIR, createTaskWorkspace, taskSteps, TASKS } from "../helpers/task-workspace.js";

let ws: GitWorkspace | undefined;
afterEach(() => ws?.remove());

const WEB_SPEC = [
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

/** Task 1.1 names `reference` in its title; the web spec, a mockup and its CSS sit in the change. */
async function briefOf(reference: string, extra: Record<string, string> = {}): Promise<string> {
  const tasks = reference === "" ? TASKS : TASKS.replace("1.1 Search over note text", `1.1 Search over note text. ${reference}`);
  ws = createTaskWorkspace(tasks, { approved: false });
  const files: Record<string, string> = {
    [`${CHANGE_DIR}/specs/web/spec.md`]: WEB_SPEC,
    [`${CHANGE_DIR}/specs/web/mockups/login.html`]: '<link rel="stylesheet" href="login.css"><p class="card">Login</p>',
    [`${CHANGE_DIR}/specs/web/mockups/login.css`]: ".card { color: red; }",
    ...extra,
  };
  for (const [file, text] of Object.entries(files)) writeAt(ws.root, file, text);
  git(ws.root, "add", "--all");
  git(ws.root, "commit", "--message", "materials");
  approvePlanDirectly(ws.root);
  const result = await taskSteps(ws.root).start("1.1");
  expect(result.exitCode).toBe(0);
  return readFileSync(path.join(ws.root, CHANGE_DIR, "tasks/1.1/brief.md"), "utf8");
}

describe("lexforge task start: материалы задачи в брифе", () => {
  it("кладёт в бриф макет, который называет задача, и его CSS", async () => {
    const brief = await briefOf("Build against specs/web/mockups/login.html.");
    expect(brief).toContain("## Materials");
    expect(brief).toContain(`${CHANGE_DIR}/specs/web/mockups/login.html`);
    expect(brief).toContain('<p class="card">Login</p>');
    expect(brief).toContain(`${CHANGE_DIR}/specs/web/mockups/login.css`);
    expect(brief).toContain(".card { color: red; }");
  });

  it("кладёт диаграмму и таблицу контракта из раздела спеки под якорем", async () => {
    const brief = await briefOf("Build against specs/web/spec.md#requirement-login.");
    expect(brief).toContain("web -> api: Login");
    expect(brief).toContain("| Login | web | api | email |");
    expect(brief).not.toContain("UNRELATED SECTION TEXT");
  });

  it("находит раздел, в заголовке которого есть знаки препинания", async () => {
    const brief = await briefOf("Build against specs/web/spec.md#requirement-login-signup.");
    expect(brief).toContain("PUNCTUATED SECTION TEXT");
  });

  it("говорит, что материалов нет, когда задача их не называет", async () => {
    const brief = await briefOf("");
    expect(brief).toContain("## Materials\n\nThe task names no diagram, contract table or mockup.");
  });

  it("пропускает странные ссылки и стили за пределами capability", async () => {
    const brief = await briefOf(
      "See specs/web/mockups/./login.html and specs/web/mockups//x and specs/web/mockups. Also specs/web/mockups/evil.html.",
      {
        [`${CHANGE_DIR}/specs/web/mockups/evil.html`]:
          '<link rel="stylesheet" href="../../../package.json"><link rel="stylesheet" href="../spec.md">',
      },
    );
    const materials = brief.slice(brief.indexOf("## Materials"), brief.indexOf("## Decisions"));
    expect([...materials.matchAll(/^### (.+)$/gm)].map((m) => m[1]!.split("/").pop())).toEqual(["evil.html"]);
  });
});
