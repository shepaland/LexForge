import path from "node:path";

import { describe, expect, it } from "vitest";

import { manifestPath, readManifest, renderManifest } from "../../../src/core/init/install-manifest.js";

const MANIFEST = {
  version: "1.0.0",
  installedAt: "2026-08-29T10:00:00.000Z",
  tool: "claude",
  scope: "project" as const,
  files: ["lexforge/SKILL.md", "lexforge-plan/SKILL.md"],
};

describe("renderManifest", () => {
  it("даёт документ JSON с версией, временем, инструментом, областью и файлами", () => {
    const text = renderManifest(MANIFEST);
    const data = JSON.parse(text) as Record<string, unknown>;

    expect(data.version).toBe("1.0.0");
    expect(data.installedAt).toBe("2026-08-29T10:00:00.000Z");
    expect(data.tool).toBe("claude");
    expect(data.scope).toBe("project");
    expect(data.files).toEqual(["lexforge/SKILL.md", "lexforge-plan/SKILL.md"]);
  });

  it("заканчивается переводом строки, чтобы файл читался построчно", () => {
    expect(renderManifest(MANIFEST).endsWith("\n")).toBe(true);
  });
});

describe("readManifest", () => {
  it("разбирает документ, записанный renderManifest", () => {
    expect(readManifest(renderManifest(MANIFEST))).toEqual(MANIFEST);
  });

  it("на битом JSON отдаёт пустой результат вместо исключения", () => {
    expect(readManifest("{ files: [")).toBeUndefined();
  });

  it("на документе без списка файлов отдаёт пустой результат", () => {
    const text = JSON.stringify({ ...MANIFEST, files: undefined });

    expect(readManifest(text)).toBeUndefined();
  });

  it("на чужой области отдаёт пустой результат", () => {
    const text = JSON.stringify({ ...MANIFEST, scope: "global" });

    expect(readManifest(text)).toBeUndefined();
  });
});

describe("manifestPath", () => {
  it("кладёт файл рядом с каталогом скиллов, а не внутрь него", () => {
    const skillsDir = path.join(path.sep, "project", ".claude", "skills");

    expect(manifestPath(skillsDir)).toBe(
      path.join(path.sep, "project", ".claude", "lexforge-install.json"),
    );
  });

  it("не зависит от завершающего разделителя в пути каталога", () => {
    const skillsDir = path.join(path.sep, "home", ".config", "opencode", "skills");

    expect(manifestPath(`${skillsDir}${path.sep}`)).toBe(manifestPath(skillsDir));
  });
});

describe("список файлов манифеста", () => {
  it("хранит пути относительно каталога скиллов", () => {
    const skillsDir = path.join(path.sep, "project", ".claude", "skills");
    const written = [
      path.join(skillsDir, "lexforge", "SKILL.md"),
      path.join(skillsDir, "lexforge-apply", "reviewer-prompt.md"),
    ];

    const text = renderManifest({
      ...MANIFEST,
      files: written.map((file) => path.relative(skillsDir, file)),
    });
    const data = JSON.parse(text) as { files: string[] };

    expect(data.files).toEqual([
      "lexforge/SKILL.md",
      "lexforge-apply/reviewer-prompt.md",
    ]);
  });

  it("записывает разделитель прямой косой чертой, каким бы он ни пришёл", () => {
    const text = renderManifest({ ...MANIFEST, files: ["lexforge-plan\\SKILL.md"] });
    const data = JSON.parse(text) as { files: string[] };

    expect(data.files).toEqual(["lexforge-plan/SKILL.md"]);
    for (const file of data.files) {
      expect(file.startsWith("/")).toBe(false);
    }
  });
});
