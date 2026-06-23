import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth/operator", () => ({ requireOperator: vi.fn() }));
vi.mock("@/lib/auth/auth-mode", () => ({ getAuthMode: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({ getCurrentWorkspaceContext: vi.fn() }));
vi.mock("@/lib/activation/read-model", () => ({ getActivationState: vi.fn() }));
vi.mock("./start-setup-form", () => ({ StartSetupForm: () => null }));

import { getActivationState } from "@/lib/activation/read-model";
import { getAuthMode } from "@/lib/auth/auth-mode";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import StartPage from "./page";

const authModeMock = vi.mocked(getAuthMode);
const workspaceMock = vi.mocked(getCurrentWorkspaceContext);
const activationMock = vi.mocked(getActivationState);

beforeEach(() => {
  vi.clearAllMocks();
  authModeMock.mockReturnValue("supabase");
  workspaceMock.mockResolvedValue({ orgId: "org-1", orgName: "Acme Co", workspaceId: "ws-1" } as never);
  activationMock.mockResolvedValue({
    signals: { brandCaptured: false, dismissed: false, hasMedia: false, hasCampaign: false, hasTeammate: false },
    checklist: { steps: [], coreDone: false, showChecklist: true },
  });
});

describe("StartPage guards", () => {
  it("redirects home when auth mode is not supabase", async () => {
    authModeMock.mockReturnValue("open");
    await expect(StartPage()).rejects.toThrow("REDIRECT:/");
  });

  it("redirects home when brand capture is already complete", async () => {
    activationMock.mockResolvedValue({
      signals: { brandCaptured: true, dismissed: false, hasMedia: false, hasCampaign: false, hasTeammate: false },
      checklist: { steps: [], coreDone: true, showChecklist: false },
    });
    await expect(StartPage()).rejects.toThrow("REDIRECT:/");
  });

  it("renders the setup flow for a fresh owner", async () => {
    const result = await StartPage();
    expect(result).toBeTruthy();
  });
});
