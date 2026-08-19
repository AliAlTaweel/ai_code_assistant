# SkillsMatch MCP

A permission-aware staffing agent platform. A local LLM (via [Ollama](https://ollama.com)) drives
role-scoped specialist agents that call tools on an [MCP](https://modelcontextprotocol.io) server
backed by Postgres + pgvector, with a human-in-the-loop approval gate for any write and a React
dashboard for observing and controlling all of it.

## System architecture

```mermaid
flowchart LR
    subgraph Browser
        Web["apps/web (React)\nRole switcher · Chat console\nTrace panel · HITL queue · Evals tab"]
    end

    subgraph AgentService["packages/agent (Fastify)"]
        API["/api/chat\n/api/agent/approve|reject\n/api/agent/pending-actions\n/api/trace/stream (SSE)\n/api/evals/latest"]
        Orchestrator["orchestrator.ts\nclassifyIntent()"]
        Specialists["specialists/\nstaffing · finance · resourcing"]
        ToolLoop["toolLoop.ts\nrunToolLoop()"]
        Pending["pendingActions.ts\nWAITING_FOR_APPROVAL → APPROVED/REJECTED"]
    end

    subgraph MCP["packages/mcp-server (stdio)"]
        Tools["get_consultant_availability\nget_project_margin\ndraft_assignment"]
        RBAC["requireRole() per tool"]
    end

    Ollama["Ollama\nqwen2.5-coder:32b\n(OpenAI-compatible /api/chat)"]
    DB[("Postgres 16 + pgvector\nconsultants · projects\nassignments · pending_actions\nusers")]

    Web -- "fetch / EventSource" --> API
    API --> Orchestrator
    Orchestrator -- "chat()" --> Ollama
    API -- "intent" --> Specialists
    Specialists --> ToolLoop
    Specialists -- "resourcing only:\nno tool, plain chat()" --> Ollama
    ToolLoop -- "chat() with tool defs" --> Ollama
    ToolLoop -- "callMcpTool()\nrequester_role forced\nto real session role" --> Tools
    Tools --> RBAC
    RBAC -- "PERMISSION_DENIED\n(never crashes)" --> ToolLoop
    Tools --> DB
    Specialists -- "draft_assignment proposal" --> Pending
    Pending --> DB
    API -- "approve: requester_role='ADMIN'" --> Tools
    API -- "SSE trace events" --> Web

    classDef trust stroke:#c0392b,stroke-width:2px
    class ToolLoop,RBAC trust
```

## Request flow: a single chat turn

Every `POST /api/chat` call goes through the same pipeline regardless of which specialist ends up
handling it. This is the "orchestration" layer — one classifier routing to one of three
independent, role-scoped agents.

```mermaid
sequenceDiagram
    actor User
    participant Web as apps/web
    participant API as /api/chat
    participant Orc as orchestrator.classifyIntent
    participant Spec as specialist (staffing/finance/resourcing)
    participant Loop as toolLoop.runToolLoop
    participant LLM as Ollama
    participant MCP as MCP server
    participant DB as Postgres

    User->>Web: types a message, picks a role
    Web->>API: POST {message, role}
    API->>Orc: classifyIntent(message)
    Orc->>LLM: chat() — classification prompt
    LLM-->>Orc: "staffing_match" | "margin_check" | "draft_assignment" | "general"
    Orc-->>API: Intent
    API-->>Web: SSE: classification event

    alt staffing_match / margin_check
        API->>Spec: run({message, role, runId, onTraceEvent})
        Spec->>Loop: runToolLoop({systemPrompt, tools, role})
        loop up to 5 steps, up to 5 total tool calls
            Loop->>LLM: chat(messages, tools)
            LLM-->>Loop: tool_calls[] or final content
            Loop-->>Web: SSE: tool_call trace event
            Note over Loop: requester_role is ALWAYS overwritten<br/>with the real session role here —<br/>a model-claimed role is discarded
            Loop->>MCP: callMcpTool(name, {...args, requester_role: role})
            MCP->>MCP: requireRole() check
            alt authorized
                MCP->>DB: query
                DB-->>MCP: rows
                MCP-->>Loop: result
            else not authorized
                MCP-->>Loop: PERMISSION_DENIED
                Loop-->>Web: SSE: permission_denied event
                Note over Loop: loop stops immediately, no retry
            end
            Loop-->>Web: SSE: tool_result trace event
        end
        Loop-->>Spec: {finalAnswer, trace}
    else draft_assignment
        API->>Spec: resourcing.run({message, role})
        alt role not ADMIN/RESOURCING_MANAGER
            Spec-->>API: permission_denied (no LLM/tool call at all)
        else
            Spec->>LLM: chat() — no tools, asks for {project_id, consultant_id, hours} JSON
            LLM-->>Spec: proposal JSON or clarifying question
            Spec->>DB: createPendingAction("draft_assignment", proposal)
            Note over DB: status = WAITING_FOR_APPROVAL
            Spec-->>API: "submitted, awaiting approval"
        end
    else general
        API->>LLM: chat() with a guard prompt<br/>("never state facts you didn't look up")
        LLM-->>API: finalAnswer
    end

    API-->>Web: {finalAnswer, trace}
    Web-->>User: renders reply + live trace panel
```

## Human-in-the-loop approval

`draft_assignment` is never executed directly by a specialist — it can only be written by the
approve route, and only from a `WAITING_FOR_APPROVAL` row.

```mermaid
sequenceDiagram
    actor Manager
    participant Web as apps/web (HITL queue)
    participant API as /api/agent/approve
    participant DB as Postgres
    participant MCP as MCP server

    Manager->>Web: opens Approvals tab
    Web->>API: GET /api/agent/pending-actions
    API->>DB: SELECT ... WHERE status='WAITING_FOR_APPROVAL'
    DB-->>Web: pending actions

    Manager->>Web: clicks Approve
    Web->>API: POST /api/agent/approve {pendingActionId}
    API->>DB: UPDATE ... SET status='APPROVED'<br/>WHERE id=? AND status='WAITING_FOR_APPROVAL'<br/>RETURNING *
    Note over DB: atomic conditional claim — at most one<br/>concurrent approve/reject can ever win this row
    alt row claimed
        API->>MCP: draft_assignment(payload, requester_role: "ADMIN")
        alt write succeeds
            MCP->>DB: INSERT assignment
            API-->>Web: 200 APPROVED
        else write fails
            API->>DB: revert status back to WAITING_FOR_APPROVAL
            API-->>Web: 422 (retryable)
        end
    else already resolved
        API-->>Web: 409 Conflict
    end
```

## Repo layout

| Path | What it is |
|---|---|
| `db/` | Postgres 16 + pgvector schema, seed data, consultant-embedding generation |
| `packages/shared/` | Shared `Role` enum, MCP tool Zod schemas, DB pool helper |
| `packages/mcp-server/` | MCP server: `get_consultant_availability`, `get_project_margin`, `draft_assignment`, each RBAC-gated via `requireRole()` |
| `packages/agent/` | Fastify HTTP+SSE service: intent classifier, tool loop, three specialists, HITL approve/reject, trace streaming |
| `evals/` | Offline scenario runner scoring the live `/api/chat` API on tool-selection accuracy, grounding, and permission-boundary compliance |
| `apps/web/` | React dashboard: role switcher, chat console, live execution trace panel, HITL approval queue, eval metrics tab |

## Multi-agent orchestration, in short

- **One classifier, three specialists.** `classifyIntent()` is the only router — it never calls a
  tool itself, it just labels the message and hands off. Each specialist (`staffing`, `finance`,
  `resourcing`) is independently scoped to exactly one MCP tool (or, for `resourcing`, no tool at
  all — it only ever produces a proposal for a human to approve).
- **The trust boundary lives in one place.** `runToolLoop()` is shared by `staffing` and `finance`;
  every `callMcpTool()` call inside it unconditionally overwrites `requester_role` with the real,
  session-derived role right before the request leaves the process — a model that claims a
  different role in its tool-call arguments is always ignored.
- **Permission denials short-circuit, never crash.** The MCP server returns a structured
  `PERMISSION_DENIED` result; the tool loop treats that as a terminal state, not something to
  retry or paper over.
- **Mutations always wait for a human.** `draft_assignment` is only ever invoked from the approve
  route, gated by an atomic, race-safe status transition in Postgres.
- **Every step is observable live.** Each trace event (`classification`, `model_thought`,
  `tool_call`, `tool_result`, `permission_denied`) is streamed over SSE the moment it's produced,
  tagged with a `runId` correlating the whole turn — the dashboard's trace panel and the eval
  suite both consume this same stream.
