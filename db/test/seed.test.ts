// db/test/seed.test.ts
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
  await client.query(readFileSync(new URL("../schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../seed.sql", import.meta.url), "utf-8"));
});

afterAll(async () => {
  await client.end();
});

describe("seed data", () => {
  it("seeds at least one user per required role", async () => {
    const result = await client.query(
      `SELECT DISTINCT role FROM users WHERE role IN ('ADMIN', 'RESOURCING_MANAGER', 'FINANCE')`
    );
    const roles = result.rows.map((r) => r.role).sort();
    expect(roles).toEqual(["ADMIN", "FINANCE", "RESOURCING_MANAGER"]);
  });

  it("seeds exactly 10 consultants, each with at least one skill", async () => {
    const consultantCount = await client.query(`SELECT count(*)::int FROM consultants`);
    expect(consultantCount.rows[0].count).toBe(10);

    const consultantsMissingSkills = await client.query(
      `SELECT c.id FROM consultants c
       LEFT JOIN skills s ON s.consultant_id = c.id
       WHERE s.id IS NULL`
    );
    expect(consultantsMissingSkills.rows).toHaveLength(0);
  });

  it("seeds exactly 5 projects with non-empty required_skills", async () => {
    const result = await client.query(
      `SELECT count(*)::int FROM projects WHERE array_length(required_skills, 1) > 0`
    );
    expect(result.rows[0].count).toBe(5);
  });
});
