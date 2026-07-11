import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructEvent = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  isStripeConfigured: vi.fn(() => true),
  getStripeClient: () => ({ webhooks: { constructEvent } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: vi.fn(() => true),
  getSupabaseAdminClient: vi.fn(() => ({})),
}));
const { applyStripeSubscriptionUpdate } = vi.hoisted(() => ({
  applyStripeSubscriptionUpdate: vi.fn<(input: { orgId: string | null; update: unknown }, client?: unknown) => Promise<{ ok: boolean }>>(
    async () => ({ ok: true }),
  ),
}));
vi.mock("@/lib/billing/subscription-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/subscription-sync")>();
  return { ...actual, applyStripeSubscriptionUpdate };
});

import { isStripeConfigured } from "@/lib/billing/stripe";
import { POST } from "./route";

function req(body = "{}", sig = "sig") {
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": sig }, body });
}

const ORIG = process.env.STRIPE_WEBHOOK_SECRET;
beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  constructEvent.mockReset();
  applyStripeSubscriptionUpdate.mockReset();
  applyStripeSubscriptionUpdate.mockResolvedValue({ ok: true });
  vi.mocked(isStripeConfigured).mockReturnValue(true);
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = ORIG;
});

describe("POST /api/webhooks/stripe", () => {
  it("503 when Stripe isn't configured", async () => {
    vi.mocked(isStripeConfigured).mockReturnValue(false);
    expect((await POST(req())).status).toBe(503);
  });

  it("400 on a bad/missing signature and never syncs", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(applyStripeSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it("syncs a subscription event (with org metadata) and returns 200", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          customer: "cus_1",
          metadata: { org_id: "org-9" },
          items: { data: [{ price: { id: "price_pro" } }] },
          current_period_end: 1_893_456_000,
        },
      },
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(applyStripeSubscriptionUpdate).toHaveBeenCalledTimes(1);
    expect(applyStripeSubscriptionUpdate.mock.calls[0][0]).toMatchObject({ orgId: "org-9" });
  });

  it("ignores unrelated event types (200, no sync)", async () => {
    constructEvent.mockReturnValue({ type: "payment_intent.succeeded", data: { object: {} } });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(applyStripeSubscriptionUpdate).not.toHaveBeenCalled();
  });
});
