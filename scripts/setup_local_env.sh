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
