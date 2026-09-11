import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SHIPPED_PROVIDERS } from "../../src/core/models/catalogue.js";
import { readSkills, type SkillFile } from "../helpers/read-skills.js";
import {
  IMPLEMENTATION_SKILLS,
  MAX_BODY_WORDS,
  MAX_DESCRIPTION_CHARS,
  PLANNING_SKILLS,
  ALL_SKILLS,
  QUEUE_RULE_IMPLEMENTATION_SKILLS,
  GATE_ONLY_SKILLS,
  MODEL_BLOCK_END,
  MODEL_BLOCK_START,
  MODEL_GATE_END,
  MODEL_GATE_START,
  modelBlockEntries,
  checkModelBlockCatalogue,
  readModelBlock,
  QUEUE_RULE_START,
  checkSkillStructure,
  readModelGate,
  readQueueRule,
  type SkillFinding,
} from "./checks.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/skills-structure", import.meta.url));
const SKILLS = fileURLToPath(new URL("../../skills", import.meta.url));

function fixture(dir: string): SkillFile {
  const skill = readSkills(FIXTURES).find((entry) => entry.dir === dir);
  if (!skill) {
    throw new Error(`fixture ${dir} is missing`);
  }
  return skill;
}

function only(findings: SkillFinding[]): SkillFinding {
  expect(findings).toHaveLength(1);
  return findings[0]!;
}

describe("проверки структуры на фикстурах", () => {
  it("три поля во фронтматтере дают находку frontmatter-fields", () => {
    const finding = only(checkSkillStructure(fixture("three-fields")));

    expect(finding.rule).toBe("frontmatter-fields");
    expect(finding.message).toContain("three-fields/SKILL.md");
    expect(finding.message).toContain("version");
  });

  it("имя, разошедшееся с каталогом, даёт находку name-mismatch с обоими значениями", () => {
    const finding = only(checkSkillStructure(fixture("name-mismatch")));

    expect(finding.rule).toBe("name-mismatch");
    expect(finding.message).toContain("name-mismatch/SKILL.md");
    expect(finding.message).toContain("another-name");
  });

  it("описание не со слов Use when даёт находку description-opening", () => {
    const finding = only(checkSkillStructure(fixture("no-use-when")));

    expect(finding.rule).toBe("description-opening");
    expect(finding.message).toContain("no-use-when/SKILL.md");
    expect(finding.message).toContain("Use when");
  });

  it("описание длиннее предела даёт находку description-length с длиной", () => {
    const skill = fixture("long-description");
    const finding = only(checkSkillStructure(skill));

    expect(finding.rule).toBe("description-length");
    expect(finding.message).toContain("long-description/SKILL.md");
    expect(finding.message).toContain(String(MAX_DESCRIPTION_CHARS));
    expect(finding.message).toContain(String(`${skill.frontmatter.description}`.length));
  });

  it("тело длиннее предела даёт находку body-length с длиной", () => {
    const skill = fixture("long-body");
    const finding = only(checkSkillStructure(skill));

    expect(finding.rule).toBe("body-length");
    expect(finding.message).toContain("long-body/SKILL.md");
    expect(finding.message).toContain(String(MAX_BODY_WORDS));
    expect(finding.message).toContain(String(skill.body.split(/\s+/).filter(Boolean).length));
  });

  it("валидная фикстура находок не даёт", () => {
    expect(checkSkillStructure(fixture("minimal"))).toEqual([]);
  });

  it("фикстура с командой из будущего этапа проходит проверки структуры", () => {
    expect(checkSkillStructure(fixture("future-command"))).toEqual([]);
  });
});

describe("проверки структуры на каталоге skills", () => {
  it("ни один скилл не даёт находок", () => {
    const findings = readSkills(SKILLS).flatMap((skill) => checkSkillStructure(skill));

    expect(findings.map((finding) => finding.message)).toEqual([]);
  });

  it("в каталоге лежат девять скиллов: пять планирующих и четыре реализующих", () => {
    const dirs = readSkills(SKILLS).map((skill) => skill.dir);

    expect(dirs.slice().sort()).toEqual(
      [...PLANNING_SKILLS, ...IMPLEMENTATION_SKILLS].slice().sort(),
    );
  });
});

describe("скилл проектирования и шаблон design", () => {
  const NUMBER_WORDS = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
  ];

  it("называет столько разделов, сколько заголовков несёт шаблон", () => {
    const template = readFileSync(
      fileURLToPath(new URL("../../schemas/spec-driven/templates/design.md", import.meta.url)),
      "utf8",
    );
    const headings = template.match(/^## .+$/gm) ?? [];
    const skill = readSkills(SKILLS).find((entry) => entry.dir === "lexforge-design");

    expect(skill, "скилла lexforge-design нет в каталоге").toBeTruthy();
    expect(headings.length).toBeGreaterThan(0);

    // Разделы и ответы считаются вместе: ответ даётся на раздел, и число
    // у них одно. «one answer» — про один ответ, а не про их число, и в счёт
    // не идёт.
    const named = [...skill!.body.matchAll(/\b([a-z]+) (?:sections|answers)\b/g)]
      .map((match) => match[1]!)
      .filter((word) => word !== "one");

    expect(named.length).toBeGreaterThan(0);
    expect([...new Set(named)]).toEqual([NUMBER_WORDS[headings.length]]);
  });
});

