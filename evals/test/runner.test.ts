import { describe, it, expect, vi, afterEach } from "vitest";
import * as report from "../report.js";
import { runEvals } from "../runner.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runEvals", () => {
  it("scores each test case against the agent API and appends a report", async () => {
    const calls: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, opts: any) => {
        calls.push([url, opts]);
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

    // Guard against a future regression that renames/drops a field in the outgoing request body —
    // this would otherwise only be caught against a live Fastify schema.
    const scenarioACall = calls.find(([, opts]) => JSON.parse(opts.body).message.includes("Go engineer"));
    expect(JSON.parse(scenarioACall[1].body)).toEqual({
      message: "Find me a senior Go engineer with at least 20 hours available per week",
      role: "CONSULTANT",
    });
  });

  it("marks a scenario as failed (without throwing) when /api/chat responds non-2xx, and continues the run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        if (body.message.includes("COBOL")) {
          return { ok: false, status: 500, json: async () => ({}) };
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
    vi.spyOn(report, "appendReport").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const run = await runEvals("http://localhost:3001");

    expect(run.results).toHaveLength(4);
    const scenarioD = run.results.find((r) => r.id === "D");
    expect(scenarioD).toMatchObject({
      passed: false,
      toolSelectionAccuracy: false,
      groundingScore: false,
      permissionCompliance: false,
    });
    // The other scenarios still complete rather than the whole run aborting.
    const scenarioA = run.results.find((r) => r.id === "A");
    expect(scenarioA?.passed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("fails scenario D when the agent hallucinates a forbidden (nonexistent-match) consultant name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        if (body.message.includes("COBOL")) {
          return {
            ok: true,
            json: async () => ({
              finalAnswer: "I recommend Alice Chen for this COBOL mainframe role.",
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
    vi.spyOn(report, "appendReport").mockImplementation(() => {});

    const run = await runEvals("http://localhost:3001");

    const scenarioD = run.results.find((r) => r.id === "D");
    expect(scenarioD?.passed).toBe(false);
  });
});
