import { describe, it, expect, vi } from "vitest";
import * as ollama from "../src/ollama.js";
import * as mcp from "../src/mcpClient.js";
import { runToolLoop } from "../src/toolLoop.js";

const TOOL_DEF = {
  type: "function" as const,
  function: { name: "get_consultant_availability", description: "d", parameters: {} },
};

describe("runToolLoop", () => {
  it("executes a tool call the model requests, then returns the model's final answer", async () => {
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_consultant_availability", arguments: { required_skills: ["Go"], min_hours: 10 } } }],
      })
      .mockResolvedValueOnce({ role: "assistant", content: "Found Alice Chen." });
    vi.spyOn(mcp, "callMcpTool").mockResolvedValue({
      isError: false,
      text: '[{"full_name":"Alice Chen"}]',
    });

    const result = await runToolLoop({
      systemPrompt: "sys",
      userMessage: "find a go engineer",
      tools: [TOOL_DEF],
      client: {} as any,
      role: "CONSULTANT",
    });

    expect(result.finalAnswer).toBe("Found Alice Chen.");
    expect(result.trace.some((e) => e.type === "tool_call")).toBe(true);
    expect(result.trace.some((e) => e.type === "tool_result")).toBe(true);
    expect(chatSpy).toHaveBeenCalledTimes(2);
  });

  it("stops and explains on a PERMISSION_DENIED tool result without retrying", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValueOnce({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "get_project_margin", arguments: {} } }],
    });
    vi.spyOn(mcp, "callMcpTool").mockResolvedValue({
      isError: true,
      text: "PERMISSION_DENIED: Operational scope required: [FINANCE_READ]",
    });

    const result = await runToolLoop({
      systemPrompt: "sys",
      userMessage: "what's the margin?",
      tools: [TOOL_DEF],
      client: {} as any,
      role: "CONSULTANT",
    });

    expect(result.trace.some((e) => e.type === "permission_denied")).toBe(true);
    expect(result.finalAnswer.toLowerCase()).toContain("permission");
  });

  it("retries once with relaxed constraints on an empty tool result, then stops after 2 retries", async () => {
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_consultant_availability", arguments: {} } }],
      })
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_consultant_availability", arguments: {} } }],
      })
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_consultant_availability", arguments: {} } }],
      })
      .mockResolvedValueOnce({ role: "assistant", content: "No consultants match, even relaxed." });
    vi.spyOn(mcp, "callMcpTool").mockResolvedValue({ isError: false, text: "[]" });

    const result = await runToolLoop({
      systemPrompt: "sys",
      userMessage: "find an impossible combo",
      tools: [TOOL_DEF],
      client: {} as any,
      role: "CONSULTANT",
    });

    // 3 tool-call turns (1 initial + 2 relaxation retries) + 1 final answer turn = 4 chat calls
    expect(chatSpy).toHaveBeenCalledTimes(4);
    expect(result.finalAnswer).toContain("No consultants match");
  });

  it("always overwrites requester_role in tool call args with the trusted caller role, ignoring any model-supplied value", async () => {
    vi.spyOn(ollama, "chat")
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: {
              name: "get_consultant_availability",
              // Model hallucinates/attempts to spoof a different, more-privileged role.
              arguments: { required_skills: ["Go"], requester_role: "ADMIN" },
            },
          },
        ],
      })
      .mockResolvedValueOnce({ role: "assistant", content: "Found someone." });
    const callMcpToolSpy = vi.spyOn(mcp, "callMcpTool").mockResolvedValue({
      isError: false,
      text: '[{"full_name":"Alice Chen"}]',
    });

    await runToolLoop({
      systemPrompt: "sys",
      userMessage: "find a go engineer",
      tools: [TOOL_DEF],
      client: {} as any,
      role: "CONSULTANT",
    });

    expect(callMcpToolSpy).toHaveBeenCalledWith(
      expect.anything(),
      "get_consultant_availability",
      expect.objectContaining({ requester_role: "CONSULTANT" })
    );
    const actualArgs = callMcpToolSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(actualArgs.requester_role).toBe("CONSULTANT");
    expect(actualArgs.requester_role).not.toBe("ADMIN");
  });
});
