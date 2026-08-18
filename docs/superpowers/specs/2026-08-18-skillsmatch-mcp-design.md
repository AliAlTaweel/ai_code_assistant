# SkillsMatch MCP — System Design

Status: Approved for planning
Source: `claude_prompt.md` (original phase-by-phase prompt guide)

## Purpose

SkillsMatch MCP is a fully local, permission-aware staffing agent for a
professional services company. It lets staff query consultant
availability, check project margins, and draft assignments through a
multi-agent conversational interface, with role-based access control
enforced at the tool layer and every mutating action gated behind
human approval.

Everything runs locally: Ollama for the LLM, Postgres+pgvector for
storage, no external API calls.

## Architecture Overview

Single npm workspaces monorepo, all TypeScript:

```
skillsmatch-mcp/
├── docker-compose.yml          # Postgres 16 + pgvector
├── db/
│   ├── schema.sql
│   └── seed.sql
├── packages/
│   ├── mcp-server/             # MCP tools + RBAC (stdio)
│   ├── agent/                  # orchestrator + specialist agents, HITL gate, HTTP/SSE API
│   ├── evals/                  # offline scenario runner
│   └── shared/                 # DB client, Zod types, Role enum — shared contracts
├── apps/
│   └── web/                    # Vite + React + Tailwind dashboard
└── scripts/
    └── setup_local_env.sh
```

- Ollama runs as an external local process (not containerized), so it
  can use host GPU/Metal acceleration. Only Postgres is containerized.
- `packages/shared` holds the Zod schemas / TS types for MCP tool
  inputs/outputs and the `Role` enum, so `mcp-server` and `agent` never
  drift out of sync on contracts.
- `packages/agent` is both the orchestration logic and its own thin
  HTTP/SSE API server (Fastify) — there is no separate backend
  service. The web app only ever talks to this API.

## Data Layer

**`docker-compose.yml`**: single `pgvector/pgvector:pg16` service on
port 5432, named volume, env vars `POSTGRES_DB=agileday_local`,
`POSTGRES_USER=admin`, `POSTGRES_PASSWORD=password`.

**`schema.sql`**:
- `users`: `id`, `name`, `email`, `role` (`ADMIN`, `RESOURCING_MANAGER`,
  `CONSULTANT`, `FINANCE`) — `FINANCE` is added beyond the original
  prompt doc's three roles because `get_project_margin`'s permission
  check needs a real role to check against.
- `consultants`: `id`, `user_id`, `full_name`, `title`,
  `hourly_cost_rate`, `availability_hours_per_week`,
  `embedding vector(768)` (dimension matches nomic-embed-text), plus
  an HNSW (or IVFFlat) index on `embedding` for similarity search.
- `skills`: `id`, `consultant_id`, `skill_name`, `proficiency_level` (1-5).
- `projects`: `id`, `client_name`, `project_name`, `target_bill_rate`,
  `required_skills text[]`, `status` (`PROSPECT`, `ACTIVE`, `COMPLETED`).
- `assignments`: `id`, `project_id`, `consultant_id`, `allocated_hours`,
  `status` (`DRAFT`, `CONFIRMED`).
- `pending_actions`: agent-side HITL queue — `id`, `type`, `payload
  jsonb`, `status` (`WAITING_FOR_APPROVAL`, `APPROVED`, `REJECTED`),
  `created_at`, `resolved_at`. Not part of the original prompt doc's
  table list; introduced by the HITL design in this spec (see
  Multi-Agent Orchestration).

**`seed.sql`**: 10 realistic consultant profiles + skills, 5 project
opportunities with varied required skills, and 3-4 seed `users` rows
spanning all four roles (so the dashboard's role switcher has one of
each to pick from). Consultant embeddings are not raw SQL — a one-off
seed script calls Ollama's embedding endpoint per consultant profile
and writes the resulting vectors back after `seed.sql` runs.

**`scripts/setup_local_env.sh`**: `docker compose up -d`, wait for
Postgres healthy, apply `schema.sql`, run `seed.sql`, run the
embedding-generation step, curl-check `localhost:11434`.

## MCP Server (`packages/mcp-server`)

Built on the official `@modelcontextprotocol/sdk`, exposed over
**stdio** (the agent package spawns it as a child process — no network
exposure, no separate transport auth needed for a local-only tool).

**Tools**:

| Tool | Params | Behavior | Permission |
|---|---|---|---|
| `get_consultant_availability` | `required_skills: string[]`, `min_hours: number` | Embeds the skill query via Ollama, `ORDER BY embedding <=> $query LIMIT N` against `consultants`, joined to `skills` for proficiency, filtered by `availability_hours_per_week >= min_hours` | All roles |
| `get_project_margin` | `consultant_id: string`, `target_bill_rate: number` | `(target_bill_rate - hourly_cost_rate) / target_bill_rate * 100` | `ADMIN` or `FINANCE` |
| `draft_assignment` | `project_id: string`, `consultant_id: string`, `hours: number` | Inserts a `DRAFT` row into `assignments` | `RESOURCING_MANAGER` or `ADMIN` |

**RBAC enforcement**: every tool call includes `{ user_id, role }` in
its call context, populated from the dashboard's role-switcher
selection. A single `requireRole(...)` guard runs before any DB
access in each handler. A denied call returns the structured error
`PERMISSION_DENIED: Operational scope required: [FINANCE_READ]`
(or the equivalent scope name per tool) rather than throwing. Every
handler is wrapped in try/catch so a DB error or malformed input
returns a clean MCP error object — the server process must never
crash on a bad or unauthorized call.

