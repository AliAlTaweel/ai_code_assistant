import { z } from "zod";

export const Role = z.enum(["ADMIN", "RESOURCING_MANAGER", "CONSULTANT", "FINANCE"]);
export type Role = z.infer<typeof Role>;
