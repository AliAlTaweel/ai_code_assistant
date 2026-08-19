import { describe, it, expect, vi, afterEach } from "vitest";
import { postChat, listUsers, getLatestEvals } from "../src/api/client.js";

afterEach(() => vi.restoreAllMocks());

describe("postChat", () => {
  it("POSTs message and role to /api/chat and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ finalAnswer: "hi", trace: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postChat("find a go engineer", "CONSULTANT");

    expect(result).toEqual({ finalAnswer: "hi", trace: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/chat"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("postChat error handling", () => {
  it("throws when the response is not ok instead of resolving with an error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "boom",
      })
    );

    await expect(postChat("find a go engineer", "CONSULTANT")).rejects.toThrow(/500/);
  });
});

describe("listUsers", () => {
  it("GETs /api/users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "u1", name: "Ava", role: "ADMIN" }] })
    );
    const users = await listUsers();
    expect(users).toEqual([{ id: "u1", name: "Ava", role: "ADMIN" }]);
  });
});

describe("getLatestEvals", () => {
  it("returns null on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await getLatestEvals()).toBeNull();
  });
});
