# Arc App Awareness + Settings Reach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Arc a canonical map of every app surface plus live workspace-state awareness and a Settings read tool, so it knows where everything lives and can ground answers in real workspace config.

**Architecture:** Four units. (1) A runner-local app-map registry + `get_app_map` tool for wayfinding, guarded by a drift test against the real tool registry. (2) An app-side `src/lib/workspace/summary.ts` read-model + bearer-gated `GET /api/v1/arc/workspace` route (compact + `detail=full`) that aggregates existing read-models. (3) The runner fetches the compact snapshot once per turn inside `runArcQuery` and injects a `WORKSPACE STATE` block via `buildSystemPrompt`. (4) A `get_workspace_settings` tool over the `detail=full` route, plus prompt/skills wiring. Everything is read-only; no new writes or outbound.

**Tech Stack:** TypeScript, `@anthropic-ai/claude-agent-sdk` `tool()` defs (runner), Next.js 16 route handlers + Supabase read-models (app), Vitest + `vi.mock`.

**Spec:** `docs/superpowers/specs/2026-06-23-arc-app-awareness-design.md`

**Conventions used below:**
- Runner test (single file): `pnpm --filter @bsr/arc-runner test <path-relative-to-apps/arc-runner>`
- App test (single file): `pnpm test <path-relative-to-repo-root>`
- Typecheck: `pnpm typecheck` (app) and `pnpm --filter @bsr/arc-runner typecheck` (runner)
- All paths are repo-root-relative.

---

## Task 1: App-map registry + `get_app_map` tool

**Files:**
- Create: `apps/arc-runner/src/app-map.ts`
- Create: `apps/arc-runner/src/tools/app-map.ts`
- Create: `apps/arc-runner/src/tools/app-map.test.ts`
- Create: `apps/arc-runner/src/app-map.test.ts`
- Modify: `apps/arc-runner/src/tools/index.ts`

- [ ] **Step 1: Create the registry**

Create `apps/arc-runner/src/app-map.ts`:

```ts
/**
 * Arc's map of the app: every operator-facing surface, what it's for, where it
 * lives (deep-link route), and which tools read/write it. Single source of truth
 * for wayfinding ("where do I do X / take me to Y") and the coverage backbone the
 * later slices plug into. Routes mirror the app's real nav; the app-map.test.ts
 * drift test keeps the tool names honest against the real runner tool registry.
 */
export type ArcSurfaceApproval = "read_only" | "direct_write" | "proposes_to_approval";

export type ArcSurface = {
  id: string;
  label: string;
  purpose: string;
  route: string;
  reads: readonly string[];
  writes: readonly string[];
  approval: ArcSurfaceApproval;
};

export const ARC_APP_MAP: readonly ArcSurface[] = [
  {
    id: "crm",
    label: "CRM",
    purpose:
      "Companies, contacts, leads, jobs, outcomes, and properties — the record of who the business serves.",
    route: "/crm",
    reads: [
      "search_companies",
      "search_contacts",
      "search_leads",
      "get_lead",
      "search_jobs",
      "search_outcomes",
      "search_properties",
    ],
    writes: ["create_lead", "update_record", "log_interaction"],
    approval: "direct_write",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    purpose: "Approval-gated campaign packages and their draft assets across channels.",
    route: "/campaigns",
    reads: ["list_campaigns", "get_campaign", "list_approvals"],
    writes: ["create_campaign_draft", "generate_image", "generate_video"],
    approval: "proposes_to_approval",
  },
  {
    id: "library",
    label: "Library",
    purpose:
      "The business's real, approved media (photos, video, logos, docs) Arc reuses as authentic proof.",
    route: "/library",
    reads: ["list_media"],
    writes: ["attach_media"],
    approval: "proposes_to_approval",
  },
  {
    id: "brand",
    label: "Brand",
    purpose: "Brand identity, voice, proof points, and the source documents Arc learns the brand from.",
    route: "/brand",
    reads: ["list_brand_documents", "read_brand_document"],
    writes: ["analyze_website", "propose_brand_profile"],
    approval: "proposes_to_approval",
  },
  {
    id: "personas",
    label: "Personas",
    purpose: "The business's customer personas and their revenue-intelligence segments, scores, and signals.",
    route: "/personas",
    reads: ["read_persona_intelligence"],
    writes: [],
    approval: "read_only",
  },
  {
    id: "brain",
    label: "Brain",
    purpose: "Arc's marketing knowledge graph — durable learnings, signals, and the facts that ground its work.",
    route: "/brain",
    reads: ["query_brain"],
    writes: ["record_brain_note", "link_brain_nodes"],
    approval: "direct_write",
  },
  {
    id: "opportunities",
    label: "Opportunities",
    purpose: "The source-backed opportunity inbox Arc surveys and proposes into.",
    route: "/opportunities",
    reads: ["list_opportunities"],
    writes: ["propose_opportunity"],
    approval: "proposes_to_approval",
  },
  {
    id: "performance",
    label: "Performance",
    purpose: "Outcome and channel/persona performance Arc cites before proposing a next iteration.",
    route: "/analytics",
    reads: ["read_performance"],
    writes: [],
    approval: "read_only",
  },
  {
    id: "settings",
    label: "Settings",
    purpose:
      "Workspace configuration — connectors, Brand Kit status, compliance rules, team, and agent behavior. Read-only to Arc; changes are human-only.",
    route: "/settings",
    // get_workspace_settings is added to this surface in Task 4 (it doesn't exist yet).
    reads: [],
    writes: [],
    approval: "read_only",
  },
];
```

