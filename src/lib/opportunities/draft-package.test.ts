import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/campaigns/create", () => ({ promoteAssetToCampaign: vi.fn() }));
vi.mock("./persistence", () => ({ markOpportunityDrafted: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdminClient: vi.fn(), isSupabaseAdminConfigured: () => true }));

import { promoteAssetToCampaign } from "@/lib/campaigns/create";

import { executeOpportunityDraftTask } from "./draft-package";
import { markOpportunityDrafted } from "./persistence";

const promoteMock = vi.mocked(promoteAssetToCampaign);
const draftedMock = vi.mocked(markOpportunityDrafted);

const TASK = {
  id: "task-1",
  source_id: "opp-1",
  campaign_id: "camp-1",
  objective: "Draft a campaign package",
  metadata: {
    campaign_id: "camp-1",
    brief: {
      title: "Re-engage cold lead",
      angle: "Book a walkthrough",
      personaLabel: "Property manager",
      focusLabel: "Water backup",
      urgency: "high",
      subjectLabel: "Lead",
    },
  },
  org_id: "org-1",
  workspace_id: "ws-1",
};

// Minimal chainable fake of the agent_tasks table access the executor uses:
// the claim update (…select().maybeSingle()) returns the task row once; the
// completion update is awaited directly. Records every update payload.
function makeClient(taskRow: unknown) {
  const updates: Record<string, unknown>[] = [];
  let claimReturned = false;
  function table() {
    let payload: Record<string, unknown> | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Record<string, unknown>) => {
        payload = p;
        return b;
      },
      eq: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => {
        if (payload) {
          updates.push(payload);
          const data = claimReturned ? null : taskRow;
          claimReturned = true;
          return { data };
        }
        return { data: null };
      },
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
        if (payload) updates.push(payload);
        return Promise.resolve({ error: null }).then(onF, onR);
      },
    };
    return b;
  }
  return { client: { from: () => table() } as never, updates };
}

beforeEach(() => {
  promoteMock.mockReset();
  draftedMock.mockReset();
  let n = 0;
  promoteMock.mockImplementation(async () => ({ assetId: `asset-${++n}` }));
  draftedMock.mockResolvedValue({ ok: true });
});

describe("executeOpportunityDraftTask", () => {
  it("claims the task, drafts a 4-asset package, marks drafted, and completes the task", async () => {
    const { client, updates } = makeClient(TASK);
    const res = await executeOpportunityDraftTask({ agentTaskId: "task-1", orgId: "org-1", client });

    expect(res).toMatchObject({ ok: true, status: "drafted", taskId: "task-1", campaignId: "camp-1" });
    if (res.ok && res.status === "drafted") expect(res.assetIds).toHaveLength(4);

    // One approval-gated asset per channel, all on the linked campaign.
    expect(promoteMock).toHaveBeenCalledTimes(4);
    expect(promoteMock.mock.calls.map((c) => c[0].assetType)).toEqual(["email", "sms", "social_ad", "landing_page"]);
    expect(promoteMock.mock.calls.every((c) => c[0].campaignId === "camp-1")).toBe(true);

    // Opportunity linked + advanced; task claimed then completed.
    expect(draftedMock).toHaveBeenCalledWith("opp-1", "camp-1", client, { orgId: "org-1" });
    expect(updates[0]).toMatchObject({ status: "running" });
    expect(updates.some((u) => u.status === "completed")).toBe(true);
  });

  it("returns idle when no queued task matches (nothing drafted)", async () => {
    const { client } = makeClient(null);
    const res = await executeOpportunityDraftTask({ agentTaskId: "missing", orgId: "org-1", client });
    expect(res).toEqual({ ok: true, status: "idle" });
    expect(promoteMock).not.toHaveBeenCalled();
  });
});
