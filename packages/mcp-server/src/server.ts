import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Pool } from "pg";
import {
  GetConsultantAvailabilityInput,
  GetProjectMarginInput,
  DraftAssignmentInput,
  FindConsultantByNameInput,
} from "@skillsmatch/shared";
import { getConsultantAvailability } from "./tools/getConsultantAvailability.js";
import { getProjectMargin } from "./tools/getProjectMargin.js";
import { draftAssignment } from "./tools/draftAssignment.js";
import { findConsultantByName } from "./tools/findConsultantByName.js";

function toErrorResponse(err: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
  };
}

export function buildServer(pool: Pool): McpServer {
  const server = new McpServer({ name: "skillsmatch-mcp", version: "0.1.0" });

  server.registerTool(
    "get_consultant_availability",
    {
      description:
        "Find consultants matching required skills and minimum weekly availability, ranked by semantic similarity. Open to all roles. requester_role is the acting user's role, supplied by the calling agent.",
      inputSchema: GetConsultantAvailabilityInput.shape,
    },
    async (input) => {
      try {
        const results = await getConsultantAvailability(input, pool);
        return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  server.registerTool(
    "find_consultant_by_name",
    {
      description:
        "Look up consultants by (partial, case-insensitive) full name, returning id/full_name/title. Open to all roles. Use this to resolve a name to a consultant_id before calling tools that require one.",
      inputSchema: FindConsultantByNameInput.shape,
    },
    async (input) => {
      try {
        const results = await findConsultantByName(input, pool);
        return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  server.registerTool(
    "get_project_margin",
    {
      description:
        "Compute the profit margin percentage for a consultant at a given target bill rate. Restricted to ADMIN and FINANCE roles. requester_role is the acting user's role, supplied by the calling agent — not to be set by the model.",
      inputSchema: GetProjectMarginInput.shape,
    },
    async (input) => {
      try {
        const result = await getProjectMargin(input, pool);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  server.registerTool(
    "draft_assignment",
    {
      description:
        "Create a DRAFT assignment linking a consultant to a project for a number of hours. Restricted to ADMIN and RESOURCING_MANAGER roles. requester_role is the acting user's role, supplied by the calling agent — not to be set by the model.",
      inputSchema: DraftAssignmentInput.shape,
    },
    async (input) => {
      try {
        const result = await draftAssignment(input, pool);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return toErrorResponse(err);
      }
    }
  );

  return server;
}
