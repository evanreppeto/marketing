import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(() => ({})),
  isSupabaseAdminConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/brand-kit/persistence", () => ({
  getBusinessProfile: vi.fn(),
  listPersonaDefinitions: vi.fn(),
}));
vi.mock("@/lib/brand-kit/read-model", () => ({ getBusinessContext: vi.fn() }));
vi.mock("@/lib/connectors/read-model", () => ({ listWorkspaceConnectors: vi.fn() }));
vi.mock("@/lib/approvals/read-model", () => ({ countActiveApprovals: vi.fn() }));
vi.mock("@/lib/media-library/arc-handoff", () => ({ listAvailableArcMedia: vi.fn() }));

import { getBusinessProfile, listPersonaDefinitions } from "@/lib/brand-kit/persistence";
import { listWorkspaceConnectors } from "@/lib/connectors/read-model";
import { countActiveApprovals } from "@/lib/approvals/read-model";
import { listAvailableArcMedia } from "@/lib/media-library/arc-handoff";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { getWorkspaceSummary } from "./summary";

const profileMock = vi.mocked(getBusinessProfile);
const personasMock = vi.mocked(listPersonaDefinitions);
const connectorsMock = vi.mocked(listWorkspaceConnectors);
const approvalsMock = vi.mocked(countActiveApprovals);
const mediaMock = vi.mocked(listAvailableArcMedia);

beforeEach(() => {
  profileMock.mockResolvedValue({ status: "draft" } as never);
  personasMock.mockResolvedValue([{ key: "a" }, { key: "b" }] as never);
  connectorsMock.mockResolvedValue([
    { credentialPresent: true },
    { credentialPresent: false },
    { credentialPresent: true },
  ] as never);
  approvalsMock.mockResolvedValue(4);
  mediaMock.mockResolvedValue([{ id: "m1" }, { id: "m2" }] as never);
});
afterEach(() => vi.clearAllMocks());

describe("getWorkspaceSummary", () => {
  it("aggregates a compact snapshot", async () => {
    const s = await getWorkspaceSummary("org_1", "ws_1");
    expect(s).toEqual({
      brandKit: "draft",
      connectors: { connected: 2, total: 3 },
      mediaAvailable: 2,
      pendingApprovals: 4,
      personas: 2,
    });
  });

  it("reports brandKit none when there is no profile", async () => {
    profileMock.mockResolvedValue(null);
    const s = await getWorkspaceSummary("org_1", "ws_1");
    expect(s.brandKit).toBe("none");
  });

  it("falls back per-field when a source throws (never breaks the turn)", async () => {
    connectorsMock.mockRejectedValue(new Error("connectors down"));
    approvalsMock.mockRejectedValue(new Error("approvals down"));
    const s = await getWorkspaceSummary("org_1", "ws_1");
    expect(s.connectors).toEqual({ connected: 0, total: 0 });
    expect(s.pendingApprovals).toBe(0);
    expect(s.brandKit).toBe("draft"); // unaffected source still resolves
  });

  it("returns a neutral snapshot without reading when Supabase is unconfigured", async () => {
    vi.mocked(isSupabaseAdminConfigured).mockReturnValueOnce(false);
    const s = await getWorkspaceSummary("org_1", "ws_1");
    expect(s).toEqual({
      brandKit: "none",
      connectors: { connected: 0, total: 0 },
      mediaAvailable: 0,
      pendingApprovals: 0,
      personas: 0,
    });
    expect(getBusinessProfile).not.toHaveBeenCalled();
  });
});
