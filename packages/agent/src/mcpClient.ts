import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function connectMcpClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "../mcp-server/src/index.ts"],
    // fileURLToPath handles URL-encoding correctly (spaces, non-ASCII, Windows drive letters/
    // backslashes); reading .pathname directly does not.
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: process.env as Record<string, string>,
  });
  const client = new Client({ name: "skillsmatch-agent", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

export async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<{ isError: boolean; text: string }> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text?: string }>)
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return { isError: Boolean(result.isError), text };
}
