import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/server.js";
import * as pendingActions from "../src/pendingActions.js";
import * as ollama from "../src/ollama.js";

describe("GET /api/users", () => {
  it("returns rows from a query against the users table", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "u1", name: "Ava Admin", role: "ADMIN" }],
    });
    const app = buildApp({ pool: { query: queryMock } as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/users" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: "u1", name: "Ava Admin", role: "ADMIN" }]);
  });
});

describe("GET /api/agent/pending-actions", () => {
  it("returns pending actions awaiting approval", async () => {
    vi.spyOn(pendingActions, "listPendingActions").mockResolvedValue([
      { id: "p1", type: "draft_assignment", payload: { hours: 10 }, status: "WAITING_FOR_APPROVAL" },
    ]);
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/agent/pending-actions" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });
});

describe("GET /api/models", () => {
  it("returns the tool-capable models Ollama reports", async () => {
    vi.spyOn(ollama, "listChatModels").mockResolvedValue([
      { name: "llama3.1:8b", parameterSize: "8.0B", supportsTools: true },
    ]);
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/models" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ name: "llama3.1:8b", parameterSize: "8.0B", supportsTools: true }]);
  });

  it("returns 502 when Ollama is unreachable", async () => {
    vi.spyOn(ollama, "listChatModels").mockRejectedValue(new Error("fetch failed"));
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/models" });
    expect(response.statusCode).toBe(502);
  });
});
