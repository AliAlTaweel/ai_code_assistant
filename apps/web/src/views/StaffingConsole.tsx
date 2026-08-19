import { useState } from "react";
import { postChat, type TraceEvent } from "../api/client.js";
import { useCurrentUser } from "../context/RoleContext.js";

interface Turn {
  role: "user" | "agent";
  text: string;
  trace: TraceEvent[];
}

export function StaffingConsole() {
  const currentUser = useCurrentUser();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);

  async function send() {
    if (!currentUser || !input.trim()) return;
    const message = input;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text: message, trace: [] }]);

    const result = await postChat(message, currentUser.role);
    setTurns((prev) => [...prev, { role: "agent", text: result.finalAnswer, trace: result.trace }]);
  }

  return (
    <div>
      <div>
        {turns.map((turn, i) => (
          <div key={i}>
            <p>{turn.text}</p>
            {turn.role === "agent" && turn.trace.length > 0 && (
              <details>
                <summary>steps</summary>
                <pre>{JSON.stringify(turn.trace, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
      <input
        placeholder="Ask the staffing agent..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
      />
      <button onClick={send}>Send</button>
    </div>
  );
}
