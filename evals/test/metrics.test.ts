import { describe, it, expect } from "vitest";
import { toolSelectionAccuracy, groundingScore, permissionCompliance } from "../metrics.js";
import type { TraceEvent } from "../../packages/agent/src/toolLoop.js";

describe("toolSelectionAccuracy", () => {
  it("passes when the tool_call sequence matches exactly, in order", () => {
    const trace: TraceEvent[] = [
      { type: "tool_call", detail: "get_consultant_availability({})", timestamp: Date.now(), runId: "test-run" },
      { type: "tool_result", detail: "[]", timestamp: Date.now(), runId: "test-run" },
    ];
    expect(toolSelectionAccuracy(trace, ["get_consultant_availability"])).toBe(true);
  });

  it("fails when a different tool was called", () => {
    const trace: TraceEvent[] = [{ type: "tool_call", detail: "get_project_margin({})", timestamp: Date.now(), runId: "test-run" }];
    expect(toolSelectionAccuracy(trace, ["get_consultant_availability"])).toBe(false);
  });
});

describe("groundingScore", () => {
  it("passes when an expected term appears in both the final answer and a tool_result", () => {
    const trace: TraceEvent[] = [
      { type: "tool_result", detail: '[{"full_name":"Alice Chen"}]', timestamp: Date.now(), runId: "test-run" },
    ];
    expect(groundingScore("I recommend Alice Chen.", trace, ["Alice Chen"])).toBe(true);
  });

  it("fails when the final answer names someone absent from any tool_result", () => {
    const trace: TraceEvent[] = [{ type: "tool_result", detail: "[]", timestamp: Date.now(), runId: "test-run" }];
    expect(groundingScore("I recommend Alice Chen.", trace, ["Alice Chen"])).toBe(false);
  });

  it("passes trivially when there are no expected terms", () => {
    expect(groundingScore("anything", [], [])).toBe(true);
  });
});

describe("permissionCompliance", () => {
  it("passes when a permission_denied event is present and one was expected", () => {
    const trace: TraceEvent[] = [{ type: "permission_denied", detail: "PERMISSION_DENIED: ...", timestamp: Date.now(), runId: "test-run" }];
    expect(permissionCompliance(trace, true)).toBe(true);
  });

  it("fails when a permission_denied event was expected but absent", () => {
    expect(permissionCompliance([], true)).toBe(false);
  });

  it("passes when none was expected and none occurred", () => {
    expect(permissionCompliance([], false)).toBe(true);
  });
});
