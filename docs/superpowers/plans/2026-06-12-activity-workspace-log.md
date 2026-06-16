# Activity Workspace Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/activity` as a readable workspace log that shows human actions, Arc work, approvals, risks, CRM/campaign changes, and marketing progress in one simple timeline.

**Architecture:** Extend the existing `src/lib/activity/read-model.ts` read model so all filtering, mapping, summary counts, and date grouping are pure and testable. Then add a server-rendered App Router page that uses existing `PageHeader`, `MetricStrip`, `WorkspacePanel`, `EmptyState`, `StatusPill`, and query-param filter patterns. Add a nav icon and nav item last so the route becomes discoverable only after the page works.

**Tech Stack:** Next.js 16 App Router, React 19 server components, TypeScript, Supabase read model, Vitest, existing Signal design-system components.

---

## Spec

Implement the approved design in `docs/superpowers/specs/2026-06-12-activity-tab-design.md`.

## Scope Check

This is one coherent feature: a read-only Activity page backed by an existing multi-source read model. It does not require a separate subsystem plan because it has one UI route, one read-model boundary, one test file, and one nav addition.

Do not implement future-work items from the spec:

- No detail drawer.
- No export flow.
- No saved views.
- No "Ask Arc what happened this week" action.
- No alert rules.
- No real-time feed.
- No write actions.

## Required Pre-Read

Before writing code, read these local docs because this repo uses Next.js 16 and the project `AGENTS.md` warns that local Next docs are authoritative:

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`

Confirm the implementation keeps `searchParams` as a promise in the page component and uses the server `searchParams` prop for filtering.

## File Map

- Modify `src/lib/activity/read-model.ts`
  - Owns source queries, row mapping, pure filters, summary counts, grouping, labels, and hrefs.
  - Exports the UI-friendly activity types consumed by the page.
- Modify `src/lib/activity/read-model.test.ts`
  - Adds tests for filters, summary counts, row grouping, title safety, and event mapping.
- Create `src/app/activity/page.tsx`
  - Server component route. Reads query params, calls the read model, renders header, metrics, filters, timeline, empty/unavailable states.
- Modify `src/app/_components/nav-icons.tsx`
  - Adds an `activity` line icon.
- Modify `src/app/_components/console-frame.tsx`
  - Adds top-level `Activity` nav item after `Board`.
- No database migrations in this plan.
- No server actions in this plan.

## Data Contract

Keep compatibility with the existing read model while expanding it.

Use these public types in `src/lib/activity/read-model.ts`:

```ts
export type ActivityKind = "decision" | "run" | "draft" | "campaign" | "event";
export type ActivityTone = "green" | "red" | "amber" | "blue" | "gray";
export type ActivityActorType = "human" | "arc" | "sub_agent" | "integration" | "system";
export type ActivityCategory = "approval" | "campaign" | "crm" | "asset" | "agent" | "integration" | "risk" | "system";
export type ActivityInsightLabel =
  | "Needs review"
  | "Marketing progress"
  | "Risk blocked"
  | "Data changed"
  | "Agent work"
  | "Customer signal"
  | "Campaign result";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  tone: ActivityTone;
  title: string;
  detail: string;
  actor: string;
  actorType: ActivityActorType;
  category: ActivityCategory;
  insightLabel: ActivityInsightLabel | null;
  relatedLabel: string | null;
  occurredAt: string;
  href: string | null;
};

export type ActivityQuery = {
  categories?: ActivityCategory[];
  actorTypes?: ActivityActorType[];
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
};

export type ActivitySummary = {
  needsReview: number;
  hermesActions: number;
  campaignProgress: number;
  blockedOrRisky: number;
};

export type ActivityDayGroup = {
  label: string;
  entries: ActivityEntry[];
};

export type RecentActivity =
  | { status: "live"; entries: ActivityEntry[]; summary: ActivitySummary; groups: ActivityDayGroup[] }
  | { status: "unavailable"; message: string };
```

Notes:

- Existing `kind`, `tone`, `title`, `detail`, `actor`, `occurredAt`, and `href` stay present so older callers/tests remain easy to update.
- Additive fields support the new UI without raw logs leaking into page code.

## Task 1: Read The Local Next.js Docs

**Files:**
- Read: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
- Read: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`
- Read: `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`

- [ ] **Step 1: Read the App Router page docs**

Run:

```powershell
Get-Content -Path node_modules\next\dist\docs\01-app\03-api-reference\03-file-conventions\page.md
```

Expected: The docs confirm `searchParams` is a promise and should be awaited in server page components.

- [ ] **Step 2: Read the search-param docs**

Run:

```powershell
Get-Content -Path node_modules\next\dist\docs\01-app\03-api-reference\04-functions\use-search-params.md
```

