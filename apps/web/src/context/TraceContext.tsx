import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { subscribeTrace, type TraceEvent } from "../api/client.js";

interface TraceContextValue {
  events: TraceEvent[];
  connected: boolean;
}

const TraceContext = createContext<TraceContextValue | null>(null);

// Mounted once for the app's whole lifetime (in App.tsx, above the view switch) so trace events
// emitted while the user is on the Console tab are still captured and available when they
// switch to the Trace tab — subscribing only inside TracePanel would miss every event emitted
// while that view isn't mounted.
export function TraceProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeTrace(
      (event) => setEvents((prev) => [...prev, event]),
      () => setConnected(false)
    );
    return unsubscribe;
  }, []);

  return (
    <TraceContext.Provider value={{ events, connected }}>{children}</TraceContext.Provider>
  );
}

export function useTraceContext(): TraceContextValue {
  const ctx = useContext(TraceContext);
  if (!ctx) throw new Error("useTraceContext must be used within a TraceProvider");
  return ctx;
}
