import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Pool } from "pg";
import {
  GetConsultantAvailabilityInput,
  GetProjectMarginInput,
  DraftAssignmentInput,
} from "@skillsmatch/shared";
import { getConsultantAvailability } from "./tools/getConsultantAvailability.js";
import { getProjectMargin } from "./tools/getProjectMargin.js";
import { draftAssignment } from "./tools/draftAssignment.js";

function toErrorResponse(err: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: (err as Error).message }] };
}

export function buildServer(pool: Pool): McpServer {
  const server = new McpServer({ name: "skillsmatch-mcp", version: "0.1.0" });

  server.tool("get_consultant_availability", GetConsultantAvailabilityInput.shape, async (input) => {
    try {
      const results = await getConsultantAvailability(input, pool);
      return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
    } catch (err) {
      return toErrorResponse(err);
    }
  });

  server.tool("get_project_margin", GetProjectMarginInput.shape, async (input) => {
    try {
      const result = await getProjectMargin(input, pool);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return toErrorResponse(err);
    }
  });

  server.tool("draft_assignment", DraftAssignmentInput.shape, async (input) => {
    try {
      const result = await draftAssignment(input, pool);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return toErrorResponse(err);
    }
  });

  return server;
}
