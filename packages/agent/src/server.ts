import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import type { Pool } from "pg";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { existsSync, readFileSync } from "node:fs";
import { chat, listChatModels } from "./ollama.js";
import { classifyIntent } from "./orchestrator.js";
import { callMcpTool } from "./mcpClient.js";
import {
  getPendingAction,
  resolvePendingAction,
  revertPendingAction,
  listPendingActions,
} from "./pendingActions.js";
import * as staffing from "./specialists/staffing.js";
import * as finance from "./specialists/finance.js";
import * as resourcing from "./specialists/resourcing.js";
import type { Role } from "@skillsmatch/shared";
import type { TraceEvent } from "./toolLoop.js";

const EVAL_REPORT_PATH = new URL("../../../evals/eval_report.json", import.meta.url);

// Vite dev server origin for apps/web. Overridable for non-default dev ports/hosts.
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

// The "general" intent has no tools and no grounding data available to it — it must never
// state specific financial/staffing facts as if it looked them up, since it didn't.
const GENERAL_SYSTEM_PROMPT = `You are a general-purpose assistant for a staffing platform. You
have NOT looked up any real data for this request — you have no access to tools, consultant
records, project records, financial figures, or availability data in this conversation. Never
state specific financial figures, staffing assignments, consultant availability, or margins as
fact. If the request seems to need real data to answer accurately, say plainly that you don't
have that information rather than guessing or inventing a plausible-sounding number.`;

const sseClients = new Set<FastifyReply>();

function emitTrace(event: TraceEvent): void {
  const payload = `event: trace\ndata: ${JSON.stringify(event)}\n\n`;
  for (const reply of sseClients) {
    reply.raw.write(payload);
  }
}

