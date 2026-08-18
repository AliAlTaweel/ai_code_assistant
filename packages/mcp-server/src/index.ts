import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getPool } from "@skillsmatch/shared";
import { buildServer } from "./server.js";

const pool = getPool();
const server = buildServer(pool);
const transport = new StdioServerTransport();
await server.connect(transport);
