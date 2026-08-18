// db/test/schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: TEST_URL });
  await client.connect();
  const sql = readFileSync(new URL("../schema.sql", import.meta.url), "utf-8");
  await client.query(sql);
});

afterAll(async () => {
  await client.end();
});

describe("schema", () => {
  it("creates all six tables", async () => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = result.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "assignments",
        "consultants",
        "pending_actions",
        "projects",
        "skills",
        "users",
      ])
    );
  });

  it("sizes consultants.embedding as vector(768)", async () => {
    const result = await client.query(
      `SELECT format_type(atttypid, atttypmod) AS type
       FROM pg_attribute
       WHERE attrelid = 'consultants'::regclass AND attname = 'embedding'`
    );
    expect(result.rows[0].type).toBe("vector(768)");
  });

  it("allows FINANCE as a users.role value", async () => {
    await client.query(
      `INSERT INTO users (name, email, role) VALUES ('Test Finance', 'finance@test.local', 'FINANCE')`
    );
    const result = await client.query(
      `SELECT role FROM users WHERE email = 'finance@test.local'`
    );
    expect(result.rows[0].role).toBe("FINANCE");
  });
});
