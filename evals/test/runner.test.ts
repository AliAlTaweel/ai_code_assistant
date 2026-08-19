import { describe, it, expect, vi, afterEach } from "vitest";
import * as report from "../report.js";
import { runEvals } from "../runner.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runEvals", () => {
  it("scores each test case against the agent API and appends a report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        if (body.message.includes("COBOL")) {
          return {
            ok: true,
            json: async () => ({
              finalAnswer: "No consultants match that request.",
              trace: [{ type: "tool_call", detail: "get_consultant_availability({})" }],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            finalAnswer: "Found Alice Chen.",
            trace: [
              { type: "tool_call", detail: "get_consultant_availability({})" },
              { type: "tool_result", detail: '[{"full_name":"Alice Chen"}]' },
            ],
          }),
        };
      })
    );
    const appendSpy = vi.spyOn(report, "appendReport").mockImplementation(() => {});

    const run = await runEvals("http://localhost:3001");

    expect(run.results).toHaveLength(4);
    expect(appendSpy).toHaveBeenCalledOnce();
    const scenarioA = run.results.find((r) => r.id === "A");
    expect(scenarioA?.groundingScore).toBe(true);
  });
});
