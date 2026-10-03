import { spawn } from "node:child_process";
import process from "node:process";
import { createInterface } from "node:readline/promises";

export type UpdateChoice = "update" | "stay";

export type UpdateOutcome =
  | { kind: "continue"; updateAvailable: boolean }
  | { kind: "updated"; updateAvailable: true };

export interface UpdateCheckOptions {
  currentVersion: string;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchLatestVersion?: () => Promise<string>;
  choose?: (currentVersion: string, latestVersion: string) => Promise<string>;
  install?: (
    command: string,
    args: string[],
    options: { shell: boolean },
  ) => Promise<void>;
  write?: (message: string) => void;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export async function checkForCliUpdate(
  options: UpdateCheckOptions,
): Promise<UpdateOutcome> {
  const write = options.write ?? ((message) => process.stdout.write(`${message}\n`));
  const timeoutMs = options.timeoutMs ?? 3_000;
  const maxResponseBytes = options.maxResponseBytes ?? 64 * 1024;
  let latestVersion: string;

  try {
    latestVersion = await withTimeout(
      options.fetchLatestVersion?.() ?? fetchLatestVersion(timeoutMs, maxResponseBytes),
      timeoutMs,
    );
  } catch {
    return { kind: "continue", updateAvailable: false };
  }

  if (!isNewerVersion(latestVersion, options.currentVersion)) {
    return { kind: "continue", updateAvailable: false };
  }

  const choice = await (options.choose ?? promptForChoice)(
    options.currentVersion,
    latestVersion,
  );
  if (choice !== "update") {
    return { kind: "continue", updateAvailable: true };
  }

  const npmCommand = (options.platform ?? process.platform) === "win32" ? "npm.cmd" : "npm";
  try {
    await (options.install ?? installPackage)(
      npmCommand,
      ["install", "-g", "lexforge@latest"],
      { shell: (options.platform ?? process.platform) === "win32" },
    );
  } catch {
    return { kind: "continue", updateAvailable: true };
  }

  write("LexForge was updated. Please repeat the original command to run it again.");
  return { kind: "updated", updateAvailable: true };
}

async function fetchLatestVersion(
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<string> {
  const response = await fetch("https://registry.npmjs.org/lexforge/latest", {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status}`);
  }
  const data: unknown = JSON.parse(await readBoundedBody(response, maxResponseBytes));
  if (
    typeof data !== "object" ||
    data === null ||
    !("version" in data) ||
    typeof data.version !== "string"
  ) {
    throw new Error("npm registry response has no version");
  }
  return data.version;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("npm registry response is too large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error("npm registry response is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function promptForChoice(
  currentVersion: string,
  latestVersion: string,
): Promise<UpdateChoice> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(
      `LexForge ${latestVersion} is available (installed: ${currentVersion}). Update now? [u/S] `,
    );
    return /^u(?:pdate)?$/i.test(answer.trim()) ? "update" : "stay";
  } finally {
    prompt.close();
  }
}

function installPackage(
  command: string,
  args: string[],
  options: { shell: boolean },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: options.shell });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("npm registry request timed out")), timeoutMs);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseSemver(candidate);
  const installed = parseSemver(current);
  if (!next || !installed) return false;

  for (const key of ["major", "minor", "patch"] as const) {
    if (next[key] !== installed[key]) return next[key] > installed[key];
  }
  return comparePrerelease(next.prerelease, installed.prerelease) > 0;
}

function parseSemver(value: string): Semver | null {
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    value,
  );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) > Number(b) ? 1 : -1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}
