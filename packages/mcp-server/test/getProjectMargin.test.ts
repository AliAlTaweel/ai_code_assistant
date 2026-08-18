import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { getPool } from "@skillsmatch/shared";
import { getProjectMargin } from "../src/tools/getProjectMargin.js";
import { PermissionDeniedError } from "../src/rbac.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

let consultantId: string;

beforeAll(async () => {
  const client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../../../db/seed.sql", import.meta.url), "utf-8"));
  const { rows } = await client.query(
    `SELECT id, hourly_cost_rate FROM consultants WHERE title = 'Go Developer'`
  );
  consultantId = rows[0].id;
  await client.end();
});

afterAll(async () => {
  await getPool(TEST_URL).end();
});

describe("getProjectMargin", () => {
  it("computes margin percent for ADMIN", async () => {
    const pool = getPool(TEST_URL);
    const result = await getProjectMargin(
      { consultant_id: consultantId, target_bill_rate: 170, requester_role: "ADMIN" },
      pool
    );
    // Go Developer hourly_cost_rate seeded as 85.00 -> (170-85)/170*100 = 50
    expect(result.marginPercent).toBeCloseTo(50, 5);
  });

  it("rejects RESOURCING_MANAGER with PermissionDeniedError", async () => {
    const pool = getPool(TEST_URL);
    await expect(
      getProjectMargin(
        { consultant_id: consultantId, target_bill_rate: 170, requester_role: "RESOURCING_MANAGER" },
        pool
      )
    ).rejects.toThrow(PermissionDeniedError);
  });
});
