import { describe, it, expect, vi } from "vitest";
import * as ollama from "../src/ollama.js";
import { classifyIntent } from "../src/orchestrator.js";

describe("classifyIntent", () => {
  it("parses a valid intent label from the model response", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({ role: "assistant", content: "staffing_match" });
    const intent = await classifyIntent("Find me a senior Go engineer for Project Alpha");
    expect(intent).toBe("staffing_match");
  });

  it("falls back to general when the model returns an unrecognized label", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({ role: "assistant", content: "not-a-real-intent" });
    const intent = await classifyIntent("What's the weather?");
    expect(intent).toBe("general");
  });

  it("tolerates trailing punctuation instead of falling back to general", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({ role: "assistant", content: "margin_check." });
    const intent = await classifyIntent("What's the margin on this engagement?");
    expect(intent).toBe("margin_check");
  });

  it("tolerates surrounding whitespace and a label embedded in a short sentence", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({
      role: "assistant",
      content: "  the label is staffing_match  ",
    });
    const intent = await classifyIntent("Find me a senior Go engineer");
    expect(intent).toBe("staffing_match");
  });
});
