import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getPool } from "@skillsmatch/shared";
import { buildServer } from "./server.js";

const pool = getPool();
pool.on("error", (err) => {
  console.error("[mcp-server] idle client error:", err.message);
});

const server = buildServer(pool);
const transport = new StdioServerTransport();
transport.onclose = () => {
  void pool.end().finally(() => process.exit(0));
};
await server.connect(transport);
