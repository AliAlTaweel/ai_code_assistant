import { useState } from "react";
import { RoleProvider } from "./context/RoleContext.js";
import { TraceProvider } from "./context/TraceContext.js";
import { ModelProvider } from "./context/ModelContext.js";
import { RoleSwitcher } from "./components/RoleSwitcher.js";
import { ModelSelector } from "./components/ModelSelector.js";
import { StaffingConsole } from "./views/StaffingConsole.js";
import { TracePanel } from "./views/TracePanel.js";
import { HitlQueue } from "./views/HitlQueue.js";
import { EvalsTab } from "./views/EvalsTab.js";

type View = "console" | "trace" | "approvals" | "evals";

const NAV_ITEMS: Array<{ view: View; label: string }> = [
  { view: "console", label: "Console" },
  { view: "trace", label: "Trace" },
  { view: "approvals", label: "Approvals" },
  { view: "evals", label: "Evals" },
];

export default function App() {
  const [view, setView] = useState<View>("console");
  // Minimal shared "prefill" string for the plan's stated (but previously unbuilt) HITL
  // "Modify" flow: Reject-then-prefill-console. HitlQueue sets this and switches to the
  // Console view; StaffingConsole consumes-and-clears it on mount/change via a useEffect.
  const [prefill, setPrefill] = useState<string | null>(null);

  return (
    <RoleProvider>
      <ModelProvider>
        <TraceProvider>
          <h1 className="px-4 pt-4 text-xl font-bold text-gray-900">SkillsMatch MCP</h1>
          <nav className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
            <RoleSwitcher />
            <ModelSelector />
            <div className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.view}
                  aria-current={view === item.view ? "page" : undefined}
                  onClick={() => setView(item.view)}
                  className={
                    view === item.view
                      ? "rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
                      : "rounded px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
          <main className="flex gap-6 p-4">
            <div className="flex-1">
              {view === "console" && (
                <StaffingConsole prefill={prefill} onConsumePrefill={() => setPrefill(null)} />
              )}
              {view === "trace" && <TracePanel />}
              {view === "approvals" && (
                <HitlQueue
                  onModify={(text) => {
                    setPrefill(text);
                    setView("console");
                  }}
                />
              )}
              {view === "evals" && <EvalsTab />}
            </div>
          </main>
        </TraceProvider>
      </ModelProvider>
    </RoleProvider>
  );
}
