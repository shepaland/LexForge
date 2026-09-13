import { describe, expect, it } from "vitest";

import { SHIPPED_PROVIDERS } from "../../src/core/models/catalogue.js";
import { readSkills, type SkillFile } from "../helpers/read-skills.js";
import {
  ALL_SKILLS,
  IMPLEMENTATION_SKILLS,
  PLANNING_SKILLS,
  QUEUE_RULE_START,
} from "./checks.js";
import {
  MODEL_BLOCK_END,
  MODEL_BLOCK_START,
  MODEL_GATE_START,
  checkModelBlockCatalogue,
  modelBlockEntries,
  readModelBlock,
  readModelGate,
} from "./model-checks.js";
import { SKILLS, only } from "./helpers.js";

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

