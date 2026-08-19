const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const DEFAULT_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? "qwen2.5-coder:32b";

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
  tools?: OllamaToolDef[],
  model?: string
): Promise<OllamaMessage> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model ?? DEFAULT_CHAT_MODEL, messages, tools, stream: false }),
  });
  if (!response.ok) {
    throw new Error(`ollama chat failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { message: OllamaMessage };
  return body.message;
}

export interface OllamaModelInfo {
  name: string;
  parameterSize?: string;
  supportsTools: boolean;
}

export async function listChatModels(): Promise<OllamaModelInfo[]> {
  const response = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!response.ok) {
    throw new Error(`ollama tags failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as {
    models: Array<{
      name: string;
      details?: { parameter_size?: string };
      capabilities?: string[];
    }>;
  };
  // Only surface models capable of tool calling — the specialists and classifier all rely on
  // structured tool_calls, so a model without that capability (an embedding or vision-only
  // model, for example) would silently fail or be unusable here.
  const models = body.models
    .filter((m) => m.capabilities?.includes("tools"))
    .map((m) => ({
      name: m.name,
      parameterSize: m.details?.parameter_size,
      supportsTools: true,
    }));

  // Sort to put gemma4:e4b first (preferred default), then rest in original order
  const gemmaIndex = models.findIndex((m) => m.name === "gemma4:e4b");
  if (gemmaIndex > 0) {
    const [gemma] = models.splice(gemmaIndex, 1);
    models.unshift(gemma);
  }
  return models;
}