describe("общий блок правила очереди", () => {
  function blocksOf(group: string[], dir = SKILLS): { dir: string; text: string | null }[] {
    const skills = readSkills(dir).filter((skill) => group.includes(skill.dir));
    const missing = group.filter((name) => !skills.some((skill) => skill.dir === name));

    expect(missing).toEqual([]);

    return skills.map((skill) => ({ dir: skill.dir, text: readQueueRule(skill) }));
  }

  function sharedText(group: string[], dir = SKILLS): string {
    const blocks = blocksOf(group, dir);

    expect(blocks.filter((block) => block.text === null).map((block) => block.dir)).toEqual([]);
    expect(blocks).toHaveLength(group.length);

    const first = blocks[0]!;
    // The list names the file: a skill left with the old text shows up by its directory.
    expect(blocks.filter((block) => block.text !== first.text).map((block) => block.dir)).toEqual(
      [],
    );

    return first.text!;
  }

  it("совпадает посимвольно у пяти скиллов планирования", () => {
    expect(sharedText(PLANNING_SKILLS)).toContain("Queue rule");
  });

  it("совпадает посимвольно у трёх скиллов реализации, работающих на change", () => {
    expect(sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS)).toContain("Queue rule");
  });

  it("у двух групп разный: планирование читает артефакт, реализация — весь план", () => {
    expect(sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS)).not.toBe(sharedText(PLANNING_SKILLS));
  });

  it("блок скилла отладки — это один модельный гейт: он работает и без рабочего пространства", () => {
    const skills = readSkills(SKILLS).filter((skill) => GATE_ONLY_SKILLS.includes(skill.dir));

    expect(skills).toHaveLength(GATE_ONLY_SKILLS.length);
    for (const skill of skills) {
      const block = readQueueRule(skill);
      const gate = readModelGate(skill);

      expect(block, `у скилла ${skill.dir} нет блока`).not.toBeNull();
      expect(gate, `у скилла ${skill.dir} нет гейта`).not.toBeNull();
      const withMarkers = `${MODEL_GATE_START}${gate!}${MODEL_GATE_END}`;

      expect(block!.replace(withMarkers, "").trim()).toBe("");
      expect(block).not.toContain("workspace-not-found");
    }
  });

  it("блок отладки не совпадает ни с планирующим, ни с реализующим", () => {
    const debugBlock = blocksOf(GATE_ONLY_SKILLS)[0]!.text;

    expect(debugBlock).not.toBe(sharedText(PLANNING_SKILLS));
    expect(debugBlock).not.toBe(sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS));
  });

  it("группы блока и каталог скиллов сходятся", () => {
    expect([...QUEUE_RULE_IMPLEMENTATION_SKILLS, ...GATE_ONLY_SKILLS].sort()).toEqual(
      IMPLEMENTATION_SKILLS.slice().sort(),
    );
  });

  /** Words that turn "the skill does it" back into "the skill offers, then waits". */
  const STALLING_WORDS = ["offer", "ask", "approve", "permission", "stop"];

  it("блок планирования чинит отсутствие рабочего пространства через init, не спрашивая и не останавливаясь", () => {
    const block = sharedText(PLANNING_SKILLS);
    const start = block.indexOf("workspace-not-found");
    const end = block.indexOf("change-not-found", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const clause = block.slice(start, end).toLowerCase();

    expect(clause).toContain("--tools");
    for (const word of STALLING_WORDS) {
      expect(clause, `«${word}» в предложении про workspace-not-found`).not.toMatch(
        new RegExp(`\\b${word}\\b`),
      );
    }
  });

  it("блок реализации чинит отсутствие рабочего пространства через init, не спрашивая и не останавливаясь", () => {
    const block = sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS);
    const start = block.indexOf("workspace-not-found");
    const end = block.indexOf("change-not-found", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const clause = block.slice(start, end).toLowerCase();

    expect(clause).toContain("--tools");
    for (const word of STALLING_WORDS) {
      expect(clause, `«${word}» в предложении про workspace-not-found`).not.toMatch(
        new RegExp(`\\b${word}\\b`),
      );
    }
  });

  it("после артефакта блок планирования выполняет nextStep сам и останавливается только на isPlanningComplete", () => {
    const block = sharedText(PLANNING_SKILLS);
    const index = block.indexOf("isPlanningComplete");

    expect(index).toBeGreaterThan(-1);

    const before = block.slice(Math.max(0, index - 400), index);
    const after = block.slice(index, index + 300);
    const handoff = (before + after).toLowerCase();

    // The command named in nextStep is run by the skill itself, not merely named for later.
    expect(before).toContain("nextStep");
    expect(before).toMatch(/\brun\b/i);
    for (const phrase of ["let the user", "tell the user"]) {
      expect(handoff, `«${phrase}» в передаче хода`).not.toContain(phrase);
    }

    // The stop is tied to isPlanningComplete being true, not to finishing one artifact.
    expect(after).toMatch(/`true`/);
    expect(before + after).toMatch(/\bstop\b/i);
  });

  /** Words that turn "run it yourself" back into "name it and wait for the user". */
  const HANDOFF_STALLING_WORDS = [
    "wait",
    "further",
    "answer",
    "permission",
    "stop",
    "tell the user",
    "let the user",
  ];

  it.each(["lexforge", "lexforge-propose", "lexforge-spec", "lexforge-design"])(
    "%s запускает свой nextStep сам, без слов ожидания рядом с ним",
    (dir) => {
      const skill = readSkills(SKILLS).find((entry) => entry.dir === dir)!;
      const index = skill.body.lastIndexOf("nextStep");

      expect(index).toBeGreaterThan(-1);

      const window = skill.body.slice(Math.max(0, index - 80), index + 40).toLowerCase();

      expect(window).toMatch(/\brun\b/);
      for (const word of HANDOFF_STALLING_WORDS) {
        expect(window, `«${word}» рядом с nextStep у ${dir}`).not.toContain(word);
      }
    },
  );

  it("общий блок планирования не отменяет вопрос, которого требует сам артефакт", () => {
    const block = sharedText(PLANNING_SKILLS);
    const carveOutIndex = block.toLowerCase().indexOf("handover between artifacts");

    expect(
      carveOutIndex,
      "блок не отличает вопрос артефакта от передачи хода между артефактами",
    ).toBeGreaterThan(-1);

    const before = block.slice(Math.max(0, carveOutIndex - 220), carveOutIndex).toLowerCase();

    expect(before).toMatch(/\bask/);
    expect(before).toMatch(/\bwait/);
  });

  it("блок реализации после init повторяет именно отказавшую команду, а не «carry on»", () => {
    const block = sharedText(QUEUE_RULE_IMPLEMENTATION_SKILLS).toLowerCase();
    const start = block.indexOf("workspace-not-found");
    const end = block.indexOf("change-not-found", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const clause = block.slice(start, end);

    expect(clause).toMatch(/refused/);
    expect(clause).not.toMatch(/\bcarry on\b/);
  });
});

