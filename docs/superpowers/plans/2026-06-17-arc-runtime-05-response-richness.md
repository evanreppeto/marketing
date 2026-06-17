# Arc Runtime — Plan 5: Response richness (packages, suggestions, sources, media field)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Arc's chat replies look like the rich demo — multi-asset **campaign-package decks**, **follow-up suggestion** chips, and a **"Sources Arc used"** chip row — instead of plain text + one card. Mostly additive; the app already renders all of it.

**Architecture:** The app renders `metadata.suggestions` (chips), the message `mentions` column (the "Sources Arc used" row), and card `media` (thumbnail + provenance/format/risk). Today the runner emits none of these. This plan: (1) a tiny app change so the reply endpoint accepts `mentions`; (2) two new runner tools (`suggest_followups`, `cite_sources`) plus a `media` field on `emit_card`, fed through a per-turn **sink**; (3) `runArcTurn` returns `{ body, actions, suggestions, sources }`, posted on the reply; (4) prompt guidance to assemble full packages (≥2 cards → deck), cite sources, and offer suggestions.

**Tech Stack:** Next.js route + Supabase (app); TypeScript + Claude Agent SDK + Zod + Vitest (runner).

Plan 5 of the Arc runtime. Phase 1 (1–3) + Plan 4 merged.

**Scope note:** real card **thumbnails** need image/video URLs Arc doesn't have until the media-generation project (separate, flagged). This plan adds the `media` *field* so cards are thumbnail-ready and Arc can attach real BSR media URLs when it has them; text-only deck cards already render richly (channel + copy snippet). Multi-card packaging is delivered here via prompting + the existing deck renderer.

---

## File Structure
**App (`src/`):**
- Modify `src/lib/arc-chat/persistence.ts` — `completeArcMessage` accepts optional `mentions` and writes the `mentions` column.
- Modify `src/app/api/v1/arc/messages/route.ts` — the POST reads `body.mentions`, validates with `parseMentions`, passes through.
- Modify `src/lib/arc-chat/persistence.test.ts` (or add) — assert `completeArcMessage` writes mentions. (Light; mirror existing tests.)

**Runner (`apps/arc-runner/`):**
- Modify `src/helpers`? No — add `TurnSink` to `src/tools/helpers.ts`.
- Create `src/tools/reply-meta.ts` — `suggestFollowupsTool(addSuggestion)` + `citeSourcesTool(addSource)`.
- Create `src/tools/reply-meta.test.ts`.
- Modify `src/tools/cards.ts` — add `media` to `emit_card`'s schema + output.
- Modify `src/tools/cards.test.ts` — cover media.
- Modify `src/types.ts` — add `ArcMedia` + `ArcMention` types; `ArcActionCard.media?`.
- Modify `src/tools/index.ts` — `toolsForMode(mode, client, step, sink)` (sink replaces the bare `collectCard`); add the two reply-meta tools to the read tier.
- Modify `src/tools/index.test.ts` — sink + new tool names.
- Modify `src/arc.ts` — build the sink; return `{ body, actions, suggestions, sources }`.
- Modify `src/arc-client.ts` — `postChatReply` accepts `suggestions` + `mentions`.
- Modify `src/handler.ts` — pass them through.
- Modify `src/prompt.ts` — packages + cite + suggest guidance.

---

## Task 1: App — accept `mentions` on Arc's reply

**Files:** `src/lib/arc-chat/persistence.ts`, `src/app/api/v1/arc/messages/route.ts`

