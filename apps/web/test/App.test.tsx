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