- [ ] **Step 2: Write the failing tool test**

Create `apps/arc-runner/src/tools/app-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ArcClient } from "../arc-client";
import { appMapTools } from "./app-map";

const noStep = async () => {};

type HandlerResult = { content: Array<{ type: string; text: string }> };
function callHandler(t: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (t.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("appMapTools", () => {
  it("get_app_map returns the surfaces with routes", async () => {
    const [getAppMap] = appMapTools({} as ArcClient, noStep);
    expect(getAppMap.name).toBe("get_app_map");
    const res = await callHandler(getAppMap as unknown as { handler: unknown }, {});
    expect(res.content[0].text).toContain("/settings");
    expect(res.content[0].text).toContain("CRM");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @bsr/arc-runner test src/tools/app-map.test.ts`
Expected: FAIL — `Cannot find module './app-map'`.

- [ ] **Step 4: Create the tool**

Create `apps/arc-runner/src/tools/app-map.ts`:

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";

import type { ArcClient } from "../arc-client";
import { ARC_APP_MAP } from "../app-map";
import { runTool, type StepFn } from "./helpers";

/**
 * Wayfinding tool: returns Arc's map of the app — every surface, its purpose, its
 * deep-link route, and the tools that read/write it. Available in every mode. The
 * `client` arg is unused (the map is static) but kept for a uniform factory shape.
 */
export function appMapTools(_client: ArcClient, step: StepFn) {
  const getAppMap = tool(
    "get_app_map",
    "Get Arc's map of the app: every operator-facing surface (CRM, Campaigns, Library, Brand, Personas, Brain, Opportunities, Performance, Settings), what each is for, its deep-link route, and which tools read or write it. Use for wayfinding — to know where a capability lives, pick the right tool, or send the operator to the right page via its route (cite the route in an emit_card result row).",
    {},
    async () => runTool(step, "Reading app map", async () => ARC_APP_MAP),
  );
  return [getAppMap];
}
```

- [ ] **Step 5: Run the tool test to verify it passes**

Run: `pnpm --filter @bsr/arc-runner test src/tools/app-map.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the tool into every mode**

