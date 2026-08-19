import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

const DEFAULT_PATH = fileURLToPath(new URL("./eval_report.json", import.meta.url));

function readExistingRuns(path: string): EvalRun[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(parsed)) {
      console.warn(`[evals] ${path} did not contain a JSON array; starting a fresh report.`);
      return [];
    }
    return parsed;
  } catch (err) {
    console.warn(`[evals] failed to parse existing report at ${path}; starting a fresh report.`, err);
    return [];
  }
}

export function appendReport(run: EvalRun, path: string = DEFAULT_PATH): void {
  const existing = readExistingRuns(path);
  existing.push(run);
  // Write to a temp file and rename into place so a crash mid-write can't leave a truncated/
  // corrupted report file behind.
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(existing, null, 2));
  renameSync(tmpPath, path);
}
