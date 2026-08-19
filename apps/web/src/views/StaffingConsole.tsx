import { useEffect, useState } from "react";
import { postChat, type TraceEvent } from "../api/client.js";
import { useCurrentUser } from "../context/RoleContext.js";

interface Turn {
  role: "user" | "agent";
  text: string;
  trace: TraceEvent[];
}

interface StaffingConsoleProps {
  /** Set by HitlQueue's Modify flow (via App.tsx) to seed the input on mount/change. */
  prefill?: string | null;
  /** Called once the prefill value has been consumed, so the parent can clear it. */
  onConsumePrefill?: () => void;
}

export function StaffingConsole({ prefill, onConsumePrefill }: StaffingConsoleProps) {
  const currentUser = useCurrentUser();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefill) {
      setInput(prefill);
      onConsumePrefill?.();
    }
  }, [prefill, onConsumePrefill]);

  async function send() {
    if (!currentUser || !input.trim() || isSending) return;
    const message = input;
    setInput("");
    setError(null);
    setTurns((prev) => [...prev, { role: "user", text: message, trace: [] }]);
    setIsSending(true);

    try {
      const result = await postChat(message, currentUser.role);
      setTurns((prev) => [...prev, { role: "agent", text: result.finalAnswer, trace: result.trace }]);
    } catch (err) {
      console.error("Failed to send chat message:", err);
      setError("Failed to get a response from the agent. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {turns.map((turn, i) => (
          <div
            key={i}
            className={
              turn.role === "user"
                ? "ml-auto max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
                : "mr-auto max-w-[80%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900"
            }
          >
            <p>{turn.text}</p>
            {turn.role === "agent" && turn.trace.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-gray-500">steps</summary>
                <pre className="mt-1 overflow-x-auto text-xs">{JSON.stringify(turn.trace, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <input
          aria-label="Message"
          placeholder="Ask the staffing agent..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={isSending}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={isSending || !input.trim()}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