describe("модельный гейт", () => {
  function gatesOf(group: string[]): { dir: string; text: string | null }[] {
    const skills = readSkills(SKILLS).filter((skill) => group.includes(skill.dir));

    expect(group.filter((name) => !skills.some((skill) => skill.dir === name))).toEqual([]);

    return skills.map((skill) => ({ dir: skill.dir, text: readModelGate(skill) }));
  }

  it("несут все девять скиллов", () => {
    const missing = gatesOf(ALL_SKILLS)
      .filter((gate) => gate.text === null)
      .map((gate) => gate.dir);

    expect(missing).toEqual([]);
  });

  it("совпадает посимвольно у всех девяти", () => {
    const gates = gatesOf(ALL_SKILLS);
    const first = gates[0]!;

    expect(gates.filter((gate) => gate.text !== first.text).map((gate) => gate.dir)).toEqual([]);
  });

  it("называет оба источника назначения, свою запись и обе развилки", () => {
    for (const { dir, text } of gatesOf(ALL_SKILLS)) {
      const gate = text ?? "";

      for (const part of ["instructions", "stages", "lexforge-", "subagent", "lexforge/config.yaml"]) {
        expect(gate, `гейт скилла ${dir} не называет «${part}»`).toContain(part);
      }
    }
  });

  it("не требует назначения там, где рабочего пространства и change нет", () => {
    for (const { dir, text } of gatesOf(ALL_SKILLS)) {
      expect(text ?? "", `гейт скилла ${dir} молчит о проекте без рабочего пространства`).toContain(
        "no workspace",
      );
    }
  });

  it("запрещает делать работу, а не только писать файл: три скилла файлов не пишут", () => {
    for (const { dir, text } of gatesOf(ALL_SKILLS)) {
      const gate = (text ?? "").toLowerCase();

      expect(gate, `гейт скилла ${dir} запрещает только запись файла`).toContain(
        "do none of it yourself",
      );
    }
  });

  it("рантайм в тексте гейта не назван: скиллы ставятся в пять разных", () => {
    for (const { dir, text } of gatesOf(ALL_SKILLS)) {
      const gate = (text ?? "").toLowerCase();

      for (const runtime of ["claude code", "codex", "cursor", "opencode", "task tool"]) {
        expect(gate, `гейт скилла ${dir} называет рантайм ${runtime}`).not.toContain(runtime);
      }
    }
  });
});

describe("блок модели в каждом скилле", () => {
  const SHIPPED = Object.keys(SHIPPED_PROVIDERS);

  it("восемь скиллов называют модель на каждого провайдера каталога", () => {
    for (const skill of readSkills(SKILLS)) {
      if (skill.dir === "lexforge-archive") {
        continue;
      }

      const entries = modelBlockEntries(skill);

      expect(Object.keys(entries).sort(), `скилл ${skill.dir} без блока модели`).toEqual(
        [...SHIPPED].sort(),
      );
      for (const provider of SHIPPED) {
        expect(entries[provider], `${skill.dir}: провайдер ${provider} без модели`).toBeTruthy();
      }
    }
  });

  it("каждый блок называет, что провайдер вне таблицы ничего не требует", () => {
    for (const skill of readSkills(SKILLS)) {
      if (skill.dir === "lexforge-archive") {
        continue;
      }

      expect(readModelBlock(skill), `скилл ${skill.dir}`).toMatch(
        /provider outside the table/i,
      );
    }
  });

  it("архивация модели не называет и говорит об этом", () => {
    const archive = readSkills(SKILLS).find((skill) => skill.dir === "lexforge-archive")!;
    const block = readModelBlock(archive);

    expect(block).not.toBeNull();
    expect(modelBlockEntries(archive)).toEqual({});
    expect(block).toMatch(/no model/i);
  });

  it("блок модели стоит перед очередью и перед гейтом", () => {
    for (const skill of readSkills(SKILLS)) {
      const block = skill.body.indexOf(MODEL_BLOCK_START);

      expect(block, `скилл ${skill.dir} без блока модели`).toBeGreaterThan(-1);
      expect(block).toBeLessThan(skill.body.indexOf(QUEUE_RULE_START));
      expect(block).toBeLessThan(skill.body.indexOf(MODEL_GATE_START));
    }
  });
});

