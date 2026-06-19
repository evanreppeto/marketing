# Arc Campaign → Chat Project Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Arc creates/works-in a campaign inside a chat, auto-create a project for that chat (reuse if it already has one) and set the conversation's `project_id` + `campaign_id`.

**Architecture:** Thread `conversationId` from the runner into the `draft-asset` flow; the route best-effort-calls a new `linkConversationToCampaign` persistence helper that creates a project (if the conversation has none) and links the conversation to the project + campaign. No schema change. Opportunity-draft wakes excluded.

**Tech Stack:** TypeScript, Vitest, Next.js 16, `@anthropic-ai/claude-agent-sdk` tools.

**Test commands:** app — `pnpm test <path>`; runner — `pnpm --filter @bsr/arc-runner exec vitest run <path>`.

**Verified facts:** `createProject({operator, name}, client?)` and `getConversation(id, client?)` exist in `src/lib/arc-chat/persistence.ts`. `ArcConversation` has `operator`, `projectId`, `campaignId`. The `draft-asset` route already extracts fields with a local `str()` helper and best-effort-calls `markOpportunityDrafted(...).catch(...)`. `create_campaign_draft` (drafts.ts) posts `{ ...args, ...(ctx.opportunityId ? {opportunity_id} : {}) }`; `generate_image`/`generate_video` (media.ts) post the campaign fields without opportunity/conversation. Runner `ToolContext = { opportunityId?, level? }`; `runArcTurn` sets `toolContext: { level: payload.route, ... }`.

---

## File Structure
- `src/lib/arc-chat/persistence.ts` — add `linkConversationToCampaign`. (+ test)
- `src/app/api/v1/arc/campaigns/draft-asset/route.ts` — accept `conversation_id`, best-effort link. (+ test update)
- `apps/arc-runner/src/tools/index.ts` — `ToolContext.conversationId`. (modify)
- `apps/arc-runner/src/arc.ts` — thread `payload.conversationId` (runArcTurn only). (modify)
- `apps/arc-runner/src/tools/drafts.ts` + `tools/media.ts` — include `conversation_id`. (modify; + test)

---

## Task 1: `linkConversationToCampaign` persistence helper

**Files:** Modify `src/lib/arc-chat/persistence.ts`; test in the existing persistence test dir (find where `persistence.test.ts` lives — likely `src/lib/arc-chat/persistence.test.ts`; add a `describe` there, mirroring its Supabase-mock style).

- [ ] **Step 1: Read the conversation persistence to confirm `ArcConversation` field names**

Run: `rg -n "type ArcConversation|operator|projectId|campaignId" src/lib/arc-chat/persistence.ts | head`
Confirm `ArcConversation` has `operator: string`, `projectId: string | null`, `campaignId: string | null`. (If names differ, adapt the helper below.)

- [ ] **Step 2: Write the failing test**

Add to the persistence test file a `describe("linkConversationToCampaign", ...)`. Use the file's existing Supabase-mock helper (mirror how other persistence tests fake the client). The three cases:

```typescript
// Pseudocode shape — adapt to the file's existing mock style.
describe("linkConversationToCampaign", () => {
  it("creates a project (named after the campaign) and links it when the conversation has none", async () => {
    // getConversation -> { operator:"ev", projectId:null, campaignId:null }
    // createProject -> { id:"p1", ... }
    // expect arc_conversations update called with { project_id:"p1", campaign_id:"c1" } where id="conv1"
  });
  it("reuses the existing project (no createProject) and still sets campaign_id", async () => {
    // getConversation -> { operator:"ev", projectId:"pExisting", campaignId:null }
    // expect NO createProject; update with { project_id:"pExisting", campaign_id:"c1" }
  });
  it("no-ops when the conversation is not found", async () => {
    // getConversation -> null; expect no createProject, no update
  });
});
```

If mocking the chained Supabase client in that file is heavy, instead inject seams: the helper takes `client` — pass a hand-rolled fake exposing `.from().update().eq()` and have `getConversation`/`createProject` exercised through it. Match whatever the existing persistence tests already do.

- [ ] **Step 3: Run → FAIL** (`pnpm test src/lib/arc-chat/persistence.test.ts`).

- [ ] **Step 4: Add the helper** to `src/lib/arc-chat/persistence.ts` (near `createProject`/`getConversation`):

