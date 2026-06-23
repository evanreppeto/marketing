import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

vi.mock("@/lib/auth/api-token", () => ({
  checkAgentBearer: vi.fn(async () => ({
    ok: true, tokenSource: "database", orgId: "org-2",
    workspaceId: "20000000-0000-4000-8000-000000000002",
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(() => true),
}));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { GET } from "./route";

const bearerMock = vi.mocked(checkAgentBearer);
const getSupabaseMock = vi.mocked(getSupabaseAdminClient);
const configuredMock = vi.mocked(isSupabaseAdminConfigured);

const env = {
  ARC_AGENT_API_TOKEN: process.env.ARC_AGENT_API_TOKEN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
function configure() {
  process.env.ARC_AGENT_API_TOKEN = "secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
}
function request(token = "secret") {
  return new Request("http://x/api/v1/arc/folders", { headers: { authorization: `Bearer ${token}` } });
}

describe("GET /api/v1/arc/folders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configuredMock.mockReturnValue(true);
    bearerMock.mockResolvedValue({
      ok: true, tokenSource: "database", orgId: "org-2",
      workspaceId: "20000000-0000-4000-8000-000000000002",
    });
  });

  it("401s without a valid bearer token", async () => {
    configure();
    bearerMock.mockResolvedValueOnce({ ok: false, reason: "unauthorized", status: 401 });
    const res = await GET(request("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns the token org's folders", async () => {
    configure();
    const supabase = createSupabaseQueryMock({
      media_folders: { data: [{ id: "f1", name: "Logos & Brand", description: "Brand marks", parent_id: null }], error: null },
      media_assets: { data: [{ folder_id: "f1" }], error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(supabase.calls).toContainEqual(["from", "media_folders"]);
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-2"]);
    const body = await res.json();
    expect(body.folders[0]).toMatchObject({ id: "f1", name: "Logos & Brand", availableAssetCount: 1 });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
});