describe("имена моделей в блоках и поставляемый каталог", () => {
  function skillWith(block: string): SkillFile {
    return {
      dir: "lexforge-probe",
      file: "/tmp/lexforge-probe/SKILL.md",
      frontmatter: { name: "lexforge-probe", description: "Use when probing" },
      body: `${MODEL_BLOCK_START}\n## Model\n\n${block}\n${MODEL_BLOCK_END}\n`,
    };
  }

  it("каждый скилл называет модели, которые каталог держит за их провайдером", () => {
    for (const skill of readSkills(SKILLS)) {
      expect(checkModelBlockCatalogue(skill), `скилл ${skill.dir}`).toEqual([]);
    }
  });

  it("модель не того провайдера даёт находку model-block-catalogue", () => {
    const finding = only(
      checkModelBlockCatalogue(
        skillWith("| Provider | Model |\n|---|---|\n| anthropic | gpt-5.6-sol |"),
      ),
    );

    expect(finding.rule).toBe("model-block-catalogue");
    expect(finding.message).toContain("gpt-5.6-sol");
  });

  it("провайдер вне каталога тоже даёт находку", () => {
    const finding = only(
      checkModelBlockCatalogue(
        skillWith("| Provider | Model |\n|---|---|\n| acme | acme-coder-2 |"),
      ),
    );

    expect(finding.rule).toBe("model-block-catalogue");
    expect(finding.message).toContain("acme");
  });
});

describe("модельный гейт после удаления ролей", () => {
  it("не называет роль ни в одном из девяти скиллов", () => {
    for (const skill of readSkills(SKILLS)) {
      expect(readModelGate(skill), `скилл ${skill.dir}`).not.toMatch(/\brole\b/i);
    }
  });

  it("отправляет пустое назначение к блоку модели скилла", () => {
    for (const skill of readSkills(SKILLS)) {
      expect(readModelGate(skill), `скилл ${skill.dir}`).toMatch(/model block/i);
    }
  });

  it("называет флаг рантайма в командах, которыми читает назначение", () => {
    for (const skill of readSkills(SKILLS)) {
      const gate = readModelGate(skill)!;

      if (gate.includes("lexforge status") || gate.includes("lexforge instructions")) {
        expect(gate, `скилл ${skill.dir}`).toContain("--tool");
      }
    }
  });
});

describe("правило выбора моделей по скиллам", () => {
  /** Planning and the completion check take the first model of a provider. */
  const FIRST_MODEL = [...PLANNING_SKILLS, "lexforge-verify"];
  /** The implementation loop and debugging take the second. */
  const SECOND_MODEL = ["lexforge-apply", "lexforge-debug"];

  function entriesOf(dir: string): Record<string, string> {
    return modelBlockEntries(readSkills(SKILLS).find((skill) => skill.dir === dir)!);
  }

  it("планирование и проверка завершения стоят на первой модели каждого провайдера", () => {
    for (const dir of FIRST_MODEL) {
      for (const [provider, models] of Object.entries(SHIPPED_PROVIDERS)) {
        expect(entriesOf(dir)[provider], `${dir}: провайдер ${provider}`).toBe(models[0]);
      }
    }
  });

  it("реализация и отладка стоят на второй модели каждого провайдера", () => {
    for (const dir of SECOND_MODEL) {
      for (const [provider, models] of Object.entries(SHIPPED_PROVIDERS)) {
        expect(entriesOf(dir)[provider], `${dir}: провайдер ${provider}`).toBe(models[1]);
      }
    }
  });

  it("архивация модели не называет", () => {
    expect(entriesOf("lexforge-archive")).toEqual({});
  });

  it("гейт несут все четыре, отладка — вместе со своим блоком", () => {
    for (const dir of IMPLEMENTATION_SKILLS) {
      const skill = readSkills(SKILLS).find((entry) => entry.dir === dir)!;

      expect(readModelGate(skill), dir).not.toBeNull();
    }
  });
});

