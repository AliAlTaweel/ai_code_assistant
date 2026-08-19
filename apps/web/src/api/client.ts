const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

export type Role = "ADMIN" | "RESOURCING_MANAGER" | "CONSULTANT" | "FINANCE";

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface TraceEvent {
  type: "model_thought" | "tool_call" | "tool_result" | "permission_denied" | "classification";
  detail: string;
}

async function assertOk(response: Response, label: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`);
  }
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

export interface ModelInfo {
  name: string;
  parameterSize?: string;
  supportsTools: boolean;
}

export async function postChat(
  message: string,
  role: Role,
  model?: string
): Promise<{ finalAnswer: string; trace: TraceEvent[] }> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, role, model }),
  });
  await assertOk(response, "postChat");
  return response.json();
}

export async function listModels(): Promise<ModelInfo[]> {
  const response = await fetch(`${API_BASE}/api/models`);
  await assertOk(response, "listModels");
  return response.json();
}

export async function listUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE}/api/users`);
  await assertOk(response, "listUsers");
  return response.json();
}

export async function listPendingActions(): Promise<PendingAction[]> {
  const response = await fetch(`${API_BASE}/api/agent/pending-actions`);
  await assertOk(response, "listPendingActions");
  return response.json();
}

export async function approveAction(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agent/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingActionId: id }),
  });
  await assertOk(response, "approveAction");
}

export async function rejectAction(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agent/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingActionId: id }),
  });
  await assertOk(response, "rejectAction");
}

export async function getLatestEvals(): Promise<EvalRun | null> {
  const response = await fetch(`${API_BASE}/api/evals/latest`);
  if (!response.ok) return null;
  return response.json();
}

export function subscribeTrace(
  onEvent: (e: TraceEvent) => void,
  onError?: () => void
): () => void {
  const source = new EventSource(`${API_BASE}/api/trace/stream`);
  source.addEventListener("trace", (message) => {
    onEvent(JSON.parse((message as MessageEvent).data));
  });
  if (onError) {
    source.onerror = onError;
  }
  return () => source.close();
}
