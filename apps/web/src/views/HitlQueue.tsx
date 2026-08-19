import { useEffect, useState } from "react";
import { listPendingActions, approveAction, rejectAction, type PendingAction } from "../api/client.js";

interface HitlQueueProps {
  /** Invoked after a Reject-driven "Modify" with a suggested prefill string for the console
   *  input, per the plan's stated (Reject-then-prefill) Modify flow. Optional so HitlQueue can
   *  still be rendered/tested standalone without a parent wiring this up. */
  onModify?: (prefillText: string) => void;
}

export function HitlQueue({ onModify }: HitlQueueProps) {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      setActions(await listPendingActions());
      setError(null);
    } catch (err) {
      console.error("Failed to load pending actions:", err);
      setError("Failed to load pending approvals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handle(id: string, fn: (id: string) => Promise<void>) {
    setBusyId(id);
    try {
      await fn(id);
      await refresh();
    } catch (err) {
      console.error("Failed to resolve pending action:", err);
      setError("Failed to resolve that action. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleModify(action: PendingAction) {
    setBusyId(action.id);
    try {
      await rejectAction(action.id);
      await refresh();
      setError(null);
      onModify?.(`Modify request: ${JSON.stringify(action.payload)}`);
    } catch (err) {
      console.error("Failed to reject action for modify:", err);
      setError("Failed to resolve that action. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-gray-800">Pending Approvals</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && actions.length === 0 && (
        <p className="text-sm text-gray-500">No pending approvals.</p>
      )}
      <div className="flex flex-col gap-3">
        {actions.map((action) => (
          <div
            key={action.id}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            <p className="mb-2 break-words font-mono text-xs text-gray-600">
              {JSON.stringify(action.payload)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handle(action.id, approveAction)}
                disabled={busyId === action.id}
                className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
              >
                {busyId === action.id ? "Working…" : "Approve"}
              </button>
              <button
                onClick={() => handle(action.id, rejectAction)}
                disabled={busyId === action.id}
                className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
              >
                {busyId === action.id ? "Working…" : "Reject"}
              </button>
              <button
                onClick={() => handleModify(action)}
                disabled={busyId === action.id}
                className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 disabled:opacity-50"
              >
                Modify
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
