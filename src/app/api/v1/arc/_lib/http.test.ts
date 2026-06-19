import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/api-token", () => ({ checkAgentBearer: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseAdminConfigured: vi.fn(() => true),
}));

import { checkAgentBearer } from "@/lib/auth/api-token";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

import { arcGuard } from "./http";

const checkAgentBearerMock = vi.mocked(checkAgentBearer);
const getCurrentWorkspaceContextMock = vi.mocked(getCurrentWorkspaceContext);
const getSupabaseAdminClientMock = vi.mocked(getSupabaseAdminClient);

const request = new Request("http://localhost/api/v1/arc/brain/query", {
  headers: { authorization: "Bearer token" },
});

describe("arcGuard", () => {
  beforeEach(() => {
    checkAgentBearerMock.mockReset();
    getCurrentWorkspaceContextMock.mockReset();
    getSupabaseAdminClientMock.mockReset();
    getCurrentWorkspaceContextMock.mockResolvedValue({
      orgId: "org-fallback",
      orgSlug: "fallback",
      orgName: "Fallback Org",
      workspaceId: "workspace-fallback",
      workspaceKey: "default",
      workspaceSlug: "fallback",
      workspaceName: "Fallback Workspace",
      role: null,
      userId: null,
      source: "default-org",
    });
  });

  it("returns the org/workspace scope from a database-issued agent token", async () => {
    checkAgentBearerMock.mockResolvedValue({
      ok: true,
      tokenSource: "database",
      orgId: "org-token",
      workspaceId: "00000000-0000-4000-8000-000000000001",
    });

    const result = await arcGuard(request);

    expect(result).toEqual({
      ok: true,
      scope: {
        orgId: "org-token",
        workspaceId: "00000000-0000-4000-8000-000000000001",
        source: "agent-token",
      },
    });
    expect(getCurrentWorkspaceContextMock).not.toHaveBeenCalled();
  });

  it("resolves a database token workspace key to the workspace uuid", async () => {
    checkAgentBearerMock.mockResolvedValue({
      ok: true,
      tokenSource: "database",
      orgId: "org-token",
      workspaceId: "default",
    });
    getSupabaseAdminClientMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "workspace-uuid" }, error: null }),
            }),
          }),
        }),
      }),
    } as never);

    const result = await arcGuard(request);

    expect(result).toEqual({
      ok: true,
      scope: {
        orgId: "org-token",
        workspaceId: "workspace-uuid",
        source: "agent-token",
      },
    });
  });

  it("falls back to the current workspace context for the legacy env token", async () => {
    checkAgentBearerMock.mockResolvedValue({ ok: true, tokenSource: "env" });

    const result = await arcGuard(request);

    expect(result).toEqual({
      ok: true,
      scope: {
        orgId: "org-fallback",
        workspaceId: "workspace-fallback",
        source: "legacy-env-token",
      },
    });
  });
});