```typescript
/**
 * Link a conversation to the campaign it's working on, ensuring it has a project.
 * Creates a project (named after the campaign) only when the conversation has
 * none — otherwise reuses the existing one. Always sets campaign_id to the worked
 * campaign. No-op if the conversation no longer exists.
 */
export async function linkConversationToCampaign(
  conversationId: string,
  campaignId: string,
  projectName: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const conversation = await getConversation(conversationId, client);
  if (!conversation) return;

  let projectId = conversation.projectId;
  if (!projectId) {
    const project = await createProject({ operator: conversation.operator, name: projectName }, client);
    projectId = project.id;
  }

  const { error } = await client
    .from("arc_conversations")
    .update({ project_id: projectId, campaign_id: campaignId })
    .eq("id", conversationId);
  assertOk("arc_conversations link campaign", error);
}
```

- [ ] **Step 5: Run → PASS.**
- [ ] **Step 6: Commit** — `git add src/lib/arc-chat/persistence.ts src/lib/arc-chat/persistence.test.ts && git commit -m "feat(arc): linkConversationToCampaign — ensure chat project + set campaign"`

---

## Task 2: `draft-asset` route — accept `conversation_id`, best-effort link

**Files:** Modify `src/app/api/v1/arc/campaigns/draft-asset/route.ts`; update `route.test.ts`.

- [ ] **Step 1: Add the test cases** to `src/app/api/v1/arc/campaigns/draft-asset/route.test.ts`

At the top, mock the new helper alongside the existing mocks:
```typescript
vi.mock("@/lib/arc-chat/persistence", () => ({ linkConversationToCampaign: vi.fn(async () => undefined) }));
import { linkConversationToCampaign } from "@/lib/arc-chat/persistence";
const linkMock = vi.mocked(linkConversationToCampaign);
```
Reset it in `beforeEach` (`linkMock.mockReset(); linkMock.mockResolvedValue(undefined);`). Add cases:
```typescript
  it("links the conversation to the campaign when conversation_id is provided", async () => {
    configure();
    await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Hi", conversation_id: "conv1" }));
    expect(linkMock).toHaveBeenCalledWith("conv1", "camp_existing", expect.any(String));
  });
  it("does not link when conversation_id is absent", async () => {
    configure();
    await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Hi" }));
    expect(linkMock).not.toHaveBeenCalled();
  });
  it("still returns 201 when linking throws", async () => {
    configure();
    linkMock.mockRejectedValue(new Error("boom"));
    const res = await POST(req("Bearer secret", { campaign_id: "camp_existing", asset_type: "email", title: "Hi", conversation_id: "conv1" }));
    expect(res.status).toBe(201);
  });
```

- [ ] **Step 2: Run → FAIL** (`pnpm test src/app/api/v1/arc/campaigns/draft-asset/route.test.ts`).

- [ ] **Step 3: Edit the route** (`draft-asset/route.ts`)

(a) Add the import:
```typescript
import { linkConversationToCampaign } from "@/lib/arc-chat/persistence";
```
(b) Near the other field extractions (where `opportunityId` is read), add:
```typescript
  const conversationId = str(body.conversation_id) || null;
```
(c) After the asset is created and `campaignId` is known (near the existing `if (opportunityId) { await markOpportunityDrafted(...).catch(...) }`), add a sibling best-effort link:
```typescript
  if (conversationId) {
    // Organize the chat: ensure it has a project and points at this campaign.
    // Best-effort — a link hiccup must not turn a successful 201 into a 502.
    await linkConversationToCampaign(conversationId, campaignId, str(body.name) || "Campaign workspace").catch(() => undefined);
  }
```
(Use the route's existing `str()` helper. `campaignId` is the resolved id in scope at that point; `str(body.name)` is the new-campaign name, falling back to a generic project title for the attach-to-existing case.)

- [ ] **Step 4: Run → PASS** (new cases + existing draft-asset tests).
- [ ] **Step 5: Commit** — `git add src/app/api/v1/arc/campaigns/draft-asset && git commit -m "feat(arc): draft-asset links the chat to a project+campaign (best-effort)"`

---

## Task 3: Runner — thread `conversationId` into the draft tools

**Files:** Modify `apps/arc-runner/src/tools/index.ts`, `arc.ts`, `tools/drafts.ts`, `tools/media.ts`; test in `tools/drafts.test.ts` (+ media if it has one).

- [ ] **Step 1: Add a failing test** in `apps/arc-runner/src/tools/drafts.test.ts`

Add a case asserting `create_campaign_draft` forwards `conversation_id` from ctx (mirror the file's existing handler-invocation style):
```typescript
  it("forwards conversation_id from ctx to the draft-asset route", async () => {
    const client = { apiPost: vi.fn(async () => ({ campaignId: "c1", assetId: "a1" })) } as unknown as ArcClient;
    const tools = /* build draftWorkProductTools(client, noStep, () => {}, { conversationId: "conv1" }) and pick create_campaign_draft */;
    await /* invoke create_campaign_draft handler with { asset_type:"email", title:"x", campaign_id:"c1" } */;
    expect(client.apiPost).toHaveBeenCalledWith(
      "/api/v1/arc/campaigns/draft-asset",
      expect.objectContaining({ conversation_id: "conv1" }),
    );
  });
```
(Read the existing `drafts.test.ts` for how it constructs the tools + invokes handlers, and match it.)

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @bsr/arc-runner exec vitest run src/tools/drafts.test.ts`).

- [ ] **Step 3: Add `conversationId` to `ToolContext`** (`tools/index.ts`)

```typescript
export type ToolContext = { opportunityId?: string; level?: "fast" | "standard"; conversationId?: string };
```

- [ ] **Step 4: Thread it in `arc.ts`**

In `runArcTurn`, the `runArcQuery({... toolContext: { level: payload.route } ...})` call → set:
```typescript
    toolContext: { level: payload.route, conversationId: payload.conversationId },
```
Leave `runArcOpportunityDraft` unchanged (its `toolContext` is `{ opportunityId: ... }` with no `conversationId` — opportunity drafts must NOT create chat projects).

- [ ] **Step 5: Forward `conversation_id` in the tools**

In `tools/drafts.ts`, the `create_campaign_draft` apiPost body currently is `{ ...args, ...(ctx.opportunityId ? { opportunity_id: ctx.opportunityId } : {}) }`. Add the conversation spread:
```typescript
          { ...args, ...(ctx.opportunityId ? { opportunity_id: ctx.opportunityId } : {}), ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}) },
