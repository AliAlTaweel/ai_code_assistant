import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client as PgClient } from "pg";
import { readFileSync } from "node:fs";
import { getPool } from "@skillsmatch/shared";
import { connectMcpClient, callMcpTool } from "../src/mcpClient.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { run as generateEmbeddings } from "../../../db/generate-embeddings.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://admin:password@localhost:5432/agileday_test";

// The MCP server (spawned as a child process below) reads its DB target from
// DATABASE_URL (see packages/shared/src/db.ts's getPool()), not
// TEST_DATABASE_URL. Point it at the seeded test database so this real
// integration test hits the same data seeded below, instead of silently
// falling back to the (unseeded) local dev database.
const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = TEST_URL;

let client: Client;

beforeAll(async () => {
  // Mirrors packages/mcp-server/test/getConsultantAvailability.test.ts so this
  // file is reliably green in isolation, not just as part of the full suite.
  const pgClient = new PgClient({ connectionString: TEST_URL });
  await pgClient.connect();
  await pgClient.query(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf-8"));
  await pgClient.query(readFileSync(new URL("../../../db/seed.sql", import.meta.url), "utf-8"));
  await pgClient.end();
  await generateEmbeddings(TEST_URL);
});

afterAll(async () => {
  await client?.close();
  await getPool(TEST_URL).end();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe("mcpClient", () => {
  it("connects to the MCP server and calls get_consultant_availability", async () => {
    client = await connectMcpClient();
    const result = await callMcpTool(client, "get_consultant_availability", {
      required_skills: ["Go"],
      min_hours: 5,
      requester_role: "CONSULTANT",
    });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("full_name");
  });

  it("surfaces a PERMISSION_DENIED tool error without throwing", async () => {
    const result = await callMcpTool(client, "get_project_margin", {
      consultant_id: "00000000-0000-0000-0000-000000000000",
      target_bill_rate: 100,
      requester_role: "CONSULTANT",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("PERMISSION_DENIED");
  });
});
