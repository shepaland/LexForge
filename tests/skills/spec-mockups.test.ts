import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { bodyOf, section } from "./helpers.js";

const LINKED = fileURLToPath(
  new URL("../../skills/lexforge-spec/mockups-and-contracts.md", import.meta.url),
);

function linkedText(): string {
  if (!existsSync(LINKED)) {
    // The cycle's red check matches a whole output line; print the message on
    // a line of its own as well as in the failure.
    const message = "The spec skill does not agree mockups";
    console.log(message);
    expect.fail(message);
  }
  return readFileSync(LINKED, "utf8").replace(/\s+/g, " ").toLowerCase();
}

describe("spec skill: mockups, classes and interaction contracts", () => {
  it("the Work section links mockups-and-contracts.md", () => {
    const work = section(bodyOf("lexforge-spec"), "Work");
    expect(work).toContain("mockups-and-contracts.md");
  });

  it("a screen requirement gets two routes and a wait for the choice", () => {
    const text = linkedText();
    expect(text).toMatch(/visual editor/);
    expect(text).toMatch(/html file with a separate css file/);
    expect(text).toMatch(/ascii mockup/);
    expect(text).toMatch(/wait for the (user's )?choice/);
  });

  it("an unknown project CSS is searched with styles find and saved with styles set", () => {
    const text = linkedText();
    expect(text).toMatch(/`ui\.styles`/);
    expect(text).toMatch(/where the project css lies/);
    expect(text).toMatch(/"i don't know"/);
    expect(text).toMatch(/`lexforge styles find`/);
    expect(text).toMatch(/exclude or add files/);
    expect(text).toMatch(/`lexforge styles set <path>\.\.\.`/);
  });

  it("a new or changed class is named and written only after a yes", () => {
    const text = linkedText();
    expect(text).toMatch(/name the class and its purpose/);
    expect(text).toContain("write the line only after a yes");
    expect(text).toMatch(/`new` or `changed`/);
  });

  it("an interaction requirement carries the line, the diagram and the contract", () => {
    const text = linkedText();
    expect(text).toMatch(/two or more participants/);
    expect(text).toMatch(/`interaction:` line/);
    expect(text).toMatch(/`sequence`/);
    expect(text).toMatch(/contract table/);
    expect(text).toMatch(/`length` for every `string` and `array` field/);
  });

  it("the excuse table quotes the recorded rationalizations word for word", () => {
    const text = linkedText();
    expect(text).toMatch(/\| excuse \| reality \|/);
    for (const quote of [
      "I trust your taste on the UI",
      "The user asked me not to wait",
      "Pick something sensible",
      "The user doesn't want to read file lists",
      "I kept the prose to one sentence",
    ]) {
      expect(text, quote).toContain(quote.toLowerCase());
    }
  });
});