- [ ] **Step 1: `completeArcMessage` accepts mentions.** Read the current function. Extend its input to `{ messageId, body, metadata?, mentions? }` where `mentions?: ArcMention[]`, and include `mentions` in the `.update({...})` **only when provided** (so existing callers that omit it don't overwrite). Concretely:

```ts
export async function completeArcMessage(
  input: { messageId: string; body: string; metadata?: Record<string, unknown>; mentions?: ArcMention[] },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const update: Record<string, unknown> = {
    body: input.body,
    status: "complete",
    metadata: input.metadata ?? {},
  };
  if (input.mentions !== undefined) update.mentions = input.mentions;
  const { error } = await client.from("arc_messages").update(update).eq("id", input.messageId);
  assertOk("arc_messages complete", error);
}
```

Ensure `ArcMention` is imported (it's already used in this file via `parseMentions`/the `Mark/ArcMessage` type — confirm the import; add `type ArcMention` to the existing `@/domain` import if needed).

- [ ] **Step 2: POST route reads mentions.** In `src/app/api/v1/arc/messages/route.ts`, where it builds the `completeArcMessage` call, parse and pass mentions. Add `parseMentions` to the domain import, then:

```ts
const mentions = parseMentions((body as { mentions?: unknown }).mentions);
await completeArcMessage({ messageId: pending.id, body: replyBody.trim(), metadata, mentions });
```

(`parseMentions` returns `[]` for absent/malformed input, so passing it always is safe — and `[]` would set an empty mentions array. To avoid clobbering with `[]` when the runner sends none, only pass mentions when the raw field is present: `const rawMentions = (body as {mentions?: unknown}).mentions; ... completeArcMessage({ ..., ...(rawMentions !== undefined ? { mentions: parseMentions(rawMentions) } : {}) })`.)

- [ ] **Step 3: Test.** Add/extend a persistence test asserting `completeArcMessage` writes `mentions` when given and omits the key when not. Mirror the existing `persistence.test.ts` Supabase-client mock pattern (read it first). Keep assertions real.

- [ ] **Step 4: Verify + commit.** `pnpm exec tsc --noEmit` + `pnpm test src/lib/arc-chat` → PASS.
```
git add src/lib/arc-chat/persistence.ts src/app/api/v1/arc/messages/route.ts src/lib/arc-chat/persistence.test.ts
git commit -m "feat(arc-api): accept mentions on Arc reply (Sources Arc used)"
```

---

## Task 2: Runner types — `ArcMedia` + `ArcMention`

**Files:** `apps/arc-runner/src/types.ts`

- [ ] **Step 1:** Append to `types.ts` (mirrors the app's `src/domain/arc-chat.ts`):

```ts
/** A record Arc referenced — renders in the "Sources Arc used" row. */
export type ArcMention = { type: string; id: string; label: string; href: string };

/** Media attached to a card (thumbnail + provenance). url is required. */
export type ArcMedia = {
  kind: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  poster?: string;
  caption?: string;
  alt?: string;
  href?: string;
  source?: "bsr_real" | "ai_generated" | "composite" | "stock" | "external";
  sourceId?: string;
  jobId?: string;
  model?: string;
  format?: string;
  status?: "draft" | "revision" | "approved" | "rejected";
  riskFlags?: string[];
};
```

Then add `media?: ArcMedia;` to the existing `ArcActionCard` type (after `approval?`).

> Note: `types.ts` already declares `MarkMention = { type; id; label; href }` (used by the wake payload). `ArcMention` is the same shape but named for the reply/sources direction — keep both for clarity, or alias `export type ArcMention = MarkMention;`. Either is fine; the alias avoids duplication.

- [ ] **Step 2:** Typecheck → PASS. Commit: `git add apps/arc-runner/src/types.ts && git commit -m "feat(arc-runner): ArcMedia + ArcMention types; card media field"`

---

## Task 3: Per-turn sink + reply-meta tools (`suggest_followups`, `cite_sources`)

**Files:** `apps/arc-runner/src/tools/helpers.ts`, `apps/arc-runner/src/tools/reply-meta.ts` (+ test)

- [ ] **Step 1: Add `TurnSink` to `helpers.ts`** (append):

```ts
import type { ArcActionCard, ArcMention } from "../types";

/** Per-turn collectors for everything Arc attaches to its reply beyond text. */
export type TurnSink = {
  card: (card: ArcActionCard) => void;
  suggestion: (text: string) => void;
  source: (mention: ArcMention) => void;
};
```

- [ ] **Step 2: Write the failing test** `apps/arc-runner/src/tools/reply-meta.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ArcMention } from "../types";
import { citeSourcesTool, suggestFollowupsTool } from "./reply-meta";

function loose(tool: ReturnType<typeof suggestFollowupsTool>) {
  return (args: Record<string, unknown>) =>
    (tool.handler as (a: Record<string, unknown>, e?: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>)(args);
}

describe("suggest_followups", () => {
  it("collects up to 4 follow-up prompts", async () => {
    const out: string[] = [];
    const tool = suggestFollowupsTool((s) => out.push(s));
    expect(tool.name).toBe("suggest_followups");
    await loose(tool)({ prompts: ["a", "b", "c", "d", "e"] });
    expect(out).toEqual(["a", "b", "c", "d"]); // capped at 4
  });
});

describe("cite_sources", () => {
  it("collects sources as mentions", async () => {
    const out: ArcMention[] = [];
    const tool = citeSourcesTool((m) => out.push(m));
    expect(tool.name).toBe("cite_sources");
    await loose(tool)({
      sources: [{ type: "lead", id: "L1", label: "Dana Kasprak", href: "/crm/leads/L1" }],
    });
    expect(out).toEqual<ArcMention[]>([{ type: "lead", id: "L1", label: "Dana Kasprak", href: "/crm/leads/L1" }]);
  });
});
```

- [ ] **Step 3: Run → FAIL.** `pnpm --filter @bsr/arc-runner test`

- [ ] **Step 4: Implement `reply-meta.ts`:**

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import type { ArcMention } from "../types";
import { textResult } from "./helpers";

/** Propose 1–4 follow-up prompts; the app renders them as clickable chips. */
export function suggestFollowupsTool(addSuggestion: (text: string) => void) {
  return tool(
    "suggest_followups",
    "Offer 1–4 short, concrete next-step prompts the operator can tap to continue (e.g. 'Draft an SMS variant', 'Find more flood-zone landlords'). Call once near the end of your reply.",
    { prompts: z.array(z.string()).describe("1–4 short next-step prompts") },
    async (args) => {
      const kept = args.prompts.map((p) => p.trim()).filter(Boolean).slice(0, 4);
      for (const p of kept) addSuggestion(p);
      return textResult(`Suggested ${kept.length} follow-up(s).`);
    },
  );
}

/** Record the CRM/brain/campaign records you used; they render as "Sources Arc used". */
export function citeSourcesTool(addSource: (mention: ArcMention) => void) {
  return tool(
    "cite_sources",
    "Cite the records you used to answer (leads, companies, contacts, campaigns, etc.) so the operator sees your sources. Provide each as { type, id, label, href } using the record's real id and a link like /crm/leads/<id> or /campaigns/<id>.",
    {
      sources: z
        .array(
          z.object({
            type: z.string().describe("lead | company | contact | property | job | outcome | campaign | persona"),
            id: z.string(),
            label: z.string(),
            href: z.string(),
          }),
        )
        .describe("The records you referenced"),
    },
    async (args) => {
      for (const s of args.sources) addSource({ type: s.type, id: s.id, label: s.label, href: s.href });
      return textResult(`Cited ${args.sources.length} source(s).`);
    },
  );
}
```

- [ ] **Step 5: Run → PASS.** Commit: `git add apps/arc-runner/src/tools/helpers.ts apps/arc-runner/src/tools/reply-meta.ts apps/arc-runner/src/tools/reply-meta.test.ts && git commit -m "feat(arc-runner): suggest_followups + cite_sources tools"`

---

## Task 4: `emit_card` gains `media`

**Files:** `apps/arc-runner/src/tools/cards.ts`, `apps/arc-runner/src/tools/cards.test.ts`

- [ ] **Step 1:** In `cards.ts`, add a `media` field to the zod schema and pass it through. Add to the schema object:

```ts
      media: z
        .object({
          kind: z.enum(["image", "video"]),
          url: z.string(),
          alt: z.string().optional(),
          source: z.enum(["bsr_real", "ai_generated", "composite", "stock", "external"]).optional(),
          format: z.string().optional(),
          status: z.enum(["draft", "revision", "approved", "rejected"]).optional(),
          riskFlags: z.array(z.string()).optional(),
          sourceId: z.string().optional(),
          jobId: z.string().optional(),
          model: z.string().optional(),
          caption: z.string().optional(),
        })
        .optional()
        .describe("Thumbnail + provenance. Use real BSR media URLs (source:'bsr_real') when you have them; never invent a url."),
```

and in the built card object add: `...(args.media ? { media: args.media } : {})`.

Update the tool description to mention: "Attach `media` (with a real url) to show a thumbnail + provenance badge."

- [ ] **Step 2:** Add a test in `cards.test.ts`:

```ts
  it("passes through a media block", async () => {
    const { cards, call } = collectorAndTool();
    await call({
      kind: "draft",
      title: "Real proof",
      media: { kind: "image", url: "https://x/y.jpg", source: "bsr_real", format: "1:1" },
    });
    expect(cards[0].media).toEqual({ kind: "image", url: "https://x/y.jpg", source: "bsr_real", format: "1:1" });
  });
```

- [ ] **Step 3:** Typecheck + test → PASS. Commit: `git add apps/arc-runner/src/tools/cards.ts apps/arc-runner/src/tools/cards.test.ts && git commit -m "feat(arc-runner): emit_card media field (thumbnail + provenance)"`

---

## Task 5: Thread the sink through the assembler

**Files:** `apps/arc-runner/src/tools/index.ts`, `apps/arc-runner/src/tools/index.test.ts`

- [ ] **Step 1: `index.ts`.** Replace the `collectCard` param with a `TurnSink`, and add the two reply-meta tools to the read tier.

Imports:
```ts
import { suggestFollowupsTool, citeSourcesTool } from "./reply-meta";
import type { StepFn, TurnSink } from "./helpers";
```
(Drop the standalone `ArcActionCard` import if now unused — keep it if `draftTools`/`readTools` still reference it.)

`readTools` takes the sink:
```ts
function readTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [
    ...crmReadTools(client, step),
    ...brainReadTools(client, step),
    ...campaignReadTools(client, step),
    emitCardTool(sink.card),
    suggestFollowupsTool(sink.suggestion),
    citeSourcesTool(sink.source),
  ];
}
```

`draftTools` uses `sink.card`:
```ts
function draftTools(client: ArcClient, step: StepFn, sink: TurnSink) {
  return [...draftWorkProductTools(client, step, sink.card)];
}
```

`toolsForMode`:
```ts
export function toolsForMode(mode: ArcMode, client: ArcClient, step: StepFn, sink: TurnSink) {
  const read = readTools(client, step, sink);
  if (mode === "ask") return [...read];
  const write = writeTools(client, step);
  if (mode === "act") return [...read, ...write];
  return [...read, ...write, ...draftTools(client, step, sink)];
}
```

`allowedToolNames` builds a noop sink:
```ts
export function allowedToolNames(mode: ArcMode): string[] {
  const noop = (async () => {}) as StepFn;
  const placeholder = {} as ArcClient;
  const sink: TurnSink = { card: () => {}, suggestion: () => {}, source: () => {} };
  return toolsForMode(mode, placeholder, noop, sink).map((t) => `mcp__arc__${t.name}`);
}
```

- [ ] **Step 2: `index.test.ts`.** Replace the `collect` stub with a sink, add `suggest_followups` + `cite_sources` to `READ`, and update all `toolsForMode(...)` calls.

```ts
const sink = { card: () => {}, suggestion: () => {}, source: () => {} };
```
Add `"suggest_followups", "cite_sources"` to the `READ` array. Replace every `toolsForMode(mode, stubClient, step, collect)` with `toolsForMode(mode, stubClient, step, sink)`.

- [ ] **Step 3:** Typecheck + test → PASS (note: `arc.ts` will now fail typecheck on the old 4th arg — fixed in Task 6; confirm the only error is in `arc.ts`). Commit: `git add apps/arc-runner/src/tools/index.ts apps/arc-runner/src/tools/index.test.ts && git commit -m "feat(arc-runner): turn sink (cards + suggestions + sources) in assembler"`

---

## Task 6: `runArcTurn` returns suggestions + sources; handler + client post them

**Files:** `apps/arc-runner/src/arc.ts`, `apps/arc-runner/src/arc-client.ts`, `apps/arc-runner/src/handler.ts`

- [ ] **Step 1: `arc.ts`.** Build the sink and extend the result.

Import `ArcMention` (and keep `ArcActionCard`): `import type { ArcActionCard, ArcMention, MarkChatMessagePayload } from "./types";`

Extend the result type:
```ts
export type ArcTurnResult = { body: string; actions: ArcActionCard[]; suggestions: string[]; sources: ArcMention[] };
```

Replace the collector block with:
```ts
  const actions: ArcActionCard[] = [];
  const suggestions: string[] = [];
  const sources: ArcMention[] = [];
  const sink = {
    card: (card: ArcActionCard) => actions.push(card),
    suggestion: (text: string) => suggestions.push(text),
    source: (mention: ArcMention) => sources.push(mention),
  };
```

Tool list line → `const tools = toolsForMode(payload.mode, client, step, sink);`

Return → `return { body: (resultText || assistantText).trim(), actions, suggestions: suggestions.slice(0, 4), sources };`

- [ ] **Step 2: `arc-client.ts`.** `postChatReply` accepts `suggestions` + `mentions` and includes them. Extend `ChatReplyInput`:
```ts
export type ChatReplyInput = {
  agentTaskId: string;
  body: string;
  status?: "complete" | "failed";
  metadata?: Record<string, unknown>;
  mentions?: Array<{ type: string; id: string; label: string; href: string }>;
};
```
And in `postChatReply`'s body include `mentions` only when provided:
```ts
  async function postChatReply(input: ChatReplyInput): Promise<void> {
    await apiPost("/api/v1/arc/messages", {
      agentTaskId: input.agentTaskId,
      body: input.body,
      status: input.status ?? "complete",
      metadata: input.metadata ?? {},
      ...(input.mentions ? { mentions: input.mentions } : {}),
    });
  }
```

- [ ] **Step 3: `handler.ts`.** Compose metadata with suggestions, and pass mentions:
```ts
    const result = await runArcTurn(payload, client);
    const reply = result.body;
    const metadata: Record<string, unknown> = {};
    if (result.actions.length > 0) metadata.actions = result.actions;
    if (result.suggestions.length > 0) metadata.suggestions = result.suggestions;
    await client.postChatReply({
      agentTaskId: payload.agentTaskId,
      body: reply || "(Arc returned an empty reply.)",
      status: reply ? "complete" : "failed",
      metadata,
      ...(result.sources.length > 0 ? { mentions: result.sources } : {}),
    });
```

- [ ] **Step 4:** Typecheck + full runner test → PASS. Commit: `git add apps/arc-runner/src/arc.ts apps/arc-runner/src/arc-client.ts apps/arc-runner/src/handler.ts && git commit -m "feat(arc-runner): post suggestions + sources on the reply"`

---

## Task 7: Prompt guidance — packages, sources, suggestions

**Files:** `apps/arc-runner/src/prompt.ts`

- [ ] **Step 1:** After the Drafting paragraph, add:

```
Make replies rich, not bare. When the operator asks for a campaign, produce a PACKAGE: create or emit two or more draft assets (e.g. several create_campaign_draft calls across channels — paid social, email, SMS, a one-pager) so they render as a campaign deck, not a lone card. Call \`cite_sources\` with the records you actually used (real ids + links) so the operator sees your sources, and end with \`suggest_followups\` (2–4 concrete next steps). Attach \`media\` to a card only when you have a real url (e.g. approved BSR media). Lead with a short, structured summary (angle, hook, proof, CTA) above the cards.
```

- [ ] **Step 2:** Typecheck → PASS. Commit: `git add apps/arc-runner/src/prompt.ts && git commit -m "feat(arc-runner): prompt guidance for rich package replies"`

---

## Task 8: Manual acceptance

Restart the runner. In **draft** mode:

- [ ] **Step 1: Package + suggestions + sources.** `Build a storm-response campaign for flood-zone landlords.`
  Expected: a short structured summary, a **"Campaign package · N assets" deck** (≥2 cards each with Approve/Decline), a **"Sources Arc used"** chip row (the leads/companies it pulled), and **follow-up suggestion chips** at the bottom. Tapping a suggestion sends it as the next message.
- [ ] **Step 2: Sources accuracy.** The source chips link to real records (`/crm/...`, `/campaigns/...`).
- [ ] **Step 3: Media field (optional now).** If Arc references approved BSR media with a URL, the card shows a thumbnail + "Real BSR" badge. (Full thumbnails arrive with the media-gen project.)
- [ ] **Step 4: Single-answer still clean.** A simple question ("how many qualified leads?") still gives a concise reply (no forced deck) — richness is for package/asset requests, not every turn.

---

## Self-review notes
- **Delivers the demo look's structure:** packages (deck via ≥2 draft cards — prompting + existing renderer), suggestion chips (`metadata.suggestions`), sources row (`mentions` — new app reply field). Media field added; thumbnails depend on the media-gen project.
- **App change is minimal + safe:** `completeArcMessage`/POST only *add* an optional `mentions`; omitting it preserves current behavior.
- **Type/name consistency:** `TurnSink` (helpers) threaded via `toolsForMode` to `emit_card`/`create_campaign_draft` (card), `suggest_followups` (suggestion), `cite_sources` (source); `runArcTurn` returns the 4-field result; handler maps suggestions→metadata, sources→mentions. New tool names (`suggest_followups`, `cite_sources`) added to `index.test`'s READ set.
- **Restraint:** suggestions capped at 4 (app also caps); prompt says don't force a deck on simple questions; media only with a real url.
