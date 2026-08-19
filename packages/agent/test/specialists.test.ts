import { describe, it, expect, vi } from "vitest";
import * as ollama from "../src/ollama.js";
import * as mcp from "../src/mcpClient.js";
import * as pendingActions from "../src/pendingActions.js";
import * as toolLoop from "../src/toolLoop.js";
import { run as staffingRun } from "../src/specialists/staffing.js";
import { run as financeRun } from "../src/specialists/finance.js";
import { run as resourcingRun } from "../src/specialists/resourcing.js";

describe("staffing specialist", () => {
  it("only offers get_consultant_availability as a tool", async () => {
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValue({ role: "assistant", content: "no consultants needed" });

    await staffingRun({ message: "hi", role: "CONSULTANT", client: {} as any, pool: {} as any });

    const toolsPassed = chatSpy.mock.calls[0][1];
    expect(toolsPassed).toHaveLength(1);
    expect(toolsPassed?.[0].function.name).toBe("get_consultant_availability");
  });

  it("threads the caller's role into runToolLoop", async () => {
    const runToolLoopSpy = vi
      .spyOn(toolLoop, "runToolLoop")
      .mockResolvedValue({ finalAnswer: "ok", trace: [] });

    await staffingRun({ message: "hi", role: "FINANCE", client: {} as any, pool: {} as any });

    expect(runToolLoopSpy).toHaveBeenCalledWith(expect.objectContaining({ role: "FINANCE" }));
  });
});

describe("finance specialist", () => {
  it("threads the caller's role into runToolLoop", async () => {
    const runToolLoopSpy = vi
      .spyOn(toolLoop, "runToolLoop")
      .mockResolvedValue({ finalAnswer: "ok", trace: [] });

    await financeRun({ message: "what's the margin?", role: "FINANCE", client: {} as any, pool: {} as any });

    expect(runToolLoopSpy).toHaveBeenCalledWith(expect.objectContaining({ role: "FINANCE" }));
  });
});

describe("resourcing specialist", () => {
  it("creates a pending action and reports it's awaiting approval when the model proposes JSON", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({
      role: "assistant",
      content: JSON.stringify({
        project_id: "00000000-0000-0000-0000-000000000000",
        consultant_id: "00000000-0000-0000-0000-000000000000",
        hours: 10,
      }),
    });
    const createSpy = vi
      .spyOn(pendingActions, "createPendingAction")
      .mockResolvedValue({ id: "pending-1" });

    const result = await resourcingRun({
      message: "assign Alice to Project Alpha for 10 hours",
      role: "RESOURCING_MANAGER",
      client: {} as any,
      pool: {} as any,
    });

    expect(createSpy).toHaveBeenCalledWith(
      {},
      "draft_assignment",
      expect.objectContaining({ hours: 10 })
    );
    expect(result.finalAnswer.toLowerCase()).toContain("awaiting approval");
  });

  it("never passes draft_assignment as a tool to the model", async () => {
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValue({ role: "assistant", content: "which project?" });

    await resourcingRun({ message: "assign someone", role: "RESOURCING_MANAGER", client: {} as any, pool: {} as any });

    const toolsPassed = chatSpy.mock.calls[0][1];
    expect(toolsPassed ?? []).toHaveLength(0);
  });

  it("allowlists the payload passed to createPendingAction, dropping any extra model-supplied keys", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({
      role: "assistant",
      content: JSON.stringify({
        project_id: "00000000-0000-0000-0000-000000000000",
        consultant_id: "00000000-0000-0000-0000-000000000000",
        hours: 10,
        requester_role: "ADMIN", // attempted spoof / extra key that must not ride along
        __proto__: { polluted: true },
      }),
    });
    const createSpy = vi
      .spyOn(pendingActions, "createPendingAction")
      .mockResolvedValue({ id: "pending-1" });

    await resourcingRun({
      message: "assign Alice to Project Alpha for 10 hours",
      role: "RESOURCING_MANAGER",
      client: {} as any,
      pool: {} as any,
    });

    const payload = createSpy.mock.calls[0][2];
    expect(Object.keys(payload).sort()).toEqual(["consultant_id", "hours", "project_id"]);
  });

  it("rejects a role that isn't permitted to draft assignments, without calling the model or queuing a pending action", async () => {
    const chatSpy = vi.spyOn(ollama, "chat");
    const createSpy = vi.spyOn(pendingActions, "createPendingAction");

    const result = await resourcingRun({
      message: "assign Alice to Project Alpha for 10 hours",
      role: "CONSULTANT",
      client: {} as any,
      pool: {} as any,
    });

    expect(chatSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(result.finalAnswer.toLowerCase()).toContain("elevated permissions");
    expect(result.trace.some((e) => e.type === "permission_denied")).toBe(true);
  });
});
