import type { Pool } from "pg";

export interface PendingAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "WAITING_FOR_APPROVAL" | "APPROVED" | "REJECTED";
}

export async function createPendingAction(
  pool: Pool,
  type: string,
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pending_actions (type, payload) VALUES ($1, $2) RETURNING id`,
    [type, JSON.stringify(payload)]
  );
  return rows[0];
}

export async function getPendingAction(pool: Pool, id: string): Promise<PendingAction | null> {
  const { rows } = await pool.query<PendingAction>(
    `SELECT id, type, payload, status FROM pending_actions WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function resolvePendingAction(
  pool: Pool,
  id: string,
  status: "APPROVED" | "REJECTED"
): Promise<void> {
  await pool.query(
    `UPDATE pending_actions SET status = $1, resolved_at = now() WHERE id = $2`,
    [status, id]
  );
}
