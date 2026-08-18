import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { getPool, Role } from "@skillsmatch/shared";
import { getProjectMargin } from "../src/tools/getProjectMargin.js";
import { draftAssignment } from "../src/tools/draftAssignment.js";
import { PermissionDeniedError } from "../src/rbac.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";
const ROLES: Role[] = ["ADMIN", "RESOURCING_MANAGER", "CONSULTANT", "FINANCE"];

let consultantId: string;
let projectId: string;

beforeAll(async () => {
  const client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../../../db/seed.sql", import.meta.url), "utf-8"));
  consultantId = (await client.query(`SELECT id FROM consultants LIMIT 1`)).rows[0].id;
  projectId = (await client.query(`SELECT id FROM projects LIMIT 1`)).rows[0].id;
  await client.end();
});

afterAll(async () => {
  await getPool(TEST_URL).end();
});

describe("get_project_margin permission matrix", () => {
  for (const role of ROLES) {
    const shouldAllow = role === "ADMIN" || role === "FINANCE";
    it(`${shouldAllow ? "allows" : "denies"} role ${role}`, async () => {
      const pool = getPool(TEST_URL);
      const call = getProjectMargin(
        { consultant_id: consultantId, target_bill_rate: 150, requester_role: role },
        pool
      );
      if (shouldAllow) {
        await expect(call).resolves.toHaveProperty("marginPercent");
      } else {
        await expect(call).rejects.toThrow(PermissionDeniedError);
      }
    });
  }
});

describe("draft_assignment permission matrix", () => {
  for (const role of ROLES) {
    const shouldAllow = role === "ADMIN" || role === "RESOURCING_MANAGER";
    it(`${shouldAllow ? "allows" : "denies"} role ${role}`, async () => {
      const pool = getPool(TEST_URL);
      const call = draftAssignment(
        { project_id: projectId, consultant_id: consultantId, hours: 5, requester_role: role },
        pool
      );
      if (shouldAllow) {
        await expect(call).resolves.toHaveProperty("status", "DRAFT");
      } else {
        await expect(call).rejects.toThrow(PermissionDeniedError);
      }
    });
  }
});
