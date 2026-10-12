export const SQL_DIALECTS = [
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
] as const;

export type StoreFormat = "sql" | "markdown";

const STORE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function storeFormat(dialect: string): StoreFormat {
  return (SQL_DIALECTS as readonly string[]).includes(dialect) ? "sql" : "markdown";
}

export function isStoreName(name: string): boolean {
  return STORE_NAME.test(name);
}