Expected: The docs confirm server pages should prefer the `searchParams` prop for server-side filtering.

- [ ] **Step 3: Read the layouts/pages docs**

Run:

```powershell
Get-Content -Path node_modules\next\dist\docs\01-app\01-getting-started\03-layouts-and-pages.md
```

Expected: The docs confirm App Router pages are default server components and can receive `searchParams`.

## Task 2: Expand Activity Read-Model Tests First

**Files:**
- Modify: `src/lib/activity/read-model.test.ts`

- [ ] **Step 1: Replace the test helper so entries include the new fields**

In `src/lib/activity/read-model.test.ts`, replace the current `entry` helper with:

```ts
function entry(
  id: string,
  occurredAt: string,
  overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    id,
    kind: "run",
    tone: "blue",
    title: id,
    detail: "",
    actor: "Arc",
    actorType: "arc",
    category: "agent",
    insightLabel: "Agent work",
    relatedLabel: null,
    occurredAt,
    href: null,
    ...overrides,
  };
}
```

- [ ] **Step 2: Add imports for the new pure functions**

Change the import in `src/lib/activity/read-model.test.ts` to:

```ts
import {
  applyActivityFilters,
  buildActivitySummary,
  groupActivityEntriesByDay,
  mapEvent,
  mergeActivityEntries,
  type ActivityEntry,
} from "./read-model";
```

- [ ] **Step 3: Add filter tests**

Append this test block:

```ts
describe("applyActivityFilters", () => {
  const entries = [
    entry("approval", "2026-06-12T14:00:00Z", {
      actor: "Evan",
      actorType: "human",
      category: "approval",
      title: "Evan approved Launch Email",
      detail: "Approval recorded for Launch Campaign.",
      relatedLabel: "Launch Campaign",
      insightLabel: "Needs review",
    }),
    entry("risk", "2026-06-11T14:00:00Z", {
      actor: "Arc",
      actorType: "arc",
      category: "risk",
      tone: "red",
      title: "Compliance blocked one SMS draft",
      detail: "Risky language was detected.",
      insightLabel: "Risk blocked",
    }),
    entry("campaign", "2026-06-10T14:00:00Z", {
      actor: "System",
      actorType: "system",
      category: "campaign",
      title: "Campaign moved to Ready for Review",
      detail: "Spring Winback is ready.",
      relatedLabel: "Spring Winback",
      insightLabel: "Marketing progress",
    }),
  ];

  it("filters by category", () => {
    const filtered = applyActivityFilters(entries, { categories: ["risk"] });
    expect(filtered.map((item) => item.id)).toEqual(["risk"]);
  });

  it("filters by actor type", () => {
    const filtered = applyActivityFilters(entries, { actorTypes: ["human"] });
    expect(filtered.map((item) => item.id)).toEqual(["approval"]);
  });

  it("filters by inclusive date bounds", () => {
    const filtered = applyActivityFilters(entries, {
      since: "2026-06-11T00:00:00Z",
      until: "2026-06-12T23:59:59Z",
    });
    expect(filtered.map((item) => item.id)).toEqual(["approval", "risk"]);
  });

  it("searches title, detail, actor, related label, category, and insight label", () => {
    expect(applyActivityFilters(entries, { search: "launch" }).map((item) => item.id)).toEqual(["approval"]);
    expect(applyActivityFilters(entries, { search: "arc" }).map((item) => item.id)).toEqual(["risk"]);
    expect(applyActivityFilters(entries, { search: "spring" }).map((item) => item.id)).toEqual(["campaign"]);
    expect(applyActivityFilters(entries, { search: "marketing progress" }).map((item) => item.id)).toEqual(["campaign"]);
    expect(applyActivityFilters(entries, { search: "approval" }).map((item) => item.id)).toEqual(["approval"]);
  });
});
```

- [ ] **Step 4: Add summary tests**

Append this test block:

```ts
describe("buildActivitySummary", () => {
  it("counts the four insight strip buckets", () => {
    const summary = buildActivitySummary([
      entry("review", "2026-06-12T14:00:00Z", {
        category: "approval",
        insightLabel: "Needs review",
        actorType: "human",
      }),
      entry("arc", "2026-06-12T13:00:00Z", {
        category: "agent",
        actorType: "arc",
        insightLabel: "Agent work",
      }),
      entry("campaign", "2026-06-12T12:00:00Z", {
        category: "campaign",
        actorType: "system",
        insightLabel: "Marketing progress",
      }),
      entry("risk", "2026-06-12T11:00:00Z", {
        category: "risk",
        actorType: "system",
        tone: "red",
        insightLabel: "Risk blocked",
      }),
    ]);

    expect(summary).toEqual({
      needsReview: 1,
      hermesActions: 1,
      campaignProgress: 1,
      blockedOrRisky: 1,
    });
  });
});
```

