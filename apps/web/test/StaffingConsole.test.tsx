import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RoleProvider } from "../src/context/RoleContext.js";
import { ModelProvider } from "../src/context/ModelContext.js";
import { StaffingConsole } from "../src/views/StaffingConsole.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

function renderConsole() {
  return render(
    <RoleProvider>
      <ModelProvider>
        <StaffingConsole />
      </ModelProvider>
    </RoleProvider>
  );
}

describe("StaffingConsole", () => {
  it("sends a message and renders the agent's final answer", async () => {
    vi.spyOn(client, "listUsers").mockResolvedValue([{ id: "u1", name: "Ava", role: "ADMIN" }]);
    vi.spyOn(client, "listModels").mockResolvedValue([
      { name: "llama3.1:8b", parameterSize: "8.0B", supportsTools: true },
    ]);
    vi.spyOn(client, "postChat").mockResolvedValue({ finalAnswer: "Found Alice Chen.", trace: [] });

    renderConsole();

    await waitFor(() => screen.getByPlaceholderText(/ask/i));
    fireEvent.change(screen.getByPlaceholderText(/ask/i), { target: { value: "find a go engineer" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => screen.getByText("Found Alice Chen."));
    expect(client.postChat).toHaveBeenCalledWith("find a go engineer", "ADMIN", "llama3.1:8b");
  });

  it("shows a visible error message when postChat rejects", async () => {
    vi.spyOn(client, "listUsers").mockResolvedValue([{ id: "u1", name: "Ava", role: "ADMIN" }]);
    vi.spyOn(client, "listModels").mockResolvedValue([]);
    vi.spyOn(client, "postChat").mockRejectedValue(new Error("postChat failed: 500"));

    renderConsole();

    await waitFor(() => screen.getByPlaceholderText(/ask/i));
    fireEvent.change(screen.getByPlaceholderText(/ask/i), { target: { value: "find a go engineer" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => screen.getByText(/failed to get a response/i));
  });
});
