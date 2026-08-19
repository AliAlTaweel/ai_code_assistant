import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";
import type { Pool } from "pg";

function poolThatThrows(): Pool {
  return {
    query: async () => {
      throw new Error("simulated database failure");
    },
  } as unknown as Pool;
}

describe("buildServer", () => {
  it("registers all three tools", async () => {
    const server = buildServer(poolThatThrows());
    expect(Object.keys((server as any)._registeredTools).sort()).toEqual([
      "draft_assignment",
      "get_consultant_availability",
      "get_project_margin",
    ]);
  });

  it("converts a DB error inside get_project_margin into an isError response, not a throw", async () => {
    const server = buildServer(poolThatThrows());
    const result = await (server as any)._registeredTools["get_project_margin"].handler({
      consultant_id: "00000000-0000-0000-0000-000000000000",
      target_bill_rate: 100,
      requester_role: "ADMIN",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("simulated database failure");
  });

  it("converts a permission denial inside draft_assignment into an isError response", async () => {
    const server = buildServer(poolThatThrows());
    const result = await (server as any)._registeredTools["draft_assignment"].handler({
      project_id: "00000000-0000-0000-0000-000000000000",
      consultant_id: "00000000-0000-0000-0000-000000000000",
      hours: 10,
      requester_role: "CONSULTANT",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("PERMISSION_DENIED");
  });
});
