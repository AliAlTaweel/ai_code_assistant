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
