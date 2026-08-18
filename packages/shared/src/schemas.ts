import { z } from "zod";
import { Role } from "./role.js";

export { Role };

export const GetConsultantAvailabilityInput = z.object({
  required_skills: z.array(z.string()).min(1),
  min_hours: z.number().min(0),
  requester_role: Role,
});
export type GetConsultantAvailabilityInput = z.infer<typeof GetConsultantAvailabilityInput>;

export const GetProjectMarginInput = z.object({
  consultant_id: z.string().uuid(),
  target_bill_rate: z.number().positive(),
  requester_role: Role,
});
export type GetProjectMarginInput = z.infer<typeof GetProjectMarginInput>;

export const DraftAssignmentInput = z.object({
  project_id: z.string().uuid(),
  consultant_id: z.string().uuid(),
  hours: z.number().positive(),
  requester_role: Role,
});
export type DraftAssignmentInput = z.infer<typeof DraftAssignmentInput>;
