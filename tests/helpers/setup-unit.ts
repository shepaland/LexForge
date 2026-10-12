import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

let home: string | undefined;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "lexforge-unit-home-"));
  vi.spyOn(os, "homedir").mockReturnValue(home);
  vi.stubGlobal("fetch", () =>
    Promise.reject(new Error("no registry in unit tests (tests/helpers/setup-unit.ts)")),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (home) rmSync(home, { recursive: true, force: true });
  home = undefined;
});
