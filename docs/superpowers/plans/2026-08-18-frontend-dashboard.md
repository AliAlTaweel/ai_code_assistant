# Frontend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React dashboard with a role switcher, a staffing chat console, a live execution trace panel, a HITL approval queue, and an evaluation metrics tab — talking only to the agent package's HTTP/SSE API.

**Architecture:** Vite + React + TypeScript + Tailwind, single-page app with client-side view state (no router needed for four views behind one nav). A thin `api/client.ts` wraps every backend call; a `RoleContext` holds the selected user and is read by every view that needs to send `role`/`user_id`.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, Vitest + `@testing-library/react` (jsdom environment).

**Spec:** `docs/superpowers/specs/2026-08-18-skillsmatch-mcp-design.md` (§ Frontend)

## Global Constraints

- Agent API base URL: `http://localhost:3001` (from the Agent Orchestration plan)
- Roles: `ADMIN`, `RESOURCING_MANAGER`, `CONSULTANT`, `FINANCE`
- Visual styling (color, spacing, typography) is deliberately unspecified in this plan — apply the `frontend-design` skill during implementation for the actual look; this plan only locks down structure and behavior
- Vitest config for this package uses `environment: "jsdom"`; run its tests with `npm test --workspace=apps/web`

---

## File Structure

```
packages/agent/src/server.ts        # modified: add GET /api/users, GET /api/agent/pending-actions
packages/agent/src/pendingActions.ts # modified: add listPendingActions
apps/web/
  package.json
  vite.config.ts
  vitest.config.ts
  tailwind.config.js
  postcss.config.js
  index.html
  src/
    main.tsx
    App.tsx
    api/client.ts
    context/RoleContext.tsx
    components/RoleSwitcher.tsx
    views/StaffingConsole.tsx
    views/TracePanel.tsx
    views/HitlQueue.tsx
    views/EvalsTab.tsx
  test/
    App.test.tsx
    RoleSwitcher.test.tsx
    StaffingConsole.test.tsx
    HitlQueue.test.tsx
    EvalsTab.test.tsx
```

## Task 1: Missing agent API routes the frontend needs

**Files:**
- Modify: `packages/agent/src/pendingActions.ts` — add `listPendingActions`
- Modify: `packages/agent/src/server.ts` — add `GET /api/users`, `GET /api/agent/pending-actions`
- Test: `packages/agent/test/additionalRoutes.test.ts`

**Interfaces:**
- Produces: `listPendingActions(pool): Promise<PendingAction[]>` (all rows with `status = 'WAITING_FOR_APPROVAL'`), `GET /api/users` (returns `Array<{ id: string; name: string; role: Role }>` from the seeded `users` table — the Task 3 role switcher fetches this), `GET /api/agent/pending-actions` (returns `PendingAction[]` — Task 6's HITL queue polls this).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/agent/test/additionalRoutes.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/server.js";
import * as pendingActions from "../src/pendingActions.js";

describe("GET /api/users", () => {
  it("returns rows from a query against the users table", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "u1", name: "Ava Admin", role: "ADMIN" }],
    });
    const app = buildApp({ pool: { query: queryMock } as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/users" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: "u1", name: "Ava Admin", role: "ADMIN" }]);
  });
});

