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

/**
 * Atomically transition a pending action to APPROVED/REJECTED, but only if it is
 * currently WAITING_FOR_APPROVAL. This is the DB-level guard against double-approve /
 * double-reject races: the conditional WHERE clause and RETURNING happen as a single
 * statement, so at most one concurrent caller can ever get a non-null row back, even if
 * two requests both read status=WAITING_FOR_APPROVAL before either writes. Callers must
 * treat a null return as "already resolved" (or "resolved by someone else"), not as an
 * error to retry.
 */
export async function resolvePendingAction(
  pool: Pool,
  id: string,
  status: "APPROVED" | "REJECTED"
): Promise<PendingAction | null> {
  const { rows } = await pool.query<PendingAction>(
    `UPDATE pending_actions SET status = $1, resolved_at = now()
     WHERE id = $2 AND status = 'WAITING_FOR_APPROVAL'
     RETURNING id, type, payload, status`,
    [status, id]
  );
  return rows[0] ?? null;
}

/**
 * Compensating action for the approve route: if a pending action was atomically claimed
 * (flipped to APPROVED) but the downstream MCP write then failed, revert it back to
 * WAITING_FOR_APPROVAL so it can be retried, rather than leaving it stuck as "approved"
 * with no assignment actually created.
 */
export async function listPendingActions(pool: Pool): Promise<PendingAction[]> {
  const { rows } = await pool.query<PendingAction>(
    `SELECT id, type, payload, status FROM pending_actions WHERE status = 'WAITING_FOR_APPROVAL' ORDER BY created_at DESC`
  );
  return rows;
}

export async function revertPendingAction(
  pool: Pool,
  id: string,
  from: "APPROVED" | "REJECTED"
): Promise<void> {
  await pool.query(
    `UPDATE pending_actions SET status = 'WAITING_FOR_APPROVAL', resolved_at = NULL
     WHERE id = $1 AND status = $2`,
    [id, from]
  );
}
