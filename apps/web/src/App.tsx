import { useState } from "react";
import { RoleProvider } from "./context/RoleContext.js";
import { RoleSwitcher } from "./components/RoleSwitcher.js";
import { StaffingConsole } from "./views/StaffingConsole.js";
import { TracePanel } from "./views/TracePanel.js";
import { HitlQueue } from "./views/HitlQueue.js";
import { EvalsTab } from "./views/EvalsTab.js";

type View = "console" | "trace" | "approvals" | "evals";

export default function App() {
  const [view, setView] = useState<View>("console");

  return (
    <RoleProvider>
      <nav>
        <RoleSwitcher />
        <button onClick={() => setView("console")}>Console</button>
        <button onClick={() => setView("trace")}>Trace</button>
        <button onClick={() => setView("approvals")}>Approvals</button>
        <button onClick={() => setView("evals")}>Evals</button>
      </nav>
      <main>
        {view === "console" && <StaffingConsole />}
        {view === "trace" && <TracePanel />}
        {view === "approvals" && <HitlQueue />}
        {view === "evals" && <EvalsTab />}
      </main>
    </RoleProvider>
  );
}