- [ ] **Step 5: Add grouping tests**

Append this test block:

```ts
describe("groupActivityEntriesByDay", () => {
  it("groups entries with friendly day labels", () => {
    const groups = groupActivityEntriesByDay(
      [
        entry("today", "2026-06-12T14:00:00Z"),
        entry("yesterday", "2026-06-11T14:00:00Z"),
        entry("older", "2026-06-10T14:00:00Z"),
      ],
      new Date("2026-06-12T16:00:00Z"),
    );

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", "June 10, 2026"]);
    expect(groups.map((group) => group.entries.map((item) => item.id))).toEqual([["today"], ["yesterday"], ["older"]]);
  });
});
```

- [ ] **Step 6: Add event mapping tests**

Append this test block:

```ts
describe("mapEvent", () => {
  it("maps CRM events to readable activity rows with CRM hrefs", () => {
    const mapped = mapEvent({
      id: "evt_1",
      actor: "Evan",
      subject_type: "lead",
      subject_id: "lead_1",
      type: "lead.created",
      payload: { title: "New lead created", detail: "Ada Lovelace entered the workspace.", relatedLabel: "Ada Lovelace" },
      occurred_at: "2026-06-12T14:00:00Z",
    });

    expect(mapped).toMatchObject({
      id: "event:evt_1",
      kind: "event",
      actor: "Evan",
      actorType: "human",
      category: "crm",
      title: "New lead created",
      detail: "Ada Lovelace entered the workspace.",
      relatedLabel: "Ada Lovelace",
      href: "/crm/leads/lead_1",
    });
  });

  it("never exposes raw event names when no title is present", () => {
    const mapped = mapEvent({
      id: "evt_2",
      actor: "system.process.queued_task",
      subject_type: "campaign",
      subject_id: "campaign_1",
      type: "campaign.ready_for_review",
      payload: {},
      occurred_at: "2026-06-12T14:00:00Z",
    });

    expect(mapped.title).toBe("Campaign Ready For Review");
    expect(mapped.actor).toBe("System");
    expect(mapped.href).toBe("/campaigns/campaign_1");
  });
});
```

- [ ] **Step 7: Run the tests to verify failure**

Run:

```powershell
pnpm test src/lib/activity/read-model.test.ts
```

Expected: FAIL because `applyActivityFilters`, `buildActivitySummary`, `groupActivityEntriesByDay`, `mapEvent`, and the new `ActivityEntry` fields do not exist yet.

## Task 3: Implement Activity Types, Filters, Summary, Grouping, And Event Mapping

**Files:**
- Modify: `src/lib/activity/read-model.ts`

- [ ] **Step 1: Replace the public type block**

In `src/lib/activity/read-model.ts`, replace the current `ActivityKind`, `ActivityTone`, `ActivityEntry`, and `RecentActivity` type block with the exact Data Contract block from this plan.

- [ ] **Step 2: Update the source limit and function signature**

Replace:

```ts
const SOURCE_LIMIT = 15;

export async function getRecentActivity(limit = 20, client?: SupabaseClient): Promise<RecentActivity> {
```

with:

```ts
const SOURCE_LIMIT = 50;
const DEFAULT_LIMIT = 100;

export async function getRecentActivity(query: ActivityQuery = {}, client?: SupabaseClient): Promise<RecentActivity> {
  const limit = query.limit ?? DEFAULT_LIMIT;
```

- [ ] **Step 3: Add the CRM events source query**

Inside the `Promise.all`, add a fifth query:

```ts
      supabase
        .from("events")
        .select("id,actor,subject_type,subject_id,type,payload,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(SOURCE_LIMIT),
```

Name the result `events`.

- [ ] **Step 4: Assert the events query and merge mapped rows**

After the existing assertions, add:

```ts
    assertOk("events", events.error);
```

Then include event rows in the entries array:

```ts
      ...rows(events.data).map(mapEvent),
```

- [ ] **Step 5: Apply filters before merge and return summary/groups**

Replace the current return:

```ts
    return { status: "live", entries: mergeActivityEntries(entries, limit) };
```

with:

```ts
    const filtered = applyActivityFilters(entries, query);
    const merged = mergeActivityEntries(filtered, limit);

    return {
      status: "live",
      entries: merged,
      summary: buildActivitySummary(merged),
      groups: groupActivityEntriesByDay(merged),
    };
```

- [ ] **Step 6: Add filter, summary, and grouping functions after `mergeActivityEntries`**

Add:

