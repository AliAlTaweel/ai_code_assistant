import { useTraceContext } from "../context/TraceContext.js";

export function TracePanel() {
  const { events, connected } = useTraceContext();

  return (
    <aside>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Execution Trace</h2>
        {!connected && (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            disconnected
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {events.map((event, i) => (
          <li
            key={i}
            className={
              event.type === "permission_denied"
                ? "trace-event trace-event--denied rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800"
                : "trace-event rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700"
            }
          >
            <strong className="font-mono text-xs uppercase tracking-wide">{event.type}</strong>:{" "}
            {event.detail}
          </li>
        ))}
      </ul>
    </aside>
  );
}