describe("раздел 9: порог CRITICAL/IMPORTANT против MINOR", () => {
  function bodyOf(dir: string): string {
    return readSkills(SKILLS).find((entry) => entry.dir === dir)!.body;
  }

  /** The text of one `## Heading` section, up to the next `## `. */
  function section(body: string, heading: string): string {
    const start = body.indexOf(`## ${heading}`);
    expect(start, `раздел «${heading}» не найден`).toBeGreaterThan(-1);

    const next = body.indexOf("\n## ", start + 1);
    return next === -1 ? body.slice(start) : body.slice(start, next);
  }

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

  it("машинная половина называет четыре измерения, среди них openDefects", () => {
    const machineHalf = section(bodyOf("lexforge-verify"), "The machine half");

    for (const dimension of [
      "openTasks",
      "requirementsWithoutTrace",
      "staleLabels",
      "openDefects",
    ]) {
      expect(machineHalf, `не называет ${dimension}`).toContain(`\`${dimension}\``);
    }

    const zeroIndex = machineHalf.indexOf("`0`");
    expect(zeroIndex).toBeGreaterThan(-1);

    const zeroSentence = machineHalf.slice(zeroIndex, zeroIndex + 120).toLowerCase();

    expect(zeroSentence).not.toMatch(/\bthree measures\b/);
    expect(zeroSentence).toMatch(/\bfour measures\b/);
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

describe("раздел 10: параллельные секции в lexforge-apply", () => {
  function applyBody(): string {
    return readSkills(SKILLS).find((entry) => entry.dir === "lexforge-apply")!.body;
  }

  function reviewerPromptText(): string {
    const path = fileURLToPath(
      new URL("../../skills/lexforge-apply/reviewer-prompt.md", import.meta.url),
    );
    return readFileSync(path, "utf8");
  }

  function parallelExecutionText(): string {
    const path = fileURLToPath(
      new URL("../../skills/lexforge-apply/parallel-execution.md", import.meta.url),
    );
    // A source line wrap must not break a phrase match: collapse whitespace runs
    // (including a mid-sentence newline) down to a single space.
    return readFileSync(path, "utf8").replace(/\s+/g, " ");
  }

  /** The text of one `## Heading` section, up to the next `## `. */
  function pxSection(heading: string): string {
    const text = parallelExecutionText();
    const start = text.toLowerCase().indexOf(`## ${heading}`.toLowerCase());

    expect(start, `раздел «${heading}» не найден в parallel-execution.md`).toBeGreaterThan(-1);

    const next = text.indexOf("## ", start + 3);
    return (next === -1 ? text.slice(start) : text.slice(start, next)).toLowerCase();
  }

  it("тело lexforge-apply ссылается на parallel-execution.md", () => {
    expect(applyBody()).toMatch(/\[parallel-execution\.md\]\(parallel-execution\.md\)/);
  });

  it("IMPORTANT 2 (раунд 4): SKILL.md сам несёт «whether or not the change is already under way», не только сосед", () => {
    const lower = applyBody().toLowerCase().replace(/\s+/g, " ");
    const linkIndex = lower.indexOf("[parallel-execution.md](parallel-execution.md)");

    expect(linkIndex, "ссылка на parallel-execution.md не найдена в теле").toBeGreaterThan(-1);

    const sentence = lower.slice(linkIndex, linkIndex + 150);

    expect(sentence).toMatch(/before your first task/);
    expect(sentence).toMatch(/whether or not the change is already under way/);
  });

  it("MINOR из ревью попадает в lexforge defect record сейчас, а не в новую задачу плана потом", () => {
    const body = applyBody();
    const lower = body.toLowerCase();
    const minorIndex = lower.indexOf("minor");

    expect(minorIndex, "MINOR не названо в теле lexforge-apply").toBeGreaterThan(-1);

    const sentence = lower.slice(minorIndex, minorIndex + 200);

    expect(sentence).toMatch(/\bnow\b/);
    expect(sentence).toMatch(/lexforge defect record/);

    for (const phrase of [
      "numbered task",
      "fresh task",
      "new task",
      "for later",
      "needs no",
      "no need",
      "keep it in mind",
      "kept in mind",
    ]) {
      expect(sentence, `«${phrase}» рядом с MINOR ослабляет требование`).not.toContain(phrase);
    }
  });

  it("parallel-execution.md реально проверяет рантайм на исполнителей и на ревью до первой задачи", () => {
    const text = pxSection("The runtime check");

    expect(text).toMatch(/before your first task|before task 1/);
    expect(text).toMatch(/executor subagent/);
    expect(text).toMatch(/sequential/);
    // The decision above C2 (round 4), then 11.7-11.9: the check establishes
    // three things, not one.
    expect(text).toMatch(/establish three things/);
    expect(text).toMatch(/whether an executor of it can start a reviewer of its own/);

    const establishIndex = text.indexOf("establish");
    expect(establishIndex, "нет слова «establish»").toBeGreaterThan(-1);

    const around = text.slice(Math.max(0, establishIndex - 20), establishIndex + 20);
    expect(around).not.toMatch(/no need to|need not|not need to|no reason to/);

    for (const phrase of [
      "no need",
      "say nothing",
      "nothing either way",
      "skip the check",
      "optional",
    ]) {
      expect(text, `«${phrase}» рядом с проверкой рантайма`).not.toContain(phrase);
    }
  });

  it("МИНОР: «closed» определено там, где впервые используется, и это же слово применяется к зависимости", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(/a section is closed when every one of its checkboxes is marked/);

    // The dependency check uses the defined term, not an undefined synonym.
    const dependsIndex = section.indexOf("`depends on:` line names is");
    expect(dependsIndex, "предложение о зависимости не найдено").toBeGreaterThan(-1);
    expect(section.slice(dependsIndex, dependsIndex + 60)).toMatch(/is closed\b/);
  });

  it("раздел «A wave is every section ready at once» называет юнитом раздел словом и запрещает слияние", () => {
    const section = pxSection("A wave is every section ready at once");

    // MINOR 14: the unit is named, not just implied by the heading.
    expect(section).toMatch(/\bsection\b/);
    expect(section).toMatch(/their own executor agent|its own executor agent/);
    expect(section).toMatch(/never merged into one pass|not merged into one pass/);
    // The loop is enumerated, not just referenced by name.
    expect(section).toMatch(/test, red, implementation, green, review, checkbox/);

    for (const phrase of [
      "may be merged",
      "can be merged",
      "merged when",
      "one pass for",
      "merge them",
      "folded into a neighbour",
      "folded into one",
      "run as a pair",
      "may be folded",
      "may compress",
      "compress where",
    ]) {
      // Every banned phrase except the two the file itself uses to state the ban
      // ("folded into one", "run as a pair" appear right after "never merged" -
      // check them only outside that clause).
      if (phrase === "folded into one" || phrase === "run as a pair") {
        continue;
      }
      expect(section, `«${phrase}» разрешает слияние секций`).not.toContain(phrase);
    }
  });

  it("волна из одной секции без соседей выполняется сессией, без исполнителя, и это согласовано в двух местах", () => {
    const waveSection = pxSection("A wave is every section ready at once");
    const stampSection = pxSection("The checkbox and the stamp");

    // IMPORTANT 6 / CRITICAL 3: both places that talk about a lone section agree.
    expect(waveSection).toMatch(/no concurrent neighbour/);
    expect(waveSection).toMatch(/no executor agent is dispatched/);

    // MINOR: the stamp section's degenerate-wave wording covers "no parallel
    // neighbour" broadly - the same condition the wave section names.
    expect(stampSection).toMatch(/no section runs in parallel with another/);
  });

  it("IMPORTANT 10: ни одна секция не диспетчеризуется, пока текущая волна не закрылась штампом", () => {
    const waveSection = pxSection("A wave is every section ready at once");

    expect(waveSection).toMatch(/no section is dispatched until its own wave closes/);

    for (const phrase of ["joins the running wave", "dispatched immediately", "added to the wave"]) {
      expect(waveSection, `«${phrase}» досрочно диспетчеризует секцию`).not.toContain(phrase);
    }
  });

  it("CRITICAL 3 и 4: исполнителю передаются «Task order», «Past the delta» и запрет писать tasks.md", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section).toMatch(/the `lexforge-apply` rule, verbatim/);
    expect(section).toMatch(/"task order"/);
    expect(section).toMatch(/"past the delta"/);
    expect(section).toMatch(/"review before the checkbox"/);

    // CRITICAL 4: the prohibition sits inside what is handed over, not only in
    // prose addressed to the dispatcher. The old "Read only" analogy is gone
    // (MINOR) - the gloss it was replaced with is checked instead.
    expect(section).toMatch(/never touches\s*`?tasks\.md`? itself/);
    expect(section).toMatch(/the loop's last step is not the checkbox but that/);
    expect(section).not.toMatch(/read only\. do not edit the working tree/);

    // IMPORTANT 6: an executor dispatches reviewers only, never a further executor.
    expect(section).toMatch(/dispatches reviewers only, never a further executor/);

    // MINOR 2 (round 4): the gloss sits close to where "Task order" is named,
    // not forty words later where an executor following the verbatim text
    // could already have recomputed a wave.
    const taskOrderIndex = section.indexOf('"task order"');
    const dispatchesIndex = section.indexOf("dispatches reviewers only");
    expect(taskOrderIndex).toBeGreaterThan(-1);
    expect(dispatchesIndex).toBeGreaterThan(-1);
    expect(dispatchesIndex - taskOrderIndex).toBeLessThan(300);

    for (const phrase of [
      "the section's tasks and nothing else",
      "only the section's tasks",
      "just the section's tasks",
      "a summary of the",
    ]) {
      expect(section, `«${phrase}» урезает то, что передаётся исполнителю`).not.toContain(phrase);
    }
  });

  it("IMPORTANT 1: модель исполнителя названа явно — stages.apply из lexforge status", () => {
    const section = pxSection("What a dispatched agent is handed");
    const modelIndex = section.indexOf("the model");

    expect(modelIndex, "предложение о модели не найдено").toBeGreaterThan(-1);

    const sentence = section.slice(modelIndex, modelIndex + 220);

    expect(sentence).toMatch(/stages\.apply/);
    expect(sentence).toMatch(/lexforge status --change <name> --tool <your runtime> --json/);

    for (const phrase of ["nearest model", "a model it can reach", "any model"]) {
      expect(sentence, `«${phrase}» не называет модель явно`).not.toContain(phrase);
    }
  });

  it("IMPORTANT 4 и 5: исполнитель не коммитит и гоняет только свои проверки, не весь набор", () => {
    const section = pxSection("What a dispatched agent is handed");

    expect(section).toMatch(/it commits nothing/);
    expect(section).toMatch(/it runs only the checks its own tasks name, never the whole suite/);

    for (const phrase of ["runs the whole suite", "the full test suite", "commits its own work"]) {
      expect(section, `«${phrase}» стирает границу между исполнителем и волной`).not.toContain(
        phrase,
      );
    }
  });

  it("CRITICAL 5 / решение о ревью: исполнитель без ревьюера делает одну задачу и возвращается", () => {
    const reviewSection = pxSection("Whether an executor can review itself");
    const stampSection = pxSection("The checkbox and the stamp");

    // The runtime check above already establishes this; this section acts on it.
    expect(reviewSection).toMatch(/the runtime check above also establishes/);

    // Can review: works the whole section itself, one report with one entry per task.
    expect(reviewSection).toMatch(/where it can:/);
    expect(reviewSection).toMatch(/one task at a time/);
    expect(reviewSection).toMatch(/one entry per task/);

    // Cannot review: one task per round trip - the decision handed down this round.
    expect(reviewSection).toMatch(/where it cannot:/);
    expect(reviewSection).toMatch(/carries out one task only and returns/);
    // IMPORTANT 3 (round 4): the ordering word IS the decision - the checkbox
    // is marked before the next dispatch, not merely "soon after" it.
    expect(reviewSection).toMatch(
      /marks its checkbox before dispatching the executor again for\s*the next task/,
    );
    expect(reviewSection).toMatch(/no task is written on top of a task nobody has reviewed/);

    // MINOR 1 (round 4): "reviews that task itself" reads as "in its own
    // head" - SKILL.md itself bans reading your own diff as review. Say it
    // sends the task to a reviewer, not that it reviews it.
    expect(reviewSection).toMatch(/sends that task to a reviewer itself, with the brief in/);
    expect(reviewSection).not.toMatch(/reviews that task itself/);

    // IMPORTANT 7: the outcome of a CRITICAL/IMPORTANT the dispatcher's own
    // review finds is named, not left open.
    expect(reviewSection).toMatch(/a critical or an important the\s*dispatcher's own review finds/);
    expect(reviewSection).toMatch(/run watched fail first/);
    expect(reviewSection).toMatch(/the task is struck/);

    for (const phrase of [
      "that section's review",
      "a single review",
      "the whole section's review",
      "returns every task of its section unreviewed",
    ]) {
      expect(reviewSection, `«${phrase}» сворачивает ревью с задачи до раздела`).not.toContain(
        phrase,
      );
    }

    // The report itself: per task, not a single verdict for N tasks.
    expect(stampSection).toMatch(/whether one report covers a whole\s*section or one task, it carries, per task/);
    expect(stampSection).toMatch(/the dispatching skill reads a valid entry and ticks that task's box/);
    expect(stampSection).not.toMatch(/one verdict/);
  });

  it("11.7: рантайм без единого агента не даёт ревьюера — ни одна галочка без ревью, и есть два законных выхода", () => {
    const runtimeSection = pxSection("The runtime check");
    const reviewSection = pxSection("Whether an executor can review itself");

    // The check's own paragraph now says three things, not two.
    expect(runtimeSection).toMatch(/establish three things/);
    expect(runtimeSection).toMatch(/reach any agent at all/);
    expect(runtimeSection).toMatch(/say all three/);

    // Positive: the third case is named, said before the first task, and no
    // checkbox closes on it.
    expect(reviewSection).toMatch(/can reach no agent at all/);

    const sayIndex = reviewSection.indexOf("say so before the first task");
    expect(sayIndex, "нет предложения «say so before the first task»").toBeGreaterThan(-1);
    const sayBefore = reviewSection.slice(Math.max(0, sayIndex - 30), sayIndex);
    // "no need to", "no call to", "not required to" and the like all shrink
    // to the same shape right before the anchor - ban the shape, not a fixed
    // list a future rewording can dodge by picking an untried noun.
    expect(sayBefore).not.toMatch(/\b(no|not)\s+\S+\s+to\s*$/);
    expect(sayBefore).not.toMatch(/need not/);

    // "No checkbox is marked" has to carry its own consequence, not just the
    // bare word "no" somewhere nearby - the anchor phrase contains "no"
    // itself, so a window check for /\bno\b/ around it can never go red
    // while the anchor phrase stands, however the sentence around it reads.
    expect(reviewSection).toContain("no checkbox is marked without a review behind it");

    // Reading your own diff does not stand in for a review, pinned whole -
    // and no permissive modal is allowed to sit in front of the clause
    // either, since "may stand in for" keeps every matched word while
    // reversing what the sentence permits.
    expect(reviewSection).toContain("does not stand in for");
    expect(reviewSection).not.toMatch(/\b(may|can|will|could)\s+stand in for/);

    // Ordering: the two ways out and the wait for the user's answer come
    // after the stand-in-for clause in the text, not folded in before it and
    // not dropped - a rewrite that states the clause and then never asks the
    // user anything still has an anchor to find but no sequence behind it.
    const standsInIndex = reviewSection.indexOf("does not stand in for");
    const waitIndex = reviewSection.indexOf("wait for their answer");
    expect(waitIndex, "нет ожидания ответа пользователя").toBeGreaterThan(standsInIndex);

    // Two lawful ways out, both named, and they go to the user.
    expect(reviewSection).toMatch(/make a reviewer reachable/);
    expect(reviewSection).toMatch(/strike (that task|the task) from the plan with (their|the user's) word/);

    // "Strike" names no object the plan holds by itself - a live run read it
    // as striking the review requirement and keeping the work, unreviewed.
    // The clause has to say what struck means, in terms of the task and its
    // work, not leave the reader to guess.
    expect(reviewSection).toContain(
      "struck means the task is dropped and its work with it",
    );

    // The clause names the misreading only to rule it out - pinned whole, so
    // the negation has to sit directly against it rather than merely
    // somewhere in the same sentence.
    expect(reviewSection).toContain(
      "never that the work stands and the review is waived",
    );

    for (const phrase of [
      "tick anyway",
      "close it anyway",
      "does stand in",
      "may stand in",
      "can stand in",
      "will stand in",
      "proceed with the work as it stands",
      "the work as it stands - unreviewed",
      "strike the review requirement",
      "counts as a review",
      "continue without a reviewer",
      "one lawful way",
      "no call to say so",
      "no need to say so",
      "not required to say so",
    ]) {
      expect(reviewSection, `«${phrase}» разрешает то, что раздел запрещает`).not.toContain(phrase);
    }
  });

  it("C1: отчёт несёт цитату упавшей строки, и запись без неё не считается зелёной", () => {
    const stampSection = pxSection("The checkbox and the stamp");

    // MINOR 3 (round 4): pin the whole clause, not a list of guessed
    // qualifiers - a future qualifier the list did not anticipate must still
    // fail this the same way "which the executor may compress" did.
    expect(stampSection).toMatch(
      /the failing line of the run it watched fail, quoted, the command that confirmed it/,
    );
    expect(stampSection).toMatch(/an entry with no quoted failure is not a green entry/);
    expect(stampSection).toMatch(/send it back, or run that task in this session/);
  });

  it("IMPORTANT 4: отчёт несёт диафф файлов задачи и команду подтверждения — не диапазон коммитов", () => {
    const stampSection = pxSection("The checkbox and the stamp");

    expect(stampSection).toMatch(/the diff of the files that task names/);
    expect(stampSection).toMatch(/command that confirmed it/);
    expect(stampSection).not.toMatch(/commit range/);
  });

  it("старый C3: исполнитель нигде не описан как тот, кто сам ставит галочки в tasks.md", () => {
    const stampSection = pxSection("The checkbox and the stamp");

    expect(stampSection).toMatch(/executor never edits `?tasks\.md`?/);
    expect(stampSection).not.toMatch(/executor ticks/);
    expect(stampSection).not.toMatch(/ticks its own box/);
  });

  it("CRITICAL 1 / IMPORTANT 8: красная секция читается сразу, тикаются все её зелёные задачи, не только целиком чистая секция", () => {
    const section = pxSection("One executor comes back red while others are still running");

    // Positive framing, not "hold everything until told otherwise".
    expect(section).toMatch(/its report is still read right away, the same as any other/);
    expect(section).toMatch(/each task in it whose own entry shows a green run/);
    expect(section).toMatch(/whichever section it came from/);
    expect(section).toMatch(/dispatch no further section/);
    expect(section).toMatch(/let the executors still running finish/);

    for (const phrase of [
      "close nothing yet",
      "hold the ticks",
      "wait to tick",
      "dispatch the remaining",
      "already came back clean",
    ]) {
      expect(section, `«${phrase}» откладывает то, что уже должно случиться`).not.toContain(phrase);
    }
  });

  it("IMPORTANT 9: код возврата `1` назван по команде — lexforge evidence record, а не безымянный красный запуск", () => {
    const section = pxSection("A red stamp");

    expect(section).toMatch(/exit code of `1` from `lexforge evidence record`/);
    expect(section).toMatch(/dispatch no further section/);
    expect(section).toMatch(/checkboxes already marked.*stay marked/);
  });

  it("МИНОР 13: волна не останавливается «anyway» — положительное утверждение плюс узкий запрет", () => {
    const stampSection = pxSection("The checkbox and the stamp");
    const failSection = pxSection("One executor comes back red while others are still running");

    // Positive: the stamp command follows sections coming back, never being dispatched.
    expect(stampSection).toMatch(/has come back/);
    expect(stampSection).not.toMatch(/once the wave is dispatched/);

    // Narrow ban: the specific inversion the reviewer used, not the whole word.
    expect(failSection + stampSection).not.toMatch(/sections? anyway/);

    for (const phrase of [
      "may run `lexforge evidence record`",
      "can run `lexforge evidence record`",
    ]) {
      expect(stampSection, `«${phrase}» разрешает то, что раздел запрещает`).not.toContain(phrase);
    }

    expect(stampSection).toMatch(/executor agent does not run `lexforge evidence record`/);
  });

  it("тело lexforge-apply держит штамп на волновой границе — не на границе задачи, и не откатывается к пустой клетке", () => {
    // A source line wrap must not break a phrase match.
    const body = applyBody().toLowerCase().replace(/\s+/g, " ");
    const runIndex = body.indexOf("lexforge evidence record --change <name> --label tests");

    expect(runIndex, "команда штампа не найдена в теле").toBeGreaterThan(-1);

    const after = body.slice(runIndex, runIndex + 90);

    // CRITICAL 2: "wave boundary", not "task boundary".
    expect(after).toMatch(/wave boundary/);
    expect(after).not.toMatch(/task boundary/);

    const exitIndex = body.indexOf("exit `1`");
    expect(exitIndex).toBeGreaterThan(-1);

    const exitSentence = body.slice(exitIndex, exitIndex + 120);

    // Old-round C2: reverting to "the box stays empty" must fail.
    expect(exitSentence).toMatch(/ticked boxes stay ticked/);
    expect(exitSentence).not.toMatch(/box stays empty/);
  });

  it("IMPORTANT 7 (2й раунд) / IMPORTANT 3 (3й раунд): бриф сужает диафф до файлов именно этой задачи", () => {
    const text = reviewerPromptText();

    expect(text).toMatch(/\[FILES\]/);
    expect(text).toMatch(/git diff --stat \[BASE_SHA\]\.\.\[HEAD_SHA\] -- \[FILES\]/);
    expect(text).toMatch(/git diff \[BASE_SHA\]\.\.\[HEAD_SHA\] -- \[FILES\]/);

    const filesRowIndex = text.indexOf("`[FILES]`");
    expect(filesRowIndex, "строка [FILES] не найдена в таблице").toBeGreaterThan(-1);

    const filesRow = text.slice(filesRowIndex, text.indexOf("\n", filesRowIndex));

    // [FILES] must scope to this task, not the whole section it lives in -
    // otherwise a reviewer of task 4.1 is handed 4.2-4.5's diff as in scope.
    expect(filesRow).toMatch(/this task itself names|this task names/);
    expect(filesRow).not.toMatch(/section names/);
  });

  it("CRITICAL (раунд 4): бриф несёт форму без коммита — WORKTREE — раз исполнитель не коммитит", () => {
    const text = reviewerPromptText();
    const lower = text.toLowerCase();

    expect(text).toMatch(/`WORKTREE`/);
    expect(lower).toMatch(/uncommitted work is the normal case under a wave/);

    // Both diff forms are present in the fenced brief - a commit range and a
    // worktree-only form - so the reviewer is never handed a range with
    // nothing in it.
    expect(text).toMatch(/git diff --stat -- \[FILES\]/);
    expect(text).toMatch(/git diff -- \[FILES\]/);

    for (const phrase of ["can hold a neighbouring section's work"]) {
      expect(lower, `«${phrase}» неверно описывает диапазон без коммита`).not.toContain(
        phrase.toLowerCase(),
      );
    }
  });

  it("IMPORTANT 1 (раунд 4): бриф называет отправителя условно — исполнитель шлёт его, только если сам может дать ревьюера", () => {
    // A source line wrap must not break a phrase match.
    const lower = reviewerPromptText().toLowerCase().replace(/\s+/g, " ");

    expect(lower).toMatch(
      /an executor dispatched for a section where an executor of this runtime can start a reviewer of its own/,
    );
    expect(lower).toMatch(/otherwise the dispatching skill sends it once that executor's task comes back/);
  });
});
