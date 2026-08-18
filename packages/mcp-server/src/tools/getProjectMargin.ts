import type { Pool } from "pg";
import type { GetProjectMarginInput } from "@skillsmatch/shared";
import { requireRole } from "../rbac.js";

export async function getProjectMargin(
  input: GetProjectMarginInput,
  pool: Pool
): Promise<{ marginPercent: number }> {
  requireRole(input.requester_role, ["ADMIN", "FINANCE"], "FINANCE_READ");

  const { rows } = await pool.query<{ hourly_cost_rate: string }>(
    `SELECT hourly_cost_rate FROM consultants WHERE id = $1`,
    [input.consultant_id]
  );
  if (rows.length === 0) {
    throw new Error(`consultant not found: ${input.consultant_id}`);
  }

  const cost = Number(rows[0].hourly_cost_rate);
  const marginPercent = ((input.target_bill_rate - cost) / input.target_bill_rate) * 100;
  return { marginPercent };
}
