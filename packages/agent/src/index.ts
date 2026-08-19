import { getPool } from "@skillsmatch/shared";
import { connectMcpClient } from "./mcpClient.js";
import { buildApp } from "./server.js";

const pool = getPool();
const mcpClient = await connectMcpClient();
const app = buildApp({ pool, mcpClient });

await app.listen({ port: 3001, host: "0.0.0.0" });
console.log("agent API listening on http://localhost:3001");