describe("GET /api/agent/pending-actions", () => {
  it("returns pending actions awaiting approval", async () => {
    vi.spyOn(pendingActions, "listPendingActions").mockResolvedValue([
      { id: "p1", type: "draft_assignment", payload: { hours: 10 }, status: "WAITING_FOR_APPROVAL" },
    ]);
    const app = buildApp({ pool: {} as any, mcpClient: {} as any });
    const response = await app.inject({ method: "GET", url: "/api/agent/pending-actions" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/agent/test/additionalRoutes.test.ts`
Expected: FAIL — routes don't exist.

- [ ] **Step 3: Add `listPendingActions` to `packages/agent/src/pendingActions.ts`**

Append to the existing file:

```typescript
export async function listPendingActions(pool: Pool): Promise<PendingAction[]> {
  const { rows } = await pool.query<PendingAction>(
    `SELECT id, type, payload, status FROM pending_actions WHERE status = 'WAITING_FOR_APPROVAL' ORDER BY created_at DESC`
  );
  return rows;
}
```

- [ ] **Step 4: Add the two routes to `packages/agent/src/server.ts`**

Add the import: `import { getPendingAction, resolvePendingAction, listPendingActions } from "./pendingActions.js";` (replacing the existing narrower import line).

Add inside `buildApp`, before `return app;`:

```typescript
  app.get("/api/users", async () => {
    const { rows } = await deps.pool.query(`SELECT id, name, role FROM users ORDER BY name`);
    return rows;
  });

  app.get("/api/agent/pending-actions", async () => {
    return listPendingActions(deps.pool);
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- packages/agent/test/additionalRoutes.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/pendingActions.ts packages/agent/src/server.ts packages/agent/test/additionalRoutes.test.ts
git commit -m "feat: add users and pending-actions list routes for the dashboard"
```

---

## Task 2: Vite + React + Tailwind scaffold and API client

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/tailwind.config.js`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/index.css`
- Create: `apps/web/src/api/client.ts`
- Test: `apps/web/test/client.test.ts`

**Interfaces:**
- Produces: `Role` re-exported type, `User` (`{ id: string; name: string; role: Role }`), `TraceEvent`, `postChat(message: string, role: Role): Promise<{ finalAnswer: string; trace: TraceEvent[] }>`, `listUsers(): Promise<User[]>`, `listPendingActions(): Promise<PendingAction[]>`, `approveAction(id: string): Promise<void>`, `rejectAction(id: string): Promise<void>`, `getLatestEvals(): Promise<EvalRun | null>` (returns `null` on 404), `subscribeTrace(onEvent: (e: TraceEvent) => void): () => void` (opens an `EventSource` against `/api/trace/stream`, returns an unsubscribe function). Every later task's view imports from `../api/client.js`.

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@skillsmatch/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.8",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "jsdom": "^24.1.1",
    "tailwindcss": "^3.4.9",
    "postcss": "^8.4.41",
    "autoprefixer": "^10.4.20",
    "typescript": "^5.5.4",
    "vite": "^5.4.1",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write build/tooling config files**

`apps/web/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

`apps/web/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "jsdom", setupFiles: [] },
});
```

`apps/web/tailwind.config.js`:
```javascript
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

`apps/web/postcss.config.js`:
```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>SkillsMatch MCP</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/web/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Write the failing API client test**

```typescript
// apps/web/test/client.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { postChat, listUsers, getLatestEvals } from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("postChat", () => {
  it("POSTs message and role to /api/chat and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ finalAnswer: "hi", trace: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postChat("find a go engineer", "CONSULTANT");

    expect(result).toEqual({ finalAnswer: "hi", trace: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/chat"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("listUsers", () => {
  it("GETs /api/users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "u1", name: "Ava", role: "ADMIN" }] })
    );
    const users = await listUsers();
    expect(users).toEqual([{ id: "u1", name: "Ava", role: "ADMIN" }]);
  });
});

describe("getLatestEvals", () => {
  it("returns null on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getLatestEvals()).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- test/client.test.ts`
Expected: FAIL — `src/api/client.js` does not exist.

- [ ] **Step 5: Write `apps/web/src/api/client.ts`**

```typescript
const API_BASE = "http://localhost:3001";

export type Role = "ADMIN" | "RESOURCING_MANAGER" | "CONSULTANT" | "FINANCE";

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface TraceEvent {
  type: "model_thought" | "tool_call" | "tool_result" | "permission_denied";
  detail: string;
}

export interface PendingAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "WAITING_FOR_APPROVAL" | "APPROVED" | "REJECTED";
}

export interface EvalRun {
  timestamp: string;
  results: Array<{ id: string; passed: boolean; latencyMs: number }>;
  summary: { passRate: number; avgLatencyMs: number };
}

export async function postChat(
  message: string,
  role: Role
): Promise<{ finalAnswer: string; trace: TraceEvent[] }> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, role }),
  });
  return response.json();
}

export async function listUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE}/api/users`);
  return response.json();
}

export async function listPendingActions(): Promise<PendingAction[]> {
  const response = await fetch(`${API_BASE}/api/agent/pending-actions`);
  return response.json();
}

export async function approveAction(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/agent/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingActionId: id }),
  });
}

export async function rejectAction(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/agent/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingActionId: id }),
  });
}

export async function getLatestEvals(): Promise<EvalRun | null> {
  const response = await fetch(`${API_BASE}/api/evals/latest`);
  if (!response.ok) return null;
  return response.json();
}

