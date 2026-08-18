# Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the orchestrator + specialist multi-agent engine and its HTTP/SSE API: classify each request, dispatch to a scoped specialist that runs a bounded Ollama+MCP tool loop, gate `draft_assignment` behind human approval, and stream every step to the dashboard.

**Architecture:** `packages/agent` spawns the MCP server (previous plan) as a stdio child process and talks to it via the MCP client SDK. Each specialist is built on one shared, generically-typed tool loop (`runToolLoop`) that only differs by which tools it's given and its system prompt. A Fastify server exposes chat, SSE trace streaming, and HITL approve/reject endpoints.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` (client side), Fastify, `pg`, Vitest. Requires the Data Layer and MCP Server plans already applied, and Ollama running locally with `qwen2.5-coder:32b` pulled.

**Spec:** `docs/superpowers/specs/2026-08-18-skillsmatch-mcp-design.md` (§ Multi-Agent Orchestration)

## Global Constraints

- `DATABASE_URL`/`TEST_DATABASE_URL`/`OLLAMA_URL` env conventions from the Data Layer plan
- Chat model: `qwen2.5-coder:32b` via Ollama's OpenAI-compatible `/api/chat` endpoint, using its native `tools` (function-calling) support
- Roles: `ADMIN`, `RESOURCING_MANAGER`, `CONSULTANT`, `FINANCE` (`@skillsmatch/shared`'s `Role`)
- Every MCP tool call from the agent must set `requester_role` to the acting user's real role (from `@skillsmatch/shared`'s `Role`) — never hardcode or omit it
- Tool loop cap: 5 tool calls per specialist run; empty-result retry cap: 2, with the relaxation disclosed in the final answer
- `PERMISSION_DENIED` responses are caught, never retried, never hallucinated around
- `draft_assignment` is never called by a specialist directly — only via the `POST /api/agent/approve` HITL path

---

## File Structure

```
packages/agent/
  package.json
  src/
    ollama.ts               # chat(messages, tools?) client
    mcpClient.ts             # spawns mcp-server, wraps callTool
    pendingActions.ts        # pending_actions CRUD
    orchestrator.ts           # classifyIntent(message)
    toolLoop.ts                # runToolLoop(...) shared by all specialists
    specialists/
      staffing.ts
      finance.ts
      resourcing.ts
    server.ts                   # Fastify app: routes + SSE
    index.ts                     # entrypoint: starts the Fastify server
  test/
    ollama.test.ts
    pendingActions.test.ts
    orchestrator.test.ts
    toolLoop.test.ts
    specialists.test.ts
    server.test.ts
```

## Task 1: Ollama chat client

**Files:**
- Create: `packages/agent/package.json`
- Create: `packages/agent/src/ollama.ts`
- Test: `packages/agent/test/ollama.test.ts`

**Interfaces:**
- Produces: `OllamaMessage` (`{ role: "system"|"user"|"assistant"|"tool", content: string, tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> }`), `OllamaToolDef` (`{ type: "function", function: { name: string; description: string; parameters: Record<string, unknown> } }`), `chat(messages: OllamaMessage[], tools?: OllamaToolDef[]): Promise<OllamaMessage>`. Every later task in this plan imports these types and `chat` from `./ollama.js`.

- [ ] **Step 1: Write `packages/agent/package.json`**

```json
{
  "name": "@skillsmatch/agent",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@skillsmatch/shared": "*",
    "@modelcontextprotocol/sdk": "^1.15.0",
    "fastify": "^4.28.1",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.6"
  }
}
```

- [ ] **Step 2: Write the failing test (mocks `fetch`, no live Ollama call)**

```typescript
// packages/agent/test/ollama.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { chat } from "../src/ollama.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat", () => {
  it("posts messages and tools to the Ollama /api/chat endpoint and returns message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { role: "assistant", content: "hello" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await chat([{ role: "user", content: "hi" }]);

    expect(result).toEqual({ role: "assistant", content: "hello" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/chat");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("qwen2.5-coder:32b");
    expect(body.stream).toBe(false);
  });

  it("throws with response text when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" })
    );
    await expect(chat([{ role: "user", content: "hi" }])).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- packages/agent/test/ollama.test.ts`
Expected: FAIL — `src/ollama.js` does not exist.

- [ ] **Step 4: Write `packages/agent/src/ollama.ts`**

