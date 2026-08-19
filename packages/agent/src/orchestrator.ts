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
  // Be forgiving of near-miss formatting (trailing punctuation, stray whitespace, a label
  // embedded in a short sentence) rather than immediately falling back to "general" — a
  // fallback to "general" means an unguarded, tool-less chat() call that can hallucinate
  // financial/staffing data, so it should only be a true last resort.
  const raw = response.content.trim().toLowerCase();
  const exact = raw as Intent;
  if (VALID_INTENTS.includes(exact)) {
    return exact;
  }
  const stripped = raw.replace(/^[^a-z]+|[^a-z]+$/g, "") as Intent;
  if (VALID_INTENTS.includes(stripped)) {
    return stripped;
  }
  const contained = VALID_INTENTS.find((intent) => intent !== "general" && raw.includes(intent));
  return contained ?? "general";
}
