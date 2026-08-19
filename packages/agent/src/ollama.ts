const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const CHAT_MODEL = "qwen2.5-coder:32b";

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    /** Present on some providers/models; used to correlate a tool result back to its call. */
    id?: string;
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  /** Only meaningful on role: "tool" messages — the name of the tool that produced this result. */
  name?: string;
  /** Only meaningful on role: "tool" messages — correlates the result back to its originating call. */
  tool_call_id?: string;
}

export interface OllamaToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export async function chat(
  messages: OllamaMessage[],
  tools?: OllamaToolDef[]
): Promise<OllamaMessage> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: CHAT_MODEL, messages, tools, stream: false }),
  });
  if (!response.ok) {
    throw new Error(`ollama chat failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { message: OllamaMessage };
  return body.message;
}
