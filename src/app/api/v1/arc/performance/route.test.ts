import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/performance/slice-read-model", () => ({
  getPerformanceBySlice: vi.fn(async (f: { dimension?: string }) => ({
    dimension: f.dimension ?? "persona",
    slices: [{ key: "persona_landlord", jobs: 4, roas: 4, leads: 10, sampleSize: 2 }],
  })),
}));
import { getPerformanceBySlice } from "@/lib/performance/slice-read-model";

import { GET } from "./route";

function req(authorization: string | undefined, query = "") {
  return new Request(`http://localhost/api/v1/arc/performance${query}`, {
    headers: { ...(authorization ? { authorization } : {}) },
  });
}

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
}

beforeEach(() => {
  vi.mocked(getPerformanceBySlice).mockClear();
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /api/v1/arc/performance", () => {
  it("401 without a valid token, no read", async () => {
    configure();
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(getPerformanceBySlice).not.toHaveBeenCalled();
  });

  it("200 with default dimension when no param", async () => {
    configure();
    const res = await GET(req("Bearer secret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      dimension: "persona",
      slices: [{ key: "persona_landlord", jobs: 4 }],
    });
  });

  it("honors dimension + persona filter params", async () => {
    configure();
    const res = await GET(req("Bearer secret", "?dimension=channel&persona=persona_landlord"));
    expect(res.status).toBe(200);
    expect(getPerformanceBySlice).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: "channel", persona: "persona_landlord" }),
    );
    const json = await res.json();
    expect(json.dimension).toBe("channel");
  });
});
