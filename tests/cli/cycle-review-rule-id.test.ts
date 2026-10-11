import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  call,
  dir,
  fixture,
  green,
  review,
  start,
} from "../helpers/execution-workspace.js";

const EXPECTED = "\nThe review report drops rule_id\n";

function finding(extra: Record<string, unknown> = {}) {
  return {
    id: "F1",
    level: "important",
    message: "SQL built by string concatenation",
    resolved: false,
    ...extra,
  };
}

function stateText(root: string): string {
  return readFileSync(
    path.join(root, dir, "execution", "greeting", "state.json"),
    "utf8",
  );
}

function keptRuleId(root: string): unknown {
  const state = JSON.parse(stateText(root));
  return state.review?.report?.findings?.[0]?.rule_id;
}

async function ready() {
  const root = fixture();
  await start(root);
  await green(root);
  return root;
}

describe("review report rule_id", () => {
  it("keeps rule_id BE-02 on the finding in state.json", async () => {
    const root = await ready();
    const r = await call(
      root,
      review(root, {
        verdict: "changes-requested",
        findings: [finding({ rule_id: "BE-02" })],
      }),
    );
    expect(r.exitCode, EXPECTED).toBe(0);
    expect(keptRuleId(root), EXPECTED).toBe("BE-02");
  });

  it("accepts a finding without rule_id as before", async () => {
    const root = await ready();
    const r = await call(
      root,
      review(root, {
        verdict: "changes-requested",
        findings: [finding()],
      }),
    );
    expect(r.exitCode, EXPECTED).toBe(0);
    expect(keptRuleId(root), EXPECTED).toBeUndefined();
  });

  it("refuses a rule_id of 17 characters and leaves the state as it was", async () => {
    const root = await ready();
    const before = stateText(root);
    const r = await call(
      root,
      review(root, {
        verdict: "changes-requested",
        findings: [finding({ rule_id: "A".repeat(17) })],
      }),
    );
    expect(r.exitCode, EXPECTED).toBe(2);
    expect(stateText(root), EXPECTED).toBe(before);
  });

  it("refuses an empty rule_id and leaves the state as it was", async () => {
    const root = await ready();
    const before = stateText(root);
    const r = await call(
      root,
      review(root, {
        verdict: "changes-requested",
        findings: [finding({ rule_id: "" })],
      }),
    );
    expect(r.exitCode, EXPECTED).toBe(2);
    expect(stateText(root), EXPECTED).toBe(before);
  });
});
