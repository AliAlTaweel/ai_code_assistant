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
