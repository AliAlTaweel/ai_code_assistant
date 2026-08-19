import type { Pool } from "pg";
import type { FindConsultantByNameInput } from "@skillsmatch/shared";

export interface ConsultantNameMatch {
  id: string;
  full_name: string;
  title: string;
}

// Open to all roles: this returns the same id/name/title fields already exposed by
// get_consultant_availability's search results, so it discloses nothing new.
export async function findConsultantByName(
  input: FindConsultantByNameInput,
  pool: Pool
): Promise<ConsultantNameMatch[]> {
  const { rows } = await pool.query<ConsultantNameMatch>(
    `SELECT id, full_name, title FROM consultants WHERE full_name ILIKE $1 ORDER BY full_name LIMIT 5`,
    [`%${input.name}%`]
  );
  return rows;
}
