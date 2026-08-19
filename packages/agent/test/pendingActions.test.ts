import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { getPool } from "@skillsmatch/shared";
import {
  createPendingAction,
  resolvePendingAction,
  getPendingAction,
} from "../src/pendingActions.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

beforeAll(async () => {
  const client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf-8"));
  await client.end();
});

afterAll(async () => {
  await getPool(TEST_URL).end();
});

describe("pendingActions", () => {
  it("creates, reads, and resolves a pending action", async () => {
    const pool = getPool(TEST_URL);
    const created = await createPendingAction(pool, "draft_assignment", {
      project_id: "00000000-0000-0000-0000-000000000000",
      consultant_id: "00000000-0000-0000-0000-000000000000",
      hours: 10,
    });
    expect(created.id).toBeTruthy();

    const fetched = await getPendingAction(pool, created.id);
    expect(fetched?.status).toBe("WAITING_FOR_APPROVAL");
    expect(fetched?.payload.hours).toBe(10);

    const resolvedRow = await resolvePendingAction(pool, created.id, "APPROVED");
    expect(resolvedRow?.status).toBe("APPROVED");
    const resolved = await getPendingAction(pool, created.id);
    expect(resolved?.status).toBe("APPROVED");
  });

  it("returns null and leaves status unchanged when resolving an action that isn't WAITING_FOR_APPROVAL", async () => {
    const pool = getPool(TEST_URL);
    const created = await createPendingAction(pool, "draft_assignment", {
      project_id: "00000000-0000-0000-0000-000000000000",
      consultant_id: "00000000-0000-0000-0000-000000000000",
      hours: 5,
    });

    const first = await resolvePendingAction(pool, created.id, "APPROVED");
    expect(first?.status).toBe("APPROVED");

    // A second resolve attempt (simulating a double-POST or a losing concurrent request)
    // must be rejected by the DB-level conditional UPDATE, not silently re-applied.
    const second = await resolvePendingAction(pool, created.id, "APPROVED");
    expect(second).toBeNull();

    const rejectAttempt = await resolvePendingAction(pool, created.id, "REJECTED");
    expect(rejectAttempt).toBeNull();

    const fetched = await getPendingAction(pool, created.id);
    expect(fetched?.status).toBe("APPROVED");
  });
});