```ts
export function applyActivityFilters(entries: ActivityEntry[], query: ActivityQuery): ActivityEntry[] {
  const categorySet = query.categories?.length ? new Set(query.categories) : null;
  const actorSet = query.actorTypes?.length ? new Set(query.actorTypes) : null;
  const since = query.since ? Date.parse(query.since) : null;
  const until = query.until ? Date.parse(query.until) : null;
  const search = normalizeSearch(query.search);

  return entries.filter((entry) => {
    if (categorySet && !categorySet.has(entry.category)) return false;
    if (actorSet && !actorSet.has(entry.actorType)) return false;

    const time = Date.parse(entry.occurredAt);
    if (since !== null && Number.isFinite(since) && time < since) return false;
    if (until !== null && Number.isFinite(until) && time > until) return false;

    if (!search) return true;

    const haystack = [
      entry.title,
      entry.detail,
      entry.actor,
      entry.relatedLabel ?? "",
      entry.category,
      entry.actorType,
      entry.insightLabel ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

export function buildActivitySummary(entries: ActivityEntry[]): ActivitySummary {
  return {
    needsReview: entries.filter((entry) => entry.insightLabel === "Needs review").length,
    hermesActions: entries.filter((entry) => entry.actorType === "arc" || entry.actorType === "sub_agent").length,
    campaignProgress: entries.filter((entry) => entry.category === "campaign" || entry.insightLabel === "Marketing progress").length,
    blockedOrRisky: entries.filter((entry) => entry.category === "risk" || entry.tone === "red" || entry.insightLabel === "Risk blocked").length,
  };
}

export function groupActivityEntriesByDay(entries: ActivityEntry[], now = new Date()): ActivityDayGroup[] {
  const groups = new Map<string, ActivityEntry[]>();

  for (const entry of entries) {
    const label = dayLabel(entry.occurredAt, now);
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }

  return Array.from(groups, ([label, groupedEntries]) => ({ label, entries: groupedEntries }));
}
```

- [ ] **Step 7: Update the four existing mappers with the new fields**

Update each mapper return object to include readable actor/category fields.

For `mapDecision`, add:

```ts
    actorType: "human",
    category: "approval",
    insightLabel: decision.toLowerCase().includes("approv") ? "Marketing progress" : "Needs review",
    relatedLabel: approvalId ? "Approval item" : null,
```

For `mapRun`, add:

```ts
    actorType: agentActorType(str(row.model_name) ?? str(row.model_provider)),
    category: error ? "risk" : "agent",
    insightLabel: error ? "Risk blocked" : "Agent work",
    relatedLabel: taskId ? "Agent task" : null,
```

For `mapOutput`, add:

```ts
    actorType: "arc",
    category: outputTone(`${compliance} ${approval} ${risk}`) === "red" ? "risk" : "asset",
    insightLabel: approval.toLowerCase().includes("approved") ? "Marketing progress" : "Needs review",
    relatedLabel: str(row.title) ?? titleize(str(row.output_type) ?? "Draft"),
```

For `mapCampaignEvent`, add:

```ts
    actorType: actorTypeFromActor(str(row.actor)),
    category: campaignTone(eventType) === "red" ? "risk" : "campaign",
    insightLabel: campaignTone(eventType) === "red" ? "Risk blocked" : "Marketing progress",
    relatedLabel: str(row.detail) ?? "Campaign update",
```

If TypeScript complains about repeated calls to `outputTone` or `campaignTone`, assign the tone to a local `const tone` and use that in the return object.

- [ ] **Step 8: Export `mapEvent`**

Add this mapper below `mapCampaignEvent`:

```ts
export function mapEvent(row: Record<string, unknown>): ActivityEntry {
  const subjectType = str(row.subject_type) ?? "record";
  const subjectId = str(row.subject_id);
  const eventType = str(row.type) ?? "record.updated";
  const payload = object(row.payload);
  const title = str(payload.title) ?? titleize(eventType);
  const detail = str(payload.detail) ?? `${titleize(subjectType)} activity recorded.`;
  const actor = displayActor(str(row.actor));
  const href = hrefForSubject(subjectType, subjectId);

  return {
    id: `event:${String(row.id)}`,
    kind: "event",
    tone: eventTone(eventType),
    title,
    detail,
    actor,
    actorType: actorTypeFromActor(actor),
    category: categoryForEvent(subjectType, eventType),
    insightLabel: insightForEvent(subjectType, eventType),
    relatedLabel: str(payload.relatedLabel) ?? titleize(subjectType),
    occurredAt: str(row.occurred_at) ?? "",
    href,
  };
}
```

- [ ] **Step 9: Add helper functions above `assertOk`**

Add:

