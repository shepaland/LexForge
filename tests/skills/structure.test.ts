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
  PLANNING_SKILLS,
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
