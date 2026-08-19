import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { existsSync, readFileSync } from "node:fs";
import { chat } from "./ollama.js";
import { classifyIntent } from "./orchestrator.js";
import { callMcpTool } from "./mcpClient.js";
import { getPendingAction, resolvePendingAction } from "./pendingActions.js";
import * as staffing from "./specialists/staffing.js";
import * as finance from "./specialists/finance.js";
import * as resourcing from "./specialists/resourcing.js";
import type { Role } from "@skillsmatch/shared";

const EVAL_REPORT_PATH = new URL("../../../evals/eval_report.json", import.meta.url);

export function buildApp(deps: { pool: Pool; mcpClient: Client }): FastifyInstance {
  const app = Fastify();

  app.post<{ Body: { message: string; role: Role } }>("/api/chat", async (request) => {
    const { message, role } = request.body;
    const intent = await classifyIntent(message);

    if (intent === "staffing_match") {
      return staffing.run({ message, role, client: deps.mcpClient, pool: deps.pool });
    }
    if (intent === "margin_check") {
      return finance.run({ message, role, client: deps.mcpClient, pool: deps.pool });
    }
    if (intent === "draft_assignment") {
      return resourcing.run({ message, role, client: deps.mcpClient, pool: deps.pool });
    }
    const response = await chat([{ role: "user", content: message }]);
    return { finalAnswer: response.content, trace: [] };
  });

  app.post<{ Body: { pendingActionId: string } }>("/api/agent/approve", async (request, reply) => {
    const action = await getPendingAction(deps.pool, request.body.pendingActionId);
    if (!action) {
      return reply.code(404).send({ error: "pending action not found" });
    }
    const result = await callMcpTool(deps.mcpClient, "draft_assignment", {
      ...action.payload,
      requester_role: "ADMIN",
    });
    if (result.isError) {
      return reply.code(422).send({ error: result.text });
    }
    await resolvePendingAction(deps.pool, action.id, "APPROVED");
    return { status: "APPROVED" };
  });

  app.post<{ Body: { pendingActionId: string } }>("/api/agent/reject", async (request, reply) => {
    const action = await getPendingAction(deps.pool, request.body.pendingActionId);
    if (!action) {
      return reply.code(404).send({ error: "pending action not found" });
    }
    await resolvePendingAction(deps.pool, action.id, "REJECTED");
    return { status: "REJECTED" };
  });

  app.get("/api/evals/latest", async (_request, reply) => {
    if (!existsSync(EVAL_REPORT_PATH)) {
      return reply.code(404).send({ error: "no eval report yet" });
    }
    return JSON.parse(readFileSync(EVAL_REPORT_PATH, "utf-8"));
  });

  return app;
}
