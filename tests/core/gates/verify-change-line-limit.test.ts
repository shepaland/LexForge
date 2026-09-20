import { unlinkSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { lineLimitFindings } from "../../../src/core/gates/line-limit-findings.js";
import { DEFAULT_FILE_LIMIT_INCLUDE } from "../../../src/core/workspace/project-config.js";
import { writeAt } from "../../helpers/git-workspace.js";
import { created, workspace } from "./verify-change-fixtures.js";

const LIMIT = { max: 400, patterns: DEFAULT_FILE_LIMIT_INCLUDE };
const TASKS = "- [ ] 1.1 Write `src/app.ts`\n";

afterEach(() => {
  while (created.length > 0) {
    created.pop()!.remove();
  }
});

/** `count` numbered lines, each ending in `\n`, so `wc -l` reads exactly `count`. */
function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
}

describe("lineLimitFindings: путь keep", () => {
  it("короткий файл, выросший за предел, даёт находку с началом, концом и пределом", () => {
    const w = workspace(TASKS, { "src/cart.ts": lines(380) });
    const base = w.head;

    writeAt(w.root, "src/cart.ts", lines(420));

    const findings = lineLimitFindings(w.root, base, ["src/cart.ts"], LIMIT, "keep");

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("file-over-line-limit");
    expect(findings[0]!.file).toBe("src/cart.ts");
    expect(findings[0]!.message).toContain("src/cart.ts");
    expect(findings[0]!.message).toContain("380");
    expect(findings[0]!.message).toContain("420");
    expect(findings[0]!.message).toContain("400");
    expect(findings[0]!.message).toContain("file_limit.include");
    expect(findings[0]!.message).toContain("!");
  });

  it("длинный файл, выросший на пути keep, даёт находку", () => {
    const w = workspace(TASKS, { "src/billing.ts": lines(612) });
    const base = w.head;

    writeAt(w.root, "src/billing.ts", lines(640));

    const findings = lineLimitFindings(w.root, base, ["src/billing.ts"], LIMIT, "keep");

    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("612");
    expect(findings[0]!.message).toContain("640");
    expect(findings[0]!.message).toContain("400");
  });

  it("длинный файл, ужавшийся в пределах старта на пути keep, находок не даёт", () => {
    const w = workspace(TASKS, { "src/billing.ts": lines(612) });
    const base = w.head;

    writeAt(w.root, "src/billing.ts", lines(605));

    const findings = lineLimitFindings(w.root, base, ["src/billing.ts"], LIMIT, "keep");

    expect(findings).toHaveLength(0);
  });
});

describe("lineLimitFindings: путь refactor", () => {
  it("длинный файл, оставшийся длинным на пути refactor, даёт находку", () => {
    const w = workspace(TASKS, { "src/billing.ts": lines(612) });
    const base = w.head;

    writeAt(w.root, "src/billing.ts", lines(590));

    const findings = lineLimitFindings(w.root, base, ["src/billing.ts"], LIMIT, "refactor");

    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("612");
    expect(findings[0]!.message).toContain("590");
    expect(findings[0]!.message).toContain("400");
  });
});

describe("lineLimitFindings: удалённый и новый файл", () => {
  it("удалённый файл не проверяется", () => {
    const w = workspace(TASKS, { "src/legacy-billing.ts": lines(900) });
    const base = w.head;

    unlinkSync(path.join(w.root, "src/legacy-billing.ts"));

    const findings = lineLimitFindings(w.root, base, ["src/legacy-billing.ts"], LIMIT, "keep");

    expect(findings).toHaveLength(0);
  });

  it("новый файл за пределом называет себя новым и свой размер", () => {
    const w = workspace(TASKS);
    const base = w.head;

    writeAt(w.root, "src/refunds.ts", lines(401));

    const findings = lineLimitFindings(w.root, base, ["src/refunds.ts"], LIMIT, "keep");

    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("src/refunds.ts");
    expect(findings[0]!.message.toLowerCase()).toContain("new");
    expect(findings[0]!.message).toContain("401");
  });
});

describe("lineLimitFindings: путь не записан", () => {
  it("длинный файл без записанного пути судится как refactor и называет обе развилки", () => {
    const w = workspace(TASKS, { "src/billing.ts": lines(612) });
    const base = w.head;

    const findings = lineLimitFindings(w.root, base, ["src/billing.ts"], LIMIT, null);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("file-over-line-limit");
    expect(findings[0]!.file).toBe("src/billing.ts");
    expect(findings[0]!.message).toContain("612");
    expect(findings[0]!.message).toContain("long_files");
    expect(findings[0]!.message.toLowerCase()).toContain("split");
    expect(findings[0]!.message).toContain("file_limit.include");
    expect(findings[0]!.message).toContain("!");
  });
});