```
In `tools/media.ts`, widen `mediaTools`' `ctx` param type to include `conversationId?: string` (it's currently `{ level?: "fast" | "standard" }`), and add `conversation_id: ctx.conversationId` to BOTH the `generate_image` and `generate_video` `apiPost("/api/v1/arc/campaigns/draft-asset", {...})` bodies, guarded `...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {})`.

- [ ] **Step 6: Run the test → PASS** + typecheck

`pnpm --filter @bsr/arc-runner exec vitest run src/tools/drafts.test.ts` → PASS.
`pnpm --filter @bsr/arc-runner typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add apps/arc-runner/src/tools/index.ts apps/arc-runner/src/arc.ts apps/arc-runner/src/tools/drafts.ts apps/arc-runner/src/tools/drafts.test.ts apps/arc-runner/src/tools/media.ts
git commit -m "feat(arc): thread conversationId into campaign draft tools (chat wakes only)"
```

---

## Task 4: Sweep + build

- [ ] **Step 1: App tests** — `pnpm test src/lib/arc-chat/persistence.test.ts src/app/api/v1/arc/campaigns/draft-asset` → pass.
- [ ] **Step 2: Runner suite** — `pnpm --filter @bsr/arc-runner test` → pass (drafts + existing). If `index.test.ts` snapshots `ToolContext` shape or tool counts, it shouldn't change (no tool added) — but re-run to confirm.
- [ ] **Step 3: Build** — `pnpm build` → succeeds (`pnpm install` first if deps missing). Fix only feature-caused failures.
- [ ] **Step 4: Final commit (if fixups)** — `git add -A && git commit -m "test(arc): campaign-project-link verification fixups"`
- [ ] **Step 5: Manual smoke (post-deploy)** — in a chat with "No project", tell Arc to draft a campaign → confirm the chat's project selector now shows a project named after the campaign, and the chat is linked to that campaign. Draft a second campaign in the same chat → project unchanged (reused).

---

## Self-Review (plan author)

- **Spec coverage:** persistence helper (create-if-none, reuse, set campaign_id, no-op on missing) → Task 1; route accepts `conversation_id` + best-effort link → Task 2; runner threads conversationId for chat wakes only + both draft + media tools forward it → Task 3; sweep/build/manual → Task 4. All spec sections covered.
- **Placeholder scan:** the Task 1/Task 3 test blocks are pseudocode-shaped with explicit "match the existing mock/handler style" instructions (the persistence + tool test files have established, idiosyncratic mock harnesses — the implementer must mirror them rather than copy a guessed shape). All production code is exact. Step 1 of Task 1 is a verification of `ArcConversation` field names before relying on them.
- **Type consistency:** `linkConversationToCampaign(conversationId, campaignId, projectName, client?)` is called by the route (Task 2c) with `(conversationId, campaignId, str(body.name) || "Campaign workspace")` — arg order matches. `createProject({operator, name})` (not `title`) used correctly. `ToolContext.conversationId` (Task 3) is set in `arc.ts` and read in drafts.ts/media.ts. `payload.conversationId` exists on `MarkChatMessagePayload`.
- **Safety:** best-effort link (`.catch`) never fails the 201; opportunity drafts excluded (no conversationId threaded); reuse-if-present (project created only when `projectId` null); no schema change.
```
