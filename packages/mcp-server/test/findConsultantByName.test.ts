import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { getPool } from "@skillsmatch/shared";
import { findConsultantByName } from "../src/tools/findConsultantByName.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

beforeAll(async () => {
  const client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../../../db/seed.sql", import.meta.url), "utf-8"));
  await client.end();
});

afterAll(async () => {
  await getPool(TEST_URL).end();
});

describe("findConsultantByName", () => {
  it("finds an exact-name match", async () => {
    const pool = getPool(TEST_URL);
    const results = await findConsultantByName({ name: "Alice Chen", requester_role: "CONSULTANT" }, pool);
    expect(results).toHaveLength(1);
    expect(results[0].full_name).toBe("Alice Chen");
    expect(results[0]).toHaveProperty("id");
    expect(results[0]).toHaveProperty("title");
  });

  it("matches case-insensitively on a partial name", async () => {
    const pool = getPool(TEST_URL);
    const results = await findConsultantByName({ name: "alice", requester_role: "ADMIN" }, pool);
    expect(results.some((r) => r.full_name === "Alice Chen")).toBe(true);
  });

  it("returns an empty array when nothing matches", async () => {
    const pool = getPool(TEST_URL);
    const results = await findConsultantByName({ name: "Nonexistent Person", requester_role: "ADMIN" }, pool);
    expect(results).toEqual([]);
  });
});
