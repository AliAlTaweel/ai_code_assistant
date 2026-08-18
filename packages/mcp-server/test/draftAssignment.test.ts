import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { getPool } from "@skillsmatch/shared";
import { draftAssignment } from "../src/tools/draftAssignment.js";
import { PermissionDeniedError } from "../src/rbac.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

let projectId: string;
let consultantId: string;

beforeAll(async () => {
  const client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../../../db/seed.sql", import.meta.url), "utf-8"));
  projectId = (await client.query(`SELECT id FROM projects LIMIT 1`)).rows[0].id;
  consultantId = (await client.query(`SELECT id FROM consultants LIMIT 1`)).rows[0].id;
  await client.end();
});

afterAll(async () => {
  await getPool(TEST_URL).end();
});

describe("draftAssignment", () => {
  it("inserts a DRAFT assignment for RESOURCING_MANAGER", async () => {
    const pool = getPool(TEST_URL);
    const result = await draftAssignment(
      { project_id: projectId, consultant_id: consultantId, hours: 15, requester_role: "RESOURCING_MANAGER" },
      pool
    );
    expect(result.status).toBe("DRAFT");
    expect(result.id).toBeTruthy();
  });

  it("rejects CONSULTANT with PermissionDeniedError", async () => {
    const pool = getPool(TEST_URL);
    await expect(
      draftAssignment(
        { project_id: projectId, consultant_id: consultantId, hours: 15, requester_role: "CONSULTANT" },
        pool
      )
    ).rejects.toThrow(PermissionDeniedError);
  });
});
