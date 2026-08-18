# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is currently greenfield — the only content is `claude_prompt.md`, a phase-by-phase
implementation plan for **SkillsMatch MCP**, a permission-aware staffing agent platform. No source
code, build tooling, or tests exist yet. Treat `claude_prompt.md` as the spec of record; consult it
before starting work on any phase, since it defines exact table schemas, MCP tool signatures, and
file paths expected for each phase.

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

No build/test/lint tooling exists yet. Once a phase scaffolds a package (Node/Go backend, evals
runner, or the Vite frontend), record its actual commands here rather than assuming defaults.
