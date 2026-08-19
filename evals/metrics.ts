import type { TraceEvent } from "../packages/agent/src/toolLoop.js";

export function toolSelectionAccuracy(trace: TraceEvent[], expected: string[]): boolean {
  const actual = trace
    .filter((e) => e.type === "tool_call")
    .map((e) => e.detail.split("(")[0]);
  // The agent's tool loop retries a tool call (up to MAX_EMPTY_RESULT_RETRIES times) whenever it
  // gets an empty result back, producing several consecutive tool_call events for what is really a
  // single logical tool use. Collapse consecutive duplicate tool names before comparing so a
  // single-entry `expected` still matches a retried call correctly.
  const collapsed = actual.filter((name, i) => name !== actual[i - 1]);
  if (collapsed.length !== expected.length) return false;
  return collapsed.every((name, i) => name === expected[i]);
}

export function noForbiddenTerms(finalAnswer: string, forbiddenTerms: string[] = []): boolean {
  if (forbiddenTerms.length === 0) return true;
  const lowerAnswer = finalAnswer.toLowerCase();
  return forbiddenTerms.every((term) => !lowerAnswer.includes(term.toLowerCase()));
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