In `apps/arc-runner/src/tools/index.ts`, add the import alongside the other tool imports (after line 15's `proposeOpportunityTool` import):

```ts
import { appMapTools } from "./app-map";
```

Then in `readTools(...)` (the array returned), add as the first entry so it leads:

```ts
function readTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [
    ...appMapTools(client, step),
    ...crmReadTools(client, step),
    ...brainReadTools(client, step),
    ...campaignReadTools(client, step),
    ...performanceReadTools(client, step),
    ...intelligenceTools(client, step),
    ...libraryReadTools(client, step),
    emitCardTool(sink.card),
    suggestFollowupsTool(sink.suggestion),
    citeSourcesTool(sink.source),
    askOperatorTool(sink.question),
  ];
}
```

- [ ] **Step 7: Write the failing drift test**

Create `apps/arc-runner/src/app-map.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ArcClient } from "./arc-client";
import { ARC_APP_MAP } from "./app-map";
import { toolsForMode, type ArcMode } from "./tools";
import type { TurnSink } from "./tools/helpers";

const noStep = async () => {};
const sink: TurnSink = { card: () => {}, suggestion: () => {}, source: () => {}, question: () => {} };

function allRealToolNames(): Set<string> {
  const names = new Set<string>();
  for (const mode of ["ask", "scan", "act", "draft"] as ArcMode[]) {
    for (const t of toolsForMode(mode, {} as ArcClient, noStep, sink)) names.add(t.name);
  }
  return names;
}

describe("ARC_APP_MAP", () => {
  it("references only tool names that exist in the real tool registry", () => {
    const real = allRealToolNames();
    const referenced = ARC_APP_MAP.flatMap((s) => [...s.reads, ...s.writes]);
    const missing = referenced.filter((name) => !real.has(name));
    expect(missing).toEqual([]);
  });

  it("gives every surface a non-empty id and a route under /", () => {
    for (const s of ARC_APP_MAP) {
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.route.startsWith("/")).toBe(true);
    }
  });
});
```

- [ ] **Step 8: Run the drift test to verify it passes**

Run: `pnpm --filter @bsr/arc-runner test src/app-map.test.ts`
Expected: PASS (the `settings` surface has empty `reads`, so no missing names; all other referenced names exist).

- [ ] **Step 9: Typecheck the runner**

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/arc-runner/src/app-map.ts apps/arc-runner/src/app-map.test.ts apps/arc-runner/src/tools/app-map.ts apps/arc-runner/src/tools/app-map.test.ts apps/arc-runner/src/tools/index.ts
git commit -m "feat(arc): app-map registry + get_app_map wayfinding tool"
```

---

## Task 2: Workspace summary read-model + `/api/v1/arc/workspace` route

**Files:**
- Create: `src/lib/workspace/summary.ts`
- Create: `src/lib/workspace/summary.test.ts`
- Create: `src/app/api/v1/arc/workspace/route.ts`
- Create: `src/app/api/v1/arc/workspace/route.test.ts`

- [ ] **Step 1: Write the failing read-model test**

Create `src/lib/workspace/summary.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdminClient: vi.fn(() => ({})) }));
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/workspace/summary.test.ts`
Expected: FAIL — `Cannot find module './summary'`.

- [ ] **Step 3: Create the read-model**

Create `src/lib/workspace/summary.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { getBusinessProfile, listPersonaDefinitions } from "@/lib/brand-kit/persistence";
import { getBusinessContext } from "@/lib/brand-kit/read-model";
import { listWorkspaceConnectors } from "@/lib/connectors/read-model";
import { countActiveApprovals } from "@/lib/approvals/read-model";
import { listAvailableArcMedia } from "@/lib/media-library/arc-handoff";

/** Bounded media snapshot — a count proxy, not a full library scan. */
const MEDIA_SNAPSHOT_LIMIT = 100;

export type WorkspaceSummary = {
  brandKit: "active" | "draft" | "none";
  connectors: { connected: number; total: number };
  mediaAvailable: number;
  pendingApprovals: number;
  personas: number;
};

export type WorkspaceSettingsDetail = WorkspaceSummary & {
  connectorList: Array<{ key: string; label: string; status: string; connected: boolean; lastTestOk: boolean | null }>;
  personaList: Array<{ key: string; label: string; isActive: boolean }>;
  compliance: { disallowedClaims: string[]; complianceNotes: string };
  identity: { tagline: string | null; websiteUrl: string | null; serviceAreas: string[] };
};

