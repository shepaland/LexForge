import { afterEach, describe, expect, it } from "vitest";

import { UsageError } from "../../../src/cli/errors.js";
import { assertRepository, readHead } from "../../../src/core/git/repository.js";
import {
  createGitWorkspace,
  createPlainWorkspace,
  git,
  type GitWorkspace,
} from "../../helpers/git-workspace.js";

const created: GitWorkspace[] = [];

function keep(workspace: GitWorkspace): GitWorkspace {
  created.push(workspace);
  return workspace;
}

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

function refusal(call: () => unknown): UsageError {
  try {
    call();
  } catch (error) {
    expect(error).toBeInstanceOf(UsageError);
    return error as UsageError;
  }

  throw new Error("expected a UsageError, got none");
}

describe("assertRepository", () => {
  it("на каталоге с репозиторием проходит молча", () => {
    const workspace = keep(createGitWorkspace());

    expect(() => assertRepository(workspace.root)).not.toThrow();
  });

  it("без репозитория называет первый шаг", () => {
    const workspace = keep(createPlainWorkspace());

    const error = refusal(() => assertRepository(workspace.root));

    expect(error.code).toBe("git-missing");
    expect(`${error.message} ${error.nextStep}`).toContain("git init");
  });
});

describe("readHead", () => {
  it("отдаёт коммит, сделанный помощником", () => {
    const workspace = keep(createGitWorkspace());

    const head = readHead(workspace.root);

    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(head).toBe(workspace.head);
  });

  it("в репозитории без коммитов останавливает работу", () => {
    const workspace = keep(createPlainWorkspace());
    git(workspace.root, "init", "--initial-branch=main");

    const error = refusal(() => readHead(workspace.root));

    expect(error.code).toBe("git-no-commit");
    expect(`${error.message} ${error.nextStep}`).toContain("git commit");
  });
});
