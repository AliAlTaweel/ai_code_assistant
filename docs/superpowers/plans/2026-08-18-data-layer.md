# Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the local Postgres+pgvector database — schema, seed data, and consultant embeddings — that every later subsystem (MCP server, agent, evals) reads from.

**Architecture:** A single dockerized `pgvector/pgvector:pg16` instance. SQL files define schema and static seed data; a small Node script fills in consultant embeddings by calling a local Ollama embedding model after the static seed runs. A `setup_local_env.sh` script wires the whole sequence together for a fresh machine.

**Tech Stack:** Docker Compose, PostgreSQL 16 + pgvector, Node.js 20+ with TypeScript (`tsx` for running scripts directly), `pg` driver, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-08-18-skillsmatch-mcp-design.md` (§ Data Layer)

## Global Constraints

- Postgres image: `pgvector/pgvector:pg16`, port 5432, `POSTGRES_DB=agileday_local`, `POSTGRES_USER=admin`, `POSTGRES_PASSWORD=password`
- Embedding model: `nomic-embed-text` (768 dimensions) via Ollama at `http://localhost:11434`
- Chat model for later subsystems: `qwen2.5-coder:32b` (not used in this plan, but do not size the `embedding` column for any other model)
- Ollama runs as an external local process, never containerized
- Node 20+, TypeScript throughout, npm workspaces monorepo rooted at the project root

---

## File Structure

```
package.json                      # root workspace config + scripts
tsconfig.base.json                # shared TS compiler options
vitest.config.ts                  # points at db/test/global-setup.ts
.env.example                      # documents DATABASE_URL, TEST_DATABASE_URL, OLLAMA_URL
docker-compose.yml
db/
  schema.sql
  seed.sql
  generate-embeddings.ts
  test/
    global-setup.ts               # creates/reseeds agileday_test before the suite runs
    schema.test.ts
    seed.test.ts
    generate-embeddings.test.ts
scripts/
  setup_local_env.sh
```

## Task 1: Monorepo scaffold + Docker Compose Postgres

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `docker-compose.yml`
- Create: `db/test/global-setup.ts`
- Test: `db/test/connectivity.test.ts`

**Interfaces:**
- Produces: `DATABASE_URL` env convention (`postgres://admin:password@localhost:5432/agileday_local`), `TEST_DATABASE_URL` (`postgres://admin:password@localhost:5432/agileday_test`), `OLLAMA_URL` (`http://localhost:11434`) — every later task and every later subsystem plan reads these from `process.env`, falling back to these exact defaults if unset.
- Produces: npm workspaces at `packages/*` and `apps/*` (empty for now, populated by later plans).

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "skillsmatch-mcp",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "vitest run",
    "db:apply-schema": "tsx db/apply.ts db/schema.sql $DATABASE_URL",
    "db:seed": "tsx db/apply.ts db/seed.sql $DATABASE_URL",
    "db:generate-embeddings": "tsx db/generate-embeddings.ts"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "tsx": "^4.16.5",
    "vitest": "^2.0.5",
    "@types/node": "^20.14.15",
    "@types/pg": "^8.11.6"
  },
  "dependencies": {
    "pg": "^8.12.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Write `.env.example` and `.gitignore`**

`.env.example`:
```
DATABASE_URL=postgres://admin:password@localhost:5432/agileday_local
TEST_DATABASE_URL=postgres://admin:password@localhost:5432/agileday_test
OLLAMA_URL=http://localhost:11434
```

`.gitignore`:
```
node_modules/
.env
eval_report.json
```

- [ ] **Step 4: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: agileday_local
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
    volumes:
      - agileday_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d agileday_local"]
      interval: 2s
      timeout: 3s
      retries: 20

volumes:
  agileday_pg_data:
```

- [ ] **Step 5: Write `db/test/global-setup.ts`**

This runs once before the whole Vitest suite: connects to the default `postgres` database, drops/recreates `agileday_test`, so every test file starts from a clean database.

```typescript
import { Client } from "pg";

const ADMIN_URL = "postgres://admin:password@localhost:5432/postgres";
const TEST_DB = "agileday_test";

export default async function globalSetup() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();
}
```

- [ ] **Step 6: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./db/test/global-setup.ts"],
    testTimeout: 15000,
  },
});
```

