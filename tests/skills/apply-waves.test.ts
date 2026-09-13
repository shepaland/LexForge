import { describe, expect, it } from "vitest";

import { parallelExecutionText, pxSection, reviewerPromptText } from "./helpers.js";

describe("A wave is every section ready at once: dispatch by group label", () => {
  it("reads the group labels of a ready section and dispatches one executor per label, concurrently", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(
      /reads the group labels of (?:the|a ready) section and dispatches one executor per distinct label, concurrently\./,
    );
  });

  it("each group's executor works its own tasks through test, implementation, and the green run, then stops and returns to the session - it starts no agent", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(
      /each group's executor works its own tasks through test, the failure watched and recorded, the implementation, and the green run - and there it stops: it starts no agent, and it returns its result to the session\./,
    );
  });

  it("the session dispatches the reviewer for that group's work as its own agent and ticks that group's boxes", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(
      /the session dispatches the reviewer for that group's work as its own agent, closes what the review finds, and ticks that group's boxes\./,
    );
  });

  it("a section whose tasks all carry one label is one executor, exactly as a section with no concurrent neighbour is today", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(
      /a section whose tasks all carry one label is one executor, exactly as a section with no concurrent neighbour is today/,
    );
  });

  it("two groups of one section are never merged into one pass, folded into one executor, or run as a pair, whatever their size", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(
      /two groups of one section are never merged into one pass, folded into one executor, or run as a pair, whatever their size/,
    );
  });

  it("an executor dispatched for a group touches no task carrying a different label", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(/an executor dispatched for a group touches no task carrying a different label\./);
  });

  it("the wave boundary and its stamp stay where they are, taken once after every group of the wave has come back", () => {
    const section = pxSection("A wave is every section ready at once");

    expect(section).toMatch(
      /the wave boundary and its stamp stay where they are[^.]*taken once, after every group of the wave has come back, never after one group of a still-running section/,
    );
  });
});