**Tests** (`mcp_server.test.ts`, against a disposable test DB via the
same docker-compose service): input schema validation per tool, and a
permission matrix test (each tool × each role) covering allow/deny.

## Multi-Agent Orchestration (`packages/agent`)

**Pattern**: orchestrator + specialists, hand-rolled (no agent
framework).

- **Orchestrator**: one cheap Ollama call classifies the user's
  message into `staffing_match | margin_check | draft_assignment |
  general`, then dispatches to the matching specialist.
- **Specialists**: staffing, finance, and resourcing specialists each
  see only the MCP tools relevant to their job (e.g. the staffing
  specialist cannot even attempt `get_project_margin`) — enforced in
  code, not just by MCP-layer RBAC, so an out-of-scope tool call is
  impossible to construct, not just rejected. Each specialist runs a
  bounded ReAct-style loop against `qwen2.5-coder:32b` (system prompt
  → tool selection → MCP call → inject result → next step or final
  answer), capped at ~5 tool calls to prevent runaway loops.

**Resilience**:
- `PERMISSION_DENIED` from MCP is caught and turned into a user-facing
  explanation (e.g. "I don't have finance access to compute margins,
  but here are matching consultants by skill/availability") — never
  silently retried, never hallucinated around.
- Empty tool results trigger one retry with a relaxed constraint
  (drop the least-important required skill, or lower `min_hours`),
  capped at 2 retries total, with the relaxation disclosed in the
  final answer.

**HITL gate**: specialists never call `draft_assignment` directly.
Instead a specialist emits a proposed payload, which the agent package
persists into `pending_actions` as `WAITING_FOR_APPROVAL` and streams
over SSE to the dashboard. Only `POST /api/agent/approve` invokes the
MCP `draft_assignment` tool; `POST /api/agent/reject` marks it
`REJECTED` with no DB mutation.

**HTTP/SSE API** (Fastify, inside `packages/agent`):
- `POST /api/chat` — starts an orchestrator run for a message + role
- `GET /api/trace/stream` — SSE stream of step events (classification,
  tool call, tool result, RBAC outcome)
- `POST /api/agent/approve` / `POST /api/agent/reject` — resolves a
  `pending_actions` row
- `GET /api/evals/latest` — serves the most recent eval report (see
  Evaluation Suite)

**Test scripts**: mock prompts covering both permitted and
role-restricted flows per specialist, run against a live local Ollama
+ Postgres (not further mocked), since the whole point is to validate
real tool-calling and RBAC behavior end to end.

## Evaluation Suite (`packages/evals`)

`evals/runner.ts` drives the agent package's `/api/chat` endpoint
directly — the same code path the dashboard uses — so results reflect
real orchestrator behavior.

**Test cases** (`evals/test_cases.json`): each case specifies the
prompt, acting role, expected specialist(s), expected tool-call
sequence, and either expected named consultants/rates (grounding
check) or an expected `PERMISSION_DENIED` outcome.
- Scenario A: valid staffing match, high availability
- Scenario B: `RESOURCING_MANAGER` asks a margin question → expect
  `PERMISSION_DENIED` + graceful skills-only fallback
- Scenario C: ambiguous query → expect the relaxed-constraint retry
  path to fire
- Scenario D: zero matching consultants → expect an honest "no match"
  answer, no hallucination

**Metrics**:
- *Tool Selection Accuracy* — actual tool-call sequence (from captured
  SSE trace events) vs. expected, order-sensitive
- *Grounding/Hallucination Score* — every named consultant, rate, and
  project in the final answer is checked against the tool-result
  payloads actually returned in that run; anything untraceable is
  flagged
- *Latency* — per-step timestamps from the trace stream, aggregated to
  per-scenario and overall p50/p95
- *Permission Boundary Compliance* — pass/fail per role-restricted
  scenario, checking both that MCP denied the call and that the final
  answer didn't fabricate the denied data

**Output**: `eval_report.json`, appended (not overwritten) as a
timestamped array so the dashboard can show history, plus a CLI table
via `console.table`.

## Frontend (`apps/web`)

React (Vite) + TypeScript + Tailwind. Talks only to `packages/agent`'s
HTTP/SSE API — no direct DB or MCP access from the browser.

**Layout**: persistent left rail with a role switcher (selects a
seeded user; sets `user_id`/`role` sent with every request) and view
navigation. Main area has four views:

- **Staffing Agent Console** — chat UI posting to `/api/chat`; each
  turn shows the specialist's final answer with a collapsible "steps"
  affordance
- **Execution Trace Panel** (right drawer) — live SSE consumer:
  orchestrator classification → specialist dispatch → each tool
  call/result → RBAC outcome; `PERMISSION_DENIED` events rendered in a
  distinct warning style
- **HITL Action Queue** — renders `pending_actions` in
  `WAITING_FOR_APPROVAL` as cards (project, consultant, hours) with
  Approve/Reject hitting `/api/agent/approve|reject`; Modify reopens
  the chat with the proposed values pre-filled rather than a separate
  edit form
- **Evaluation & Grounding Tab** — reads `/api/evals/latest`, renders
  the same metrics as the CLI table plus a latency/pass-rate trend
  view across historical runs

Visual styling (colors, spacing, typography) is intentionally
unspecified here — professional/muted per the source prompt doc, to be
resolved during frontend implementation.

## Out of Scope

- Real authentication (no login system; the role switcher is a
  trusted local-only selector, acceptable because this is a local demo
  tool with no network exposure)
- Any cloud/hosted LLM or embedding provider
- Multi-tenant support
