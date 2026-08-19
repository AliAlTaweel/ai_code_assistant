import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("switches between views via nav buttons", async () => {
    vi.spyOn(client, "listUsers").mockResolvedValue([{ id: "u1", name: "Ava", role: "ADMIN" }]);
    vi.spyOn(client, "listModels").mockResolvedValue([
      { name: "llama3.1:8b", parameterSize: "8.0B", supportsTools: true },
    ]);
    vi.spyOn(client, "listPendingActions").mockResolvedValue([]);
    vi.spyOn(client, "getLatestEvals").mockResolvedValue(null);
    vi.spyOn(client, "subscribeTrace").mockReturnValue(() => {});

    render(<App />);

    await waitFor(() => screen.getByText("Console"));
    expect(screen.getByPlaceholderText(/ask/i)).toBeInTheDocument();
    expect(screen.getByText("Console")).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByText("Approvals"));
    await waitFor(() => screen.getByText("Pending Approvals"));
    expect(screen.getByText("Approvals")).toHaveAttribute("aria-current", "page");
  });

  it("keeps trace events received while on another view when switching to Trace", async () => {
    vi.spyOn(client, "listUsers").mockResolvedValue([{ id: "u1", name: "Ava", role: "ADMIN" }]);
    vi.spyOn(client, "listModels").mockResolvedValue([
      { name: "llama3.1:8b", parameterSize: "8.0B", supportsTools: true },
    ]);
    vi.spyOn(client, "listPendingActions").mockResolvedValue([]);
    vi.spyOn(client, "getLatestEvals").mockResolvedValue(null);

    let deliverEvent: ((e: client.TraceEvent) => void) | undefined;
    vi.spyOn(client, "subscribeTrace").mockImplementation((onEvent) => {
      deliverEvent = onEvent;
      return () => {};
    });

    render(<App />);

    await waitFor(() => screen.getByText("Console"));
    // Simulate a trace event arriving while the user is still on the Console view — the
    // subscription must be mounted above the view switch to receive this at all.
    deliverEvent?.({ type: "tool_call", detail: "get_consultant_availability({})" });

    fireEvent.click(screen.getByText("Trace"));
    await waitFor(() => screen.getByText(/get_consultant_availability/));
  });
});
