# SkillsMatch MCP

A permission-aware staffing agent platform. A local LLM (via [Ollama](https://ollama.com)) drives
role-scoped specialist agents that call tools on an [MCP](https://modelcontextprotocol.io) server
backed by Postgres + pgvector, with a human-in-the-loop approval gate for any write and a React
dashboard for observing and controlling all of it.

## System architecture

```mermaid
flowchart LR
    subgraph Browser
        Web["apps/web (React)\nRole switcher · Model selector · Chat console\nTrace panel · HITL queue · Evals tab"]
    end

    subgraph AgentService["packages/agent (Fastify)"]
        API["/api/chat\n/api/agent/approve|reject\n/api/agent/pending-actions\n/api/trace/stream (SSE)\n/api/evals/latest\n/api/models · /api/users"]
        Orchestrator["orchestrator.ts\nclassifyIntent()"]
        Specialists["specialists/\nstaffing · finance · resourcing"]
        ToolLoop["toolLoop.ts\nrunToolLoop()"]
        Pending["pendingActions.ts\nWAITING_FOR_APPROVAL → APPROVED/REJECTED"]
    end

    subgraph MCP["packages/mcp-server (stdio)"]
        Tools["get_consultant_availability\nfind_consultant_by_name\nget_project_margin\ndraft_assignment"]
        RBAC["requireRole() per tool"]
    end

    Ollama["Ollama\nmodel chosen per-request\n(qwen2.5-coder:32b · gemma4:e4b · llama3.1:8b)\n(OpenAI-compatible /api/chat)"]
    DB[("Postgres 16 + pgvector\nconsultants · projects\nassignments · pending_actions\nusers")]

    Web -- "GET /api/models\n(lists tool-capable models)" --> API
    Web -- "fetch / EventSource\n{message, role, model}" --> API
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
    participant ToolLoop as toolLoop.runToolLoop
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
        API->>Spec: run({message, role, model, runId, onTraceEvent})
        Note over Spec: finance also has find_consultant_by_name,<br/>so it can resolve a name to a consultant_id<br/>before calling get_project_margin
        Spec->>ToolLoop: runToolLoop({systemPrompt, tools, role, model})
        rect rgb(200, 250, 200)
            Note over ToolLoop: up to 5 steps, up to 5 total tool calls
            ToolLoop->>LLM: chat(messages, tools, model)
            LLM-->>ToolLoop: tool_calls[] or final content
            ToolLoop-->>Web: SSE: tool_call trace event
            Note over ToolLoop: requester_role forced to real session role<br/>(model-claimed role discarded)
            ToolLoop->>MCP: callMcpTool(name, {...args, requester_role})
            MCP->>MCP: requireRole() check
            alt authorized
                MCP->>DB: query
                DB-->>MCP: rows
                MCP-->>ToolLoop: result
            else not authorized
                MCP-->>ToolLoop: PERMISSION_DENIED
                ToolLoop-->>Web: SSE: permission_denied event
                Note over ToolLoop: stops immediately, no retry
            end
            ToolLoop-->>Web: SSE: tool_result trace event
        end
        ToolLoop-->>Spec: {finalAnswer, trace}
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
| `packages/mcp-server/` | MCP server: `get_consultant_availability`, `find_consultant_by_name`, `get_project_margin`, `draft_assignment`, each RBAC-gated via `requireRole()` (`find_consultant_by_name` is open to all roles — it discloses nothing `get_consultant_availability` doesn't already) |
| `packages/agent/` | Fastify HTTP+SSE service: intent classifier, tool loop, three specialists, HITL approve/reject, trace streaming |
| `evals/` | Offline scenario runner scoring the live `/api/chat` API on tool-selection accuracy, grounding, and permission-boundary compliance |
| `apps/web/` | React dashboard: role switcher, chat console, live execution trace panel, HITL approval queue, eval metrics tab |

## Model selection

The dashboard's model selector (`GET /api/models`, backed by Ollama's `/api/tags`) lists every
locally-pulled model that reports `tools` in its capabilities, and threads the chosen `model` name
through `/api/chat` into the classifier, every specialist, and the tool loop's `chat()` calls — so
a single request is free to use a different model than the last one. In this environment,
`qwen2.5-coder:32b` is flagged red in the picker: it reliably hangs Ollama's single-request queue
on this machine. `gemma4:e4b` and `llama3.1:8b` are smaller and respond, though a small model may
still narrate a tool call as prose instead of issuing it, or stop after one call in a
multi-tool-call chain (e.g. resolving a name, then never following up with the margin lookup) —
model capability, not something the orchestration layer can paper over.

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