```typescript
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const CHAT_MODEL = "qwen2.5-coder:32b";

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- packages/agent/test/ollama.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/package.json packages/agent/src/ollama.ts packages/agent/test/ollama.test.ts
git commit -m "feat: add ollama chat client"
```

---

## Task 2: MCP client wrapper

**Files:**
- Create: `packages/agent/src/mcpClient.ts`
- Test: `packages/agent/test/mcpClient.test.ts`

**Interfaces:**
- Consumes: the MCP server's stdio entrypoint at `packages/mcp-server/src/index.ts` (previous plan).
- Produces: `connectMcpClient(): Promise<Client>` (spawns the server, connects, returns the SDK `Client`), `callMcpTool(client: Client, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }>` — flattens the SDK's content-block response into a single string plus an error flag. All three specialists (Task 6) call tools exclusively through `callMcpTool`.

**Requires:** the MCP Server plan already implemented (`packages/mcp-server/src/index.ts` runnable), and the Data Layer plan's schema/seed/embeddings applied so tool calls have real data to return.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent/test/mcpClient.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { connectMcpClient, callMcpTool } from "../src/mcpClient.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

let client: Client;

afterAll(async () => {
  await client?.close();
});

describe("mcpClient", () => {
  it("connects to the MCP server and calls get_consultant_availability", async () => {
    client = await connectMcpClient();
    const result = await callMcpTool(client, "get_consultant_availability", {
      required_skills: ["Go"],
      min_hours: 5,
      requester_role: "CONSULTANT",
    });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("full_name");
  });

  it("surfaces a PERMISSION_DENIED tool error without throwing", async () => {
    const result = await callMcpTool(client, "get_project_margin", {
      consultant_id: "00000000-0000-0000-0000-000000000000",
      target_bill_rate: 100,
      requester_role: "CONSULTANT",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("PERMISSION_DENIED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/agent/test/mcpClient.test.ts`
Expected: FAIL — `src/mcpClient.js` does not exist.

- [ ] **Step 3: Write `packages/agent/src/mcpClient.ts`**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function connectMcpClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "../mcp-server/src/index.ts"],
    cwd: new URL("../", import.meta.url).pathname,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/agent/test/mcpClient.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/mcpClient.ts packages/agent/test/mcpClient.test.ts
git commit -m "feat: add MCP client wrapper for the agent"
```

---

## Task 3: `pending_actions` store

**Files:**
- Create: `packages/agent/src/pendingActions.ts`
- Test: `packages/agent/test/pendingActions.test.ts`

**Interfaces:**
- Consumes: `pending_actions` table (Data Layer plan), `getPool` from `@skillsmatch/shared`.
- Produces: `createPendingAction(pool, type: string, payload: object): Promise<{ id: string }>`, `resolvePendingAction(pool, id: string, status: "APPROVED" | "REJECTED"): Promise<void>`, `getPendingAction(pool, id: string): Promise<{ id: string; type: string; payload: Record<string, unknown>; status: string } | null>`. Task 6's resourcing specialist calls `createPendingAction`; Task 7's `/api/agent/approve` and `/api/agent/reject` routes call `getPendingAction` + `resolvePendingAction`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent/test/pendingActions.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { getPool } from "@skillsmatch/shared";
import {
  createPendingAction,
  resolvePendingAction,
  getPendingAction,
} from "../src/pendingActions.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

beforeAll(async () => {
  const client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf-8"));
  await client.end();
});

afterAll(async () => {
  await getPool(TEST_URL).end();
});

describe("pendingActions", () => {
  it("creates, reads, and resolves a pending action", async () => {
    const pool = getPool(TEST_URL);
    const created = await createPendingAction(pool, "draft_assignment", {
      project_id: "00000000-0000-0000-0000-000000000000",
      consultant_id: "00000000-0000-0000-0000-000000000000",
      hours: 10,
    });
    expect(created.id).toBeTruthy();

    const fetched = await getPendingAction(pool, created.id);
    expect(fetched?.status).toBe("WAITING_FOR_APPROVAL");
    expect(fetched?.payload.hours).toBe(10);

    await resolvePendingAction(pool, created.id, "APPROVED");
    const resolved = await getPendingAction(pool, created.id);
    expect(resolved?.status).toBe("APPROVED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/agent/test/pendingActions.test.ts`
Expected: FAIL — `src/pendingActions.js` does not exist.

- [ ] **Step 3: Write `packages/agent/src/pendingActions.ts`**

```typescript
import type { Pool } from "pg";

export interface PendingAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "WAITING_FOR_APPROVAL" | "APPROVED" | "REJECTED";
}

export async function createPendingAction(
  pool: Pool,
  type: string,
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pending_actions (type, payload) VALUES ($1, $2) RETURNING id`,
    [type, JSON.stringify(payload)]
  );
  return rows[0];
}

export async function getPendingAction(pool: Pool, id: string): Promise<PendingAction | null> {
  const { rows } = await pool.query<PendingAction>(
    `SELECT id, type, payload, status FROM pending_actions WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function resolvePendingAction(
  pool: Pool,
  id: string,
  status: "APPROVED" | "REJECTED"
): Promise<void> {
  await pool.query(
    `UPDATE pending_actions SET status = $1, resolved_at = now() WHERE id = $2`,
    [status, id]
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/agent/test/pendingActions.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/pendingActions.ts packages/agent/test/pendingActions.test.ts
git commit -m "feat: add pending_actions store for HITL gate"
```

---

## Task 4: Orchestrator intent classifier

**Files:**
- Create: `packages/agent/src/orchestrator.ts`
- Test: `packages/agent/test/orchestrator.test.ts`

**Interfaces:**
- Consumes: `chat` from `./ollama.js` (Task 1).
- Produces: `Intent` (`"staffing_match" | "margin_check" | "draft_assignment" | "general"`), `classifyIntent(message: string): Promise<Intent>`. Task 7's `/api/chat` route calls this first to pick a specialist.

- [ ] **Step 1: Write the failing test (mocks `chat`)**

```typescript
// packages/agent/test/orchestrator.test.ts
import { describe, it, expect, vi } from "vitest";
import * as ollama from "../src/ollama.js";
import { classifyIntent } from "../src/orchestrator.js";

describe("classifyIntent", () => {
  it("parses a valid intent label from the model response", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({ role: "assistant", content: "staffing_match" });
    const intent = await classifyIntent("Find me a senior Go engineer for Project Alpha");
    expect(intent).toBe("staffing_match");
  });

  it("falls back to general when the model returns an unrecognized label", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({ role: "assistant", content: "not-a-real-intent" });
    const intent = await classifyIntent("What's the weather?");
    expect(intent).toBe("general");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/agent/test/orchestrator.test.ts`
Expected: FAIL — `src/orchestrator.js` does not exist.

- [ ] **Step 3: Write `packages/agent/src/orchestrator.ts`**

```typescript
import { chat } from "./ollama.js";

export type Intent = "staffing_match" | "margin_check" | "draft_assignment" | "general";
const VALID_INTENTS: Intent[] = ["staffing_match", "margin_check", "draft_assignment", "general"];

const SYSTEM_PROMPT = `You are an intent classifier for a staffing platform. Read the user's
message and respond with exactly one label, nothing else: staffing_match, margin_check,
draft_assignment, or general.
- staffing_match: finding consultants by skill/availability
- margin_check: computing profit margin for a consultant/project combination
- draft_assignment: explicitly asking to assign/book a consultant to a project
- general: anything else`;

export async function classifyIntent(message: string): Promise<Intent> {
  const response = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: message },
  ]);
  const label = response.content.trim().toLowerCase() as Intent;
  return VALID_INTENTS.includes(label) ? label : "general";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/agent/test/orchestrator.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/orchestrator.ts packages/agent/test/orchestrator.test.ts
git commit -m "feat: add orchestrator intent classifier"
```

---

## Task 5: Shared tool loop with resilience

**Files:**
- Create: `packages/agent/src/toolLoop.ts`
- Test: `packages/agent/test/toolLoop.test.ts`

**Interfaces:**
- Consumes: `OllamaMessage`/`OllamaToolDef`/`chat` from `./ollama.js`, `callMcpTool` from `./mcpClient.js`.
- Produces:
  - `TraceEvent` (`{ type: "model_thought" | "tool_call" | "tool_result" | "permission_denied"; detail: string }`)
  - `ToolLoopResult` (`{ finalAnswer: string; trace: TraceEvent[] }`)
  - `runToolLoop(opts: { systemPrompt: string; userMessage: string; tools: OllamaToolDef[]; client: Client; maxSteps?: number }): Promise<ToolLoopResult>` — drives the chat↔tool cycle (default `maxSteps` 5), appends a `TraceEvent` for each model turn and each tool call/result, converts any `isError` MCP response whose text contains `PERMISSION_DENIED` into a `permission_denied` trace event and a final answer that explains the denial without another tool attempt, and retries once with a system-prompt hint to relax constraints (capped at 2 relaxation retries total) when a tool call returns an empty JSON array `[]` as its text. All three specialists (Task 6) call this directly.

- [ ] **Step 1: Write the failing test (mocks `chat` and `callMcpTool`)**

```typescript
// packages/agent/test/toolLoop.test.ts
import { describe, it, expect, vi } from "vitest";
import * as ollama from "../src/ollama.js";
import * as mcp from "../src/mcpClient.js";
import { runToolLoop } from "../src/toolLoop.js";

const TOOL_DEF = {
  type: "function" as const,
  function: { name: "get_consultant_availability", description: "d", parameters: {} },
};

describe("runToolLoop", () => {
  it("executes a tool call the model requests, then returns the model's final answer", async () => {
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_consultant_availability", arguments: { required_skills: ["Go"], min_hours: 10 } } }],
      })
      .mockResolvedValueOnce({ role: "assistant", content: "Found Alice Chen." });
    vi.spyOn(mcp, "callMcpTool").mockResolvedValue({
      isError: false,
      text: '[{"full_name":"Alice Chen"}]',
    });

    const result = await runToolLoop({
      systemPrompt: "sys",
      userMessage: "find a go engineer",
      tools: [TOOL_DEF],
      client: {} as any,
    });

    expect(result.finalAnswer).toBe("Found Alice Chen.");
    expect(result.trace.some((e) => e.type === "tool_call")).toBe(true);
    expect(result.trace.some((e) => e.type === "tool_result")).toBe(true);
    expect(chatSpy).toHaveBeenCalledTimes(2);
  });

  it("stops and explains on a PERMISSION_DENIED tool result without retrying", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValueOnce({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "get_project_margin", arguments: {} } }],
    });
    vi.spyOn(mcp, "callMcpTool").mockResolvedValue({
      isError: true,
      text: "PERMISSION_DENIED: Operational scope required: [FINANCE_READ]",
    });

    const result = await runToolLoop({
      systemPrompt: "sys",
      userMessage: "what's the margin?",
      tools: [TOOL_DEF],
      client: {} as any,
    });

    expect(result.trace.some((e) => e.type === "permission_denied")).toBe(true);
    expect(result.finalAnswer.toLowerCase()).toContain("permission");
  });

  it("retries once with relaxed constraints on an empty tool result, then stops after 2 retries", async () => {
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_consultant_availability", arguments: {} } }],
      })
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_consultant_availability", arguments: {} } }],
      })
      .mockResolvedValueOnce({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_consultant_availability", arguments: {} } }],
      })
      .mockResolvedValueOnce({ role: "assistant", content: "No consultants match, even relaxed." });
    vi.spyOn(mcp, "callMcpTool").mockResolvedValue({ isError: false, text: "[]" });

    const result = await runToolLoop({
      systemPrompt: "sys",
      userMessage: "find an impossible combo",
      tools: [TOOL_DEF],
      client: {} as any,
    });

    // 3 tool-call turns (1 initial + 2 relaxation retries) + 1 final answer turn = 4 chat calls
    expect(chatSpy).toHaveBeenCalledTimes(4);
    expect(result.finalAnswer).toContain("No consultants match");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/agent/test/toolLoop.test.ts`
Expected: FAIL — `src/toolLoop.js` does not exist.

- [ ] **Step 3: Write `packages/agent/src/toolLoop.ts`**

```typescript
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { chat, type OllamaMessage, type OllamaToolDef } from "./ollama.js";
import { callMcpTool } from "./mcpClient.js";

export interface TraceEvent {
  type: "model_thought" | "tool_call" | "tool_result" | "permission_denied";
  detail: string;
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
  maxSteps?: number;
}

const MAX_EMPTY_RESULT_RETRIES = 2;

export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const maxSteps = opts.maxSteps ?? 5;
  const trace: TraceEvent[] = [];
  const messages: OllamaMessage[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userMessage },
  ];
  let emptyResultRetries = 0;

  for (let step = 0; step < maxSteps; step++) {
    const response = await chat(messages, opts.tools);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      trace.push({ type: "model_thought", detail: response.content });
      return { finalAnswer: response.content, trace };
    }

    for (const toolCall of response.tool_calls) {
      const { name, arguments: args } = toolCall.function;
      trace.push({ type: "tool_call", detail: `${name}(${JSON.stringify(args)})` });

      const result = await callMcpTool(opts.client, name, args);
      trace.push({ type: "tool_result", detail: result.text });

      if (result.isError && result.text.includes("PERMISSION_DENIED")) {
        trace.push({ type: "permission_denied", detail: result.text });
        return {
          finalAnswer:
            "I don't have permission to access that information, but I can help with what's within my scope.",
          trace,
        };
      }

      if (result.text.trim() === "[]" && emptyResultRetries < MAX_EMPTY_RESULT_RETRIES) {
        emptyResultRetries++;
        messages.push({
          role: "tool",
          content: `${result.text}\n(No results. Retry with relaxed constraints — drop the least important requirement or lower the threshold.)`,
        });
      } else {
        messages.push({ role: "tool", content: result.text });
      }
    }
  }

  return {
    finalAnswer: "I wasn't able to complete this within the allowed number of steps.",
    trace,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/agent/test/toolLoop.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/toolLoop.ts packages/agent/test/toolLoop.test.ts
git commit -m "feat: add shared tool loop with permission and retry resilience"
```

---

## Task 6: Specialists

**Files:**
- Create: `packages/agent/src/specialists/staffing.ts`
- Create: `packages/agent/src/specialists/finance.ts`
- Create: `packages/agent/src/specialists/resourcing.ts`
- Test: `packages/agent/test/specialists.test.ts`

**Interfaces:**
- Consumes: `runToolLoop` (Task 5), `createPendingAction` (Task 3), `Role` from `@skillsmatch/shared`.
- Produces: each specialist exports `run(opts: { message: string; role: Role; client: Client; pool: Pool }): Promise<ToolLoopResult>`.
  - `staffing.run` — only exposes the `get_consultant_availability` tool definition to the loop.
  - `finance.run` — only exposes `get_project_margin`.
  - `resourcing.run` — does **not** expose `draft_assignment` as an Ollama tool at all (per the spec, a specialist must not even be able to attempt it). Instead its system prompt instructs the model to respond with a JSON object `{ "project_id": ..., "consultant_id": ..., "hours": ... }` when it has enough information to propose an assignment; `resourcing.run` parses that JSON, calls `createPendingAction(pool, "draft_assignment", payload)`, and returns a `finalAnswer` telling the user the proposal is awaiting approval. If the model's response isn't parseable JSON, `resourcing.run` returns its plain-text content as the answer (treated as a clarifying question, not a proposal).
  Task 7's `/api/chat` route dispatches to whichever specialist's `run` matches the orchestrator's classified `Intent` (`staffing_match` → staffing, `margin_check` → finance, `draft_assignment` → resourcing; `general` gets a plain `chat()` call with no tools, handled directly in `server.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent/test/specialists.test.ts
import { describe, it, expect, vi } from "vitest";
import * as ollama from "../src/ollama.js";
import * as mcp from "../src/mcpClient.js";
import * as pendingActions from "../src/pendingActions.js";
import { run as staffingRun } from "../src/specialists/staffing.js";
import { run as resourcingRun } from "../src/specialists/resourcing.js";

describe("staffing specialist", () => {
  it("only offers get_consultant_availability as a tool", async () => {
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValue({ role: "assistant", content: "no consultants needed" });

    await staffingRun({ message: "hi", role: "CONSULTANT", client: {} as any, pool: {} as any });

    const toolsPassed = chatSpy.mock.calls[0][1];
    expect(toolsPassed).toHaveLength(1);
    expect(toolsPassed?.[0].function.name).toBe("get_consultant_availability");
  });
});

describe("resourcing specialist", () => {
  it("creates a pending action and reports it's awaiting approval when the model proposes JSON", async () => {
    vi.spyOn(ollama, "chat").mockResolvedValue({
      role: "assistant",
      content: JSON.stringify({
        project_id: "00000000-0000-0000-0000-000000000000",
        consultant_id: "00000000-0000-0000-0000-000000000000",
        hours: 10,
      }),
    });
    const createSpy = vi
      .spyOn(pendingActions, "createPendingAction")
      .mockResolvedValue({ id: "pending-1" });

    const result = await resourcingRun({
      message: "assign Alice to Project Alpha for 10 hours",
      role: "RESOURCING_MANAGER",
      client: {} as any,
      pool: {} as any,
    });

    expect(createSpy).toHaveBeenCalledWith(
      {},
      "draft_assignment",
      expect.objectContaining({ hours: 10 })
    );
    expect(result.finalAnswer.toLowerCase()).toContain("awaiting approval");
  });

  it("never passes draft_assignment as a tool to the model", async () => {
    const chatSpy = vi
      .spyOn(ollama, "chat")
      .mockResolvedValue({ role: "assistant", content: "which project?" });

    await resourcingRun({ message: "assign someone", role: "RESOURCING_MANAGER", client: {} as any, pool: {} as any });

    const toolsPassed = chatSpy.mock.calls[0][1];
    expect(toolsPassed ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/agent/test/specialists.test.ts`
Expected: FAIL — specialist modules do not exist.

- [ ] **Step 3: Write `packages/agent/src/specialists/staffing.ts`**

```typescript
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Pool } from "pg";
import type { Role } from "@skillsmatch/shared";
import { runToolLoop, type ToolLoopResult } from "../toolLoop.js";

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_consultant_availability",
      description: "Find consultants matching required skills with enough available hours",
      parameters: {
        type: "object",
        properties: {
          required_skills: { type: "array", items: { type: "string" } },
          min_hours: { type: "number" },
        },
        required: ["required_skills", "min_hours"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a staffing specialist. Use get_consultant_availability to find
matching consultants, then summarize the best matches for the user in plain language.`;

export async function run(opts: {
  message: string;
  role: Role;
  client: Client;
  pool: Pool;
}): Promise<ToolLoopResult> {
  return runToolLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: opts.message,
    tools: TOOLS,
    client: opts.client,
  });
}
```

- [ ] **Step 4: Write `packages/agent/src/specialists/finance.ts`**

```typescript
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Pool } from "pg";
import type { Role } from "@skillsmatch/shared";
import { runToolLoop, type ToolLoopResult } from "../toolLoop.js";

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_project_margin",
      description: "Compute the gross profit margin percent for a consultant at a target bill rate",
      parameters: {
        type: "object",
        properties: {
          consultant_id: { type: "string" },
          target_bill_rate: { type: "number" },
        },
        required: ["consultant_id", "target_bill_rate"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are a finance specialist. Use get_project_margin to compute margins.
If you lack permission, explain that clearly instead of guessing a number.`;

export async function run(opts: {
  message: string;
  role: Role;
  client: Client;
  pool: Pool;
}): Promise<ToolLoopResult> {
  return runToolLoop({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: opts.message,
    tools: TOOLS,
    client: opts.client,
  });
}
```

- [ ] **Step 5: Write `packages/agent/src/specialists/resourcing.ts`**

```typescript
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Pool } from "pg";
import type { Role } from "@skillsmatch/shared";
import { chat } from "../ollama.js";
import { createPendingAction } from "../pendingActions.js";
import type { ToolLoopResult } from "../toolLoop.js";

const SYSTEM_PROMPT = `You are a resourcing specialist. You cannot draft assignments yourself.
When you have a project_id, consultant_id, and hours, respond with ONLY a JSON object of the
shape {"project_id": "...", "consultant_id": "...", "hours": N} and nothing else. If you're
missing information, ask a clarifying question in plain text instead.`;

interface DraftProposal {
  project_id: string;
  consultant_id: string;
  hours: number;
}

function tryParseProposal(content: string): DraftProposal | null {
  try {
    const parsed = JSON.parse(content);
    if (
      typeof parsed.project_id === "string" &&
      typeof parsed.consultant_id === "string" &&
      typeof parsed.hours === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function run(opts: {
  message: string;
  role: Role;
  client: Client;
  pool: Pool;
}): Promise<ToolLoopResult> {
  const response = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: opts.message },
  ]);

  const proposal = tryParseProposal(response.content);
  if (!proposal) {
    return { finalAnswer: response.content, trace: [{ type: "model_thought", detail: response.content }] };
  }

  const pending = await createPendingAction(opts.pool, "draft_assignment", proposal);
  return {
    finalAnswer: `Proposal submitted and awaiting approval (id: ${pending.id}). It won't be booked until a manager approves it.`,
    trace: [{ type: "model_thought", detail: JSON.stringify(proposal) }],
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- packages/agent/test/specialists.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/specialists packages/agent/test/specialists.test.ts
git commit -m "feat: add staffing, finance, and resourcing specialists"
```

---

## Task 7: Fastify HTTP/SSE API

**Files:**
- Create: `packages/agent/src/server.ts`
- Create: `packages/agent/src/index.ts`
- Test: `packages/agent/test/server.test.ts`

**Interfaces:**
- Consumes: `classifyIntent` (Task 4), all three specialists (Task 6), `getPendingAction`/`resolvePendingAction` (Task 3), `connectMcpClient` (Task 2), `callMcpTool` (Task 2, used directly for the actual `draft_assignment` call on approval), `getPool` from `@skillsmatch/shared`.
- Produces: `buildApp(deps: { pool: Pool; mcpClient: Client }): FastifyInstance` with routes:
  - `POST /api/chat` — body `{ message: string; role: Role }`; classifies intent, dispatches to the matching specialist (or a plain `chat()` call for `general`), returns `{ finalAnswer: string, trace: TraceEvent[] }`.
  - `POST /api/agent/approve` — body `{ pendingActionId: string }`; loads the pending action, calls `draft_assignment` via `callMcpTool` with `requester_role: "ADMIN"` (approval is itself an admin-gated action performed through the dashboard, per the spec's HITL design — the approving user's own role, not the original requester's, is what authorizes the actual write), marks it `APPROVED` on success.
  - `POST /api/agent/reject` — body `{ pendingActionId: string }`; marks it `REJECTED`, no MCP call.
  - `GET /api/evals/latest` — reads `evals/eval_report.json` from the repo root if present; returns `404` with `{ error: "no eval report yet" }` if it doesn't exist yet (the Evaluation Suite plan is what creates this file).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent/test/server.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/server.js";
import * as orchestrator from "../src/orchestrator.js";
import * as staffing from "../src/specialists/staffing.js";
import * as pendingActions from "../src/pendingActions.js";
import * as mcpClient from "../src/mcpClient.js";

describe("POST /api/chat", () => {
  it("dispatches a staffing_match intent to the staffing specialist", async () => {
    vi.spyOn(orchestrator, "classifyIntent").mockResolvedValue("staffing_match");
    vi.spyOn(staffing, "run").mockResolvedValue({ finalAnswer: "Found Alice.", trace: [] });

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "find a go engineer", role: "CONSULTANT" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ finalAnswer: "Found Alice.", trace: [] });
  });
});

describe("POST /api/agent/approve", () => {
  it("calls draft_assignment via MCP and marks the pending action APPROVED", async () => {
    vi.spyOn(pendingActions, "getPendingAction").mockResolvedValue({
      id: "pending-1",
      type: "draft_assignment",
      payload: { project_id: "p1", consultant_id: "c1", hours: 10 },
      status: "WAITING_FOR_APPROVAL",
    });
    const callToolSpy = vi
      .spyOn(mcpClient, "callMcpTool")
      .mockResolvedValue({ isError: false, text: '{"id":"a1","status":"DRAFT"}' });
    const resolveSpy = vi.spyOn(pendingActions, "resolvePendingAction").mockResolvedValue();

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/approve",
      payload: { pendingActionId: "pending-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(callToolSpy).toHaveBeenCalledWith(
      {},
      "draft_assignment",
      expect.objectContaining({ project_id: "p1", requester_role: "ADMIN" })
    );
    expect(resolveSpy).toHaveBeenCalledWith({}, "pending-1", "APPROVED");
  });
});

describe("GET /api/evals/latest", () => {
  it("returns 404 when no eval report exists yet", async () => {
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/evals/latest" });
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/agent/test/server.test.ts`
Expected: FAIL — `src/server.js` does not exist.

- [ ] **Step 3: Write `packages/agent/src/server.ts`**

```typescript
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
```

- [ ] **Step 4: Write `packages/agent/src/index.ts`**

```typescript
import { getPool } from "@skillsmatch/shared";
import { connectMcpClient } from "./mcpClient.js";
import { buildApp } from "./server.js";

const pool = getPool();
const mcpClient = await connectMcpClient();
const app = buildApp({ pool, mcpClient });

await app.listen({ port: 3001, host: "0.0.0.0" });
console.log("agent API listening on http://localhost:3001");
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- packages/agent/test/server.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/server.ts packages/agent/src/index.ts packages/agent/test/server.test.ts
git commit -m "feat: add agent HTTP API with HITL approve/reject and eval report endpoint"
```

---

## Task 8: SSE trace streaming

**Files:**
- Modify: `packages/agent/src/server.ts`
- Test: `packages/agent/test/traceStream.test.ts`

**Interfaces:**
- Consumes: `TraceEvent` from `./toolLoop.js`.
- Produces: a module-level `emitTrace(event: TraceEvent): void` / `GET /api/trace/stream` (SSE) pair — `POST /api/chat` calls `emitTrace` for every event in the `ToolLoopResult.trace` it receives (in order) as it builds the response, and any client connected to `/api/trace/stream` receives each as an `event: trace` SSE message. This is a simple in-process pub/sub (a `Set<FastifyReply>` of open SSE connections), sufficient for the single-dashboard local use case — no external broker.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent/test/traceStream.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/server.js";
import * as orchestrator from "../src/orchestrator.js";
import * as staffing from "../src/specialists/staffing.js";

describe("GET /api/trace/stream", () => {
  it("streams trace events emitted during a /api/chat call", async () => {
    vi.spyOn(orchestrator, "classifyIntent").mockResolvedValue("staffing_match");
    vi.spyOn(staffing, "run").mockResolvedValue({
      finalAnswer: "Found Alice.",
      trace: [{ type: "tool_call", detail: "get_consultant_availability({})" }],
    });

    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    await app.ready();

    const streamResponse = app.inject({ method: "GET", url: "/api/trace/stream", payloadAsStream: false });
    // Give the SSE connection a tick to register before triggering the chat call.
    await new Promise((r) => setTimeout(r, 10));

    await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "find a go engineer", role: "CONSULTANT" },
    });

    const streamed = await streamResponse;
    expect(streamed.payload).toContain("tool_call");
    expect(streamed.payload).toContain("get_consultant_availability");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/agent/test/traceStream.test.ts`
Expected: FAIL — `/api/trace/stream` route does not exist.

- [ ] **Step 3: Modify `packages/agent/src/server.ts`** — add the SSE route and wire `emitTrace` into `/api/chat`

Add near the top, after the existing imports:

```typescript
import type { TraceEvent } from "./toolLoop.js";
import type { FastifyReply } from "fastify";

const sseClients = new Set<FastifyReply>();

function emitTrace(event: TraceEvent): void {
  const payload = `event: trace\ndata: ${JSON.stringify(event)}\n\n`;
  for (const reply of sseClients) {
    reply.raw.write(payload);
  }
}
```

Add the route inside `buildApp`, before `return app;`:

```typescript
  app.get("/api/trace/stream", (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.add(reply);
    request.raw.on("close", () => sseClients.delete(reply));
  });
```

Replace each `return staffing.run(...)` / `finance.run(...)` / `resourcing.run(...)` / plain-chat branch in `/api/chat` so it captures the result, emits its trace, then returns it:

```typescript
  app.post<{ Body: { message: string; role: Role } }>("/api/chat", async (request) => {
    const { message, role } = request.body;
    const intent = await classifyIntent(message);

    let result: { finalAnswer: string; trace: TraceEvent[] };
    if (intent === "staffing_match") {
      result = await staffing.run({ message, role, client: deps.mcpClient, pool: deps.pool });
    } else if (intent === "margin_check") {
      result = await finance.run({ message, role, client: deps.mcpClient, pool: deps.pool });
    } else if (intent === "draft_assignment") {
      result = await resourcing.run({ message, role, client: deps.mcpClient, pool: deps.pool });
    } else {
      const response = await chat([{ role: "user", content: message }]);
      result = { finalAnswer: response.content, trace: [] };
    }

    for (const event of result.trace) {
      emitTrace(event);
    }
    return result;
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- packages/agent/test/traceStream.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/server.ts packages/agent/test/traceStream.test.ts
git commit -m "feat: add SSE trace streaming for agent execution steps"
```

---

## Self-Review Notes

- **Spec coverage:** orchestrator classification ✅ (Task 4), scoped specialist tool access ✅ (Task 6 — resourcing specialist provably cannot call `draft_assignment`), bounded tool loop with cap 5 ✅, `PERMISSION_DENIED` never retried ✅, empty-result retry capped at 2 with disclosure ✅ (Task 5), HITL gate via `pending_actions` + `/api/agent/approve|reject` ✅ (Tasks 3, 7), SSE trace streaming ✅ (Task 8), `/api/evals/latest` ✅ (Task 7, gracefully 404s until the Evaluation Suite plan exists).
- **Type consistency:** `ToolLoopResult`/`TraceEvent` defined once in `toolLoop.ts` (Task 5) and reused verbatim by every specialist (Task 6), `server.ts` (Tasks 7-8), and will be reused by the frontend plan's trace panel.
- **No placeholders:** every step has runnable code, including the SSE test's timing workaround, which is explained rather than left as a bare `setTimeout`.
