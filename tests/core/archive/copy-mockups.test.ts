import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const CHANGE = "add-login";
const CHANGE_SPECS = `lexforge/changes/${CHANGE}/specs`;

let root = "";

afterEach(() => {
  if (root) removeWorkspace(root);
  root = "";
});

async function load(): Promise<typeof import("../../../src/core/archive/copy-mockups.js")> {
  try {
    return await import("../../../src/core/archive/copy-mockups.js");
  } catch {
    return expect.fail("copyMockups is missing\nArchive does not copy the mockups");
  }
}

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("copyMockups", () => {
  it("copies the mockups of a change and replaces an older file of the same name", async () => {
    const { copyMockups } = await load();
    root = makeWorkspace({
      [`${CHANGE_SPECS}/web/spec.md`]: "# web\n",
      [`${CHANGE_SPECS}/web/mockups/login.html`]: "<html>new</html>",
      [`${CHANGE_SPECS}/web/mockups/login.css`]: "body { color: red; }",
      "lexforge/specs/web/mockups/login.css": "body { color: blue; }",
    });

    const written = copyMockups(root, CHANGE);

    expect(read("lexforge/specs/web/mockups/login.html")).toBe("<html>new</html>");
    expect(read("lexforge/specs/web/mockups/login.css")).toBe("body { color: red; }");
    expect(written.map((file) => file.split(path.sep).join("/")).sort()).toEqual([
      "lexforge/specs/web/mockups/login.css",
      "lexforge/specs/web/mockups/login.html",
    ]);
  });

  it("copies the mockups of a nested capability", async () => {
    const { copyMockups } = await load();
    root = makeWorkspace({
      [`${CHANGE_SPECS}/platform/web/spec.md`]: "# platform/web\n",
      [`${CHANGE_SPECS}/platform/web/mockups/login.html`]: "<html>nested</html>",
    });

    const written = copyMockups(root, CHANGE);

    expect(read("lexforge/specs/platform/web/mockups/login.html")).toBe("<html>nested</html>");
    expect(written).toEqual(["lexforge/specs/platform/web/mockups/login.html"]);
  });

  it("copies nothing for a change without mockups", async () => {
    const { copyMockups } = await load();
    root = makeWorkspace({
      [`${CHANGE_SPECS}/web/spec.md`]: "# web\n",
    });

    expect(copyMockups(root, CHANGE)).toEqual([]);
  });
});
