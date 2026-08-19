import { describe, it, expect, afterAll } from "vitest";
import { connectMcpClient, callMcpTool } from "../src/mcpClient.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// The MCP server (spawned as a child process below) reads its DB target from
// DATABASE_URL (see packages/shared/src/db.ts's getPool()), not
// TEST_DATABASE_URL. Point it at the seeded test database so this real
// integration test hits the same data the other suites set up, instead of
// silently falling back to the (unseeded) local dev database.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://admin:password@localhost:5432/agileday_test";

let client: Client;

afterAll(async () => {
  await client?.close();
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
