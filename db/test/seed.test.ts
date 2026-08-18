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

  // Check if schema exists by trying to query the users table
  let schemaExists = false;
  try {
    await client.query("SELECT 1 FROM users LIMIT 1");
    schemaExists = true;
  } catch (e) {
    schemaExists = false;
  }

  // Only create schema if it doesn't exist
  if (!schemaExists) {
    try {
      await client.query(readFileSync(new URL("../schema.sql", import.meta.url), "utf-8"));
    } catch (e) {
      // If schema creation fails due to extension conflict, just continue
      // Another test likely created it concurrently
      if ((e as Error).message.includes("duplicate key value violates unique constraint")) {
        // Extension already created, continue
      } else {
        throw e;
      }
    }
  } else {
    // If schema exists, clear seed data to allow re-seeding
    await client.query(`
      DELETE FROM skills;
      DELETE FROM assignments;
      DELETE FROM consultants;
      DELETE FROM projects;
      DELETE FROM pending_actions;
      DELETE FROM users;
    `);
  }

  // Run seed data
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