/** Resolve a piece of the summary, swallowing its error to a fallback so one
 *  unavailable source never sinks the whole snapshot. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function getWorkspaceSummary(
  orgId: string,
  workspaceId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<WorkspaceSummary> {
  const [profile, connectors, approvals, personas, media] = await Promise.all([
    safe(() => getBusinessProfile(orgId), null),
    safe(() => listWorkspaceConnectors(client, workspaceId), []),
    safe(() => countActiveApprovals(orgId, client), 0),
    safe(() => listPersonaDefinitions(orgId), []),
    safe(() => listAvailableArcMedia(orgId, { limit: MEDIA_SNAPSHOT_LIMIT }, client), []),
  ]);

  return {
    brandKit: profile ? profile.status : "none",
    connectors: {
      connected: connectors.filter((c) => c.credentialPresent).length,
      total: connectors.length,
    },
    mediaAvailable: media.length,
    pendingApprovals: approvals,
    personas: personas.length,
  };
}

export async function getWorkspaceSettingsDetail(
  orgId: string,
  workspaceId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<WorkspaceSettingsDetail> {
  const summary = await getWorkspaceSummary(orgId, workspaceId, client);
  const [connectors, personas, context] = await Promise.all([
    safe(() => listWorkspaceConnectors(client, workspaceId), []),
    safe(() => listPersonaDefinitions(orgId), []),
    safe(() => getBusinessContext(orgId), null),
  ]);

  return {
    ...summary,
    connectorList: connectors.map((c) => ({
      key: c.key,
      label: c.label,
      status: c.status,
      connected: c.credentialPresent,
      lastTestOk: c.lastTestOk,
    })),
    personaList: personas.map((p) => ({ key: p.key, label: p.label, isActive: p.isActive })),
    compliance: context
      ? { disallowedClaims: context.guardrails.disallowedClaims, complianceNotes: context.guardrails.complianceNotes }
      : { disallowedClaims: [], complianceNotes: "" },
    identity: context
      ? { tagline: context.tagline, websiteUrl: context.websiteUrl, serviceAreas: context.serviceAreas }
      : { tagline: null, websiteUrl: null, serviceAreas: [] },
  };
}
```

- [ ] **Step 4: Run the read-model test to verify it passes**

Run: `pnpm test src/lib/workspace/summary.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Write the failing route test**

Create `src/app/api/v1/arc/workspace/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/workspace", () => ({
  getCurrentWorkspaceContext: vi.fn(async () => ({
    orgId: "org_1",
    orgSlug: "big-shoulders-restoration",
    orgName: "Big Shoulders Restoration",
    workspaceId: "workspace_1",
    workspaceKey: "default",
    workspaceSlug: "default",
    workspaceName: "Default",
    role: null,
    userId: null,
    source: "default-org",
  })),
}));
vi.mock("@/lib/workspace/summary", () => ({
  getWorkspaceSummary: vi.fn(),
  getWorkspaceSettingsDetail: vi.fn(),
}));

import { getWorkspaceSummary, getWorkspaceSettingsDetail } from "@/lib/workspace/summary";
import { GET } from "./route";

const summaryMock = vi.mocked(getWorkspaceSummary);
const detailMock = vi.mocked(getWorkspaceSettingsDetail);

function req(url: string, authorization: string | undefined) {
  return new Request(url, { headers: { ...(authorization ? { authorization } : {}) } });
}

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

beforeEach(() => {
  summaryMock.mockReset();
  detailMock.mockReset();
  summaryMock.mockResolvedValue({
    brandKit: "active",
    connectors: { connected: 1, total: 2 },
    mediaAvailable: 7,
    pendingApprovals: 3,
    personas: 5,
  });
  detailMock.mockResolvedValue({
    brandKit: "active",
    connectors: { connected: 1, total: 2 },
    mediaAvailable: 7,
    pendingApprovals: 3,
    personas: 5,
    connectorList: [],
    personaList: [],
    compliance: { disallowedClaims: ["guarantee"], complianceNotes: "" },
    identity: { tagline: null, websiteUrl: null, serviceAreas: [] },
  });
});
afterEach(() => {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /api/v1/arc/workspace", () => {
  it("401s without a valid token and never reads", async () => {
    process.env.ARC_AGENT_API_TOKEN = "secret";
    const res = await GET(req("http://localhost/api/v1/arc/workspace", "Bearer wrong"));
    expect(res.status).toBe(401);
    expect(summaryMock).not.toHaveBeenCalled();
  });

  it("returns the compact snapshot by default", async () => {
    configure();
    const res = await GET(req("http://localhost/api/v1/arc/workspace", "Bearer secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, workspace: { brandKit: "active", personas: 5 } });
    expect(summaryMock).toHaveBeenCalledWith("org_1", "workspace_1");
    expect(detailMock).not.toHaveBeenCalled();
  });

  it("returns the full detail when detail=full", async () => {
    configure();
    const res = await GET(req("http://localhost/api/v1/arc/workspace?detail=full", "Bearer secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, workspace: { compliance: { disallowedClaims: ["guarantee"] } } });
    expect(detailMock).toHaveBeenCalledWith("org_1", "workspace_1");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test src/app/api/v1/arc/workspace/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Create the route**

Create `src/app/api/v1/arc/workspace/route.ts`:

```ts
import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getWorkspaceSummary, getWorkspaceSettingsDetail } from "@/lib/workspace/summary";

/**
 * Workspace awareness for Arc. The compact snapshot drives Arc's per-turn
 * situational awareness; `detail=full` backs the get_workspace_settings tool.
 *   GET /api/v1/arc/workspace             -> { ok, workspace }  (compact)
 *   GET /api/v1/arc/workspace?detail=full -> { ok, workspace }  (detailed)
 * Read-only. Bearer + workspace gated; secrets are never echoed.
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const { orgId, workspaceId } = allowed.scope;
  const detail = new URL(request.url).searchParams.get("detail") === "full";
  try {
    const workspace = detail
      ? await getWorkspaceSettingsDetail(orgId, workspaceId)
      : await getWorkspaceSummary(orgId, workspaceId);
    return ok({ workspace });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load workspace.", 502);
  }
}
```

- [ ] **Step 8: Run the route test to verify it passes**

Run: `pnpm test src/app/api/v1/arc/workspace/route.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 9: Typecheck the app**

Run: `pnpm typecheck`
Expected: no errors. (If `getBusinessContext`'s inferred type lacks `guardrails`/`tagline`/`websiteUrl`/`serviceAreas`, that's a real signal — those fields are the wire contract consumed by the runner's `AppBusinessContext`; re-check against `src/lib/brand-kit/read-model.ts`.)

- [ ] **Step 10: Commit**

```bash
git add src/lib/workspace/summary.ts src/lib/workspace/summary.test.ts src/app/api/v1/arc/workspace/route.ts src/app/api/v1/arc/workspace/route.test.ts
git commit -m "feat(arc): workspace summary read-model + /api/v1/arc/workspace route"
```

---

## Task 3: Inject the live `WORKSPACE STATE` briefing

**Files:**
- Create: `apps/arc-runner/src/workspace-summary.ts`
- Modify: `apps/arc-runner/src/context.ts`
- Create: `apps/arc-runner/src/context.workspace.test.ts`
- Modify: `apps/arc-runner/src/arc.ts:69-95` (`runArcQuery`)

- [ ] **Step 1: Create the runner-side fetcher**

Create `apps/arc-runner/src/workspace-summary.ts`:

```ts
import type { ArcClient } from "./arc-client";

/** Compact workspace snapshot the runner injects each turn (mirrors the app's WorkspaceSummary). */
export type WorkspaceSummary = {
  brandKit: "active" | "draft" | "none";
  connectors: { connected: number; total: number };
  mediaAvailable: number;
  pendingApprovals: number;
  personas: number;
};

