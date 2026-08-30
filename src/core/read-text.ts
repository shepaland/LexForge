import { readFileSync } from "node:fs";

/**
 * Brings the line endings of a text to `\n`. Parsing reads a file line by line
 * and matches headings with patterns that end at `$`, and a dot in a JavaScript
 * pattern does not cover a carriage return: a line left with `\r` on its end
 * after `split("\n")` matches nothing, and the block under it silently
 * disappears. Normalising on the way in leaves no such line inside the parser.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Reads a text file the way every artifact of a change is read: the answer of a
 * command must not depend on the editor the file was written in.
 */
export function readTextFile(filePath: string): string {
  return normalizeLineEndings(readFileSync(filePath, "utf8"));
}

/**
 * Splits a text into the lines a parser walks. Every parser of an artifact goes
 * through this one function, so no pattern of its own has to know about `\r`.
 */
export function splitTextLines(text: string): string[] {
  return normalizeLineEndings(text).split("\n");
}