export function subscribeTrace(onEvent: (e: TraceEvent) => void): () => void {
  const source = new EventSource(`${API_BASE}/api/trace/stream`);
  source.addEventListener("trace", (message) => {
    onEvent(JSON.parse((message as MessageEvent).data));
  });
  return () => source.close();
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- test/client.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/vitest.config.ts apps/web/tailwind.config.js apps/web/postcss.config.js apps/web/index.html apps/web/src/main.tsx apps/web/src/index.css apps/web/src/api/client.ts apps/web/test/client.test.ts
git commit -m "chore: scaffold vite/react/tailwind app and API client"
```

---

## Task 3: Role context and switcher

**Files:**
- Create: `apps/web/src/context/RoleContext.tsx`
- Create: `apps/web/src/components/RoleSwitcher.tsx`
- Test: `apps/web/test/RoleSwitcher.test.tsx`

**Interfaces:**
- Consumes: `listUsers`, `User` from `../api/client.js`.
- Produces: `RoleProvider` (React context provider, fetches users on mount, defaults `currentUser` to the first fetched user), `useCurrentUser(): User | null`, `<RoleSwitcher />` (a `<select>` bound to the context, calling `setCurrentUser` on change). Every view in Tasks 4-6 wraps in `useCurrentUser()` to read `role`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/RoleSwitcher.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RoleProvider } from "../src/context/RoleContext.js";
import { RoleSwitcher } from "../src/components/RoleSwitcher.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("RoleSwitcher", () => {
  it("lists seeded users and lets you pick one", async () => {
    vi.spyOn(client, "listUsers").mockResolvedValue([
      { id: "u1", name: "Ava Admin", role: "ADMIN" },
      { id: "u2", name: "Ray Resourcing", role: "RESOURCING_MANAGER" },
    ]);

    render(
      <RoleProvider>
        <RoleSwitcher />
      </RoleProvider>
    );

    await waitFor(() => screen.getByDisplayValue("Ava Admin (ADMIN)"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "u2" } });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("u2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- test/RoleSwitcher.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Write `apps/web/src/context/RoleContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listUsers, type User } from "../api/client.js";