describe("раздел 10: параллельные секции в lexforge-apply — диспетчеризация исполнителя и решение о ревью", () => {
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

    // IMPORTANT 6 (round 5): an executor starts no agent at all, reviewer
    // included - the session dispatches the reviewer instead.
    expect(section).toMatch(
      /the executor starts no agent over\s+it: not a further executor, not a reviewer/,
    );
    expect(section).toMatch(/it returns to the session, which dispatches the reviewer/);
    expect(section).not.toMatch(/dispatches reviewers only, never a further executor/);

    // MINOR 2 (round 4): the gloss sits close to where "Task order" is named,
    // not forty words later where an executor following the verbatim text
    // could already have recomputed a wave.
    const taskOrderIndex = section.indexOf('"task order"');
    const startsNoAgentIndex = section.indexOf("the executor starts no agent");
    expect(taskOrderIndex).toBeGreaterThan(-1);
    expect(startsNoAgentIndex).toBeGreaterThan(-1);
    expect(startsNoAgentIndex - taskOrderIndex).toBeLessThan(300);

    for (const phrase of [
      "the section's tasks and nothing else",
      "only the section's tasks",
      "just the section's tasks",
      "a summary of the",
    ]) {
      expect(section, `«${phrase}» урезает то, что передаётся исполнителю`).not.toContain(phrase);
    }

    // Task 6.9: an executor no longer sends the reviewer brief itself - the
    // session does, so the list of what a dispatched agent is handed no
    // longer names reviewer-prompt.md.
    expect(section, "«reviewer-prompt.md» больше не входит в список того, что передаётся исполнителю").not.toContain(
      "reviewer-prompt.md",
    );
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

  it("CRITICAL 5 / 11.7 (сняты повторной проверкой): раздел «Whether an executor can review itself» удалён — рантайм больше не решает, кто шлёт ревьюера", () => {
    // The runtime-dependent review branch this section used to hold is gone
    // in full: whatever the runtime can reach, the executor never dispatches
    // a reviewer of its own (see "раздел 11" above) - the session always
    // does, so there is no longer a "where it can / where it cannot" split
    // to test. The section's heading itself is asserted absent, pinned
    // against the two headings either side of it so a rename that keeps the
    // banned words in a different shape still fails.
    const text = parallelExecutionText().toLowerCase();
    const mayStartIndex = text.indexOf("## what an executor may start");
    const stampIndex = text.indexOf("## the checkbox and the stamp");

    expect(mayStartIndex, "«What an executor may start» не найден").toBeGreaterThan(-1);
    expect(stampIndex, "«The checkbox and the stamp» не найден").toBeGreaterThan(-1);

    const between = text.slice(mayStartIndex, stampIndex);

    expect(between).not.toContain("whether an executor can review itself");
    expect(between).not.toContain("where it can:");
    expect(between).not.toContain("where it cannot:");
    expect(between).not.toContain("can reach no agent at all");

    for (const phrase of [
      "tick anyway",
      "close it anyway",
      "counts as a review",
      "continue without a reviewer",
    ]) {
      expect(between, `«${phrase}» — остаток снятой ветки ревью`).not.toContain(phrase);
    }
  });

  it("11.7 (сужено до двух ответов): «The runtime check» больше не спрашивает, может ли исполнитель сам запустить ревьюера", () => {
    const runtimeSection = pxSection("The runtime check");

    // The check now establishes two things, not three - the middle question
    // is gone because the answer is now the same on every runtime: no.
    expect(runtimeSection).toMatch(/establish two things:/);
    expect(runtimeSection).toMatch(/whether your runtime can start executor subagents/);
    expect(runtimeSection).toMatch(/whether it can reach any agent at all\./);
    expect(runtimeSection).toMatch(/say both, either way, not only on a good outcome\./);

    for (const phrase of [
      "establish three things",
      "say all three",
      "start a reviewer of its own",
      "can start a reviewer",
    ]) {
      expect(runtimeSection, `«${phrase}» — снятый вопрос ещё жив в «The runtime check»`).not.toContain(
        phrase,
      );
    }
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

  it("IMPORTANT 1 (раунд 5): бриф называет единственного отправителя — сессию, не исполнителя условно", () => {
    // A source line wrap must not break a phrase match.
    const lower = reviewerPromptText().toLowerCase().replace(/\s+/g, " ");

    expect(lower).toMatch(
      /the sender is the session that read the plan: an executor starts no agent of any kind, so it never sends this brief itself\./,
    );

    for (const phrase of [
      "an executor dispatched for a section where an executor of this runtime can start a reviewer of its own",
      "otherwise the dispatching skill sends it once that executor's task comes back",
    ]) {
      expect(lower, `«${phrase}» — снятая ветка условной отправки ещё жива`).not.toContain(phrase);
    }
  });

  it("IMPORTANT (round 6): «The runtime check» restores the two lawful ways out where no agent can be reached, for the session", () => {
    const runtimeSection = pxSection("The runtime check");

    expect(runtimeSection).toMatch(
      /the session works the first task through the loop itself, up to green, and stops there at its review, unmarked\./,
    );
    expect(runtimeSection).toMatch(
      /it offers the user two lawful ways out - make a reviewer reachable, or strike that task from the plan in the user's own words - and waits for their answer before opening anything else\./,
    );
  });
});

describe("6.13: The cycle - the session dispatches one executor per TDD triple", () => {
  it("states the cycle: one executor per triple, its return, the session's own review dispatch, the boxes, and the next executor only after", () => {
    const section = pxSection("The cycle");

    expect(section).toMatch(
      /a cycle is the tdd triple: the task that writes the test, the task that runs it and watches it fail, and the task that writes the implementation, with its green run\./,
    );
    expect(section).toMatch(/the session dispatches one executor per cycle\./);
    expect(section).toMatch(
      /the executor returns its result to the session at the end of the cycle and marks no checkbox\./,
    );
    expect(section).toMatch(
      /the session then dispatches the reviewer for that cycle as its own agent, closes every critical and important finding before ticking any checkbox, ticks the boxes of the cycle, and only then dispatches the next executor\./,
    );
    expect(section).toMatch(/no cycle's tasks are written on top of a cycle nobody has reviewed\./);
  });
});
