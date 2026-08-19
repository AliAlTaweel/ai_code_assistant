import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Role } from "@skillsmatch/shared";
import { chat, type OllamaMessage, type OllamaToolDef } from "./ollama.js";
import { callMcpTool } from "./mcpClient.js";

export interface TraceEvent {
  type: "model_thought" | "tool_call" | "tool_result" | "permission_denied" | "classification";
  detail: string;
  /** Epoch ms at the moment this event was produced (not when it was later flushed/emitted). */
  timestamp: number;
  /** Correlates every event from a single /api/chat invocation, including the classification
   *  event emitted outside runToolLoop, for the (future) eval suite's latency/accuracy metrics. */
  runId: string;
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
  /** Ollama model name to use for this run; falls back to ollama.ts's configured default. */
  model?: string;
  maxSteps?: number;
  /** Correlates this run's trace events with the classification event emitted in server.ts.
   *  Generated with crypto.randomUUID() if not supplied. */
  runId?: string;
  /** Invoked synchronously as soon as each TraceEvent is produced, so callers (server.ts) can
   *  stream it over SSE live/interleaved rather than waiting for the whole run to finish. */
  onTraceEvent?: (event: TraceEvent) => void;
}

const MAX_EMPTY_RESULT_RETRIES = 2;
// Bounds total MCP tool calls across the whole loop, independent of how many loop iterations
// (maxSteps) it took to reach them — a single turn can return several tool_calls at once, so
// bounding on iterations alone lets a run make maxSteps * (calls per turn) MCP calls.
const MAX_TOTAL_TOOL_CALLS = 5;

export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const maxSteps = opts.maxSteps ?? 5;
  const runId = opts.runId ?? crypto.randomUUID();
  const trace: TraceEvent[] = [];
  const messages: OllamaMessage[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userMessage },
  ];
  let emptyResultRetries = 0;
  let totalToolCalls = 0;

  function record(event: Omit<TraceEvent, "timestamp" | "runId">): void {
    const full: TraceEvent = { ...event, timestamp: Date.now(), runId };
    trace.push(full);
    opts.onTraceEvent?.(full);
  }

  for (let step = 0; step < maxSteps; step++) {
    const response = await chat(messages, opts.tools, opts.model);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      record({ type: "model_thought", detail: response.content });
      return { finalAnswer: response.content, trace };
    }

    for (const toolCall of response.tool_calls) {
      if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
        return {
          finalAnswer: "I wasn't able to complete this within the allowed number of tool calls.",
          trace,
        };
      }
      totalToolCalls++;

      const { name, arguments: args } = toolCall.function;
      record({ type: "tool_call", detail: `${name}(${JSON.stringify(args)})` });

      // SECURITY: requester_role must always be the trusted, real role of the acting user.
      // The model's tool-call arguments are untrusted input — never let a model-supplied
      // requester_role (hallucinated or a deliberate self-escalation attempt) reach the
      // MCP server's RBAC-gated tools. Unconditionally overwrite, never merge-if-absent.
      const trustedArgs = { ...args, requester_role: opts.role };

      const result = await callMcpTool(opts.client, name, trustedArgs);
      record({ type: "tool_result", detail: result.text });

      if (result.isError && result.text.includes("PERMISSION_DENIED")) {
        record({ type: "permission_denied", detail: result.text });
        return {
          finalAnswer:
            "I don't have permission to access that information, but I can help with what's within my scope.",
          trace,
        };
      }

      const toolMessage: OllamaMessage = {
        role: "tool",
        content: result.text,
        name,
        tool_call_id: toolCall.id,
      };

      // KNOWN SOFT LIMIT: this relaxation retry is only a prompt nudge, not a deterministic
      // guarantee — the model may ignore the hint and re-issue the same tool call unchanged, or
      // relax the wrong constraint. Accepted tradeoff for now; revisit if eval data shows it's
      // not actually improving empty-result recovery in practice.
      if (result.text.trim() === "[]" && emptyResultRetries < MAX_EMPTY_RESULT_RETRIES) {
        emptyResultRetries++;
        toolMessage.content = `${result.text}\n(No results. Retry with relaxed constraints — drop the least important requirement or lower the threshold.)`;
      }
      messages.push(toolMessage);
    }
  }

  return {
    finalAnswer: "I wasn't able to complete this within the allowed number of steps.",
    trace,
  };
}
