import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/server.js";
import * as orchestrator from "../src/orchestrator.js";
import * as staffing from "../src/specialists/staffing.js";
import * as ollama from "../src/ollama.js";
import * as pendingActions from "../src/pendingActions.js";
import * as mcpClient from "../src/mcpClient.js";

describe("CORS", () => {
  it("allows the Vite dev origin on responses", async () => {
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "GET",
      url: "/api/evals/latest",
      headers: { origin: "http://localhost:5173" },
    });

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("POST /api/chat", () => {
  it("dispatches a staffing_match intent to the staffing specialist", async () => {
    vi.spyOn(orchestrator, "classifyIntent").mockResolvedValue("staffing_match");
    vi.spyOn(staffing, "run").mockResolvedValue({ finalAnswer: "Found Alice.", trace: [] });

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "find a go engineer", role: "CONSULTANT" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ finalAnswer: "Found Alice.", trace: [] });
  });

  it("rejects a request with an empty message", async () => {
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "", role: "CONSULTANT" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a request missing role", async () => {
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "hi" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("guards the general intent branch's chat() call with a system message that forbids stating unverified facts", async () => {
    vi.spyOn(orchestrator, "classifyIntent").mockResolvedValue("general");
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValue({ role: "assistant", content: "I don't have that information." });

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "what's the weather today?", role: "CONSULTANT" },
    });

    expect(response.statusCode).toBe(200);
    const messages = chatSpy.mock.calls[0][0];
    expect(messages[0].role).toBe("system");
    const systemContent = messages[0].content.toLowerCase().replace(/\s+/g, " ");
    expect(systemContent).toContain("financial");
    expect(systemContent).toContain("don't have that information");
  });
});

describe("POST /api/agent/approve", () => {
  it("calls draft_assignment via MCP and marks the pending action APPROVED", async () => {
    vi.spyOn(pendingActions, "getPendingAction").mockResolvedValue({
      id: "pending-1",
      type: "draft_assignment",
      payload: { project_id: "p1", consultant_id: "c1", hours: 10 },
      status: "WAITING_FOR_APPROVAL",
    });
    const callToolSpy = vi
      .spyOn(mcpClient, "callMcpTool")
      .mockResolvedValue({ isError: false, text: '{"id":"a1","status":"DRAFT"}' });
    const resolveSpy = vi.spyOn(pendingActions, "resolvePendingAction").mockResolvedValue({
      id: "pending-1",
      type: "draft_assignment",
      payload: { project_id: "p1", consultant_id: "c1", hours: 10 },
      status: "APPROVED",
    });

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/approve",
      payload: { pendingActionId: "pending-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(callToolSpy).toHaveBeenCalledWith(
      {},
      "draft_assignment",
      expect.objectContaining({ project_id: "p1", requester_role: "ADMIN" })
    );
    expect(resolveSpy).toHaveBeenCalledWith({}, "pending-1", "APPROVED");
  });

  it("returns 404 when the pending action does not exist", async () => {
    vi.spyOn(pendingActions, "getPendingAction").mockResolvedValue(null);
    const callToolSpy = vi.spyOn(mcpClient, "callMcpTool");

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/approve",
      payload: { pendingActionId: "missing" },
    });

    expect(response.statusCode).toBe(404);
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it("returns 409 and does not call the MCP tool again when approving an already-APPROVED action", async () => {
    vi.spyOn(pendingActions, "getPendingAction").mockResolvedValue({
      id: "pending-1",
      type: "draft_assignment",
      payload: { project_id: "p1", consultant_id: "c1", hours: 10 },
      status: "APPROVED",
    });
    vi.spyOn(pendingActions, "resolvePendingAction").mockResolvedValue(null);
    const callToolSpy = vi.spyOn(mcpClient, "callMcpTool");

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/approve",
      payload: { pendingActionId: "pending-1" },
    });

    expect(response.statusCode).toBe(409);
    expect(callToolSpy).not.toHaveBeenCalled();
  });

  it("returns 409 when approving an already-REJECTED action", async () => {
    vi.spyOn(pendingActions, "getPendingAction").mockResolvedValue({
      id: "pending-1",
      type: "draft_assignment",
      payload: { project_id: "p1", consultant_id: "c1", hours: 10 },
      status: "REJECTED",
    });
    vi.spyOn(pendingActions, "resolvePendingAction").mockResolvedValue(null);
    const callToolSpy = vi.spyOn(mcpClient, "callMcpTool");

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/approve",
      payload: { pendingActionId: "pending-1" },
    });

    expect(response.statusCode).toBe(409);
    expect(callToolSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/reject", () => {
  it("returns 404 when the pending action does not exist", async () => {
    vi.spyOn(pendingActions, "getPendingAction").mockResolvedValue(null);

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/reject",
      payload: { pendingActionId: "missing" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 409 when rejecting an already-resolved action", async () => {
    vi.spyOn(pendingActions, "getPendingAction").mockResolvedValue({
      id: "pending-1",
      type: "draft_assignment",
      payload: {},
      status: "APPROVED",
    });
    vi.spyOn(pendingActions, "resolvePendingAction").mockResolvedValue(null);

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/reject",
      payload: { pendingActionId: "pending-1" },
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("GET /api/agent/pending-actions", () => {
  it("returns pending actions waiting for approval", async () => {
    const rows = [
      { id: "pending-1", type: "draft_assignment", payload: {}, status: "WAITING_FOR_APPROVAL" },
    ];
    const pool = { query: vi.fn().mockResolvedValue({ rows }) };

    const app = buildApp({ pool: pool as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/agent/pending-actions" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(rows);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("WAITING_FOR_APPROVAL"));
  });
});

describe("GET /api/evals/latest", () => {
  it("returns 404 when no eval report exists yet", async () => {
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/evals/latest" });
    expect(response.statusCode).toBe(404);
  });
});
