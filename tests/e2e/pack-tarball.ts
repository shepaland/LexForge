import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GlobalSetupContext } from "vitest/node";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

declare module "vitest" {
  export interface ProvidedContext {
    /** Путь архива, собранного один раз на весь прогон. */
    tarball: string;
  }
}

/**
 * Архив пакета собирается один раз до первого файла тестов и отдаётся всем,
 * кому он нужен, через `inject("tarball")`.
 *
 * Здесь это не экономия времени, а починка гонки. `npm pack` через `prepack`
 * запускает `tsc`, который переписывает общий каталог `dist/`. Пока два файла
 * тестов звали упаковку сами, эта запись шла параллельно с прогонами, которые
 * запускают `bin/lexforge.js`, а он читает `dist/cli/run.js`: один тест
 * из тридцати падал раз в несколько прогонов. Сборка до первого файла тестов
 * читается проще, чем очередь между файлами, и снимает гонку целиком —
 * во время прогона в `dist/` не пишет никто.
 */
export default function setup({ provide }: GlobalSetupContext): () => void {
  const destination = mkdtempSync(path.join(os.tmpdir(), "lexforge-pack-"));

  const output = execFileSync(
    "npm",
    ["pack", "--pack-destination", destination, "--loglevel", "error"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );

  provide("tarball", path.join(destination, output.trim().split("\n").at(-1)!));

  return () => rmSync(destination, { recursive: true, force: true });
}
