import { describe, it, expect, vi } from "vitest";
import * as ollama from "../src/ollama.js";
import * as mcp from "../src/mcpClient.js";
import * as pendingActions from "../src/pendingActions.js";
import { run as staffingRun } from "../src/specialists/staffing.js";
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
});
