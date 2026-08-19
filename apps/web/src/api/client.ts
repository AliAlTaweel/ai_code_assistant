const API_BASE = "http://localhost:3001";

export type Role = "ADMIN" | "RESOURCING_MANAGER" | "CONSULTANT" | "FINANCE";

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface TraceEvent {
  type: "model_thought" | "tool_call" | "tool_result" | "permission_denied";
  detail: string;
}

export interface PendingAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "WAITING_FOR_APPROVAL" | "APPROVED" | "REJECTED";
}

export interface EvalRun {
  timestamp: string;
  results: Array<{ id: string; passed: boolean; latencyMs: number }>;
  summary: { passRate: number; avgLatencyMs: number };
}

export async function postChat(
  message: string,
  role: Role
): Promise<{ finalAnswer: string; trace: TraceEvent[] }> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, role }),
  });
  return response.json();
}

export async function listUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE}/api/users`);
  return response.json();
}

export async function listPendingActions(): Promise<PendingAction[]> {
  const response = await fetch(`${API_BASE}/api/agent/pending-actions`);
  return response.json();
}

export async function approveAction(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/agent/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingActionId: id }),
  });
}

export async function rejectAction(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/agent/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingActionId: id }),
  });
}

export async function getLatestEvals(): Promise<EvalRun | null> {
  const response = await fetch(`${API_BASE}/api/evals/latest`);
  if (!response.ok) return null;
  return response.json();
}

export function subscribeTrace(onEvent: (e: TraceEvent) => void): () => void {
  const source = new EventSource(`${API_BASE}/api/trace/stream`);
  source.addEventListener("trace", (message) => {
    onEvent(JSON.parse((message as MessageEvent).data));
  });
  return () => source.close();
}
