import { useEffect, useState } from "react";
import { listPendingActions, approveAction, rejectAction, type PendingAction } from "../api/client.js";

export function HitlQueue() {
  const [actions, setActions] = useState<PendingAction[]>([]);

  async function refresh() {
    setActions(await listPendingActions());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handle(id: string, fn: (id: string) => Promise<void>) {
    await fn(id);
    await refresh();
  }

  return (
    <div>
      <h2>Pending Approvals</h2>
      {actions.map((action) => (
        <div key={action.id}>
          <p>{JSON.stringify(action.payload)}</p>
          <button onClick={() => handle(action.id, approveAction)}>Approve</button>
          <button onClick={() => handle(action.id, rejectAction)}>Reject</button>
        </div>
      ))}
    </div>
  );
}
