import "dotenv/config";
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

  try {
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
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://admin:password@localhost:5432/agileday_local";
  await run(connectionString);
  console.log("embeddings generated");
}
