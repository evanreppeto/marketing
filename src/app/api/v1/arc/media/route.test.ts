import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/api-token", () => ({
  checkAgentBearer: vi.fn(async () => ({ ok: false, reason: "unauthorized", status: 401 })),
}));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { GET } from "./route";

describe("GET /api/v1/arc/media", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s without a valid bearer token", async () => {
    const res = await GET(new Request("http://x/api/v1/arc/media"));
    expect(res.status).toBe(401);
  });

  it("503s when the token is not configured", async () => {
    (checkAgentBearer as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, reason: "not_configured", status: 503,
    });
    const res = await GET(new Request("http://x/api/v1/arc/media"));
    expect(res.status).toBe(503);
  });
});
