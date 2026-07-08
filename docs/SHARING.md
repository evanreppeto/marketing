# Chats & Campaigns — Ownership + Sharing

Status: chats done (backend + actions), UI + campaigns pending · Last updated: 2026-07-08

## The short version

- **Chats are already per-person.** Every Arc conversation has an `owner_id`; new
  chats are private to their creator by default.
- **Chats are already fully shareable — on the backend.** Visibility, workspace
  permission, per-member direct shares, and project-cascade sharing all exist. The
  only missing piece was the UI glue, now filled by server actions (below).
- **Campaigns are NOT shared per-member yet** — they're workspace/org-scoped only.
  Extending the same sharing model to campaigns is the remaining backend work.

## Chats — the model (built)

Per-conversation columns (`arc_conversations`, migration `20260623090000`):
- `owner_id` — the creator (per-person ownership).
- `visibility` — `private` | `workspace`.
- `workspace_permission` — `view` | `collaborate` (what workspace members get when
  visibility is `workspace`).
- Direct shares — `arc_conversation_shares(conversation_id, user_id, permission)`.
- Project cascade — a chat in a shared project inherits the project's grant
  (`arc_project_shares`).

Access resolution is pure + centralized: `resolveResourceAccess` (`src/domain/arc-sharing.ts`)
combines owner / workspace-member / direct-share / inherited-share into an
`AccessDecision`. Enforced only in **supabase auth mode**; open/dev mode is
intentionally wide open (matches `requireOperator()`), so sharing can't be
exercised in the offline preview.

Read/write lib (`src/lib/arc-chat/sharing.ts`, all pre-existing):
`getShareViewer`, `listConversationsForViewer`, `resolveConversationAccess`,
`assertConversationAccess`, `setConversationVisibility`, `shareConversation`,
`unshareConversation`, `listConversationShares`.

### Shipped this pass — the UI glue
`src/app/(app)/arc/sharing-actions.ts` — operator-gated server actions over the
above: `setChatSharingAction` (visibility + workspace permission),
`shareChatWithMemberAction`, `unshareChatMemberAction`, `listChatSharesAction`.
Each requires `assertConversationAccess("collaborate")` so only someone who can
already collaborate may change who else has access.

### Shipped — the Share dialog
A **Share dialog** in the Arc composer (`arc-view.tsx` → `ShareDialog`, opened from
a "Share" pill): visibility toggle (Private ↔ Workspace), workspace permission
(View / Collaborate), and a member picker driven by
`getChatSharingStateAction(conversationId)` — which returns current visibility, the
members already shared with (+ their permission, removable), and the remaining
workspace members to add. Wired to `setChatSharingAction` /
`shareChatWithMemberAction` / `unshareChatMemberAction`. Verified rendering +
interactions in the preview; **enforcement + real membership only exist in supabase
auth mode** (open-mode preview shows the chrome and the actions no-op).

Open refinement: restrict re-sharing to the **owner** specifically (today
`collaborate` is required; the model's max permission is `collaborate`, so owner-only
would need an explicit `owner_id === viewer` check).

## Campaigns — the plan (not built)

Campaigns today carry `org_id`/`workspace_id` only — no per-person owner, no
per-member sharing. To match chats:

1. **Schema** (new migration): add `owner_id`, `visibility`, `workspace_permission`
   to the campaigns table + a `campaign_shares(campaign_id, user_id, permission,
   shared_by)` table. ⚠️ Rides the migration pipeline — see the blocker below.
2. **Domain reuse**: campaigns become another `ShareableResource`; reuse
   `resolveResourceAccess` verbatim (it's resource-agnostic). Add
   `resolveCampaignAccess` / `assertCampaignAccess` mirroring the conversation
   helpers.
3. **Read model**: filter campaign lists through the viewer (owned / shared /
   workspace-visible), like `listConversationsForViewer`.
4. **Actions + UI**: the same share dialog, generalized over `{ kind: "chat" |
   "campaign", id }`.

> ⚠️ **Migration blocker (prerequisite for campaign sharing).** The 74-migration
> chain does not apply cleanly to a fresh DB (four duplicate version prefixes +
> an `org_id` ordering error — see the chat-compaction memory). Any new sharing
> migration inherits that broken pipeline, so this should be fixed first — and
> carefully, since renaming shipped migrations can desync prod's `schema_migrations`.
