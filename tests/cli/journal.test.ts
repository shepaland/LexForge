import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitWorkspace, type GitWorkspace } from "../helpers/git-workspace.js";
import { CHANGE, cli, planFiles } from "../helpers/plan-fixture.js";

let ws: GitWorkspace;
let root: string;

beforeEach(() => {
  ws = createGitWorkspace(planFiles());
  root = ws.root;
});
afterEach(() => ws.remove());

describe("lexforge journal", () => {
  it("journal add answers with the entry id and resolve closes it", async () => {
    const added = await cli(root, ["journal", "add", "--change", CHANGE, "--kind", "question", "--text", "Which sort?"]);
    expect(added.json.data?.entry.id).toBe("J1");
    expect(added.json.data?.nextStep).toBe("lexforge resume --change demo");
    const resolved = await cli(root, ["journal", "resolve", "--change", CHANGE, "--id", "J1", "--note", "by title"]);
    expect(resolved.json.data?.entry.resolved.note).toBe("by title");
  });

  it("refuses a decision without a quote with a top-level next step", async () => {
    const result = await cli(root, ["journal", "add", "--change", CHANGE, "--kind", "decision", "--text", "Keep it"]);
    expect(result.exitCode).toBe(2);
    expect(result.json.error?.code).toBe("quote-required");
    expect(result.json.nextStep).toContain("--quote");
  });

  it("refuses an unknown kind", async () => {
    const result = await cli(root, ["journal", "add", "--change", CHANGE, "--kind", "idea", "--text", "x"]);
    expect(result.exitCode).toBe(2);
    expect(result.json.error?.code).toBe("unknown-kind");
  });

  it("opens a session and lists the permissions that expired", async () => {
    await cli(root, ["journal", "session", "--change", CHANGE]);
    await cli(root, [
      "journal", "add", "--change", CHANGE, "--kind", "permission", "--text", "edit config",
      "--quote", "можно", "--scope", "session",
    ]);
    const second = await cli(root, ["journal", "session", "--change", CHANGE]);
    expect(second.json.data).toMatchObject({ session: 2, expired: ["J1"] });
  });
});
