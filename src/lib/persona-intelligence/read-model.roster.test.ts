import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPersonaIntelligenceData } from "./read-model";

/**
 * read_persona_intelligence is the tool Arc is told to use to pick "which persona
 * to target". It read persona_snapshots (per-record memory, empty on prod) and
 * never the persona roster, so it returned "0 tracked personas" while 10 personas
 * were defined — and Arc wrote "persona intelligence is running blind" onto an
 * operator-facing opportunity card.
 *
 * The roster (who the workspace sells to) and the snapshots (which records have a
 * current persona snapshot) are different facts. This pins that the response
 * carries the roster, and that a 0 in the snapshot count doesn't masquerade as
 * "no personas defined".
 */

// The roster is fetched via getOrgPersonaOptions, which uses the admin client
// directly — a per-table query double keyed by table name serves both paths.
const rows: Record<string, unknown[]> = {
  persona_snapshots: [],
  persona_knowledge_entries: [],
  guardrail_rules: [],
  personas: [
    { slug: "homeowner-emergency", name: "Homeowner emergency" },
    { slug: "plumbing-partner", name: "Plumbing partner" },
    { slug: "insurance-agent", name: "Insurance agent" },
  ],
};

function queryDouble() {
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null });
      return q;
    },
  };
  return client as never;
}

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdminClient: () => queryDouble(),
}));

const env = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});
afterEach(() => {
  process.env = { ...env };
});

describe("getPersonaIntelligenceData carries the roster", () => {
  it("returns the workspace's defined personas even when snapshots are empty", async () => {
    const data = await getPersonaIntelligenceData("org-1", queryDouble());
    expect("status" in data && data.status).toBe("live");
    if (!("roster" in data)) throw new Error("expected a live response with a roster");

    expect(data.roster.map((p) => p.key)).toEqual(["homeowner-emergency", "plumbing-partner", "insurance-agent"]);
    // The snapshots are empty — the bug was reporting that as the whole story.
    expect(data.personas).toHaveLength(0);
  });

  it("counts defined personas separately from snapshot-tracked ones", async () => {
    const data = await getPersonaIntelligenceData("org-1", queryDouble());
    if (!("stats" in data)) throw new Error("expected stats");

    const stat = (label: string) => data.stats.find((s) => s.label === label);
    // Defined personas = the roster (3). This is the number Arc needs to target.
    expect(stat("Defined personas")?.value).toBe(3);
    // Tracked = records with a current snapshot (0). A real, smaller claim.
    expect(stat("Tracked personas")?.value).toBe(0);
  });

  it("no longer labels the tracked count as if it were the persona inventory", async () => {
    // "Supabase persona memory" read as "the personas we have"; it meant snapshots.
    const data = await getPersonaIntelligenceData("org-1", queryDouble());
    if (!("stats" in data)) throw new Error("expected stats");
    expect(data.stats.find((s) => s.label === "Tracked personas")?.delta).not.toMatch(/persona memory/i);
  });
});
