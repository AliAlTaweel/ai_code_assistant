import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Pool } from "pg";
import type { Role } from "@skillsmatch/shared";
import { runToolLoop, type ToolLoopResult, type TraceEvent } from "../toolLoop.js";

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_consultant_availability",
      description: "Find consultants matching required skills with enough available hours",
      parameters: {
        type: "object",
        properties: {
          required_skills: { type: "array", items: { type: "string" } },
          min_hours: { type: "number" },
        },
        required: ["required_skills", "min_hours"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a staffing specialist. Use get_consultant_availability to find
matching consultants, then summarize the best matches for the user in plain language.`;

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