- [ ] **Step 7: Write the connectivity test**

```typescript
// db/test/connectivity.test.ts
import { describe, it, expect } from "vitest";
import { Client } from "pg";

describe("postgres connectivity", () => {
  it("connects to agileday_test", async () => {
    const client = new Client({
      connectionString:
        process.env.TEST_DATABASE_URL ??
        "postgres://admin:password@localhost:5432/agileday_test",
    });
    await client.connect();
    const result = await client.query("SELECT 1 AS ok");
    expect(result.rows[0].ok).toBe(1);
    await client.end();
  });
});
```

- [ ] **Step 8: Bring up Postgres and install dependencies**

Run: `docker compose up -d && npm install`
Expected: container reports healthy (`docker compose ps` shows `healthy`); `npm install` completes with no errors.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- db/test/connectivity.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts .env.example .gitignore docker-compose.yml db/test/global-setup.ts db/test/connectivity.test.ts package-lock.json
git commit -m "chore: scaffold monorepo and dockerized postgres"
```

---

## Task 2: Schema

**Files:**
- Create: `db/schema.sql`
- Create: `db/apply.ts`
- Test: `db/test/schema.test.ts`

**Interfaces:**
- Consumes: `TEST_DATABASE_URL` from Task 1.
- Produces: tables `users`, `consultants`, `skills`, `projects`, `assignments`, `pending_actions`; enums `user_role` (`ADMIN`, `RESOURCING_MANAGER`, `CONSULTANT`, `FINANCE`), `project_status` (`PROSPECT`, `ACTIVE`, `COMPLETED`), `assignment_status` (`DRAFT`, `CONFIRMED`), `pending_action_status` (`WAITING_FOR_APPROVAL`, `APPROVED`, `REJECTED`). `consultants.embedding` is `vector(768)`. Every later task/plan that touches the DB references these exact table and column names.
- Produces: `db/apply.ts` — a CLI (`tsx db/apply.ts <sqlFilePath> <connectionString>`) that any later task can reuse to apply a `.sql` file.

- [ ] **Step 1: Write the failing schema test**

```typescript
// db/test/schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: TEST_URL });
  await client.connect();
  const sql = readFileSync(new URL("../schema.sql", import.meta.url), "utf-8");
  await client.query(sql);
});

afterAll(async () => {
  await client.end();
});

