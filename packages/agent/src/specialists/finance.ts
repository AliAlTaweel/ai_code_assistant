import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Pool } from "pg";
import type { Role } from "@skillsmatch/shared";
import { runToolLoop, type ToolLoopResult, type TraceEvent } from "../toolLoop.js";

const TOOLS = [
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
If you lack permission, explain that clearly instead of guessing a number.`;

export async function run(opts: {
  message: string;
  role: Role;
  client: Client;
  pool: Pool;
  runId?: string;
  onTraceEvent?: (event: TraceEvent) => void;
}): Promise<ToolLoopResult> {
  return runToolLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: opts.message,
    tools: TOOLS,
    client: opts.client,
    role: opts.role,
    runId: opts.runId,
    onTraceEvent: opts.onTraceEvent,
  });
}
