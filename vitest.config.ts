import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Два проекта заведены ради одного: архив пакета нужен только файлам
    // `tests/e2e`, собирается их `globalSetup` до первого файла тестов,
    // и прогон одних модульных тестов за эту сборку не платит.
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["**/node_modules/**", "tests/e2e/**"],
        },
      },
      {
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
          // Гонку за общий каталог `dist/` разбирает `tests/e2e/pack-tarball.ts`.
          globalSetup: ["tests/e2e/pack-tarball.ts"],
        },
      },
    ],
  },
});
