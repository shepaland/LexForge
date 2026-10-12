import { describe, expect, it } from "vitest";

const EXPECTED = "\nthe module `src/core/data/dialects.ts` does not exist\n";

interface Dialects {
  SQL_DIALECTS: readonly string[];
  storeFormat: (dialect: string) => string;
  isStoreName: (name: string) => boolean;
}

async function load(): Promise<Dialects | undefined> {
  try {
    return (await import("../../../src/core/data/dialects.js")) as Dialects;
  } catch {
    return undefined;
  }
}

describe("диалекты хранилищ данных", () => {
  it("SQL_DIALECTS перечисляет ровно тринадцать диалектов node-sql-parser", async () => {
    const mod = await load();
    expect(mod, EXPECTED).toBeDefined();
    expect([...mod!.SQL_DIALECTS]).toEqual([
      "postgresql",
      "mysql",
      "mariadb",
      "sqlite",
      "transactsql",
      "bigquery",
      "snowflake",
      "redshift",
      "db2",
      "hive",
      "trino",
      "athena",
      "flinksql",
    ]);
  });

  it("storeFormat даёт sql для postgresql", async () => {
    const mod = await load();
    expect(mod, EXPECTED).toBeDefined();
    expect(mod!.storeFormat("postgresql")).toBe("sql");
  });

  it("storeFormat даёт markdown для mongodb и oracle", async () => {
    const mod = await load();
    expect(mod, EXPECTED).toBeDefined();
    expect(mod!.storeFormat("mongodb")).toBe("markdown");
    expect(mod!.storeFormat("oracle")).toBe("markdown");
  });

  it("isStoreName принимает main и order-events", async () => {
    const mod = await load();
    expect(mod, EXPECTED).toBeDefined();
    expect(mod!.isStoreName("main")).toBe(true);
    expect(mod!.isStoreName("order-events")).toBe(true);
  });

  it("isStoreName отвергает Main, main_db, пустую строку и -main", async () => {
    const mod = await load();
    expect(mod, EXPECTED).toBeDefined();
    for (const bad of ["Main", "main_db", "", "-main"]) {
      expect(mod!.isStoreName(bad), bad).toBe(false);
    }
  });
});
