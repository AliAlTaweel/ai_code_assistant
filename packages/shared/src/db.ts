import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(connectionString?: string): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString:
        connectionString ??
        process.env.DATABASE_URL ??
        "postgres://admin:password@localhost:5432/agileday_local",
    });
  }
  return pool;
}
