# Evaluation Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline scenario runner that drives the real agent HTTP API (`/api/chat`) and scores tool-selection accuracy, grounding, latency, and permission-boundary compliance, writing an appendable `eval_report.json` plus a CLI table.

**Architecture:** `packages/evals` is a thin package: `test_cases.json` (fixtures), pure `metrics.ts` functions scored against each response's `{ finalAnswer, trace }`, a `report.ts` writer that appends timestamped runs to `evals/eval_report.json`, and `runner.ts` that ties it together and prints a `console.table`.

**Tech Stack:** TypeScript, Vitest. Requires the Agent Orchestration plan's `/api/chat` endpoint running (`packages/agent`), which in turn requires the MCP server and seeded database running.

**Spec:** `docs/superpowers/specs/2026-08-18-skillsmatch-mcp-design.md` (§ Evaluation Suite)

## Global Constraints

- Agent API base URL: `http://localhost:3001` (matches `packages/agent/src/index.ts`'s port from the Agent Orchestration plan)
- Report path: `evals/eval_report.json` (repo root `evals/`, not `packages/evals/` — this is the exact path `packages/agent/src/server.ts`'s `/api/evals/latest` route already reads, per the Agent Orchestration plan)
- **Scope decision — latency granularity:** the spec asks for "latency per reasoning step and tool call," but `TraceEvent` (Agent Orchestration plan) does not carry timestamps. This plan measures **end-to-end wall-clock latency per scenario** (time around the `/api/chat` call) instead of per-step latency. Per-step timing would require adding timestamps to `TraceEvent` and is out of scope here — flag it as a follow-up if per-step latency is later needed.
- **Scope decision — grounding check:** rather than free-form named-entity extraction, each test case declares its own `expectedGroundedTerms: string[]`; the grounding metric checks each declared term appears both in `finalAnswer` and in at least one `tool_result` trace entry. This keeps the check deterministic instead of relying on NLP heuristics.

---

## File Structure

```
evals/
  test_cases.json
  metrics.ts
  report.ts
  runner.ts
  test/
    metrics.test.ts
    report.test.ts
    runner.test.ts
```

`evals/` is a plain TypeScript directory driven by `tsx`, not an npm workspace package (it has no internal consumers other than itself and the agent's `/api/evals/latest` file read), consistent with `db/` in the Data Layer plan.

## Task 1: Test cases + metrics

**Files:**
- Create: `evals/test_cases.json`
- Create: `evals/metrics.ts`
- Test: `evals/test/metrics.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions over plain data).
- Produces: `TestCase` (`{ id: string; description: string; role: Role; message: string; expectedToolSequence: string[]; expectedGroundedTerms: string[]; expectPermissionDenied: boolean }`), and pure functions `toolSelectionAccuracy(trace: TraceEvent[], expected: string[]): boolean`, `groundingScore(finalAnswer: string, trace: TraceEvent[], expectedTerms: string[]): boolean`, `permissionCompliance(trace: TraceEvent[], expectPermissionDenied: boolean): boolean`. Task 3's `runner.ts` calls all three per scenario.

- [ ] **Step 1: Write `evals/test_cases.json`**

```json
[
  {
    "id": "A",
    "description": "Valid staffing match with high availability",
    "role": "CONSULTANT",
    "message": "Find me a senior Go engineer with at least 20 hours available per week",
    "expectedToolSequence": ["get_consultant_availability"],
    "expectedGroundedTerms": ["Alice Chen"],
    "expectPermissionDenied": false
  },
  {
    "id": "B",
    "description": "Permission restriction check on the finance tool",
    "role": "RESOURCING_MANAGER",
    "message": "What's the profit margin if we bill Alice Chen at $170 an hour?",
    "expectedToolSequence": ["get_project_margin"],
    "expectedGroundedTerms": [],
    "expectPermissionDenied": true
  },
  {
    "id": "C",
    "description": "Ambiguous query requiring constraint relaxation",
    "role": "CONSULTANT",
    "message": "Find a consultant skilled in Go, Kubernetes, Terraform, and Rust, available 40 hours a week",
    "expectedToolSequence": ["get_consultant_availability"],
    "expectedGroundedTerms": [],
    "expectPermissionDenied": false
  },
  {
    "id": "D",
    "description": "Edge case with zero available consultants",
    "role": "CONSULTANT",
    "message": "Find a consultant skilled in COBOL mainframe programming",
    "expectedToolSequence": ["get_consultant_availability"],
    "expectedGroundedTerms": [],
    "expectPermissionDenied": false
  }
]
```

- [ ] **Step 2: Write the failing metrics test**

```typescript
// evals/test/metrics.test.ts
import { describe, it, expect } from "vitest";
import { toolSelectionAccuracy, groundingScore, permissionCompliance } from "../metrics.js";
import type { TraceEvent } from "../../packages/agent/src/toolLoop.js";

describe("toolSelectionAccuracy", () => {
  it("passes when the tool_call sequence matches exactly, in order", () => {
    const trace: TraceEvent[] = [
      { type: "tool_call", detail: "get_consultant_availability({})" },
      { type: "tool_result", detail: "[]" },
    ];
    expect(toolSelectionAccuracy(trace, ["get_consultant_availability"])).toBe(true);
  });

  it("fails when a different tool was called", () => {
    const trace: TraceEvent[] = [{ type: "tool_call", detail: "get_project_margin({})" }];
    expect(toolSelectionAccuracy(trace, ["get_consultant_availability"])).toBe(false);
  });
});

describe("groundingScore", () => {
  it("passes when an expected term appears in both the final answer and a tool_result", () => {
    const trace: TraceEvent[] = [
      { type: "tool_result", detail: '[{"full_name":"Alice Chen"}]' },
    ];
    expect(groundingScore("I recommend Alice Chen.", trace, ["Alice Chen"])).toBe(true);
  });

  it("fails when the final answer names someone absent from any tool_result", () => {
    const trace: TraceEvent[] = [{ type: "tool_result", detail: "[]" }];
    expect(groundingScore("I recommend Alice Chen.", trace, ["Alice Chen"])).toBe(false);
  });

  it("passes trivially when there are no expected terms", () => {
    expect(groundingScore("anything", [], [])).toBe(true);
  });
});

describe("permissionCompliance", () => {
  it("passes when a permission_denied event is present and one was expected", () => {
    const trace: TraceEvent[] = [{ type: "permission_denied", detail: "PERMISSION_DENIED: ..." }];
    expect(permissionCompliance(trace, true)).toBe(true);
  });

  it("fails when a permission_denied event was expected but absent", () => {
    expect(permissionCompliance([], true)).toBe(false);
  });

  it("passes when none was expected and none occurred", () => {
    expect(permissionCompliance([], false)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- evals/test/metrics.test.ts`
Expected: FAIL — `evals/metrics.js` does not exist.

- [ ] **Step 4: Write `evals/metrics.ts`**

```typescript
import type { TraceEvent } from "../packages/agent/src/toolLoop.js";

export function toolSelectionAccuracy(trace: TraceEvent[], expected: string[]): boolean {
  const actual = trace
    .filter((e) => e.type === "tool_call")
    .map((e) => e.detail.split("(")[0]);
  if (actual.length !== expected.length) return false;
  return actual.every((name, i) => name === expected[i]);
}

export function groundingScore(
  finalAnswer: string,
  trace: TraceEvent[],
  expectedTerms: string[]
): boolean {
  if (expectedTerms.length === 0) return true;
  const toolResultText = trace
    .filter((e) => e.type === "tool_result")
    .map((e) => e.detail)
    .join("\n");
  return expectedTerms.every(
    (term) => finalAnswer.includes(term) && toolResultText.includes(term)
  );
}

export function permissionCompliance(trace: TraceEvent[], expectPermissionDenied: boolean): boolean {
  const wasDenied = trace.some((e) => e.type === "permission_denied");
  return wasDenied === expectPermissionDenied;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- evals/test/metrics.test.ts`
Expected: PASS — 7 tests passed.

- [ ] **Step 6: Commit**

```bash
git add evals/test_cases.json evals/metrics.ts evals/test/metrics.test.ts
git commit -m "feat: add eval test cases and scoring metrics"
```

---

## Task 2: Report writer

**Files:**
- Create: `evals/report.ts`
- Test: `evals/test/report.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces: `EvalRun` (`{ timestamp: string; results: Array<{ id: string; passed: boolean; latencyMs: number; toolSelectionAccuracy: boolean; groundingScore: boolean; permissionCompliance: boolean }>; summary: { passRate: number; avgLatencyMs: number } }`), `appendReport(run: EvalRun, path?: string): void` — reads the existing JSON array at `path` (default `evals/eval_report.json`, resolved relative to the repo root) if present, appends `run`, writes it back; creates the file with a single-element array if it doesn't exist yet.

- [ ] **Step 1: Write the failing test**

```typescript
// evals/test/report.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { appendReport } from "../report.js";

const TEST_PATH = new URL("./tmp-eval-report.json", import.meta.url).pathname;

beforeEach(() => {
  if (existsSync(TEST_PATH)) rmSync(TEST_PATH);
});
afterEach(() => {
  if (existsSync(TEST_PATH)) rmSync(TEST_PATH);
});

describe("appendReport", () => {
  it("creates the file with one run when it doesn't exist", () => {
    appendReport(
      { timestamp: "2026-08-18T00:00:00Z", results: [], summary: { passRate: 1, avgLatencyMs: 100 } },
      TEST_PATH
    );
    const contents = JSON.parse(readFileSync(TEST_PATH, "utf-8"));
    expect(contents).toHaveLength(1);
  });

  it("appends a second run to an existing file", () => {
    appendReport(
      { timestamp: "2026-08-18T00:00:00Z", results: [], summary: { passRate: 1, avgLatencyMs: 100 } },
      TEST_PATH
    );
    appendReport(
      { timestamp: "2026-08-18T01:00:00Z", results: [], summary: { passRate: 0.5, avgLatencyMs: 200 } },
      TEST_PATH
    );
    const contents = JSON.parse(readFileSync(TEST_PATH, "utf-8"));
    expect(contents).toHaveLength(2);
    expect(contents[1].summary.passRate).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- evals/test/report.test.ts`
Expected: FAIL — `evals/report.js` does not exist.

- [ ] **Step 3: Write `evals/report.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface EvalResult {
  id: string;
  passed: boolean;
  latencyMs: number;
  toolSelectionAccuracy: boolean;
  groundingScore: boolean;
  permissionCompliance: boolean;
}

export interface EvalRun {
  timestamp: string;
  results: EvalResult[];
  summary: { passRate: number; avgLatencyMs: number };
}

const DEFAULT_PATH = new URL("./eval_report.json", import.meta.url).pathname;

export function appendReport(run: EvalRun, path: string = DEFAULT_PATH): void {
  const existing: EvalRun[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : [];
  existing.push(run);
  writeFileSync(path, JSON.stringify(existing, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- evals/test/report.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add evals/report.ts evals/test/report.test.ts
git commit -m "feat: add appendable eval report writer"
```

---

## Task 3: Runner

**Files:**
- Create: `evals/runner.ts`
- Test: `evals/test/runner.test.ts`

**Interfaces:**
- Consumes: `test_cases.json`, `toolSelectionAccuracy`/`groundingScore`/`permissionCompliance` (Task 1), `appendReport` (Task 2).
- Produces: `runEvals(baseUrl?: string): Promise<EvalRun>` — POSTs each test case to `${baseUrl}/api/chat` (default `http://localhost:3001`), scores the response, appends the run via `appendReport`, prints a `console.table` of per-scenario pass/fail + latency, and returns the `EvalRun`. Runnable standalone via `tsx evals/runner.ts`.

- [ ] **Step 1: Write the failing test (mocks `fetch` and `appendReport`)**

```typescript
// evals/test/runner.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as report from "../report.js";
import { runEvals } from "../runner.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runEvals", () => {
  it("scores each test case against the agent API and appends a report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        if (body.message.includes("COBOL")) {
          return {
            ok: true,
            json: async () => ({
              finalAnswer: "No consultants match that request.",
              trace: [{ type: "tool_call", detail: "get_consultant_availability({})" }],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            finalAnswer: "Found Alice Chen.",
            trace: [
              { type: "tool_call", detail: "get_consultant_availability({})" },
              { type: "tool_result", detail: '[{"full_name":"Alice Chen"}]' },
            ],
          }),
        };
      })
    );
    const appendSpy = vi.spyOn(report, "appendReport").mockImplementation(() => {});

    const run = await runEvals("http://localhost:3001");

    expect(run.results).toHaveLength(4);
    expect(appendSpy).toHaveBeenCalledOnce();
    const scenarioA = run.results.find((r) => r.id === "A");
    expect(scenarioA?.groundingScore).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- evals/test/runner.test.ts`
Expected: FAIL — `evals/runner.js` does not exist.

- [ ] **Step 3: Write `evals/runner.ts`**

```typescript
import { readFileSync } from "node:fs";
import { toolSelectionAccuracy, groundingScore, permissionCompliance } from "./metrics.js";
import { appendReport, type EvalResult, type EvalRun } from "./report.js";
import type { TraceEvent } from "../packages/agent/src/toolLoop.js";

interface TestCase {
  id: string;
  description: string;
  role: string;
  message: string;
  expectedToolSequence: string[];
  expectedGroundedTerms: string[];
  expectPermissionDenied: boolean;
}

const TEST_CASES: TestCase[] = JSON.parse(
  readFileSync(new URL("./test_cases.json", import.meta.url), "utf-8")
);

export async function runEvals(baseUrl = "http://localhost:3001"): Promise<EvalRun> {
  const results: EvalResult[] = [];

  for (const testCase of TEST_CASES) {
    const start = Date.now();
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testCase.message, role: testCase.role }),
    });
    const latencyMs = Date.now() - start;
    const body = (await response.json()) as { finalAnswer: string; trace: TraceEvent[] };

    const toolOk = toolSelectionAccuracy(body.trace, testCase.expectedToolSequence);
    const groundingOk = groundingScore(body.finalAnswer, body.trace, testCase.expectedGroundedTerms);
    const permissionOk = permissionCompliance(body.trace, testCase.expectPermissionDenied);

    results.push({
      id: testCase.id,
      passed: toolOk && groundingOk && permissionOk,
      latencyMs,
      toolSelectionAccuracy: toolOk,
      groundingScore: groundingOk,
      permissionCompliance: permissionOk,
    });
  }

  const run: EvalRun = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      passRate: results.filter((r) => r.passed).length / results.length,
      avgLatencyMs: results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length,
    },
  };

  appendReport(run);
  console.table(results);
  console.log(`Pass rate: ${(run.summary.passRate * 100).toFixed(0)}%, avg latency: ${run.summary.avgLatencyMs.toFixed(0)}ms`);

  return run;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runEvals();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- evals/test/runner.test.ts`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Run the real suite end-to-end**

With Postgres, Ollama, the MCP server, and `packages/agent`'s API all running (`npm run start --workspace=@skillsmatch/agent` or equivalent), run: `npx tsx evals/runner.ts`
Expected: a `console.table` prints with 4 rows (A-D), `evals/eval_report.json` is created/appended, and `curl http://localhost:3001/api/evals/latest` returns it.

- [ ] **Step 6: Commit**

```bash
git add evals/runner.ts evals/test/runner.test.ts
git commit -m "feat: add eval runner driving the live agent API"
```

---

## Self-Review Notes

- **Spec coverage:** all four scenarios (A-D) ✅, all four metrics ✅ (with the latency-granularity and grounding-check scope decisions stated explicitly up front rather than silently), `eval_report.json` output + CLI table ✅, history via append ✅ (Task 2), dashboard integration via the already-built `/api/evals/latest` route ✅ (no new work needed here — confirmed by Task 3 Step 5's manual check).
- **Type consistency:** `TraceEvent` imported from `packages/agent/src/toolLoop.ts` rather than redefined; `EvalRun`/`EvalResult` defined once in `report.ts` and reused by `runner.ts`.
- **No placeholders:** every step has runnable code.
