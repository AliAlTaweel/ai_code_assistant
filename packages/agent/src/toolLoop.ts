import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Role } from "@skillsmatch/shared";
import { chat, type OllamaMessage, type OllamaToolDef } from "./ollama.js";
import { callMcpTool } from "./mcpClient.js";

export interface TraceEvent {
  type: "model_thought" | "tool_call" | "tool_result" | "permission_denied";
  detail: string;
}

export interface ToolLoopResult {
  finalAnswer: string;
  trace: TraceEvent[];
}

export interface ToolLoopOptions {
  systemPrompt: string;
  userMessage: string;
  tools: OllamaToolDef[];
  client: Client;
  /** The acting user's real role. Always wins over any requester_role the model supplies. */
  role: Role;
  maxSteps?: number;
}

const MAX_EMPTY_RESULT_RETRIES = 2;

export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const maxSteps = opts.maxSteps ?? 5;
  const trace: TraceEvent[] = [];
  const messages: OllamaMessage[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userMessage },
  ];
  let emptyResultRetries = 0;

  for (let step = 0; step < maxSteps; step++) {
    const response = await chat(messages, opts.tools);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      trace.push({ type: "model_thought", detail: response.content });
      return { finalAnswer: response.content, trace };
    }

    for (const toolCall of response.tool_calls) {
      const { name, arguments: args } = toolCall.function;
      trace.push({ type: "tool_call", detail: `${name}(${JSON.stringify(args)})` });

      // SECURITY: requester_role must always be the trusted, real role of the acting user.
      // The model's tool-call arguments are untrusted input — never let a model-supplied
      // requester_role (hallucinated or a deliberate self-escalation attempt) reach the
      // MCP server's RBAC-gated tools. Unconditionally overwrite, never merge-if-absent.
      const trustedArgs = { ...args, requester_role: opts.role };

      const result = await callMcpTool(opts.client, name, trustedArgs);
      trace.push({ type: "tool_result", detail: result.text });

      if (result.isError && result.text.includes("PERMISSION_DENIED")) {
        trace.push({ type: "permission_denied", detail: result.text });
        return {
          finalAnswer:
            "I don't have permission to access that information, but I can help with what's within my scope.",
          trace,
        };
      }

      if (result.text.trim() === "[]" && emptyResultRetries < MAX_EMPTY_RESULT_RETRIES) {
        emptyResultRetries++;
        messages.push({
          role: "tool",
          content: `${result.text}\n(No results. Retry with relaxed constraints — drop the least important requirement or lower the threshold.)`,
        });
      } else {
        messages.push({ role: "tool", content: result.text });
      }
    }
  }

  return {
    finalAnswer: "I wasn't able to complete this within the allowed number of steps.",
    trace,
  };
}
