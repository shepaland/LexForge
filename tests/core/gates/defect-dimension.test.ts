import { afterEach, describe, expect, it } from "vitest";

import { defectFindings } from "../../../src/core/gates/defect-dimension.js";
import { writeDefectLedger, type DefectEntry } from "../../../src/core/defects/store.js";
import { makeWorkspace, removeWorkspace } from "../../helpers/workspace.js";

const CHANGE = "add-auth";
const OTHER_CHANGE = "fix-parser";

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    removeWorkspace(created.pop()!);
  }
});

function workspace(): string {
  const root = makeWorkspace({ "lexforge/config.yaml": "schema: spec-driven\n" });
  created.push(root);
  return root;
}

let counter = 0;
function entry(overrides: Partial<DefectEntry>): DefectEntry {
  counter += 1;
  return {
    id: `id${String(counter).padStart(6, "0")}`,
    change: CHANGE,
    level: "important",
    file: "src/core/auth/session.ts",
    line: 42,
    summary: "session token not invalidated on logout",
    state: "open",
    recordedAt: "2026-08-30T09:12:44.281Z",
    ...overrides,
  };
}

describe("defectFindings", () => {
  it("открытая critical запись, называющая этот change, даёт находку со своим rule id", () => {
    const root = workspace();
    const critical = entry({ level: "critical" });
    writeDefectLedger(root, { outputVersion: 1, defects: [critical] });

    const findings = defectFindings(root, CHANGE);

    expect(findings).toHaveLength(1);
    // The rule id is a contract string a skill matches on, not merely a
    // value distinct from the other three dimensions'. The scenario says
    // both commands "name the entry": the file and line are the entry's
    // own, not the ledger's, and the message names the identifier, the
    // level and the summary.
    expect(findings[0]!.rule).toBe("defect-open");
    expect(findings[0]!.file).toBe(critical.file);
    expect(findings[0]!.line).toBe(critical.line);
    expect(findings[0]!.level).toBe("error");
    expect(findings[0]!.message).toContain(critical.id);
    expect(findings[0]!.message).toContain(critical.level);
    expect(findings[0]!.message).toContain(critical.summary);
  });

  it("открытая important запись тоже даёт находку", () => {
    const root = workspace();
    const important = entry({ level: "important" });
    writeDefectLedger(root, { outputVersion: 1, defects: [important] });

    const findings = defectFindings(root, CHANGE);

    expect(findings).toHaveLength(1);
  });

  it("открытая minor запись находки не даёт", () => {
    const root = workspace();
    const minor = entry({ level: "minor" });
    writeDefectLedger(root, { outputVersion: 1, defects: [minor] });

    const findings = defectFindings(root, CHANGE);

    expect(findings).toEqual([]);
  });

  it("открытая critical запись другого change находки для этого change не даёт", () => {
    const root = workspace();
    const elsewhere = entry({ level: "critical", change: OTHER_CHANGE });
    writeDefectLedger(root, { outputVersion: 1, defects: [elsewhere] });

    const findings = defectFindings(root, CHANGE);

    expect(findings).toEqual([]);
  });

  it("закрытая critical запись находки не даёт", () => {
    const root = workspace();
    const closed = entry({
      level: "critical",
      state: "closed",
      closedAt: "2026-08-31T09:12:44.281Z",
    });
    writeDefectLedger(root, { outputVersion: 1, defects: [closed] });

    const findings = defectFindings(root, CHANGE);

    expect(findings).toEqual([]);
  });

  it("все пять записей разом: находки только для открытых critical и important этого change", () => {
    const root = workspace();
    const critical = entry({ level: "critical" });
    const important = entry({ level: "important" });
    const minor = entry({ level: "minor" });
    const otherChange = entry({ level: "critical", change: OTHER_CHANGE });
    const closed = entry({ level: "critical", state: "closed", closedAt: "2026-08-31T09:12:44.281Z" });
    writeDefectLedger(root, {
      outputVersion: 1,
      defects: [critical, important, minor, otherChange, closed],
    });

    const findings = defectFindings(root, CHANGE);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.rule)).toEqual(["defect-open", "defect-open"]);
  });

  it("перевод строки в file или summary не разбивает находку на две", () => {
    const root = workspace();
    const mangled = entry({
      level: "critical",
      file: "src/app.ts\nsrc/other.ts",
      summary: "first line\nsecond line pretending to be another finding",
    });
    writeDefectLedger(root, { outputVersion: 1, defects: [mangled] });

    const findings = defectFindings(root, CHANGE);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe("src/app.ts src/other.ts");
    expect(findings[0]!.message).not.toContain("\n");
    expect(findings[0]!.message).toContain(
      "first line second line pretending to be another finding",
    );
  });
});
