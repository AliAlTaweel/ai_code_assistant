import type { Pool } from "pg";
import type { GetConsultantAvailabilityInput } from "@skillsmatch/shared";
import { embedText } from "../../../../db/generate-embeddings.js";

export interface ConsultantMatch {
  id: string;
  full_name: string;
  title: string;
  availability_hours_per_week: number;
  similarity: number;
}

export async function getConsultantAvailability(
  input: GetConsultantAvailabilityInput,
  pool: Pool
): Promise<ConsultantMatch[]> {
  const queryVector = await embedText(input.required_skills.join(", "));
  const { rows } = await pool.query<ConsultantMatch>(
    `SELECT c.id, c.full_name, c.title, c.availability_hours_per_week::float8 AS availability_hours_per_week,
            1 - (c.embedding <=> $1) AS similarity
     FROM consultants c
     WHERE c.availability_hours_per_week >= $2 AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $1
     LIMIT 5`,
    [`[${queryVector.join(",")}]`, input.min_hours]
  );
  return rows;
}