interface RoleContextValue {
  users: User[];
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    listUsers().then((fetched) => {
      setUsers(fetched);
      if (fetched.length > 0) setCurrentUser(fetched[0]);
    });
  }, []);

  return (
    <RoleContext.Provider value={{ users, currentUser, setCurrentUser }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRoleContext(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRoleContext must be used within a RoleProvider");
  return ctx;
}

export function useCurrentUser(): User | null {
  return useRoleContext().currentUser;
}
```

- [ ] **Step 4: Write `apps/web/src/components/RoleSwitcher.tsx`**

```tsx
import { useRoleContext } from "../context/RoleContext.js";

export function RoleSwitcher() {
  const { users, currentUser, setCurrentUser } = useRoleContext();

  if (!currentUser) return null;

  return (
    <select
      role="combobox"
      value={currentUser.id}
      onChange={(e) => {
        const selected = users.find((u) => u.id === e.target.value);
        if (selected) setCurrentUser(selected);
      }}
    >
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name} ({user.role})
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- test/RoleSwitcher.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/context/RoleContext.tsx apps/web/src/components/RoleSwitcher.tsx apps/web/test/RoleSwitcher.test.tsx
git commit -m "feat: add role context and switcher"
```

---

## Task 4: Staffing console

**Files:**
- Create: `apps/web/src/views/StaffingConsole.tsx`
- Test: `apps/web/test/StaffingConsole.test.tsx`

**Interfaces:**
- Consumes: `postChat` from `../api/client.js`, `useCurrentUser` from `../context/RoleContext.js`.
- Produces: `<StaffingConsole />` — a message input, a send button, and a scrolling list of `{ role: "user" | "agent", text: string, trace: TraceEvent[] }` turns; each agent turn renders `finalAnswer` with a `<details>` element exposing its `trace` as raw JSON (the full visual trace lives in Task 5's panel — this is just a per-turn fallback).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/StaffingConsole.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RoleProvider } from "../src/context/RoleContext.js";
import { StaffingConsole } from "../src/views/StaffingConsole.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("StaffingConsole", () => {
  it("sends a message and renders the agent's final answer", async () => {
    vi.spyOn(client, "listUsers").mockResolvedValue([{ id: "u1", name: "Ava", role: "ADMIN" }]);
    vi.spyOn(client, "postChat").mockResolvedValue({ finalAnswer: "Found Alice Chen.", trace: [] });

    render(
      <RoleProvider>
        <StaffingConsole />
      </RoleProvider>
    );

    await waitFor(() => screen.getByPlaceholderText(/ask/i));
    fireEvent.change(screen.getByPlaceholderText(/ask/i), { target: { value: "find a go engineer" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => screen.getByText("Found Alice Chen."));
    expect(client.postChat).toHaveBeenCalledWith("find a go engineer", "ADMIN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- test/StaffingConsole.test.tsx`
Expected: FAIL — `src/views/StaffingConsole.js` does not exist.

- [ ] **Step 3: Write `apps/web/src/views/StaffingConsole.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- test/StaffingConsole.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/StaffingConsole.tsx apps/web/test/StaffingConsole.test.tsx
git commit -m "feat: add staffing agent console view"
```

---

## Task 5: Execution trace panel

**Files:**
- Create: `apps/web/src/views/TracePanel.tsx`

**Interfaces:**
- Consumes: `subscribeTrace` from `../api/client.js`.
- Produces: `<TracePanel />` — subscribes on mount, unsubscribes on unmount, renders a running list of `TraceEvent`s, with `permission_denied` events given a distinct class (`className="trace-event trace-event--denied"`) so styling can target them later.

**Testing note:** `EventSource` is not implemented in jsdom. Rather than polyfilling it for one component, this task is verified manually (Step 3) instead of with a unit test — consistent with the plan's testing tools (Vitest + Testing Library have no built-in SSE support).

- [ ] **Step 1: Write `apps/web/src/views/TracePanel.tsx`**

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p apps/web`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With the agent API running (`npm run start --workspace=@skillsmatch/agent`) and the dashboard running (`npm run dev --workspace=@skillsmatch/web`), open the dashboard, send a staffing query from Task 4's console, and confirm trace lines appear in the `TracePanel` in real time as the request is processed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/views/TracePanel.tsx
git commit -m "feat: add live SSE execution trace panel"
```

---

## Task 6: HITL action queue

**Files:**
- Create: `apps/web/src/views/HitlQueue.tsx`
- Test: `apps/web/test/HitlQueue.test.tsx`

**Interfaces:**
- Consumes: `listPendingActions`, `approveAction`, `rejectAction`, `PendingAction` from `../api/client.js`.
- Produces: `<HitlQueue />` — fetches pending actions on mount, renders each as a card with the payload fields and Approve/Reject buttons; on click, calls the corresponding API function then refetches the list. "Modify" (per the spec) is implemented as a `Reject` followed by prefilling `StaffingConsole`'s input — deferred to Task 4's existing send flow rather than a separate edit form, so this task only needs Approve/Reject.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/HitlQueue.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HitlQueue } from "../src/views/HitlQueue.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("HitlQueue", () => {
  it("lists a pending action and approves it on click", async () => {
    vi.spyOn(client, "listPendingActions").mockResolvedValue([
      { id: "p1", type: "draft_assignment", payload: { project_id: "pr1", consultant_id: "c1", hours: 10 }, status: "WAITING_FOR_APPROVAL" },
    ]);
    const approveSpy = vi.spyOn(client, "approveAction").mockResolvedValue();

    render(<HitlQueue />);

    await waitFor(() => screen.getByText(/10/));
    fireEvent.click(screen.getByText("Approve"));

    expect(approveSpy).toHaveBeenCalledWith("p1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- test/HitlQueue.test.tsx`
Expected: FAIL — `src/views/HitlQueue.js` does not exist.

- [ ] **Step 3: Write `apps/web/src/views/HitlQueue.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- test/HitlQueue.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/HitlQueue.tsx apps/web/test/HitlQueue.test.tsx
git commit -m "feat: add HITL action queue view"
```

---

## Task 7: Evaluation tab

**Files:**
- Create: `apps/web/src/views/EvalsTab.tsx`
- Test: `apps/web/test/EvalsTab.test.tsx`

**Interfaces:**
- Consumes: `getLatestEvals`, `EvalRun` from `../api/client.js`.
- Produces: `<EvalsTab />` — fetches on mount; renders "No eval runs yet." when `null`, otherwise a table of `results` (id, passed, latencyMs) plus the `summary` line.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/EvalsTab.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EvalsTab } from "../src/views/EvalsTab.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("EvalsTab", () => {
  it("shows a placeholder when there's no report yet", async () => {
    vi.spyOn(client, "getLatestEvals").mockResolvedValue(null);
    render(<EvalsTab />);
    await waitFor(() => screen.getByText("No eval runs yet."));
  });

  it("renders the summary pass rate when a report exists", async () => {
    vi.spyOn(client, "getLatestEvals").mockResolvedValue({
      timestamp: "2026-08-18T00:00:00Z",
      results: [{ id: "A", passed: true, latencyMs: 120 }],
      summary: { passRate: 1, avgLatencyMs: 120 },
    });
    render(<EvalsTab />);
    await waitFor(() => screen.getByText(/100%/));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- test/EvalsTab.test.tsx`
Expected: FAIL — `src/views/EvalsTab.js` does not exist.

- [ ] **Step 3: Write `apps/web/src/views/EvalsTab.tsx`**

```tsx
import { useEffect, useState } from "react";
import { getLatestEvals, type EvalRun } from "../api/client.js";

export function EvalsTab() {
  const [run, setRun] = useState<EvalRun | null | undefined>(undefined);

  useEffect(() => {
    getLatestEvals().then(setRun);
  }, []);

  if (run === undefined) return null;
  if (run === null) return <p>No eval runs yet.</p>;

  return (
    <div>
      <p>
        Pass rate: {(run.summary.passRate * 100).toFixed(0)}% · Avg latency:{" "}
        {run.summary.avgLatencyMs.toFixed(0)}ms
      </p>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Passed</th>
            <th>Latency (ms)</th>
          </tr>
        </thead>
        <tbody>
          {run.results.map((result) => (
            <tr key={result.id}>
              <td>{result.id}</td>
              <td>{result.passed ? "✅" : "❌"}</td>
              <td>{result.latencyMs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- test/EvalsTab.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/EvalsTab.tsx apps/web/test/EvalsTab.test.tsx
git commit -m "feat: add evaluation metrics tab"
```

---

## Task 8: App shell

**Files:**
- Create: `apps/web/src/App.tsx`
- Test: `apps/web/test/App.test.tsx`

**Interfaces:**
- Consumes: `RoleProvider`, `RoleSwitcher` (Task 3), `StaffingConsole` (Task 4), `TracePanel` (Task 5), `HitlQueue` (Task 6), `EvalsTab` (Task 7).
- Produces: `<App />` — wraps everything in `RoleProvider`; left nav with four buttons (`Console`, `Trace`, `Approvals`, `Evals`) switching a `useState<View>` that conditionally renders the matching view; `RoleSwitcher` always visible in the nav regardless of selected view.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/App.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("switches between views via nav buttons", async () => {
    vi.spyOn(client, "listUsers").mockResolvedValue([{ id: "u1", name: "Ava", role: "ADMIN" }]);
    vi.spyOn(client, "listPendingActions").mockResolvedValue([]);
    vi.spyOn(client, "getLatestEvals").mockResolvedValue(null);

    render(<App />);

    await waitFor(() => screen.getByText("Console"));
    expect(screen.getByPlaceholderText(/ask/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Approvals"));
    await waitFor(() => screen.getByText("Pending Approvals"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/web -- test/App.test.tsx`
Expected: FAIL — `src/App.js` does not exist.

- [ ] **Step 3: Write `apps/web/src/App.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/web -- test/App.test.tsx`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Run the whole app manually**

With Postgres, Ollama, the MCP server, and `packages/agent` running, run: `npm run dev --workspace=@skillsmatch/web`, open the printed local URL, switch roles, send a staffing query, watch the trace panel update, and check the Approvals/Evals tabs render without errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/test/App.test.tsx
git commit -m "feat: wire dashboard app shell with nav and role switcher"
```

---

## Self-Review Notes

- **Spec coverage:** role switcher ✅ (Task 3), staffing console ✅ (Task 4), execution trace panel with denial highlighting ✅ (Task 5), HITL queue with Approve/Reject (Modify handled via the existing chat flow, noted explicitly rather than left ambiguous) ✅ (Task 6), evaluation tab ✅ (Task 7), nav shell ✅ (Task 8). Two supporting API routes the spec implied but didn't name explicitly (`/api/users`, `/api/agent/pending-actions`) are added in Task 1 with their own tests.
- **Type consistency:** `Role`, `User`, `TraceEvent`, `PendingAction`, `EvalRun` all defined once in `api/client.ts` (Task 2) and imported everywhere else — never redefined per-component.
- **No placeholders:** every step has runnable code; Task 5's lack of a unit test is explicitly justified (jsdom has no `EventSource`), not silently skipped.
