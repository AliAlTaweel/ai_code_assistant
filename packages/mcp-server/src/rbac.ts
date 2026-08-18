import type { Role } from "@skillsmatch/shared";

export class PermissionDeniedError extends Error {
  constructor(public readonly scope: string) {
    super(`PERMISSION_DENIED: Operational scope required: [${scope}]`);
    this.name = "PermissionDeniedError";
  }
}

export function requireRole(actorRole: Role, allowed: Role[], scope: string): void {
  if (!allowed.includes(actorRole)) {
    throw new PermissionDeniedError(scope);
  }
}
