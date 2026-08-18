import type { Pool } from "pg";
import type { DraftAssignmentInput } from "@skillsmatch/shared";
import { requireRole } from "../rbac.js";

export async function draftAssignment(
  input: DraftAssignmentInput,
  pool: Pool
): Promise<{ id: string; status: "DRAFT" }> {
  requireRole(input.requester_role, ["RESOURCING_MANAGER", "ADMIN"], "ASSIGNMENT_WRITE");

  const { rows } = await pool.query<{ id: string; status: "DRAFT" }>(
    `INSERT INTO assignments (project_id, consultant_id, allocated_hours, status)
     VALUES ($1, $2, $3, 'DRAFT') RETURNING id, status`,
    [input.project_id, input.consultant_id, input.hours]
  );
  return rows[0];
}
