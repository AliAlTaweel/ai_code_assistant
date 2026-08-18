import { describe, it, expect } from "vitest";
import { requireRole, PermissionDeniedError } from "../src/rbac.js";

describe("requireRole", () => {
  it("does not throw when the actor role is allowed", () => {
    expect(() => requireRole("ADMIN", ["ADMIN", "FINANCE"], "FINANCE_READ")).not.toThrow();
  });

  it("throws PermissionDeniedError with the scope in the message when disallowed", () => {
    expect(() =>
      requireRole("CONSULTANT", ["ADMIN", "FINANCE"], "FINANCE_READ")
    ).toThrow(PermissionDeniedError);

    try {
      requireRole("CONSULTANT", ["ADMIN", "FINANCE"], "FINANCE_READ");
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toBe(
        "PERMISSION_DENIED: Operational scope required: [FINANCE_READ]"
      );
    }
  });
});
