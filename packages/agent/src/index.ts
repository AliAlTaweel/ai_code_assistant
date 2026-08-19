import { getPool } from "@skillsmatch/shared";
import { connectMcpClient } from "./mcpClient.js";
import { buildApp } from "./server.js";

// KNOWN GAP: there is no authentication/authorization on the HTTP layer yet — anyone who can
// reach this process can call the admin-capable /api/agent/approve route. Until real auth is
// built, the safe default for this stage of the project is to bind to loopback only (below),
// not 0.0.0.0. Do not widen AGENT_HOST beyond 127.0.0.1 without adding auth first.
const AGENT_HOST = process.env.AGENT_HOST ?? "127.0.0.1";
const AGENT_PORT = Number(process.env.AGENT_PORT ?? 3001);

const pool = getPool();

let mcpClient: Awaited<ReturnType<typeof connectMcpClient>>;
try {
  mcpClient = await connectMcpClient();
} catch (err) {
  console.error("Failed to connect to the MCP server:", err);
  await pool.end().catch(() => {});
  process.exit(1);
}

const app = buildApp({ pool, mcpClient });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);
  try {
    await app.close();
  } catch (err) {
    console.error("Error closing HTTP server:", err);
  }
  try {
    await mcpClient.close();
  } catch (err) {
    console.error("Error closing MCP client:", err);
  }
  try {
    await pool.end();
  } catch (err) {
    console.error("Error closing DB pool:", err);
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: AGENT_PORT, host: AGENT_HOST });
  console.log(`agent API listening on http://${AGENT_HOST}:${AGENT_PORT}`);
} catch (err) {
  console.error("Failed to start agent API:", err);
  await mcpClient.close().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
}
