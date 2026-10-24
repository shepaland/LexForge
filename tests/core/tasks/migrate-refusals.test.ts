import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateChange } from "../../../src/core/tasks/migrate.js";
import { CHANGE_5X as CHANGE, DIR_5X, makeChange5x } from "../../helpers/change-5x.js";
import type { GitWorkspace } from "../../helpers/git-workspace.js";

let ws: GitWorkspace | undefined;
afterEach(() => ws?.remove());

function caught(run: () => unknown): { code?: string; nextStep?: string; message?: string } {
  try {
    run();
  } catch (error) {
    return error as { code?: string; nextStep?: string; message?: string };
  }
  throw new Error("expected a refusal");
}

describe("lexforge migrate: отказы с кодом и следующим шагом", () => {
  it("change без .lexforge.yaml получает change-config-invalid, а не ENOENT", () => {
    ws = makeChange5x();
    rmSync(path.join(ws.root, DIR_5X, ".lexforge.yaml"));

    const error = caught(() => migrateChange(ws!.root, CHANGE));

    expect(error.code).toBe("change-config-invalid");
    expect(error.nextStep).toBe(
      `write "schema: spec-driven" to ${DIR_5X}/.lexforge.yaml, then run: lexforge migrate --change ${CHANGE}`,
    );
  });

  it("повтор после прерванной миграции, когда в execution-5x уже есть каталог цикла, отказывает без записи", () => {
    ws = makeChange5x();
    const dir = path.join(ws.root, DIR_5X);
    mkdirSync(path.join(dir, "execution-5x", "search"), { recursive: true });
    writeFileSync(path.join(dir, "execution-5x", "search", "state.json"), "{}");
    const plan = readFileSync(path.join(dir, "tasks/section-1.md"), "utf8");

    const error = caught(() => migrateChange(ws!.root, CHANGE));

    expect(error.code).toBe("migration-aside-occupied");
    expect(error.message).toContain(`${DIR_5X}/execution-5x/search`);
    expect(error.nextStep).toBe(
      `keep one of ${DIR_5X}/execution/search and ${DIR_5X}/execution-5x/search, ` +
        `remove the other, then run: lexforge migrate --change ${CHANGE}`,
    );
    expect(readFileSync(path.join(dir, "tasks/section-1.md"), "utf8")).toBe(plan);
  });
});
