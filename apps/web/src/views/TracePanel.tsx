import { useEffect, useState } from "react";
import { subscribeTrace, type TraceEvent } from "../api/client.js";

export function TracePanel() {
  const [events, setEvents] = useState<TraceEvent[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeTrace((event) => {
      setEvents((prev) => [...prev, event]);
    });
    return unsubscribe;
  }, []);

  return (
    <aside>
      <h2>Execution Trace</h2>
      <ul>
        {events.map((event, i) => (
          <li
            key={i}
            className={
              event.type === "permission_denied"
                ? "trace-event trace-event--denied"
                : "trace-event"
            }
          >
            <strong>{event.type}</strong>: {event.detail}
          </li>
        ))}
      </ul>
    </aside>
  );
}
