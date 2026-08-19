import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Pool } from "pg";
import type { Role } from "@skillsmatch/shared";
import { runToolLoop, type ToolLoopResult, type TraceEvent } from "../toolLoop.js";

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "find_consultant_by_name",
      description: "Look up a consultant's id by (partial) full name",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project_margin",
      description: "Compute the gross profit margin percent for a consultant at a target bill rate",
      parameters: {
        type: "object",
        properties: {
          consultant_id: { type: "string" },
          target_bill_rate: { type: "number" },
        },
        required: ["consultant_id", "target_bill_rate"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a finance specialist. Use get_project_margin to compute margins.
get_project_margin requires a consultant_id (a UUID), never a name. If the user gives you a
consultant's name instead of an id, call find_consultant_by_name first to resolve it.
- If it returns no matches, tell the user you couldn't find that consultant — do not guess an id.
- If it returns more than one match, list the names and ask the user which one they mean.
- If it returns exactly one match, use its id and proceed.
Never state or imply a permission problem unless a tool call actually returned PERMISSION_DENIED.
If you lack permission, explain that clearly instead of guessing a number.`;

export async function run(opts: {
  message: string;
  role: Role;
  client: Client;
  pool: Pool;
  runId?: string;
  model?: string;
  onTraceEvent?: (event: TraceEvent) => void;
}): Promise<ToolLoopResult> {
  return runToolLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: opts.message,
    tools: TOOLS,
    client: opts.client,
    role: opts.role,
    runId: opts.runId,
    model: opts.model,
    onTraceEvent: opts.onTraceEvent,
  });
}
