import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { GlobalSetupContext } from "vitest/node";

import { npmCall } from "../helpers/npm.js";

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
 *
 * Ждать упаковку синхронно нельзя. `npm pack` через `prepack` запускает `tsc`,
 * это десятки секунд, и всё это время главный процесс не отвечает рабочим
 * процессам другого проекта, которые уже идут рядом. На Windows, где всё это
 * втрое дольше, их обращения не укладывались в срок, и прогон, где прошли все
 * тесты, заканчивался ошибкой отчёта.
 */
const run = promisify(execFile);

export default async function setup({ provide }: GlobalSetupContext): Promise<() => void> {
  const destination = mkdtempSync(path.join(os.tmpdir(), "lexforge-pack-"));

  const pack = npmCall(["pack", "--pack-destination", destination, "--loglevel", "error"]);
  const { stdout } = await run(pack.file, pack.args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: pack.shell,
  });

  provide("tarball", path.join(destination, stdout.trim().split("\n").at(-1)!));

  return () => rmSync(destination, { recursive: true, force: true });
}