describe("schema", () => {
  it("creates all six tables", async () => {
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = result.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "assignments",
        "consultants",
        "pending_actions",
        "projects",
        "skills",
        "users",
      ])
    );
  });

  it("sizes consultants.embedding as vector(768)", async () => {
    const result = await client.query(
      `SELECT format_type(atttypid, atttypmod) AS type
       FROM pg_attribute
       WHERE attrelid = 'consultants'::regclass AND attname = 'embedding'`
    );
    expect(result.rows[0].type).toBe("vector(768)");
  });

  it("allows FINANCE as a users.role value", async () => {
    await client.query(
      `INSERT INTO users (name, email, role) VALUES ('Test Finance', 'finance@test.local', 'FINANCE')`
    );
    const result = await client.query(
      `SELECT role FROM users WHERE email = 'finance@test.local'`
    );
    expect(result.rows[0].role).toBe("FINANCE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- db/test/schema.test.ts`
Expected: FAIL — `db/schema.sql` does not exist yet (`ENOENT`).

- [ ] **Step 3: Write `db/schema.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE user_role AS ENUM ('ADMIN', 'RESOURCING_MANAGER', 'CONSULTANT', 'FINANCE');
CREATE TYPE project_status AS ENUM ('PROSPECT', 'ACTIVE', 'COMPLETED');
CREATE TYPE assignment_status AS ENUM ('DRAFT', 'CONFIRMED');
CREATE TYPE pending_action_status AS ENUM ('WAITING_FOR_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL
);

CREATE TABLE consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  full_name TEXT NOT NULL,
  title TEXT NOT NULL,
  hourly_cost_rate NUMERIC(10,2) NOT NULL,
  availability_hours_per_week NUMERIC(5,2) NOT NULL,
  embedding vector(768)
);

CREATE INDEX IF NOT EXISTS consultants_embedding_idx
  ON consultants USING hnsw (embedding vector_cosine_ops);

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  proficiency_level SMALLINT NOT NULL CHECK (proficiency_level BETWEEN 1 AND 5)
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  target_bill_rate NUMERIC(10,2) NOT NULL,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  status project_status NOT NULL DEFAULT 'PROSPECT'
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  allocated_hours NUMERIC(6,2) NOT NULL,
  status assignment_status NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status pending_action_status NOT NULL DEFAULT 'WAITING_FOR_APPROVAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
```

- [ ] **Step 4: Write `db/apply.ts`**

```typescript
// db/apply.ts — usage: tsx db/apply.ts <sqlFilePath> <connectionString>
import { Client } from "pg";
import { readFileSync } from "node:fs";

const [, , sqlPath, connectionString] = process.argv;
if (!sqlPath || !connectionString) {
  console.error("usage: tsx db/apply.ts <sqlFilePath> <connectionString>");
  process.exit(1);
}

const client = new Client({ connectionString });
await client.connect();
const sql = readFileSync(sqlPath, "utf-8");
await client.query(sql);
await client.end();
console.log(`applied ${sqlPath} to ${connectionString.replace(/:[^:@]+@/, ":***@")}`);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- db/test/schema.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql db/apply.ts db/test/schema.test.ts
git commit -m "feat: add database schema"
```

---

## Task 3: Seed data

**Files:**
- Create: `db/seed.sql`
- Test: `db/test/seed.test.ts`

**Interfaces:**
- Consumes: schema from Task 2.
- Produces: 3 seeded `users` rows, one each with role `ADMIN`, `RESOURCING_MANAGER`, `FINANCE` (a fourth `CONSULTANT` role user is optional but not required by later plans); 10 `consultants` rows (each linked to a `users` row) with `embedding` left `NULL` (populated by Task 4); 5 `projects` rows with varied `required_skills`. Every consultant has at least one `skills` row. The dashboard's role switcher (built in the frontend plan) reads these seeded `users` rows directly.

- [ ] **Step 1: Write the failing seed test**

```typescript
// db/test/seed.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../seed.sql", import.meta.url), "utf-8"));
});

afterAll(async () => {
  await client.end();
});

describe("seed data", () => {
  it("seeds at least one user per required role", async () => {
    const result = await client.query(
      `SELECT DISTINCT role FROM users WHERE role IN ('ADMIN', 'RESOURCING_MANAGER', 'FINANCE')`
    );
    const roles = result.rows.map((r) => r.role).sort();
    expect(roles).toEqual(["ADMIN", "FINANCE", "RESOURCING_MANAGER"]);
  });

  it("seeds exactly 10 consultants, each with at least one skill", async () => {
    const consultantCount = await client.query(`SELECT count(*)::int FROM consultants`);
    expect(consultantCount.rows[0].count).toBe(10);

    const consultantsMissingSkills = await client.query(
      `SELECT c.id FROM consultants c
       LEFT JOIN skills s ON s.consultant_id = c.id
       WHERE s.id IS NULL`
    );
    expect(consultantsMissingSkills.rows).toHaveLength(0);
  });

  it("seeds exactly 5 projects with non-empty required_skills", async () => {
    const result = await client.query(
      `SELECT count(*)::int FROM projects WHERE array_length(required_skills, 1) > 0`
    );
    expect(result.rows[0].count).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- db/test/seed.test.ts`
Expected: FAIL — `db/seed.sql` does not exist yet (`ENOENT`).

- [ ] **Step 3: Write `db/seed.sql`**

```sql
INSERT INTO users (name, email, role) VALUES
  ('Ava Admin', 'ava.admin@agileday.local', 'ADMIN'),
  ('Ray Resourcing', 'ray.resourcing@agileday.local', 'RESOURCING_MANAGER'),
  ('Fiona Finance', 'fiona.finance@agileday.local', 'FINANCE');

WITH consultant_users AS (
  INSERT INTO users (name, email, role)
  VALUES
    ('Alice Chen', 'alice.chen@agileday.local', 'CONSULTANT'),
    ('Ben Osei', 'ben.osei@agileday.local', 'CONSULTANT'),
    ('Carla Reyes', 'carla.reyes@agileday.local', 'CONSULTANT'),
    ('Dev Patel', 'dev.patel@agileday.local', 'CONSULTANT'),
    ('Elin Svensson', 'elin.svensson@agileday.local', 'CONSULTANT'),
    ('Farid Haidari', 'farid.haidari@agileday.local', 'CONSULTANT'),
    ('Grace Kim', 'grace.kim@agileday.local', 'CONSULTANT'),
    ('Hugo Alvarez', 'hugo.alvarez@agileday.local', 'CONSULTANT'),
    ('Ines Moreau', 'ines.moreau@agileday.local', 'CONSULTANT'),
    ('Jonas Weber', 'jonas.weber@agileday.local', 'CONSULTANT')
  RETURNING id, name
),
consultant_rows AS (
  INSERT INTO consultants (user_id, full_name, title, hourly_cost_rate, availability_hours_per_week)
  SELECT id, name, title, cost, hours FROM consultant_users
  JOIN (VALUES
    ('Alice Chen', 'Go Developer', 85.00, 30),
    ('Ben Osei', 'React Specialist', 75.00, 40),
    ('Carla Reyes', 'AI Engineer', 110.00, 20),
    ('Dev Patel', 'Backend Engineer (Node.js)', 80.00, 40),
    ('Elin Svensson', 'DevOps Engineer', 95.00, 25),
    ('Farid Haidari', 'Data Engineer', 90.00, 35),
    ('Grace Kim', 'Frontend Engineer (React)', 78.00, 40),
    ('Hugo Alvarez', 'Full-Stack Engineer', 88.00, 30),
    ('Ines Moreau', 'Machine Learning Engineer', 115.00, 20),
    ('Jonas Weber', 'Cloud Architect', 120.00, 15)
  ) AS profile(name, title, cost, hours) ON profile.name = consultant_users.name
  RETURNING id, full_name
)
INSERT INTO skills (consultant_id, skill_name, proficiency_level)
SELECT id, skill_name, proficiency_level FROM consultant_rows
JOIN (VALUES
  ('Alice Chen', 'Go', 5), ('Alice Chen', 'PostgreSQL', 4), ('Alice Chen', 'Kubernetes', 3),
  ('Ben Osei', 'React', 5), ('Ben Osei', 'TypeScript', 5), ('Ben Osei', 'Tailwind CSS', 4),
  ('Carla Reyes', 'Python', 5), ('Carla Reyes', 'PyTorch', 5), ('Carla Reyes', 'LLM Fine-Tuning', 4),
  ('Dev Patel', 'Node.js', 5), ('Dev Patel', 'PostgreSQL', 4), ('Dev Patel', 'REST APIs', 5),
  ('Elin Svensson', 'Docker', 5), ('Elin Svensson', 'CI/CD', 5), ('Elin Svensson', 'AWS', 4),
  ('Farid Haidari', 'SQL', 5), ('Farid Haidari', 'Apache Spark', 4), ('Farid Haidari', 'Airflow', 4),
  ('Grace Kim', 'React', 5), ('Grace Kim', 'CSS', 5), ('Grace Kim', 'Accessibility', 4),
  ('Hugo Alvarez', 'TypeScript', 4), ('Hugo Alvarez', 'React', 4), ('Hugo Alvarez', 'Node.js', 4),
  ('Ines Moreau', 'Python', 5), ('Ines Moreau', 'TensorFlow', 4), ('Ines Moreau', 'MLOps', 4),
  ('Jonas Weber', 'AWS', 5), ('Jonas Weber', 'Terraform', 5), ('Jonas Weber', 'Kubernetes', 5)
) AS sk(name, skill_name, proficiency_level) ON sk.name = consultant_rows.full_name;

INSERT INTO projects (client_name, project_name, target_bill_rate, required_skills, status) VALUES
  ('Northwind Logistics', 'Fleet Tracking Platform', 160.00, ARRAY['Go', 'PostgreSQL', 'Kubernetes'], 'ACTIVE'),
  ('Contoso Retail', 'Storefront Redesign', 150.00, ARRAY['React', 'TypeScript', 'Tailwind CSS'], 'PROSPECT'),
  ('Fabrikam Health', 'Clinical Notes Summarizer', 190.00, ARRAY['Python', 'LLM Fine-Tuning'], 'ACTIVE'),
  ('Globex Finance', 'Realtime Fraud Pipeline', 175.00, ARRAY['Apache Spark', 'SQL', 'Airflow'], 'PROSPECT'),
  ('Initech Cloud', 'Multi-Region Infra Migration', 200.00, ARRAY['AWS', 'Terraform', 'Kubernetes'], 'ACTIVE');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- db/test/seed.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add db/seed.sql db/test/seed.test.ts
git commit -m "feat: add seed data"
```

---

## Task 4: Consultant embeddings

**Files:**
- Create: `db/generate-embeddings.ts`
- Test: `db/test/generate-embeddings.test.ts`

**Interfaces:**
- Consumes: schema (Task 2) and seed data (Task 3); Ollama's `POST /api/embeddings` endpoint at `OLLAMA_URL` (default `http://localhost:11434`), model `nomic-embed-text`.
- Produces: `embedText(text: string): Promise<number[]>` (exported from `db/generate-embeddings.ts`) and `run(connectionString: string): Promise<void>`, which every `consultants` row with a `NULL` embedding to a 768-length vector built from `"${title}. Skills: ${skill_name (proficiency_level)}, ..."`. This is the only place in the codebase that talks to the Ollama embeddings endpoint — the MCP server plan's `get_consultant_availability` tool reuses `embedText` by importing it, so its query-time embedding call uses the exact same text-shaping convention as the seed-time one.

**Requires:** Ollama running locally with `nomic-embed-text` pulled (`ollama pull nomic-embed-text`) before running this task's steps.

- [ ] **Step 1: Write the failing test**

```typescript
// db/test/generate-embeddings.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { embedText, run } from "../generate-embeddings.js";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://admin:password@localhost:5432/agileday_test";

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(readFileSync(new URL("../schema.sql", import.meta.url), "utf-8"));
  await client.query(readFileSync(new URL("../seed.sql", import.meta.url), "utf-8"));
});

afterAll(async () => {
  await client.end();
});

describe("embedText", () => {
  it("returns a 768-length numeric vector", async () => {
    const vector = await embedText("Go Developer. Skills: Go (5), PostgreSQL (4)");
    expect(vector).toHaveLength(768);
    expect(typeof vector[0]).toBe("number");
  });
});

describe("run", () => {
  it("fills embedding for every consultant", async () => {
    await run(TEST_URL);
    const result = await client.query(
      `SELECT count(*)::int AS missing FROM consultants WHERE embedding IS NULL`
    );
    expect(result.rows[0].missing).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- db/test/generate-embeddings.test.ts`
Expected: FAIL — `db/generate-embeddings.ts` does not exist yet.

- [ ] **Step 3: Write `db/generate-embeddings.ts`**

```typescript
import { Client } from "pg";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

export async function embedText(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
  });
  if (!response.ok) {
    throw new Error(`Ollama embeddings request failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { embedding: number[] };
  return body.embedding;
}

export async function run(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  const { rows } = await client.query<{ id: string; title: string }>(
    `SELECT id, title FROM consultants WHERE embedding IS NULL`
  );

  for (const consultant of rows) {
    const skills = await client.query<{ skill_name: string; proficiency_level: number }>(
      `SELECT skill_name, proficiency_level FROM skills WHERE consultant_id = $1`,
      [consultant.id]
    );
    const skillsText = skills.rows
      .map((s) => `${s.skill_name} (${s.proficiency_level})`)
      .join(", ");
    const text = `${consultant.title}. Skills: ${skillsText}`;
    const vector = await embedText(text);
    await client.query(`UPDATE consultants SET embedding = $1 WHERE id = $2`, [
      `[${vector.join(",")}]`,
      consultant.id,
    ]);
  }

  await client.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://admin:password@localhost:5432/agileday_local";
  await run(connectionString);
  console.log("embeddings generated");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- db/test/generate-embeddings.test.ts`
Expected: PASS — 2 tests passed. (Requires `ollama serve` running locally with `nomic-embed-text` pulled; if it fails with a connection error, run `ollama pull nomic-embed-text` and ensure Ollama is running first.)

- [ ] **Step 5: Commit**

```bash
git add db/generate-embeddings.ts db/test/generate-embeddings.test.ts
git commit -m "feat: generate consultant embeddings via ollama"
```

---

## Task 5: `setup_local_env.sh`

**Files:**
- Create: `scripts/setup_local_env.sh`
- Test: manual (shell scripts aren't unit-tested; verified by full end-to-end run)

**Interfaces:**
- Consumes: `docker-compose.yml` (Task 1), `db/apply.ts` + `db/schema.sql` (Task 2), `db/seed.sql` (Task 3), `db/generate-embeddings.ts` (Task 4).
- Produces: the single command later developers/plans run to get a fully seeded local environment: `./scripts/setup_local_env.sh`.

- [ ] **Step 1: Write `scripts/setup_local_env.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Starting Postgres..."
docker compose up -d

echo "Waiting for Postgres to be healthy..."
until [ "$(docker compose ps -q postgres | xargs docker inspect -f '{{.State.Health.Status}}')" = "healthy" ]; do
  sleep 1
done

DATABASE_URL="${DATABASE_URL:-postgres://admin:password@localhost:5432/agileday_local}"

echo "Applying schema..."
npx tsx db/apply.ts db/schema.sql "$DATABASE_URL"

echo "Applying seed data..."
npx tsx db/apply.ts db/seed.sql "$DATABASE_URL"

echo "Checking Ollama is reachable at ${OLLAMA_URL:-http://localhost:11434}..."
if ! curl -sf "${OLLAMA_URL:-http://localhost:11434}/api/tags" > /dev/null; then
  echo "ERROR: Ollama not reachable. Start it with 'ollama serve' and pull 'nomic-embed-text' + 'qwen2.5-coder:32b'." >&2
  exit 1
fi

echo "Generating consultant embeddings..."
DATABASE_URL="$DATABASE_URL" npx tsx db/generate-embeddings.ts

echo "Local environment ready."
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/setup_local_env.sh`

- [ ] **Step 3: Run it end-to-end against the dev database**

Run: `./scripts/setup_local_env.sh`
Expected: script prints "Local environment ready." with no errors; `psql postgres://admin:password@localhost:5432/agileday_local -c "SELECT count(*) FROM consultants WHERE embedding IS NOT NULL"` returns 10.

- [ ] **Step 4: Commit**

```bash
git add scripts/setup_local_env.sh
git commit -m "feat: add one-command local environment setup script"
```

---

## Self-Review Notes

- **Spec coverage:** docker-compose ✅ (Task 1), schema.sql ✅ (Task 2, includes the spec's `FINANCE` role addition and `pending_actions` table), seed.sql ✅ (Task 3), embedding generation ✅ (Task 4, shares `embedText` for reuse by the MCP server plan), `setup_local_env.sh` ✅ (Task 5).
- **Type consistency:** `embedText`/`run` signatures in Task 4's steps match its own Interfaces block; `db/apply.ts`'s CLI signature is used identically in Task 5's shell script.
- **No placeholders:** every step has runnable code; no TBDs.
