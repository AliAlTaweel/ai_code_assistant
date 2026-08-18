# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**SkillsMatch MCP** is a permission-aware staffing agent platform, built phase-by-phase per
`claude_prompt.md` (the spec of record — consult it before starting work on any phase, since it
defines exact table schemas, MCP tool signatures, and file paths expected for each phase).

The **data layer** (Phase 1) is complete and merged: a Docker Compose Postgres 16 + pgvector
instance, `db/schema.sql` / `db/seed.sql`, a consultant-embedding generation script, and a Vitest
suite covering schema, seed data, embeddings, and connectivity. The MCP server, agent runtime,
evaluation suite, and frontend (Phases 2–5) are not yet built — see "Intended architecture" below.

## Intended architecture (per claude_prompt.md)

- **Local LLM:** Ollama (`qwen2.5-coder:32b` or `llama3.3`) via OpenAI-compatible endpoint at
  `http://localhost:11434/v1`.
- **Database:** PostgreSQL 16 + `pgvector`, run via Docker Compose on `localhost:5432`
  (`docker-compose.yml`, `schema.sql`, `seed.sql`).
- **MCP server** (TypeScript or Go, official MCP SDK): exposes `get_consultant_availability`,
  `get_project_margin`, `draft_assignment` tools with role-based access control enforced via
  `user_role` in tool call context. Unauthorized calls must return a structured
  `PERMISSION_DENIED` MCP error, never crash.
- **Agent runtime** (`agent/engine.ts` or `agent/engine.go`): multi-step tool-execution loop
  (System Prompt → Tool Call Selection → MCP Tool Execution → Context Injection → Final Response)
  against the local Ollama endpoint. Must never hallucinate financial data on `PERMISSION_DENIED`;
  mutating actions (`draft_assignment`) must pause for human approval via a `WAITING_FOR_APPROVAL`
  state and `/api/agent/approve`.
- **Evaluation suite** (`evals/runner.py` or `evals/runner.ts`): offline scenario tests scoring tool
  selection accuracy, grounding/hallucination, latency, and permission-boundary compliance; outputs
  `eval_report.json`.
- **Frontend** (`React` + `Vite` + `TypeScript` + `Tailwind`): staffing agent chat console, an
  execution trace panel (LLM steps, raw MCP requests/responses, RBAC status), a HITL approval queue,
  and an evaluation metrics tab, updated live via SSE/WebSockets.

The five phases in `claude_prompt.md` are meant to be built roughly in order — each later phase
depends on interfaces (DB schema, MCP tool contracts) established in the earlier ones.

## Commands

- **Fresh machine / bring up local env:** `./scripts/setup_local_env.sh` — installs npm deps,
  starts Docker Postgres, waits for health, applies `db/schema.sql` and `db/seed.sql`, checks
  Ollama is reachable, and generates consultant embeddings. Safe to re-run: `db/schema.sql` is
  idempotent (drops/recreates enum types and tables before recreating them).
- **Run tests:** `npm test` (Vitest; `db/test/global-setup.ts` creates/reseeds `agileday_test`
  before the suite runs).
- **Individual DB scripts** (each reads `DATABASE_URL`, falling back to
  `postgres://admin:password@localhost:5432/agileday_local`):
  - `npm run db:apply-schema` — applies `db/schema.sql`
  - `npm run db:seed` — applies `db/seed.sql`
  - `npm run db:generate-embeddings` — fills `consultants.embedding` via Ollama
  - Or directly: `tsx db/apply.ts <sqlFilePath> <connectionString>`
- **Env vars:** copy `.env.example` to `.env` and adjust as needed — `DATABASE_URL`,
  `TEST_DATABASE_URL`, `OLLAMA_URL`. `.env` is loaded automatically (via `dotenv`) by the DB
  scripts and the Vitest config; it is gitignored.
