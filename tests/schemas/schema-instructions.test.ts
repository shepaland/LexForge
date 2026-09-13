import { describe, expect, it } from "vitest";

import { loadSchema } from "../../src/core/schemas/load-schema.js";
import { normalizeWhitespace } from "./schema-fixtures.js";

// Каждый экстрактор ниже берёт абзац целиком - от опознающей фразы-начала до
// пустой строки в исходной инструкции (или до её конца), а не до угаданной
// фразы-конца. Прогон показал, зачем: предложение, дописанное в bounded
// после закрывающей фразы, но перед пустой строкой, оставалось невидимым
// регексу вида "нежадное начало...фраза-конец" - совпадение обрывалось на
// старой фразе-конце, и сравнение "слово в слово" со spec-driven проходило
// зелёным, хотя абзацы уже разошлись. Граница по пустой строке закрывает эту
// слепую зону: всё, что автор дописал в абзац, попадает в сравнение.
function paragraphs(instruction: string): string[] {
  return instruction
    .split(/\n\s*\n/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length > 0);
}

// bounded — source of all three paragraphs checked below: each one is cut out
// of bounded's own instruction at test time, so a wording edit to bounded
// cannot drift away from the constant silently.
function extractParagraph(schemaName: string, startsWith: string, label: string): string {
  const schema = loadSchema(schemaName);
  const tasksArtifact = schema.artifacts.find((artifact) => artifact.id === "tasks");
  expect(tasksArtifact?.instruction, schemaName).toBeDefined();

  const paragraph = paragraphs(tasksArtifact!.instruction as string).find((candidate) =>
    candidate.startsWith(startsWith),
  );
  // Пустое совпадение — самая опасная поломка: contains("") проходит для
  // любой строки, и тест зазеленеет, даже если абзац исчез из bounded.
  // Поэтому найденный абзац проверяется на непустоту отдельно.
  expect(paragraph, `${schemaName}: ${label} paragraph not found`).toBeDefined();
  expect(paragraph!.length, schemaName).toBeGreaterThan(0);

  return paragraph!;
}

function extractValidatedLabelParagraph(schemaName: string): string {
  const paragraph = extractParagraph(
    schemaName,
    "Give every task a group label",
    "group-label",
  );

  expect(paragraph, `${schemaName}: границы метки "one to eight" не найдены`).toContain(
    "one to eight",
  );

  const bracketExamples = paragraph.match(/\[[A-Za-z0-9-]+\]/g) ?? [];
  expect(
    bracketExamples.length,
    `${schemaName}: скобочный пример метки не найден`,
  ).toBeGreaterThanOrEqual(2);

  expect(
    paragraph,
    `${schemaName}: правило "TDD-триплет держится на одной метке" не найдено`,
  ).toMatch(/Keep a TDD triple.*same label/);

  return paragraph;
}

function extractValidatedIndexParagraph(schemaName: string): string {
  const paragraph = extractParagraph(schemaName, "tasks.md is an index", "index");

  expect(paragraph, `${schemaName}: "Depends on:" not named`).toContain("Depends on:");
  expect(paragraph, `${schemaName}: "one path segment below it" not named`).toContain(
    "one path segment below it",
  );

  return paragraph;
}

function extractValidatedMoveParagraph(schemaName: string): string {
  const paragraph = extractParagraph(
    schemaName,
    "A task that only carries existing code between files",
    "move-declaration",
  );

  expect(paragraph, `${schemaName}: "(move)" not named`).toContain("(move)");
  expect(paragraph, `${schemaName}: where the mark stands not named`).toContain("group label");
  expect(paragraph, `${schemaName}: "verify" not named`).toContain("`verify`");

  return paragraph;
}

describe("инструкция артефакта tasks встроенных схем", () => {
  it("инструкция артефакта tasks схемы bounded называет групповую метку", () => {
    const paragraph = extractValidatedLabelParagraph("bounded");

    expect(paragraph.length).toBeGreaterThan(0);
  });

  it("инструкция артефакта tasks схемы spec-driven называет групповую метку теми же словами, что и bounded", () => {
    const boundedParagraph = extractValidatedLabelParagraph("bounded");

    const schema = loadSchema("spec-driven");
    const tasksArtifact = schema.artifacts.find((artifact) => artifact.id === "tasks");
    expect(tasksArtifact?.instruction, "spec-driven").toBeDefined();

    const specDrivenInstruction = normalizeWhitespace(tasksArtifact!.instruction as string);
    expect(specDrivenInstruction, "spec-driven").toContain(boundedParagraph);
  });

  it("bounded's tasks instruction states tasks.md is an index, each section's file one path segment below it", () => {
    const paragraph = extractValidatedIndexParagraph("bounded");

    expect(paragraph.length).toBeGreaterThan(0);
  });

  it("spec-driven's tasks instruction states the same index rule, word for word as bounded", () => {
    const boundedParagraph = extractValidatedIndexParagraph("bounded");

    const schema = loadSchema("spec-driven");
    const tasksArtifact = schema.artifacts.find((artifact) => artifact.id === "tasks");
    expect(tasksArtifact?.instruction, "spec-driven").toBeDefined();

    const specDrivenInstruction = normalizeWhitespace(tasksArtifact!.instruction as string);
    expect(specDrivenInstruction, "spec-driven").toContain(boundedParagraph);
  });

  it("bounded's tasks instruction states the (move) declaration and where it stands", () => {
    const paragraph = extractValidatedMoveParagraph("bounded");

    expect(paragraph.length).toBeGreaterThan(0);
  });

  it("spec-driven's tasks instruction states the same move declaration, word for word as bounded", () => {
    const boundedParagraph = extractValidatedMoveParagraph("bounded");

    const schema = loadSchema("spec-driven");
    const tasksArtifact = schema.artifacts.find((artifact) => artifact.id === "tasks");
    expect(tasksArtifact?.instruction, "spec-driven").toBeDefined();

    const specDrivenInstruction = normalizeWhitespace(tasksArtifact!.instruction as string);
    expect(specDrivenInstruction, "spec-driven").toContain(boundedParagraph);
  });
});
