import { chat } from "./ollama.js";

export type Intent = "staffing_match" | "margin_check" | "draft_assignment" | "general";
const VALID_INTENTS: Intent[] = ["staffing_match", "margin_check", "draft_assignment", "general"];

const SYSTEM_PROMPT = `You are an intent classifier for a staffing platform. Read the user's
message and respond with exactly one label, nothing else: staffing_match, margin_check,
draft_assignment, or general.
- staffing_match: finding consultants by skill/availability
- margin_check: computing profit margin for a consultant/project combination
- draft_assignment: explicitly asking to assign/book a consultant to a project
- general: anything else`;

export async function classifyIntent(message: string): Promise<Intent> {
  const response = await chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: message },
  ]);
  const label = response.content.trim().toLowerCase() as Intent;
  return VALID_INTENTS.includes(label) ? label : "general";
}
