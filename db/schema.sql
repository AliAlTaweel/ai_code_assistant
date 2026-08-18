CREATE EXTENSION IF NOT EXISTS vector;

DROP TYPE IF EXISTS user_role CASCADE;
CREATE TYPE user_role AS ENUM ('ADMIN', 'RESOURCING_MANAGER', 'CONSULTANT', 'FINANCE');
DROP TYPE IF EXISTS project_status CASCADE;
CREATE TYPE project_status AS ENUM ('PROSPECT', 'ACTIVE', 'COMPLETED');
DROP TYPE IF EXISTS assignment_status CASCADE;
CREATE TYPE assignment_status AS ENUM ('DRAFT', 'CONFIRMED');
DROP TYPE IF EXISTS pending_action_status CASCADE;
CREATE TYPE pending_action_status AS ENUM ('WAITING_FOR_APPROVAL', 'APPROVED', 'REJECTED');

DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL
);

DROP TABLE IF EXISTS consultants CASCADE;
CREATE TABLE IF NOT EXISTS consultants (
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

DROP TABLE IF EXISTS skills CASCADE;
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  proficiency_level SMALLINT NOT NULL CHECK (proficiency_level BETWEEN 1 AND 5)
);

DROP TABLE IF EXISTS projects CASCADE;
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  target_bill_rate NUMERIC(10,2) NOT NULL,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  status project_status NOT NULL DEFAULT 'PROSPECT'
);

DROP TABLE IF EXISTS assignments CASCADE;
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  consultant_id UUID NOT NULL REFERENCES consultants(id),
  allocated_hours NUMERIC(6,2) NOT NULL,
  status assignment_status NOT NULL DEFAULT 'DRAFT'
);

DROP TABLE IF EXISTS pending_actions CASCADE;
CREATE TABLE IF NOT EXISTS pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status pending_action_status NOT NULL DEFAULT 'WAITING_FOR_APPROVAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
