import { describe, expect, it } from "vitest";
import { aggregateBySlice, type ResultRow } from "../performance-slicing";

const rows: ResultRow[] = [
  { persona: "persona_landlord", channel: "email", assetType: "email", impressions: 1000, clicks: 50, leads: 10, jobs: 3, wonRevenueCents: 900000, spendCents: 300000 },
  { persona: "persona_landlord", channel: "email", assetType: "email", impressions: 0, clicks: 0, leads: 0, jobs: 1, wonRevenueCents: 300000, spendCents: 0 },
  { persona: "persona_landlord", channel: "sms", assetType: "sms", impressions: 0, clicks: 0, leads: 2, jobs: 0, wonRevenueCents: 0, spendCents: 50000 },
];

describe("aggregateBySlice", () => {
  it("groups by channel and sums counters with derived metrics", () => {
    const out = aggregateBySlice(rows, "channel");
    const email = out.find((s) => s.key === "email")!;
    expect(email.jobs).toBe(4);
    expect(email.leads).toBe(10);
    expect(email.wonRevenueCents).toBe(1200000);
    expect(email.spendCents).toBe(300000);
    expect(email.roas).toBeCloseTo(4); // 1,200,000 / 300,000
    expect(email.sampleSize).toBe(2);
  });

  it("handles divide-by-zero: null roas when no spend, 0 when spend>0 & no revenue", () => {
    const out = aggregateBySlice(rows, "channel");
    const sms = out.find((s) => s.key === "sms")!;
    expect(sms.roas).toBe(0);           // spend 50000, won 0 -> 0
    expect(sms.cpl).toBeCloseTo(25000); // 50000 / 2 leads (cents)
    expect(email_cpl(out)).toBeCloseTo(30000); // 300000 / 10
  });

  it("sorts slices by jobs desc", () => {
    const out = aggregateBySlice(rows, "channel");
    expect(out[0].key).toBe("email"); // 4 jobs > 0 jobs
  });

  it("groups by persona", () => {
    const out = aggregateBySlice(rows, "persona");
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("persona_landlord");
    expect(out[0].jobs).toBe(4);
  });
});

function email_cpl(out: ReturnType<typeof aggregateBySlice>) {
  return out.find((s) => s.key === "email")!.cpl!;
}
