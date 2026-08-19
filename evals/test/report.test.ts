import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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

  it("recovers from an existing file containing invalid JSON, producing a fresh single-run array", () => {
    writeFileSync(TEST_PATH, "{ this is not valid json ");
    appendReport(
      { timestamp: "2026-08-18T00:00:00Z", results: [], summary: { passRate: 1, avgLatencyMs: 100 } },
      TEST_PATH
    );
    const contents = JSON.parse(readFileSync(TEST_PATH, "utf-8"));
    expect(contents).toHaveLength(1);
  });

  it("recovers from an existing file containing valid JSON that isn't an array", () => {
    writeFileSync(TEST_PATH, JSON.stringify({}));
    appendReport(
      { timestamp: "2026-08-18T00:00:00Z", results: [], summary: { passRate: 1, avgLatencyMs: 100 } },
      TEST_PATH
    );
    const contents = JSON.parse(readFileSync(TEST_PATH, "utf-8"));
    expect(contents).toHaveLength(1);
  });
});