export function buildApp(deps: { pool: Pool; mcpClient: Client }): FastifyInstance {
  const app = Fastify();

  // Registered synchronously (not awaited): Fastify queues plugin registration and resolves it
  // before app.listen()/app.ready()/app.inject() encapsulate, so routes below can still be
  // declared synchronously and existing test call sites that use app.inject() directly (without
  // an explicit await app.ready() first) continue to work unchanged.
  app.register(cors, { origin: WEB_ORIGIN });

  app.post<{ Body: { message: string; role: Role; model?: string } }>(
    "/api/chat",
    {
      schema: {
        body: {
          type: "object",
          required: ["message", "role"],
          properties: {
            message: { type: "string", minLength: 1 },
            role: { type: "string" },
            model: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const { message, role, model } = request.body;
      const runId = crypto.randomUUID();
      const intent = await classifyIntent(message, model);

      // Emitted immediately (not batched with the specialist's trace) so the classification
      // shows up live in the trace stream before the specialist run even starts.
      emitTrace({ type: "classification", detail: intent, timestamp: Date.now(), runId });

      // Dedupe guard: real specialist runs stream each event live via onTraceEvent as it's
      // produced (see toolLoop.ts), but the trace array returned by `run()` still contains
      // those same event objects (by reference). Mocked specialists in tests, however,
      // fabricate a fresh trace array that was never routed through onTraceEvent. Emitting by
      // identity here means real runs aren't double-emitted, while tests that mock the
      // specialist and only ever get a trace via the return value still see it emitted.
      const alreadyEmitted = new Set<TraceEvent>();
      const onTraceEvent = (event: TraceEvent): void => {
        alreadyEmitted.add(event);
        emitTrace(event);
      };

      let result: { finalAnswer: string; trace: TraceEvent[] };
      if (intent === "staffing_match") {
        result = await staffing.run({
          message,
          role,
          client: deps.mcpClient,
          pool: deps.pool,
          runId,
          model,
          onTraceEvent,
        });
      } else if (intent === "margin_check") {
        result = await finance.run({
          message,
          role,
          client: deps.mcpClient,
          pool: deps.pool,
          runId,
          model,
          onTraceEvent,
        });
      } else if (intent === "draft_assignment") {
        result = await resourcing.run({
          message,
          role,
          client: deps.mcpClient,
          pool: deps.pool,
          runId,
          model,
          onTraceEvent,
        });
      } else {
        const response = await chat(
          [
            { role: "system", content: GENERAL_SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
          undefined,
          model
        );
        result = { finalAnswer: response.content, trace: [] };
      }

      for (const event of result.trace) {
        if (!alreadyEmitted.has(event)) {
          emitTrace(event);
        }
      }
      return result;
    }
  );

  app.post<{ Body: { pendingActionId: string } }>("/api/agent/approve", async (request, reply) => {
    const { pendingActionId } = request.body;

    // First check whether the row exists at all, purely to distinguish 404 ("no such pending
    // action") from 409 ("exists, but not resolvable right now") below.
    const existing = await getPendingAction(deps.pool, pendingActionId);
    if (!existing) {
      return reply.code(404).send({ error: "pending action not found" });
    }

    // Atomically claim the row (WAITING_FOR_APPROVAL -> APPROVED) BEFORE calling the mutating
    // MCP tool. This is the actual race guard: the conditional UPDATE in resolvePendingAction
    // ensures at most one concurrent /approve (or /reject) request can ever win this claim,
    // even if both requests read status=WAITING_FOR_APPROVAL at the same time. A pre-check
    // alone can't close that race; the atomic UPDATE can.
    const claimed = await resolvePendingAction(deps.pool, pendingActionId, "APPROVED");
    if (!claimed) {
      return reply.code(409).send({ error: `pending action is already ${existing.status}` });
    }

    const result = await callMcpTool(deps.mcpClient, "draft_assignment", {
      ...claimed.payload,
      requester_role: "ADMIN",
    });
    if (result.isError) {
      // The write failed after we'd already claimed the row — revert the claim so the action
      // goes back to WAITING_FOR_APPROVAL and can be retried, instead of being stuck as
      // "approved" with no assignment actually created.
      await revertPendingAction(deps.pool, pendingActionId, "APPROVED");
      return reply.code(422).send({ error: result.text });
    }
    return { status: "APPROVED" };
  });

  app.post<{ Body: { pendingActionId: string } }>("/api/agent/reject", async (request, reply) => {
    const { pendingActionId } = request.body;
    const existing = await getPendingAction(deps.pool, pendingActionId);
    if (!existing) {
      return reply.code(404).send({ error: "pending action not found" });
    }

    const resolved = await resolvePendingAction(deps.pool, pendingActionId, "REJECTED");
    if (!resolved) {
      return reply.code(409).send({ error: `pending action is already ${existing.status}` });
    }
    return { status: "REJECTED" };
  });

  app.get("/api/users", async () => {
    const { rows } = await deps.pool.query(`SELECT id, name, role FROM users ORDER BY name`);
    return rows;
  });

  app.get("/api/models", async (_request, reply) => {
    try {
      return await listChatModels();
    } catch (err) {
      return reply.code(502).send({ error: `Ollama unreachable: ${(err as Error).message}` });
    }
  });

  app.get("/api/agent/pending-actions", async () => {
    return listPendingActions(deps.pool);
  });

  app.get("/api/trace/stream", (request, reply) => {
    // Fastify manages the raw response lifecycle for us by default; since this route writes
    // to reply.raw directly and never calls reply.send()/lets Fastify end the response, we
    // must hijack() it to opt out of that lifecycle management. Required for forward-compat
    // with Fastify v5's stricter handling of routes that manage their own raw response.
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // Flush headers immediately so the client's connection is established right away,
    // rather than waiting for the first emitTrace() write (which may be seconds away,
    // or may never come for a connection that just watches future chats).
    reply.raw.flushHeaders();
    sseClients.add(reply);
    request.raw.on("close", () => sseClients.delete(reply));
  });

  app.get("/api/evals/latest", async (_request, reply) => {
    if (!existsSync(EVAL_REPORT_PATH)) {
      return reply.code(404).send({ error: "no eval report yet" });
    }
    return JSON.parse(readFileSync(EVAL_REPORT_PATH, "utf-8"));
  });

  return app;
}
