import { describe, expect, it } from "vitest";

import { bodyOf, section } from "./helpers.js";

describe("раздел 9: порог CRITICAL/IMPORTANT против MINOR", () => {
  it("CRITICAL и IMPORTANT останавливают архивацию в одном предложении", () => {
    const threshold = section(bodyOf("lexforge-verify"), "Levels and the threshold");
    // The first mention of each level is the opening list ("CRITICAL, IMPORTANT,
    // MINOR"); the sentence that decides what happens is the one after it.
    const importantIndex = threshold.indexOf("IMPORTANT", threshold.indexOf("IMPORTANT") + 1);

    expect(importantIndex).toBeGreaterThan(-1);

    const sentence = threshold.slice(Math.max(0, importantIndex - 100), importantIndex + 100);

    expect(sentence).toMatch(/CRITICAL/);
    expect(sentence.toLowerCase()).toMatch(/\bstops?\b|not archiv|does not archive/);
    // The old wording only asked to fix IMPORTANT first, with no word that blocks anything.
    expect(threshold.toLowerCase()).not.toContain("fixed first");
  });

  it("MINOR не останавливает архивацию, названо и записано в одном предложении", () => {
    const threshold = section(bodyOf("lexforge-verify"), "Levels and the threshold");
    const minorIndex = threshold.indexOf("MINOR", threshold.indexOf("MINOR") + 1);

    expect(minorIndex).toBeGreaterThan(-1);

    const sentence = threshold.slice(minorIndex, minorIndex + 220);
    const lower = sentence.toLowerCase();

    expect(lower).toMatch(/not stop|does not stop|no reason to stop/);
    expect(sentence).toMatch(/lexforge defect record/);
    // Both verbs stand, so recording never reads as a substitute for naming.
    expect(lower).toMatch(/\bname\b/);
    expect(lower).toMatch(/\brecord(ed|s)?\b/);
  });

  /** Verbs a paraphrase could use in place of «stop» to hold MINOR back. */
  const STOP_VERBS = [
    "stop",
    "stops",
    "block",
    "blocks",
    "hold up",
    "holds up",
    "hold",
    "holds",
    "halt",
    "halts",
    "prevent",
    "prevents",
    "pause",
    "pauses",
    "bar",
    "bars",
    "gate",
    "gates",
    "keep",
    "keeps",
  ];

  it("нигде в теле lexforge-verify MINOR не становится причиной остановки", () => {
    const body = bodyOf("lexforge-verify").toLowerCase();
    // Whole sentences, not a fixed character window: a synonym or a section move
    // must not let a MINOR-and-stop pairing slip past the check.
    const sentences = body.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      if (!/\bminor\b/.test(sentence)) {
        continue;
      }

      for (const verb of STOP_VERBS) {
        // A word boundary on both ends: "hold" must not match inside "threshold".
        const verbMatch = new RegExp(`\\b${verb.replace(" ", "\\s+")}\\b`).exec(sentence);
        if (!verbMatch) {
          continue;
        }

        const verbIndex = verbMatch.index;

        // The negation has to sit right against the verb - a "not" earlier in the
        // sentence, modifying some other word, does not launder the pair.
        const before = sentence.slice(Math.max(0, verbIndex - 12), verbIndex);
        expect(
          before,
          `«${verb}» рядом с MINOR стоит без отрицания у самого глагола: «${sentence.trim()}»`,
        ).toMatch(/\b(not|never|no|n't)\s*$/);
      }
    }
  });

  it("находка, которую сессия не чинит, попадает в lexforge defect record, а вердикт остаётся без файла", () => {
    const reportGoes = section(bodyOf("lexforge-verify"), "Where the report goes");
    const lower = reportGoes.toLowerCase();

    expect(reportGoes).toMatch(/lexforge defect record/);

    const fileIndex = lower.indexOf("file");
    expect(fileIndex, "раздел не упоминает файл вердикта").toBeGreaterThan(-1);

    const around = lower.slice(Math.max(0, fileIndex - 30), fileIndex + 10);
    expect(around).toMatch(/\bno\b/);
  });

  it("машинная половина называет пять измерений, среди них unrecordedTasks, и «one measure of five» в рационализации", () => {
    const machineHalf = section(bodyOf("lexforge-verify"), "The machine half");

    for (const dimension of [
      "openTasks",
      "requirementsWithoutTrace",
      "staleLabels",
      "openDefects",
      "unrecordedTasks",
    ]) {
      expect(machineHalf, `не называет ${dimension}`).toContain(`\`${dimension}\``);
    }

    const zeroIndex = machineHalf.indexOf("`0`");
    expect(zeroIndex).toBeGreaterThan(-1);

    const zeroSentence = machineHalf.slice(zeroIndex, zeroIndex + 120).toLowerCase();

    expect(zeroSentence).not.toMatch(/\bfour measures\b/);
    expect(zeroSentence).toMatch(/\bfive measures\b/);

    const rationalizations = section(bodyOf("lexforge-verify"), "Rationalizations").toLowerCase();

    expect(rationalizations).not.toMatch(/\bone measure of four\b/);
    expect(rationalizations).toMatch(/\bone measure of five\b/);
  });

  it("lexforge defect record не рядом с CRITICAL/IMPORTANT без отрицания между ними: запись не заменяет починку", () => {
    const lower = bodyOf("lexforge-verify").toLowerCase();

    for (const recordMatch of lower.matchAll(/lexforge defect record/g)) {
      const recordIndex = recordMatch.index!;

      for (const level of ["important", "critical"]) {
        const levelIndex = lower.lastIndexOf(level, recordIndex);
        if (levelIndex === -1) {
          continue;
        }

        const between = lower.slice(levelIndex, recordIndex);
        expect(
          between,
          `«${level}» стоит рядом с «lexforge defect record» без отрицания между ними`,
        ).toMatch(/\bnot\b/);
      }
    }
  });

  it("запись в lexforge defect record не читается как замена упоминания в отчёте", () => {
    const reportGoes = section(bodyOf("lexforge-verify"), "Where the report goes").toLowerCase();

    expect(reportGoes).not.toMatch(/instead of the report|in place of the report|rather than the report/);
  });

  it("lexforge-archive останавливает слияние на CRITICAL и IMPORTANT, но не на MINOR", () => {
    const rule = section(bodyOf("lexforge-archive"), "The rule");
    const lower = rule.toLowerCase();

    const importantIndex = lower.indexOf("important");
    expect(importantIndex, "IMPORTANT не названо в разделе «The rule»").toBeGreaterThan(-1);

    const minorIndex = lower.lastIndexOf("minor");
    expect(minorIndex, "MINOR не названо в разделе «The rule»").toBeGreaterThan(-1);

    const minorSentence = rule.slice(minorIndex, minorIndex + 100).toLowerCase();

    expect(minorSentence).toMatch(/merge|archiv/);
    expect(minorSentence).not.toMatch(/\bstop\b/);
  });
});

