import { defineConfig } from "vitest/config";

const windows = process.platform === "win32";

/**
 * Windows запускает процесс в разы дольше, а тесты ворот и сквозные тесты зовут
 * `git`, `npm` и оболочку. На загруженном раннере обычная секунда превращается
 * в десяток, и падает не проверка, а её срок: поэтому там срок шире, а рабочих
 * процессов меньше — иначе они отбирают время друг у друга и у отчёта vitest.
 */
const limits = windows
  ? { testTimeout: 30_000, hookTimeout: 30_000, teardownTimeout: 30_000 }
  : {};

export default defineConfig({
  test: {
    ...(windows ? { maxWorkers: 2 } : {}),
    // Два проекта заведены ради одного: архив пакета нужен только файлам
    // `tests/e2e`, собирается их `globalSetup` до первого файла тестов,
    // и прогон одних модульных тестов за эту сборку не платит.
    //
    // Идут они по очереди, а не вместе: сквозные тесты ставят пакет через npm,
    // и пока это шло рядом с модульными, главный процесс не успевал отвечать
    // рабочим процессам. Очередь названа через `groupOrder`.
    projects: [
      {
        test: {
          name: "unit",
          ...limits,
          sequence: { groupOrder: 0 },
          include: ["tests/**/*.test.ts"],
          exclude: ["**/node_modules/**", "tests/e2e/**"],
        },
      },
      {
        test: {
          name: "e2e",
          ...limits,
          sequence: { groupOrder: 1 },
          include: ["tests/e2e/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
          // Гонку за общий каталог `dist/` разбирает `tests/e2e/pack-tarball.ts`.
          globalSetup: ["tests/e2e/pack-tarball.ts"],
        },
      },
    ],
  },
});
