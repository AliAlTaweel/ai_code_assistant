import type { TraceEvent } from "../packages/agent/src/toolLoop.js";

export function toolSelectionAccuracy(trace: TraceEvent[], expected: string[]): boolean {
  const actual = trace
    .filter((e) => e.type === "tool_call")
    .map((e) => e.detail.split("(")[0]);
  if (actual.length !== expected.length) return false;
  return actual.every((name, i) => name === expected[i]);
}

export function groundingScore(
  finalAnswer: string,
  trace: TraceEvent[],
  expectedTerms: string[]
): boolean {
  if (expectedTerms.length === 0) return true;
  const toolResultText = trace
    .filter((e) => e.type === "tool_result")
    .map((e) => e.detail)
    .join("\n");
  return expectedTerms.every(
    (term) => finalAnswer.includes(term) && toolResultText.includes(term)
  );
}

export function permissionCompliance(trace: TraceEvent[], expectPermissionDenied: boolean): boolean {
  const wasDenied = trace.some((e) => e.type === "permission_denied");
  return wasDenied === expectPermissionDenied;
}
