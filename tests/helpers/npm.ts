import { execFile } from "node:child_process";
import path from "node:path";

/**
 * Как позвать npm и npx из теста на любой системе.
 *
 * На Windows обе команды — это `.cmd`, а Node с версии 20 отказывается
 * запускать `.cmd` без шелла: вызов падает с `ENOENT` ещё до первого теста.
 * Когда прогон начался с `npm test`, npm кладёт путь к своему скрипту
 * в `npm_execpath`; тогда его запускает та же нода, что и тесты, шелл
 * не нужен, и строка вызова везде одна и та же.
 *
 * Запасной путь остаётся для прогона мимо npm — например `npx vitest`
 * руками. Там на Windows зовётся `npm.cmd` через шелл, и это единственное
 * место, где поведение систем расходится.
 */
export interface Call {
  file: string;
  args: string[];
  shell: boolean;
}

const WINDOWS = process.platform === "win32";

function viaNode(script: string, args: string[]): Call {
  return { file: process.execPath, args: [script, ...args], shell: false };
}

/** Вызов `npm <args>`. */
export function npmCall(args: string[]): Call {
  const execpath = process.env.npm_execpath;
  if (execpath?.endsWith(".js")) {
    return viaNode(execpath, args);
  }

  return { file: WINDOWS ? "npm.cmd" : "npm", args, shell: WINDOWS };
}

/** Вызов `npx <args>`: скрипт npx лежит рядом со скриптом npm. */
export function npxCall(args: string[]): Call {
  const execpath = process.env.npm_execpath;
  if (execpath?.endsWith(".js")) {
    return viaNode(path.join(path.dirname(execpath), "npx-cli.js"), args);
  }

  return { file: WINDOWS ? "npx.cmd" : "npx", args, shell: WINDOWS };
}

/** Что вернул запущенный процесс: код возврата и оба потока целиком. */
export interface ProcessResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Запускает процесс, не занимая событийный цикл. Синхронный вызов держит его
 * до конца: пока npm ставит пакет, рабочий процесс vitest не читает ответы
 * главного, и прогон, где прошли все тесты, падает по сроку обмена.
 */
export function runProcess(
  call: Call,
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    execFile(
      call.file,
      call.args,
      {
        cwd: options.cwd,
        encoding: "utf8",
        shell: call.shell,
        env: options.env,
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const status = error === null ? 0 : typeof error.code === "number" ? error.code : 1;
        resolve({ status, stdout, stderr });
      },
    );
  });
}
