import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RoleProvider } from "../src/context/RoleContext.js";
import { RoleSwitcher } from "../src/components/RoleSwitcher.js";
import * as client from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("RoleSwitcher", () => {
  it("lists seeded users and lets you pick one", async () => {
    vi.spyOn(client, "listUsers").mockResolvedValue([
      { id: "u1", name: "Ava Admin", role: "ADMIN" },
      { id: "u2", name: "Ray Resourcing", role: "RESOURCING_MANAGER" },
    ]);

    render(
      <RoleProvider>
        <RoleSwitcher />
      </RoleProvider>
    );

    await waitFor(() => screen.getByDisplayValue("Ava Admin (ADMIN)"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "u2" } });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("u2");
  });
});
