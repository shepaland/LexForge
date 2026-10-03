import { describe, expect, it, vi } from "vitest";

type UpdateCheckModule = typeof import("../../src/core/update-check.js");

async function loadUpdateCheck(): Promise<UpdateCheckModule | null> {
  try {
    return await import("../../src/core/update-check.js");
  } catch (error) {
    if (error instanceof Error && /Cannot find module|Failed to load url/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

describe("checkForCliUpdate", () => {
  it("detects a newer npm latest version", async () => {
    const updateCheck = await loadUpdateCheck();
    const updateAvailable = updateCheck
      ? await updateCheck.checkForCliUpdate({
          currentVersion: "2.0.0",
          fetchLatestVersion: async () => "2.1.0",
          choose: vi.fn(),
          install: vi.fn(),
          write: vi.fn(),
        })
      : { updateAvailable: false };

    if (!updateAvailable.updateAvailable) {
      process.stderr.write("expected updateAvailable to be true\n");
    }
    expect(
      updateAvailable.updateAvailable,
      "expected updateAvailable to be true",
    ).toBe(true);
  });

  it.each(["2.0.0", "1.9.9"])(
    "continues without prompting when npm latest is %s",
    async (latestVersion) => {
      const updateCheck = await loadUpdateCheck();
      expect(updateCheck).not.toBeNull();
      const choose = vi.fn();

      const outcome = await updateCheck!.checkForCliUpdate({
        currentVersion: "2.0.0",
        fetchLatestVersion: async () => latestVersion,
        choose,
        install: vi.fn(),
        write: vi.fn(),
      });

      expect(outcome).toEqual({ kind: "continue", updateAvailable: false });
      expect(choose).not.toHaveBeenCalled();
    },
  );

  it("continues with the installed version when the user chooses stay", async () => {
    const updateCheck = await loadUpdateCheck();
    expect(updateCheck).not.toBeNull();

    const outcome = await updateCheck!.checkForCliUpdate({
      currentVersion: "2.0.0",
      fetchLatestVersion: async () => "3.0.0",
      choose: async () => "stay",
      install: vi.fn(),
      write: vi.fn(),
    });

    expect(outcome).toEqual({ kind: "continue", updateAvailable: true });
  });

  it("runs the exact global npm installation and prints repeat guidance", async () => {
    const updateCheck = await loadUpdateCheck();
    expect(updateCheck).not.toBeNull();
    const install = vi.fn(async () => undefined);
    const write = vi.fn();

    const outcome = await updateCheck!.checkForCliUpdate({
      currentVersion: "2.0.0",
      fetchLatestVersion: async () => "2.0.1",
      choose: async () => "update",
      install,
      write,
    });

    expect(install).toHaveBeenCalledWith(
      "npm",
      ["install", "-g", "lexforge@latest"],
      { shell: false },
    );
    expect(outcome).toEqual({ kind: "updated", updateAvailable: true });
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/repeat|run.*again/i));
  });

  it("uses npm.cmd on Windows", async () => {
    const updateCheck = await loadUpdateCheck();
    expect(updateCheck).not.toBeNull();
    const install = vi.fn(async () => undefined);

    await updateCheck!.checkForCliUpdate({
      currentVersion: "2.0.0",
      platform: "win32",
      fetchLatestVersion: async () => "2.0.1",
      choose: async () => "update",
      install,
      write: vi.fn(),
    });

    expect(install).toHaveBeenCalledWith(
      "npm.cmd",
      ["install", "-g", "lexforge@latest"],
      { shell: true },
    );
  });

  it.each(["", "n", "typo"])(
    "stays on the installed version for a non-update answer %j",
    async (answer) => {
      const updateCheck = await loadUpdateCheck();
      expect(updateCheck).not.toBeNull();
      const install = vi.fn();

      const outcome = await updateCheck!.checkForCliUpdate({
        currentVersion: "2.0.0",
        fetchLatestVersion: async () => "2.1.0",
        choose: async () => answer,
        install,
        write: vi.fn(),
      });

      expect(outcome).toEqual({ kind: "continue", updateAvailable: true });
      expect(install).not.toHaveBeenCalled();
    },
  );

  it("bounds a registry lookup that never resolves", async () => {
    const updateCheck = await loadUpdateCheck();
    expect(updateCheck).not.toBeNull();

    const result = await Promise.race([
      updateCheck!.checkForCliUpdate({
        currentVersion: "2.0.0",
        timeoutMs: 10,
        fetchLatestVersion: () => new Promise<string>(() => undefined),
        choose: vi.fn(),
        install: vi.fn(),
        write: vi.fn(),
      }),
      new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 50)),
    ]);

    if (result === "timed-out") {
      process.stderr.write("expected updateAvailable to be true\n");
    }
    expect(result).toEqual({ kind: "continue", updateAvailable: false });
  });

  it("rejects a registry response body above the configured limit", async () => {
    const updateCheck = await loadUpdateCheck();
    expect(updateCheck).not.toBeNull();
    const choose = vi.fn(async () => "stay");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(JSON.stringify({ version: "2.1.0", padding: "x".repeat(128) })),
        ),
      ),
    );

    try {
      const outcome = await updateCheck!.checkForCliUpdate({
        currentVersion: "2.0.0",
        maxResponseBytes: 32,
        choose,
        install: vi.fn(),
        write: vi.fn(),
      });
      if (outcome.updateAvailable) {
        process.stderr.write("expected updateAvailable to be true\n");
      }
      expect(outcome).toEqual({ kind: "continue", updateAvailable: false });
      expect(choose).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("continues when the registry lookup fails", async () => {
    const updateCheck = await loadUpdateCheck();
    expect(updateCheck).not.toBeNull();

    const outcome = await updateCheck!.checkForCliUpdate({
      currentVersion: "2.0.0",
      fetchLatestVersion: async () => {
        throw new Error("offline");
      },
      choose: vi.fn(),
      install: vi.fn(),
      write: vi.fn(),
    });

    expect(outcome.kind).toBe("continue");
  });

  it("continues when the installer fails", async () => {
    const updateCheck = await loadUpdateCheck();
    expect(updateCheck).not.toBeNull();

    const outcome = await updateCheck!.checkForCliUpdate({
      currentVersion: "2.0.0",
      fetchLatestVersion: async () => "2.1.0",
      choose: async () => "update",
      install: async () => {
        throw new Error("permission denied");
      },
      write: vi.fn(),
    });

    expect(outcome.kind).toBe("continue");
  });
});
