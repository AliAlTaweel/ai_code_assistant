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
matching consultants.

ALWAYS format results as a markdown table with this exact format:

| Name | Title | Availability |
|------|-------|--------------|
| John Doe | Senior Backend Engineer | 30 hrs/week |
| Jane Smith | Go Developer | 20 hrs/week |

Rules:
- ALWAYS output a markdown table (never plain text)
- Use columns: Name, Title, Availability
- Extract full_name, title, availability_hours_per_week from tool results
- Format availability as "X hrs/week"
- Keep it concise and scannable
- Include a brief summary before the table if needed`;

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
