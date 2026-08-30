import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  normalizeLineEndings,
  readTextFile,
  splitTextLines,
} from "../../src/core/read-text.js";
import { makeWorkspace, removeWorkspace } from "../helpers/workspace.js";

describe("normalizeLineEndings", () => {
  it("оставляет текст с переводами Unix как был", () => {
    expect(normalizeLineEndings("a\nb\n")).toBe("a\nb\n");
  });

  it("приводит переводы Windows к переводам Unix", () => {
    expect(normalizeLineEndings("a\r\nb\r\n")).toBe("a\nb\n");
  });

  it("сводит к Unix смешанные переводы одного текста", () => {
    expect(normalizeLineEndings("a\r\nb\nc\r\n")).toBe("a\nb\nc\n");
  });

  it("не меняет числа строк", () => {
    expect(normalizeLineEndings("a\r\nb\nc").split("\n")).toHaveLength(3);
  });
});

describe("readTextFile", () => {
  let root = "";

  afterEach(() => {
    if (root !== "") {
      removeWorkspace(root);
      root = "";
    }
  });

  it("читает файл с переводами Windows так же, как файл с переводами Unix", () => {
    root = makeWorkspace({ "windows.md": "a\r\nb\r\n", "unix.md": "a\nb\n" });

    expect(readTextFile(path.join(root, "windows.md"))).toBe(
      readTextFile(path.join(root, "unix.md")),
    );
  });

  it("читает файл со смешанными переводами как текст с переводами Unix", () => {
    root = makeWorkspace({ "mixed.md": "a\r\nb\nc\r\n" });

    expect(readTextFile(path.join(root, "mixed.md"))).toBe("a\nb\nc\n");
  });
});

describe("splitTextLines", () => {
  it("делит текст с переводами Unix на строки", () => {
    expect(splitTextLines("a\nb\n")).toEqual(["a", "b", ""]);
  });

  it("не оставляет возврата каретки на конце строки", () => {
    expect(splitTextLines("a\r\nb\r\n")).toEqual(["a", "b", ""]);
  });

  it("даёт те же строки для смешанных переводов", () => {
    expect(splitTextLines("a\r\nb\nc")).toEqual(["a", "b", "c"]);
  });
});
