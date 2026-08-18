import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { getPool } from "@skillsmatch/shared";
import { getConsultantAvailability } from "../src/tools/getConsultantAvailability.js";
import { run as generateEmbeddings } from "../../../db/generate-embeddings.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

beforeAll(async () => {
  const client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../../../db/seed.sql", import.meta.url), "utf-8"));
  await client.end();
  await generateEmbeddings(TEST_URL);
});

afterAll(async () => {
  await getPool(TEST_URL).end();
});

describe("getConsultantAvailability", () => {
  it("returns Go-skilled consultants ranked by similarity, respecting min_hours", async () => {
    const pool = getPool(TEST_URL);
    const results = await getConsultantAvailability(
      { required_skills: ["Go", "Kubernetes"], min_hours: 20, requester_role: "CONSULTANT" },
      pool
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.every((r) => r.availability_hours_per_week >= 20)).toBe(true);
    expect(results[0].title.toLowerCase()).toContain("go");
  });
});
