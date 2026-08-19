import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toolSelectionAccuracy, groundingScore, permissionCompliance, noForbiddenTerms } from "./metrics.js";
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
  /** Optional: terms (e.g. names of consultants who should never be mentioned) that must NOT
   *  appear anywhere in the agent's final answer. Used to catch hallucination in scenarios where
   *  `expectedGroundedTerms` is empty (e.g. a "zero matching consultants" case) and so
   *  `groundingScore` alone can't detect a fabricated answer. */
  forbiddenTerms?: string[];
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

    if (!response.ok) {
      console.warn(
        `[evals] scenario ${testCase.id} failed: /api/chat responded with HTTP ${response.status}`
      );
      results.push({
        id: testCase.id,
        passed: false,
        latencyMs,
        toolSelectionAccuracy: false,
        groundingScore: false,
        permissionCompliance: false,
      });
      continue;
    }

    const body = (await response.json()) as { finalAnswer: string; trace: TraceEvent[] };

    const toolOk = toolSelectionAccuracy(body.trace, testCase.expectedToolSequence);
    const groundingOk = groundingScore(body.finalAnswer, body.trace, testCase.expectedGroundedTerms);
    const permissionOk = permissionCompliance(body.trace, testCase.expectPermissionDenied);
    const forbiddenOk = noForbiddenTerms(body.finalAnswer, testCase.forbiddenTerms);

    results.push({
      id: testCase.id,
      passed: toolOk && groundingOk && permissionOk && forbiddenOk,
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

// Robust against percent-encoding/path differences that can make the naive `file://${argv[1]}`
// string comparison miss (e.g. paths containing spaces, or on Windows) — resolving both sides to
// real filesystem paths before comparing preserves the original guard's intent ("only auto-run
// when invoked directly as `tsx evals/runner.ts`", not when merely imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEvals();
}
