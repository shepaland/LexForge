import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  knownTools,
  toolDirectory,
  toolVendor,
} from "../../../src/core/init/tool-registry.js";

describe("toolDirectory", () => {
  it("на проектную область даёт каталог внутри проекта", () => {
    expect(toolDirectory("claude", "project")).toBe(path.join(".claude", "skills"));
  });

  it("на пользовательскую область даёт путь под домашним каталогом", () => {
    const directory = toolDirectory("claude", "user");

    expect(path.isAbsolute(directory)).toBe(true);
    expect(directory.endsWith(path.join(".claude", "skills"))).toBe(true);
  });
});

describe("toolDirectory, расходящиеся пути OpenCode", () => {
  it("в проекте это .opencode/skills, а у пользователя .config/opencode/skills", () => {
    expect(toolDirectory("opencode", "project")).toBe(path.join(".opencode", "skills"));
    expect(toolDirectory("opencode", "user")).toBe(
      path.join(os.homedir(), ".config", "opencode", "skills"),
    );
  });
});

describe("toolDirectory, домашний каталог параметром", () => {
  it("меняет пользовательский путь вслед за домашним каталогом и не трогает проектный", () => {
    const first = path.join(path.sep, "tmp", "home-one");
    const second = path.join(path.sep, "tmp", "home-two");

    expect(toolDirectory("claude", "user", first)).toBe(path.join(first, ".claude", "skills"));
    expect(toolDirectory("claude", "user", second)).toBe(path.join(second, ".claude", "skills"));
    expect(toolDirectory("claude", "project", first)).toBe(
      toolDirectory("claude", "project", second),
    );
  });
});

describe("knownTools", () => {
  it("перечисляет пять рантаймов в алфавитном порядке", () => {
    expect(knownTools()).toEqual(["agents", "claude", "codex", "cursor", "opencode"]);
  });
});

describe("toolVendor", () => {
  it("рантайм одного вендора называет своего провайдера", () => {
    expect(toolVendor("claude")).toBe("anthropic");
    expect(toolVendor("codex")).toBe("openai");
  });

  it("рантайм поверх нескольких вендоров своего провайдера не имеет", () => {
    expect(toolVendor("cursor")).toBe("");
    expect(toolVendor("opencode")).toBe("");
    expect(toolVendor("agents")).toBe("");
  });

  it("имя вне реестра провайдера не даёт", () => {
    expect(toolVendor("hermes")).toBe("");
    expect(toolVendor("constructor")).toBe("");
  });
});
