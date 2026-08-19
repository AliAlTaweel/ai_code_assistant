import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/server.js";
import * as orchestrator from "../src/orchestrator.js";
import * as staffing from "../src/specialists/staffing.js";
import * as pendingActions from "../src/pendingActions.js";
import * as mcpClient from "../src/mcpClient.js";

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
    const resolveSpy = vi.spyOn(pendingActions, "resolvePendingAction").mockResolvedValue();

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
});

describe("GET /api/evals/latest", () => {
  it("returns 404 when no eval report exists yet", async () => {
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/evals/latest" });
    expect(response.statusCode).toBe(404);
  });
});
