import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HitlQueue } from "../src/views/HitlQueue.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("HitlQueue", () => {
  it("lists a pending action and approves it on click", async () => {
    vi.spyOn(client, "listPendingActions").mockResolvedValue([
      { id: "p1", type: "draft_assignment", payload: { project_id: "pr1", consultant_id: "c1", hours: 10 }, status: "WAITING_FOR_APPROVAL" },
    ]);
    const approveSpy = vi.spyOn(client, "approveAction").mockResolvedValue();

    render(<HitlQueue />);

    await waitFor(() => screen.getByText(/10/));
    fireEvent.click(screen.getByText("Approve"));

    expect(approveSpy).toHaveBeenCalledWith("p1");
  });
});
