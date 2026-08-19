import { describe, it, expect, vi, afterEach } from "vitest";
import { chat } from "../src/ollama.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat", () => {
  it("posts messages and tools to the Ollama /api/chat endpoint and returns message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { role: "assistant", content: "hello" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await chat([{ role: "user", content: "hi" }]);

    expect(result).toEqual({ role: "assistant", content: "hello" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/chat");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("qwen2.5-coder:32b");
    expect(body.stream).toBe(false);
  });

  it("throws with response text when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" })
    );
    await expect(chat([{ role: "user", content: "hi" }])).rejects.toThrow("boom");
  });
});