/**
 * Fetch the compact workspace snapshot for this turn. Returns null on any error
 * so a workspace outage never breaks a turn (mirrors resolveBusinessContext).
 */
export async function resolveWorkspaceSummary(client: ArcClient): Promise<WorkspaceSummary | null> {
  try {
    const res = await client.apiGet<{ workspace: WorkspaceSummary }>("/api/v1/arc/workspace");
    return res.workspace ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Write the failing context test**

Create `apps/arc-runner/src/context.workspace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, type ArcTurnContext } from "./context";
import type { WorkspaceSummary } from "./workspace-summary";

const base: ArcTurnContext = {
  business: {
    businessName: "Acme",
    industry: "x",
    brandVoice: "y",
    creativePolicy: "z",
    compliance: "c",
  },
  mode: "ask",
  scope: { conversationId: "c1", projectId: null, campaignId: null, operator: "op" },
  mentions: [],
};

const summary: WorkspaceSummary = {
  brandKit: "draft",
  connectors: { connected: 1, total: 3 },
  mediaAvailable: 12,
  pendingApprovals: 2,
  personas: 5,
};

describe("WORKSPACE STATE block in buildSystemPrompt", () => {
  it("renders the snapshot when present", () => {
    const out = buildSystemPrompt("BASE", { ...base, workspaceState: summary });
    expect(out).toContain("WORKSPACE STATE");
    expect(out).toContain("1 of 3 connected");
    expect(out).toContain("Brand Kit in draft");
  });

  it("omits the block when absent or null", () => {
    expect(buildSystemPrompt("BASE", base)).not.toContain("WORKSPACE STATE");
    expect(buildSystemPrompt("BASE", { ...base, workspaceState: null })).not.toContain("WORKSPACE STATE");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @bsr/arc-runner test src/context.workspace.test.ts`
Expected: FAIL — `workspaceState` is not a known property / no `WORKSPACE STATE` text.

- [ ] **Step 4: Add the field, block, and import to `context.ts`**

In `apps/arc-runner/src/context.ts`, add the import at the top (after the existing imports, around line 5):

```ts
import type { WorkspaceSummary } from "./workspace-summary";
```

Add `workspaceState` to `ArcTurnContext` (after the `memory?` field, ~line 31):

```ts
  /** Live workspace snapshot injected as situational awareness (may be absent). */
  workspaceState?: WorkspaceSummary | null;
```

Add the block function (place it next to `memoryBlock`, ~line 126):

```ts
function workspaceStateBlock(s: WorkspaceSummary | null | undefined): string | null {
  if (!s) return null;
  const brand =
    s.brandKit === "active"
      ? "Brand Kit active"
      : s.brandKit === "draft"
        ? "Brand Kit in draft — not yet active; tell the operator to activate it in Settings"
        : "no Brand Kit yet — running on neutral defaults";
  return [
    "WORKSPACE STATE (live snapshot — use for situational awareness; call get_workspace_settings for detail):",
    `- ${brand}`,
    `- Connectors: ${s.connectors.connected} of ${s.connectors.total} connected`,
    `- Library: ${s.mediaAvailable} approved media available to you`,
    `- Approvals: ${s.pendingApprovals} pending`,
    `- Personas: ${s.personas} configured`,
  ].join("\n");
}
```

Add it to the composed parts in `buildSystemPrompt` (insert after `businessBlock(ctx.business)`, ~line 132):

```ts
  const parts: (string | null)[] = [
    base,
    businessBlock(ctx.business),
    workspaceStateBlock(ctx.workspaceState),
    memoryBlock(ctx.memory),
    personasBlock(),
    modeBlock(ctx.mode),
    skillBlock(ctx.skill),
    styleBlock(ctx),
    scopeBlock(ctx.scope),
    mentionsBlock(ctx.mentions),
  ];
```

- [ ] **Step 5: Run the context test to verify it passes**

Run: `pnpm --filter @bsr/arc-runner test src/context.workspace.test.ts`
Expected: PASS.

- [ ] **Step 6: Fetch + inject the snapshot once per turn in `runArcQuery`**

In `apps/arc-runner/src/arc.ts`, add the import (next to the `resolveBusinessContext` import, line 3):

```ts
import { resolveWorkspaceSummary } from "./workspace-summary";
```

In `runArcQuery` (the function body, ~line 83-85), replace the `system` assignment:

```ts
  const tools = toolsForMode(opts.mode, opts.client, opts.step, sink, { ...(opts.toolContext ?? {}), skill: opts.skill });
  const arcServer = createSdkMcpServer({ name: "arc", version: "1.0.0", tools });
  const workspaceState = await resolveWorkspaceSummary(opts.client);
  const system = buildSystemPrompt(ARC_SYSTEM_PROMPT, { ...opts.ctx, workspaceState });
```

This is the single fetch site — all four entry points (`runArcTurn`, `runArcOpportunityDraft`, `runArcOpportunityScan`, `runArcCampaignTask`) funnel through `runArcQuery`, so each turn gets the briefing. `resolveWorkspaceSummary` returns null on error and `workspaceStateBlock(null)` renders nothing, so a failed fetch is invisible.

- [ ] **Step 7: Run the runner test suite + typecheck**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: PASS (existing `context.test.ts` / `context.memory.test.ts` unaffected — the block only renders when `workspaceState` is set, which they never set).

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/arc-runner/src/workspace-summary.ts apps/arc-runner/src/context.ts apps/arc-runner/src/context.workspace.test.ts apps/arc-runner/src/arc.ts
git commit -m "feat(arc): inject live WORKSPACE STATE briefing each turn"
```

---

## Task 4: `get_workspace_settings` tool + prompt/skills wiring

**Files:**
- Create: `apps/arc-runner/src/tools/settings.ts`
- Create: `apps/arc-runner/src/tools/settings.test.ts`
- Modify: `apps/arc-runner/src/tools/index.ts`
- Modify: `apps/arc-runner/src/app-map.ts` (settings surface `reads`)
- Modify: `apps/arc-runner/src/tools/index.test.ts`
- Modify: `apps/arc-runner/src/prompt.ts`
- Modify: `apps/arc-runner/src/skills.ts`

- [ ] **Step 1: Write the failing settings tool test**

Create `apps/arc-runner/src/tools/settings.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ArcClient } from "../arc-client";
import { settingsReadTools } from "./settings";

const noStep = async () => {};

type HandlerResult = { content: Array<{ type: string; text: string }> };
function byName(client: ArcClient) {
  return Object.fromEntries(settingsReadTools(client, noStep).map((t) => [t.name, t]));
}
function callHandler(t: { handler: unknown }, args: Record<string, unknown>): Promise<HandlerResult> {
  return (t.handler as (a: Record<string, unknown>, e?: unknown) => Promise<HandlerResult>)(args);
}

describe("settingsReadTools", () => {
  it("get_workspace_settings requests the full workspace detail", async () => {
    const client = {
      apiGet: vi.fn(async () => ({ ok: true, workspace: { brandKit: "active", connectorList: [] } })),
    } as unknown as ArcClient;
    const tools = byName(client);
    const res = await callHandler(tools["get_workspace_settings"], {});
    expect(client.apiGet).toHaveBeenCalledWith("/api/v1/arc/workspace", { detail: "full" });
    expect(res.content[0].text).toContain("active");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @bsr/arc-runner test src/tools/settings.test.ts`
Expected: FAIL — `Cannot find module './settings'`.

- [ ] **Step 3: Create the tool**

Create `apps/arc-runner/src/tools/settings.ts`:

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";

import type { ArcClient } from "../arc-client";
import { runTool, type StepFn } from "./helpers";

/**
 * Read-only workspace settings. Closes Arc's Settings blind spot: connectors and
 * their status, Brand Kit status + identity, the compliance / restricted-claims
 * list, and configured personas. Available in every mode. Changing settings is
 * human-only — there is no write tool here by design.
 */
export function settingsReadTools(client: ArcClient, step: StepFn) {
  const getWorkspaceSettings = tool(
    "get_workspace_settings",
    "Read the workspace's settings detail: connectors and their connection status, Brand Kit status + identity, the compliance / restricted-claims list, and the configured personas. Use to answer 'what's connected?', 'is my Brand Kit active?', or 'what can't I claim?' before drafting or recommending. Read-only — changing settings is human-only.",
    {},
    async () =>
      runTool(step, "Reading workspace settings", () =>
        client.apiGet("/api/v1/arc/workspace", { detail: "full" }),
      ),
  );
  return [getWorkspaceSettings];
}
```

- [ ] **Step 4: Run the settings tool test to verify it passes**

Run: `pnpm --filter @bsr/arc-runner test src/tools/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the tool into every mode**

In `apps/arc-runner/src/tools/index.ts`, add the import (next to the `appMapTools` import added in Task 1):

```ts
import { settingsReadTools } from "./settings";
```

Add it to `readTools(...)` (after `appMapTools`):

```ts
    ...appMapTools(client, step),
    ...settingsReadTools(client, step),
    ...crmReadTools(client, step),
```

- [ ] **Step 6: Add the tool to the Settings surface in the registry**

In `apps/arc-runner/src/app-map.ts`, update the `settings` surface `reads` (replace the empty array + its comment):

```ts
    route: "/settings",
    reads: ["get_workspace_settings"],
    writes: [],
    approval: "read_only",
```

The Task 1 drift test (`apps/arc-runner/src/app-map.test.ts`) now exercises this: `get_workspace_settings` exists in the real registry (Step 5), so the test stays green — re-run it in Step 8 to confirm.

- [ ] **Step 7: Add a presence assertion to `index.test.ts`**

In `apps/arc-runner/src/tools/index.test.ts`, add this test inside the existing top-level `describe` block (match the file's existing style for referencing `allowedToolNames`/`toolsForMode`):

```ts
  it("exposes get_app_map and get_workspace_settings in every mode", () => {
    for (const mode of ["ask", "scan", "act", "draft"] as const) {
      const names = allowedToolNames(mode);
      expect(names).toContain("mcp__arc__get_app_map");
      expect(names).toContain("mcp__arc__get_workspace_settings");
    }
  });
```

If `allowedToolNames` is not already imported in this test file, add it to the existing import from `"./index"` (e.g. `import { allowedToolNames, toolsForMode } from "./index";`).

- [ ] **Step 8: Run the runner test suite to verify everything is green**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: PASS — settings tool test, drift test, index presence test, and all prior tests.

- [ ] **Step 9: Update the system prompt**

In `apps/arc-runner/src/prompt.ts`, replace the "You can also see beyond CRM and campaigns" sentence (line 17). Find:

```ts
You can also see beyond CRM and campaigns: list_opportunities (the opportunity inbox), read_persona_intelligence (persona segments/scores/signals), list_vault_notes + get_vault_note (the knowledge vault), read_recent_activity (what's changed lately), and list_brand_documents + read_brand_document (the uploaded brand source files and what's been learned from each). Use them to ground decisions in the current state before recommending or drafting.
```

Replace with:

```ts
You can also see beyond CRM and campaigns: list_opportunities (the opportunity inbox), read_persona_intelligence (persona segments/scores/signals), list_vault_notes + get_vault_note (the knowledge vault), read_recent_activity (what's changed lately), list_brand_documents + read_brand_document (the uploaded brand source files and what's been learned from each), and get_workspace_settings (the workspace's connectors, Brand Kit status, compliance / restricted-claims list, and configured personas — what's connected and what you can't claim). Use them to ground decisions in the current state before recommending or drafting.

Wayfinding: call get_app_map to see every app surface (CRM, Campaigns, Library, Brand, Personas, Brain, Opportunities, Performance, Settings), what each is for, its deep-link route, and which tools read or write it. When you tell the operator where to do something, deep-link them via the surface route (e.g. /settings) — prefer an emit_card result row over prose. Each turn you are also given a WORKSPACE STATE snapshot (Brand Kit status, connectors, library/approval/persona counts); read it for situational awareness and call get_workspace_settings for the full detail. Settings are read-only to you — never claim you changed a setting; tell the operator what to change and where.
```

- [ ] **Step 10: Register the new tools in skills**

In `apps/arc-runner/src/skills.ts`, add `"get_app_map"` and `"get_workspace_settings"` to the `allowedTools` arrays of the `opportunity-discovery` and `approval-gated-drafting` skills (both already grant read tools). For `opportunity-discovery`, add both after `"read_recent_activity"`:

```ts
      "read_recent_activity",
      "read_performance",
      "get_app_map",
      "get_workspace_settings",
      "research_web",
```

For `approval-gated-drafting`, add both after `"read_brand_document"`:

```ts
      "list_brand_documents",
      "read_brand_document",
      "get_app_map",
      "get_workspace_settings",
      "create_campaign_draft",
```

(Leave `company-research` unchanged — it is a deliberately narrow research-only skill.)

- [ ] **Step 11: Final runner checks**

Run: `pnpm --filter @bsr/arc-runner test`
Expected: PASS.

Run: `pnpm --filter @bsr/arc-runner typecheck`
Expected: no errors.

- [ ] **Step 12: Lint the changed files (scoped — repo lint scans vendor noise)**

Run: `pnpm lint apps/arc-runner/src/app-map.ts apps/arc-runner/src/tools/app-map.ts apps/arc-runner/src/tools/settings.ts apps/arc-runner/src/workspace-summary.ts apps/arc-runner/src/context.ts apps/arc-runner/src/arc.ts apps/arc-runner/src/prompt.ts apps/arc-runner/src/skills.ts apps/arc-runner/src/tools/index.ts src/lib/workspace/summary.ts src/app/api/v1/arc/workspace/route.ts`
Expected: no errors on these files.

- [ ] **Step 13: Commit**

```bash
git add apps/arc-runner/src/tools/settings.ts apps/arc-runner/src/tools/settings.test.ts apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts apps/arc-runner/src/app-map.ts apps/arc-runner/src/prompt.ts apps/arc-runner/src/skills.ts
git commit -m "feat(arc): get_workspace_settings tool + app-awareness prompt/skills wiring"
```

---

## Final verification (whole slice)

- [ ] **Run the full runner suite:** `pnpm --filter @bsr/arc-runner test` — all green.
- [ ] **Run the touched app tests:** `pnpm test src/lib/workspace/summary.test.ts src/app/api/v1/arc/workspace/route.test.ts` — all green.
- [ ] **Typecheck both packages:** `pnpm typecheck` and `pnpm --filter @bsr/arc-runner typecheck` — no errors.
- [ ] **Manual smoke (optional, needs Supabase env + a running app):** `curl -s -H "Authorization: Bearer $ARC_AGENT_API_TOKEN" "http://localhost:3000/api/v1/arc/workspace" | jq` returns `{ ok: true, workspace: { brandKit, connectors, mediaAvailable, pendingApprovals, personas } }`; add `?detail=full` to see the connector/persona/compliance detail.

## Deploy notes

- No schema migration in this slice — all data comes from existing tables/read-models, so there is no manual prod-migration step (contrast memory `prod-schema-drift`).
- The new route ships in the app; the runner only calls it. Deploy the app before/with the runner. If the runner runs against an older app deploy that lacks `/api/v1/arc/workspace`, `resolveWorkspaceSummary` returns null and the briefing is simply omitted — no failure (memory `vercel-deploy`).

## Deferred to later slices (not this plan)

- `detail=full` currently returns connectors, Brand Kit status + identity, personas, and compliance/restricted-claims — the confirmed read-models. Team/roles, approval strictness, and media-model config are a fast-follow once their read-models are confirmed; add them to `getWorkspaceSettingsDetail` and `WorkspaceSettingsDetail` the same way.
- Library folder tree (Slice 2), persona playbooks (Slice 3), brain-as-memory (tracked initiative). Each registers its richer tools on the existing registry surface.
- Any settings writes remain out of scope (human-only).
