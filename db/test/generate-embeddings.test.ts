// db/test/generate-embeddings.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { embedText, run } from "../generate-embeddings.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await client.query(readFileSync(new URL("../schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../seed.sql", import.meta.url), "utf-8"));
});

afterAll(async () => {
  await client.end();
});

describe("embedText", () => {
  it("returns a 768-length numeric vector", async () => {
    const vector = await embedText("Go Developer. Skills: Go (5), PostgreSQL (4)");
    expect(vector).toHaveLength(768);
    expect(typeof vector[0]).toBe("number");
  });
});

describe("run", () => {
  it("fills embedding for every consultant", async () => {
    await run(TEST_URL);
    const result = await client.query(
      `SELECT count(*)::int AS missing FROM consultants WHERE embedding IS NULL`
    );
    expect(result.rows[0].missing).toBe(0);
  });
});
