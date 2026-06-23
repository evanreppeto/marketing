import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/operator", () => ({ requireOperator: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({ getCurrentWorkspaceContext: vi.fn() }));
vi.mock("@/lib/brand-kit/website-fetch", () => ({ fetchBrandSignalFromUrl: vi.fn() }));
vi.mock("@/lib/brand-kit/persistence", () => ({
  getBusinessProfile: vi.fn(),
  upsertBusinessProfile: vi.fn(),
}));
vi.mock("@/lib/activation/persistence", () => ({ markBrandCaptured: vi.fn(), dismissActivation: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ isSupabaseAdminConfigured: vi.fn(() => true) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { markBrandCaptured } from "@/lib/activation/persistence";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { fetchBrandSignalFromUrl } from "@/lib/brand-kit/website-fetch";
import { redirect } from "next/navigation";

import { analyzeWebsiteAction, confirmBrandAction } from "./actions";

const requireOperatorMock = vi.mocked(requireOperator);
const workspaceMock = vi.mocked(getCurrentWorkspaceContext);
const fetchSignalMock = vi.mocked(fetchBrandSignalFromUrl);
const getProfileMock = vi.mocked(getBusinessProfile);
const upsertProfileMock = vi.mocked(upsertBusinessProfile);
const markBrandMock = vi.mocked(markBrandCaptured);
const redirectMock = vi.mocked(redirect);

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOperatorMock.mockResolvedValue(undefined);
  workspaceMock.mockResolvedValue({ orgId: "org-1", orgName: "Acme Co", workspaceId: "ws-1" } as never);
  getProfileMock.mockResolvedValue(null);
  upsertProfileMock.mockImplementation(async (_orgId, profile) => profile);
});

describe("analyzeWebsiteAction", () => {
  it("returns an error when the website is empty", async () => {
    const state = await analyzeWebsiteAction(null, form({ websiteUrl: "  " }));
    expect(requireOperatorMock).toHaveBeenCalled();
    expect(state).toEqual({ phase: "error", message: expect.any(String) });
    expect(fetchSignalMock).not.toHaveBeenCalled();
  });

  it("surfaces a fetch failure as an error state", async () => {
    fetchSignalMock.mockResolvedValue({ ok: false, status: "failed", message: "Site returned 500." });
    const state = await analyzeWebsiteAction(null, form({ websiteUrl: "https://acme.com" }));
    expect(state).toEqual({ phase: "error", message: "Site returned 500." });
  });

  it("returns a preview with the extracted signal on success", async () => {
    fetchSignalMock.mockResolvedValue({
      ok: true,
      signal: { title: "Acme", description: "We fix leaks", faviconUrl: "https://acme.com/fav.ico", text: "..." },
    });
    const state = await analyzeWebsiteAction(null, form({ websiteUrl: "https://acme.com" }));
    expect(state).toMatchObject({
      phase: "preview",
      websiteUrl: "https://acme.com",
      signal: { title: "Acme", description: "We fix leaks" },
    });
  });
});

describe("confirmBrandAction", () => {
  it("persists the brand, marks capture, and redirects home", async () => {
    await confirmBrandAction(
      form({
        websiteUrl: "https://acme.com",
        displayName: "Acme Co",
        description: "We fix leaks",
        faviconUrl: "https://acme.com/fav.ico",
      }),
    );

    expect(requireOperatorMock).toHaveBeenCalled();
    expect(upsertProfileMock).toHaveBeenCalledTimes(1);
    const [orgId, profile] = upsertProfileMock.mock.calls[0];
    expect(orgId).toBe("org-1");
    expect(profile).toMatchObject({
      displayName: "Acme Co",
      websiteUrl: "https://acme.com",
      description: "We fix leaks",
      faviconUrl: "https://acme.com/fav.ico",
      status: "active",
    });
    expect(markBrandMock).toHaveBeenCalledWith("org-1");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("falls back to the org name when no display name is provided", async () => {
    await confirmBrandAction(form({ websiteUrl: "https://acme.com" }));
    const [, profile] = upsertProfileMock.mock.calls[0];
    expect(profile.displayName).toBe("Acme Co");
  });
});
