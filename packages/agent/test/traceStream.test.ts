import { describe, it, expect, vi, afterEach } from "vitest";
import { buildApp } from "../src/server.js";
import * as orchestrator from "../src/orchestrator.js";
import * as staffing from "../src/specialists/staffing.js";

// NOTE ON TRANSPORT: `app.inject()` (light-my-request) only resolves its returned promise
// once the response stream emits `finish` (i.e. `res.end()` is called). An SSE endpoint is
// intentionally long-lived and never calls `end()`, so an injected GET to /api/trace/stream
// would hang forever rather than let us observe the written chunks. To exercise the real
// streaming behavior we bind the app to a real ephemeral port and read the response body via
// `fetch`, which lets us observe bytes as they're written without waiting for the stream to
// close.
describe("GET /api/trace/stream", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("streams trace events emitted during a /api/chat call", async () => {
    vi.spyOn(orchestrator, "classifyIntent").mockResolvedValue("staffing_match");
    vi.spyOn(staffing, "run").mockResolvedValue({
      finalAnswer: "Found Alice.",
      trace: [{ type: "tool_call", detail: "get_consultant_availability({})" }],
    });

    app = buildApp({ pool: {} as any, mcpClient: {} as any });
    await app.ready();
    const address = await app.listen({ port: 0 });

    const streamResponse = await fetch(`${address}/api/trace/stream`);
    const reader = streamResponse.body!.getReader();
    const decoder = new TextDecoder();

    // Give the SSE connection a tick to register before triggering the chat call.
    await new Promise((r) => setTimeout(r, 10));

    await fetch(`${address}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "find a go engineer", role: "CONSULTANT" }),
    });

    let streamed = "";
    while (!streamed.includes("get_consultant_availability")) {
      const { value, done } = await reader.read();
      if (done) break;
      streamed += decoder.decode(value, { stream: true });
    }
    await reader.cancel();

    expect(streamed).toContain("tool_call");
    expect(streamed).toContain("get_consultant_availability");
  });
});
