import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Pool } from "pg";
import type { Role } from "@skillsmatch/shared";
import { chat } from "../ollama.js";
import { createPendingAction } from "../pendingActions.js";
import type { ToolLoopResult } from "../toolLoop.js";

const SYSTEM_PROMPT = `You are a resourcing specialist. You cannot draft assignments yourself.
When you have a project_id, consultant_id, and hours, respond with ONLY a JSON object of the
shape {"project_id": "...", "consultant_id": "...", "hours": N} and nothing else. If you're
missing information, ask a clarifying question in plain text instead.`;

interface DraftProposal {
  project_id: string;
  consultant_id: string;
  hours: number;
}

function tryParseProposal(content: string): DraftProposal | null {
  try {
    const parsed = JSON.parse(content);
    if (
      typeof parsed.project_id === "string" &&
      typeof parsed.consultant_id === "string" &&
      typeof parsed.hours === "number"
    ) {
      return parsed;
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
}): Promise<ToolLoopResult> {
  const response = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: opts.message },
  ]);

  const proposal = tryParseProposal(response.content);
  if (!proposal) {
    return { finalAnswer: response.content, trace: [{ type: "model_thought", detail: response.content }] };
  }

  const pending = await createPendingAction(opts.pool, "draft_assignment", proposal);
  return {
    finalAnswer: `Proposal submitted and awaiting approval (id: ${pending.id}). It won't be booked until a manager approves it.`,
    trace: [{ type: "model_thought", detail: JSON.stringify(proposal) }],
  };
}