```ts
function normalizeSearch(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Unknown date";

  const startOfInput = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const startOfNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((startOfNow - startOfInput) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function displayActor(value: string | null): string {
  if (!value) return "System";
  const normalized = value.toLowerCase();
  if (normalized.includes("system.") || normalized.includes("_process")) return "System";
  if (normalized.includes("arc") || normalized.includes("arc")) return "Arc";
  return value;
}

function actorTypeFromActor(actor: string | null): ActivityActorType {
  const value = (actor ?? "").toLowerCase();
  if (value.includes("arc") || value.includes("arc")) return "arc";
  if (value.includes("integration")) return "integration";
  if (value === "system" || value.includes("system")) return "system";
  if (value.includes("agent")) return "sub_agent";
  return "human";
}

function agentActorType(model: string | null): ActivityActorType {
  const value = (model ?? "").toLowerCase();
  if (value.includes("arc") || value.includes("arc")) return "arc";
  if (value.includes("agent")) return "sub_agent";
  return "arc";
}

function eventTone(eventType: string): ActivityTone {
  const value = eventType.toLowerCase();
  if (value.includes("block") || value.includes("fail") || value.includes("reject")) return "red";
  if (value.includes("approv") || value.includes("complete") || value.includes("won")) return "green";
  if (value.includes("review") || value.includes("pending")) return "amber";
  return "blue";
}

function categoryForEvent(subjectType: string, eventType: string): ActivityCategory {
  const subject = subjectType.toLowerCase();
  const event = eventType.toLowerCase();
  if (event.includes("risk") || event.includes("block") || event.includes("fail")) return "risk";
  if (subject.includes("campaign")) return "campaign";
  if (subject.includes("asset") || subject.includes("draft")) return "asset";
  if (subject.includes("integration")) return "integration";
  if (["company", "contact", "property", "lead", "job", "outcome"].some((item) => subject.includes(item))) return "crm";
  return "system";
}

function insightForEvent(subjectType: string, eventType: string): ActivityInsightLabel {
  const category = categoryForEvent(subjectType, eventType);
  const event = eventType.toLowerCase();
  if (category === "risk") return "Risk blocked";
  if (event.includes("review") || event.includes("pending")) return "Needs review";
  if (category === "campaign" || category === "asset") return "Marketing progress";
  if (category === "crm") return "Customer signal";
  return "Data changed";
}

function hrefForSubject(subjectType: string, subjectId: string | null): string | null {
  if (!subjectId) return null;

  const subject = subjectType.toLowerCase();
  if (subject === "company") return `/crm/companies/${subjectId}`;
  if (subject === "contact") return `/crm/contacts/${subjectId}`;
  if (subject === "property") return `/crm/properties/${subjectId}`;
  if (subject === "lead") return `/crm/leads/${subjectId}`;
  if (subject === "job") return `/crm/jobs/${subjectId}`;
  if (subject === "outcome") return `/crm/outcomes/${subjectId}`;
  if (subject === "campaign") return `/campaigns/${subjectId}`;
  if (subject === "approval") return `/approvals?item=${subjectId}`;
  if (subject === "agent_task") return `/agent-operations/tasks/${subjectId}`;

  return null;
}
```

- [ ] **Step 10: Run focused tests**

Run:

```powershell
pnpm test src/lib/activity/read-model.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit read-model work**

Run:

```powershell
git add -- src/lib/activity/read-model.ts src/lib/activity/read-model.test.ts
git commit -m "feat(activity): expand workspace log read model"
```

Expected: Commit includes only the two activity read-model files.

## Task 4: Add The Activity Page UI

**Files:**
- Create: `src/app/activity/page.tsx`

- [ ] **Step 1: Create the route file**

Create `src/app/activity/page.tsx` with:

```tsx
import Link from "next/link";
import { connection } from "next/server";

import { EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import {
  getRecentActivity,
  type ActivityActorType,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityQuery,
  type ActivityTone,
} from "@/lib/activity/read-model";

export const metadata = {
  title: "Activity",
};

type ActivityPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const categoryFilters: Array<{ label: string; value: ActivityCategory | "all" | "needs-review" | "humans" | "arc" }> = [
  { label: "All", value: "all" },
  { label: "Needs review", value: "needs-review" },
  { label: "Humans", value: "humans" },
  { label: "Arc", value: "arc" },
  { label: "Approvals", value: "approval" },
  { label: "Campaigns", value: "campaign" },
  { label: "CRM", value: "crm" },
  { label: "Assets", value: "asset" },
  { label: "Integrations", value: "integration" },
  { label: "Risk", value: "risk" },
];

const rangeFilters = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "All time", value: "all" },
] as const;

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  await connection();

  const params = await searchParams;
  const selectedFilter = getString(params.filter) || "all";
  const selectedRange = getString(params.range) || "7d";
  const search = getString(params.q);
  const query = buildActivityQuery(selectedFilter, selectedRange, search);
  const activity = await getRecentActivity(query);

  if (activity.status === "unavailable") {
    return (
      <>
        <ActivityHeader />
        <EmptyState title="Activity will appear once the workspace is connected" detail="The log uses workspace records, agent runs, approvals, campaigns, and CRM events." />
      </>
    );
  }

  return (
    <>
      <ActivityHeader />

      <MetricStrip
        metrics={[
          {
            label: "Needs review",
            value: activity.summary.needsReview,
            detail:
              activity.summary.needsReview > 0
                ? `${activity.summary.needsReview} ${plural(activity.summary.needsReview, "item")} waiting on a decision.`
                : "Nothing is waiting on you.",
            tone: activity.summary.needsReview > 0 ? "amber" : "green",
            href: activity.summary.needsReview > 0 ? "/activity?filter=needs-review" : undefined,
          },
          {
            label: "Arc actions",
            value: activity.summary.hermesActions,
            detail:
              activity.summary.hermesActions > 0
                ? `${activity.summary.hermesActions} ${plural(activity.summary.hermesActions, "agent action")} in this view.`
                : "No Arc work in this range.",
            tone: activity.summary.hermesActions > 0 ? "blue" : "gray",
            href: activity.summary.hermesActions > 0 ? "/activity?filter=arc" : undefined,
          },
          {
            label: "Campaign progress",
            value: activity.summary.campaignProgress,
            detail:
              activity.summary.campaignProgress > 0
                ? `${activity.summary.campaignProgress} ${plural(activity.summary.campaignProgress, "campaign update")} moved forward.`
                : "No campaign movement in this range.",
            tone: activity.summary.campaignProgress > 0 ? "green" : "gray",
            href: activity.summary.campaignProgress > 0 ? "/activity?filter=campaign" : undefined,
          },
          {
            label: "Blocked or risky",
            value: activity.summary.blockedOrRisky,
            detail:
              activity.summary.blockedOrRisky > 0
                ? `${activity.summary.blockedOrRisky} ${plural(activity.summary.blockedOrRisky, "risk")} needs a closer look.`
                : "No risk events in this range.",
            tone: activity.summary.blockedOrRisky > 0 ? "red" : "green",
            href: activity.summary.blockedOrRisky > 0 ? "/activity?filter=risk" : undefined,
          },
        ]}
      />

      <WorkspacePanel
        title="Workspace log"
        description="A plain-English record of what people, Arc, integrations, and the system have done across the workspace."
        aside={<ResultCount count={activity.entries.length} />}
      >
        <ActivityFilters selectedFilter={selectedFilter} selectedRange={selectedRange} search={search} />

        {activity.groups.length > 0 ? (
          <div className="divide-y divide-[var(--border-hairline)]">
            {activity.groups.map((group) => (
              <section key={group.label} aria-labelledby={`activity-${slug(group.label)}`}>
                <div className="bg-[var(--surface-soft)] px-5 py-3">
                  <h2 id={`activity-${slug(group.label)}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {group.label}
                  </h2>
                </div>
                <ul className="divide-y divide-[var(--border-hairline)]">
                  {group.entries.map((entry) => (
                    <ActivityRow entry={entry} key={entry.id} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="No activity found" detail="Try widening the date range or clearing a filter." />
          </div>
        )}
      </WorkspacePanel>
    </>
  );
}

function ActivityHeader() {
  return (
    <div className="mb-5">
      <PageHeader
        eyebrow="Workspace log"
        title="Activity"
        description="A clear record of human actions, Arc work, approvals, risks, and marketing progress."
      />
    </div>
  );
}

function ActivityFilters({
  selectedFilter,
  selectedRange,
  search,
}: {
  selectedFilter: string;
  selectedRange: string;
  search: string;
}) {
  return (
    <div className="space-y-3 border-b border-[var(--border-hairline)] bg-[var(--surface-panel)] px-5 py-4">
      <div className="flex flex-wrap gap-2" aria-label="Activity category filters">
        {categoryFilters.map((filter) => (
          <FilterLink
            active={selectedFilter === filter.value}
            href={activityHref({ filter: filter.value, range: selectedRange, q: search })}
            key={filter.value}
          >
            {filter.label}
          </FilterLink>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Activity date filters">
          {rangeFilters.map((range) => (
            <FilterLink
              active={selectedRange === range.value}
              href={activityHref({ filter: selectedFilter, range: range.value, q: search })}
              key={range.value}
            >
              {range.label}
            </FilterLink>
          ))}
        </div>

        <form action="/activity" className="flex min-w-0 gap-2">
          <input name="filter" type="hidden" value={selectedFilter} />
          <input name="range" type="hidden" value={selectedRange} />
          <label className="sr-only" htmlFor="activity-search">
            Search activity
          </label>
          <input
            className="min-h-11 w-full min-w-[220px] rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border-strong)]"
            defaultValue={search}
            id="activity-search"
            name="q"
            placeholder="Search activity"
            type="search"
          />
          <button className="min-h-11 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-raised)]" type="submit">
            Search
          </button>
        </form>
      </div>
    </div>
  );
}

function FilterLink({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const body = (
    <div className="grid gap-3 px-5 py-4 transition hover:bg-[var(--surface-inset)] sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ToneDot tone={entry.tone} />
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.actor}</span>
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">{actorLabel(entry.actorType)}</div>
      </div>

      <div className="min-w-0">
        <div className="font-medium leading-6 text-[var(--text-primary)]">{entry.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm leading-5 text-[var(--text-secondary)]">
          {entry.relatedLabel ? <span>{entry.relatedLabel}</span> : null}
          {entry.relatedLabel ? <span aria-hidden="true">&middot;</span> : null}
          <span>{entry.detail}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {entry.insightLabel ? <StatusPill tone={pillTone(entry.tone)}>{entry.insightLabel}</StatusPill> : null}
        <time className="text-xs font-medium text-[var(--text-muted)]" dateTime={entry.occurredAt}>
          {formatTime(entry.occurredAt)}
        </time>
      </div>
    </div>
  );

  return <li>{entry.href ? <Link href={entry.href}>{body}</Link> : body}</li>;
}

function ResultCount({ count }: { count: number }) {
  return <StatusPill tone={count > 0 ? "blue" : "gray"}>{count} shown</StatusPill>;
}

function buildActivityQuery(filter: string, range: string, search: string): ActivityQuery {
  const query: ActivityQuery = { limit: 100 };

  if (filter === "needs-review") query.search = mergeSearch(search, "Needs review");
  else if (filter === "humans") query.actorTypes = ["human"];
  else if (filter === "arc") query.actorTypes = ["arc", "sub_agent"];
  else if (isCategory(filter)) query.categories = [filter];

  const bounds = rangeBounds(range);
  query.since = bounds.since;
  query.until = bounds.until;

  if (filter !== "needs-review") query.search = search || undefined;

  return query;
}

function rangeBounds(range: string): { since?: string; until?: string } {
  if (range === "all") return {};

  const now = new Date();
  const since = new Date(now);
  if (range === "today") since.setHours(0, 0, 0, 0);
  else if (range === "30d") since.setDate(since.getDate() - 30);
  else since.setDate(since.getDate() - 7);

  return { since: since.toISOString(), until: now.toISOString() };
}

function mergeSearch(search: string, required: string): string {
  return [search, required].filter(Boolean).join(" ");
}

function isCategory(value: string): value is ActivityCategory {
  return ["approval", "campaign", "crm", "asset", "agent", "integration", "risk", "system"].includes(value);
}

function getString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function activityHref({ filter, range, q }: { filter: string; range: string; q: string }) {
  const params = new URLSearchParams();
  if (filter && filter !== "all") params.set("filter", filter);
  if (range && range !== "7d") params.set("range", range);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}

function actorLabel(actorType: ActivityActorType) {
  if (actorType === "human") return "Human";
  if (actorType === "arc") return "Arc";
  if (actorType === "sub_agent") return "Sub-agent";
  if (actorType === "integration") return "Integration";
  return "System";
}

function ToneDot({ tone }: { tone: ActivityTone }) {
  const classes: Record<ActivityTone, string> = {
    green: "bg-[var(--ok)]",
    red: "bg-[var(--priority)]",
    amber: "bg-[var(--warn)]",
    blue: "bg-[var(--accent)]",
    gray: "bg-[var(--text-muted)]",
  };

  return <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${classes[tone]}`} />;
}

function pillTone(tone: ActivityTone) {
  if (tone === "red") return "red";
  if (tone === "amber") return "amber";
  if (tone === "green") return "green";
  if (tone === "blue") return "blue";
  return "gray";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "No time";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
```

- [ ] **Step 2: Run TypeScript build to catch route/type issues**

Run:

```powershell
pnpm build
```

Expected: PASS, or fail only on a concrete TypeScript issue in the new Activity page that must be fixed before continuing.

- [ ] **Step 3: Commit page work**

Run:

```powershell
git add -- src/app/activity/page.tsx
git commit -m "feat(activity): add workspace log page"
```

Expected: Commit includes only the new route file.

## Task 5: Add Activity To The Main Navigation

**Files:**
- Modify: `src/app/_components/nav-icons.tsx`
- Modify: `src/app/_components/console-frame.tsx`

- [ ] **Step 1: Add `activity` to the nav icon union**

Change:

```ts
export type NavIconName = "campaigns" | "crm" | "outbox" | "gallery" | "arc" | "settings" | "board" | "analytics";
```

to:

```ts
export type NavIconName = "campaigns" | "crm" | "outbox" | "gallery" | "arc" | "settings" | "board" | "analytics" | "activity";
```

- [ ] **Step 2: Add the activity icon path**

In the `paths` object, add this entry after `board`:

```tsx
  // Activity pulse over timeline - workspace log
  activity: (
    <>
      <path d="M5 6.5h5" />
      <path d="M5 12h3.2l1.7-3.4 3.1 7 1.8-3.6H19" />
      <path d="M5 17.5h8" />
    </>
  ),
```

- [ ] **Step 3: Add the nav item**

In `src/app/_components/console-frame.tsx`, change the nav items to include Activity after Board:

```ts
  const navItems: ShellNavItem[] = [
    { label: agentName, href: "/arc", icon: "arc", matches: ["/arc", "/"] },
    { label: "Board", href: "/board", icon: "board", matches: ["/board"] },
    { label: "Activity", href: "/activity", icon: "activity", matches: ["/activity"] },
    { label: "Campaigns", href: "/campaigns", icon: "campaigns", matches: ["/campaigns"] },
    { label: "Analytics", href: "/analytics", icon: "analytics", matches: ["/analytics"] },
  ];
```

- [ ] **Step 4: Run build**

Run:

```powershell
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit nav work**

Run:

```powershell
git add -- src/app/_components/nav-icons.tsx src/app/_components/console-frame.tsx
git commit -m "feat(activity): add workspace log navigation"
```

Expected: Commit includes only the two nav files.

## Task 6: Verification And Browser Smoke

**Files:**
- Verify only; no edits unless failures point to the Activity implementation.

- [ ] **Step 1: Run focused Activity tests**

Run:

```powershell
pnpm test src/lib/activity/read-model.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```powershell
pnpm test
```

Expected: PASS. If unrelated pre-existing tests fail, capture the failing file/test names and confirm they are unrelated before proceeding.

- [ ] **Step 3: Run production build**

Run:

```powershell
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Start the dev server if one is not already running**

Run:

```powershell
pnpm dev
```

Expected: The server starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 5: Browser smoke `/activity`**

Open `/activity` in the browser.

Expected:

- The Activity nav item is visible and active.
- The page title is `Activity`.
- Four summary modules render.
- Filter chips render.
- Search input renders with accessible label.
- Timeline rows render when data exists.
- Empty or unavailable state is clear when no data exists.
- No raw IDs, JSON, table names, or enum strings appear in the main feed.

- [ ] **Step 6: Browser smoke filters**

Open these URLs:

```text
/activity?filter=arc
/activity?filter=risk
/activity?range=today
/activity?q=campaign
```

Expected:

- The selected filter appears active.
- The page remains readable.
- Empty results show `No activity found`.
- No layout overlap appears on desktop width.

- [ ] **Step 7: Final git status**

Run:

```powershell
git status --short --branch
```

Expected: Only unrelated pre-existing worktree changes remain. The Activity implementation files should be committed.

## Implementation Notes

- Keep the route read-only. Do not add server actions.
- Keep filters server-rendered through query params.
- Prefer current app primitives over new abstractions.
- Do not nest panels.
- Do not add charting, drawers, exports, or real-time updates in v1.
- Do not fake activity data when Supabase is unavailable.
- Preserve unrelated worktree changes.

## Self-Review

Spec coverage:

- Plain-English readable rows: Task 3 mapper changes and Task 4 `ActivityRow`.
- Human/Arc/integration/system actors: Task 3 actor fields and Task 4 row labels.
- Summary tiles: Task 3 `buildActivitySummary` and Task 4 `MetricStrip`.
- Filters/search/date range: Task 3 `applyActivityFilters` and Task 4 `ActivityFilters`.
- Timeline grouped by day: Task 3 `groupActivityEntriesByDay` and Task 4 grouped rendering.
- Empty/unavailable states: Task 4.
- Nav discoverability: Task 5.
- Tests and verification: Tasks 2, 3, and 6.

Red-flag scan:

- The plan contains no incomplete work markers or vague test directives.

Type consistency:

- `ActivityEntry`, `ActivityQuery`, `ActivitySummary`, `ActivityDayGroup`, `ActivityActorType`, `ActivityCategory`, and `ActivityTone` are defined before use.
- `applyActivityFilters`, `buildActivitySummary`, `groupActivityEntriesByDay`, and `mapEvent` are introduced in tests before implementation and then exported by the read model.
