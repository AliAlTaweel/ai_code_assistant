import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Pool } from "pg";
import type { Role } from "@skillsmatch/shared";
import { chat } from "../ollama.js";
import { createPendingAction } from "../pendingActions.js";
import type { ToolLoopResult, TraceEvent } from "../toolLoop.js";

const SYSTEM_PROMPT = `You are a resourcing specialist. You cannot draft assignments yourself.
When you have a project_id, consultant_id, and hours, respond with ONLY a JSON object of the
shape {"project_id": "...", "consultant_id": "...", "hours": N} and nothing else. If you're
missing information, ask a clarifying question in plain text instead.`;

// Mirrors the allowed-role set enforced server-side by the draft_assignment MCP tool
// (packages/mcp-server/src/tools/draftAssignment.ts's requireRole call). Keeping it here too
// means an unauthorized role never even gets a pending action queued, instead of relying
// solely on the approval-time RBAC check.
const ROLES_ALLOWED_TO_DRAFT_ASSIGNMENTS: Role[] = ["ADMIN", "RESOURCING_MANAGER"];

type DraftProposal = {
  project_id: string;
  consultant_id: string;
  hours: number;
};

function tryParseProposal(content: string): DraftProposal | null {
  try {
    const parsed = JSON.parse(content);
    if (
      typeof parsed.project_id === "string" &&
      typeof parsed.consultant_id === "string" &&
      typeof parsed.hours === "number"
    ) {
      // Allowlist the expected keys explicitly rather than spreading the raw parsed object —
      // the model's output is untrusted, and spreading it verbatim would let arbitrary
      // model-controlled keys ride along into pending_actions.payload.
      return {
        project_id: parsed.project_id,
        consultant_id: parsed.consultant_id,
        hours: parsed.hours,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function run(opts: {
  message: string;
  role: Role;
  client: Client;
  pool: Pool;
  runId?: string;
  model?: string;
  onTraceEvent?: (event: TraceEvent) => void;
}): Promise<ToolLoopResult> {
  if (!ROLES_ALLOWED_TO_DRAFT_ASSIGNMENTS.includes(opts.role)) {
    const detail = "This request requires elevated permissions (ADMIN or RESOURCING_MANAGER) to draft an assignment.";
    const event: TraceEvent = {
      type: "permission_denied",
      detail,
      timestamp: Date.now(),
      runId: opts.runId ?? crypto.randomUUID(),
    };
    opts.onTraceEvent?.(event);
    return {
      finalAnswer: detail,
      trace: [event],
    };
  }

  const response = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: opts.message },
    ],
    undefined,
    opts.model
  );

  const runId = opts.runId ?? crypto.randomUUID();
  function record(type: TraceEvent["type"], detail: string): TraceEvent {
    const event: TraceEvent = { type, detail, timestamp: Date.now(), runId };
    opts.onTraceEvent?.(event);
    return event;
  }

  const proposal = tryParseProposal(response.content);
  if (!proposal) {
    return { finalAnswer: response.content, trace: [record("model_thought", response.content)] };
  }

  const pending = await createPendingAction(opts.pool, "draft_assignment", proposal);
  return {
    finalAnswer: `Proposal submitted and awaiting approval (id: ${pending.id}). It won't be booked until a manager approves it.`,
    trace: [record("model_thought", JSON.stringify(proposal))],
  };
}
