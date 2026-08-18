// packages/shared/test/schemas.test.ts
import { describe, it, expect } from "vitest";
import {
  Role,
  GetConsultantAvailabilityInput,
  GetProjectMarginInput,
  DraftAssignmentInput,
} from "../src/schemas.js";

describe("Role", () => {
  it("accepts the four valid roles and rejects others", () => {
    expect(Role.safeParse("ADMIN").success).toBe(true);
    expect(Role.safeParse("FINANCE").success).toBe(true);
    expect(Role.safeParse("SUPERUSER").success).toBe(false);
  });
});

describe("GetConsultantAvailabilityInput", () => {
  it("requires required_skills, min_hours, and requester_role", () => {
    const result = GetConsultantAvailabilityInput.safeParse({
      required_skills: ["Go"],
      min_hours: 10,
      requester_role: "CONSULTANT",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty required_skills array", () => {
    const result = GetConsultantAvailabilityInput.safeParse({
      required_skills: [],
      min_hours: 10,
      requester_role: "CONSULTANT",
    });
    expect(result.success).toBe(false);
  });
});

describe("GetProjectMarginInput", () => {
  it("requires a uuid consultant_id and positive target_bill_rate", () => {
    const result = GetProjectMarginInput.safeParse({
      consultant_id: "not-a-uuid",
      target_bill_rate: 100,
      requester_role: "FINANCE",
    });
    expect(result.success).toBe(false);
  });
});

describe("DraftAssignmentInput", () => {
  it("accepts a valid payload", () => {
    const result = DraftAssignmentInput.safeParse({
      project_id: "00000000-0000-0000-0000-000000000000",
      consultant_id: "00000000-0000-0000-0000-000000000000",
      hours: 20,
      requester_role: "ADMIN",
    });
    expect(result.success).toBe(true);
  });
});
