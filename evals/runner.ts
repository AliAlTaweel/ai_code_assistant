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
