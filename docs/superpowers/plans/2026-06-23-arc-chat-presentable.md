# Arc Chat — presentable + real attachments + media-gen diagnosis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Arc chat presentable by (A) letting operators upload images/PDFs/text that Arc actually reads (multimodal), (B) shipping a secret-safe prod diagnostic for why image/video gen produces nothing, and (C) enumerating + fixing concrete chat-UI bugs.

**Architecture:** Three independent slices. A widens the upload allowlist in the frontend (`composer.tsx`) + server action (`actions.ts`), renders non-image attachments as file chips (`message-list.tsx`), and — the real fix — threads typed attachments into the live TS runner (`apps/arc-runner`) and converts the model input from a plain string to an Anthropic multimodal message (`string | AsyncIterable<SDKUserMessage>`, confirmed in the SDK's `coreTypes.d.ts`). B adds an operator-gated `GET /api/v1/arc/media/diagnose` route. C is discovery-first and produces its own follow-up plan.

**Tech Stack:** Next.js 16 / React 19, TypeScript, `@anthropic-ai/claude-agent-sdk` (subscription auth) in `apps/arc-runner`, Vitest, Supabase, GCS for uploads, Gemini (Imagen/Veo) for media gen.

**Key facts established during research:**
- Live runner is `apps/arc-runner` (TS, Cloud Run). The top-level `arc-runner/` (Python) is dead — DO NOT touch it.
- `apps/arc-runner/src/arc.ts:170` builds `prompt` as plain text; `attachments` is typed `unknown[]` (`types.ts:36`) and never reaches the model. Attachments are display-only today.
- SDK `query({ prompt })` accepts `string | AsyncIterable<SDKUserMessage>` (`coreTypes.d.ts:32`). `SDKUserMessage.message` is `MessageParam` from `@anthropic-ai/sdk/resources`, whose `content` accepts `text` / `image` / `document` blocks. Anthropic supports `source: { type: "url", url }` for images and PDFs — GCS signed read URLs (1h TTL) work without downloading bytes in the runner.
- Media gen is fully wired behind `isMediaGenEnabled()` = `ARC_MEDIA_ENABLED==="1" && GEMINI_API_KEY` (`src/lib/media/index.ts:14`).
- `ArcAttachment` shape (`src/lib/arc-chat/persistence.ts:41`): `{ url: string; objectPath: string; contentType: string; name: string }`.

**Allowlist (single source of truth, used by frontend + server):**
`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`, `text/markdown`, `text/csv`. `.docx/.xlsx` are explicitly OUT (need conversion — follow-up).

---

## Item A — Real multimodal attachments

### Task A1: Shared accepted-types module

**Files:**
- Create: `src/lib/arc-chat/attachment-types.ts`
- Test: `src/lib/arc-chat/__tests__/attachment-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/arc-chat/__tests__/attachment-types.test.ts
import { describe, expect, it } from "vitest";
import { ACCEPTED_ATTACHMENT_MIME, isAcceptedAttachment, attachmentKind } from "../attachment-types";

describe("attachment-types", () => {
  it("accepts images, pdf, and the text types", () => {
    expect(isAcceptedAttachment("image/png")).toBe(true);
    expect(isAcceptedAttachment("application/pdf")).toBe(true);
    expect(isAcceptedAttachment("text/markdown")).toBe(true);
  });
  it("rejects docx, video, and empty", () => {
    expect(isAcceptedAttachment("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
    expect(isAcceptedAttachment("video/mp4")).toBe(false);
    expect(isAcceptedAttachment("")).toBe(false);
  });
  it("classifies kind for rendering + model mapping", () => {
    expect(attachmentKind("image/jpeg")).toBe("image");
    expect(attachmentKind("application/pdf")).toBe("pdf");
    expect(attachmentKind("text/csv")).toBe("text");
    expect(attachmentKind("video/mp4")).toBe("other");
  });
  it("exposes a comma-joined accept string including image and pdf", () => {
    expect(ACCEPTED_ATTACHMENT_MIME).toContain("image/png");
    expect(ACCEPTED_ATTACHMENT_MIME).toContain("application/pdf");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/arc-chat/__tests__/attachment-types.test.ts`
Expected: FAIL — cannot find module `../attachment-types`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/arc-chat/attachment-types.ts
/** Single source of truth for which uploads Arc accepts + how to treat them.
 *  Claude (the runner's model) natively reads images, PDFs, and plain text. */
export const ACCEPTED_ATTACHMENT_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

const ACCEPTED = new Set<string>(ACCEPTED_ATTACHMENT_MIME);

export function isAcceptedAttachment(contentType: string): boolean {
  return ACCEPTED.has(contentType);
}

export type AttachmentKind = "image" | "pdf" | "text" | "other";

export function attachmentKind(contentType: string): AttachmentKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("text/")) return "text";
  return "other";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/arc-chat/__tests__/attachment-types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/arc-chat/attachment-types.ts src/lib/arc-chat/__tests__/attachment-types.test.ts
git commit -m "feat(arc): shared accepted-attachment types (images, pdf, text)"
```

---

### Task A2: Server action — widen the upload allowlist

**Files:**
- Modify: `src/app/arc/actions.ts:329-342` (`createArcUploadUrlAction`)

- [ ] **Step 1: Update the guard to use the shared allowlist**

Add the import near the other `@/lib/arc-chat` imports at the top of `src/app/arc/actions.ts`:

```ts
import { isAcceptedAttachment } from "@/lib/arc-chat/attachment-types";
```

Replace line 332:

```ts
  if (!contentType.startsWith("image/")) return { ok: false, message: "Only images can be attached." };
```

with:

```ts
  if (!isAcceptedAttachment(contentType)) {
    return { ok: false, message: "Unsupported file. Attach an image, PDF, or text file." };
  }
```

Also update the object-path prefix line 333-334 so non-images don't get a misleading `image` fallback name:

```ts
  const safe = (filename || "file").replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const objectPath = `arc-uploads/${randomUUID()}-${safe}`;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no new errors. (`pnpm lint` is eslint-only and won't catch type errors — per repo notes use tsc.)

- [ ] **Step 3: Commit**

```bash
git add src/app/arc/actions.ts
git commit -m "feat(arc): accept images, PDF, and text uploads server-side"
```

---

### Task A3: Composer — accept more types, stop silent drops, show errors

**Files:**
- Modify: `src/app/arc/_components/composer.tsx` — `handleFiles` (397-416), file input (911), drag label (742), paste handler (807-814 region), non-image preview (747-760)

- [ ] **Step 1: Import the shared helpers**

Add to the existing imports at the top of `composer.tsx`:

```ts
import { ACCEPTED_ATTACHMENT_MIME, isAcceptedAttachment, attachmentKind } from "@/lib/arc-chat/attachment-types";
```

- [ ] **Step 2: Add an upload-error state**

Next to `const [uploading, setUploading] = useState(false);` (line 355) add:

```ts
  const [uploadError, setUploadError] = useState<string | null>(null);
```

- [ ] **Step 3: Rewrite `handleFiles` to reject (not silently skip) unsupported files**

Replace the body of `handleFiles` (397-416) with:

```ts
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    const incoming = Array.from(files);
    const rejected = incoming.filter((f) => !isAcceptedAttachment(f.type)).map((f) => f.name);
    const accepted = incoming.filter((f) => isAcceptedAttachment(f.type));
    if (rejected.length > 0) {
      setUploadError(
        `Can't attach ${rejected.join(", ")} — supported: images, PDF, and text files.`,
      );
    }
    if (accepted.length === 0) return;
    setUploading(true);
    try {
      for (const file of accepted) {
        const ticket = await createArcUploadUrlAction(file.name, file.type);
        if (!ticket.ok) {
          setUploadError(ticket.message);
          continue;
        }
        const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
        if (!put.ok) {
          setUploadError(`Upload failed for ${file.name}.`);
          continue;
        }
        setAttachments((prev) => [
          ...prev,
          { url: ticket.readUrl, objectPath: ticket.objectPath, contentType: file.type, name: file.name },
        ]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
```

- [ ] **Step 4: Widen the file input `accept`**

Replace line 911:

```tsx
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
```

with:

```tsx
              <input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENT_MIME.join(",")} multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
```

- [ ] **Step 5: Fix the drag label (742)**

Replace `Drop image to attach` with `Drop files to attach`.

- [ ] **Step 6: Fix the paste handler so it forwards any files (handleFiles now filters)**

Find the `onPaste` handler (around 807). Replace its file-guard condition so it no longer requires images:

```tsx
            onPaste={(e) => {
              const files = e.clipboardData?.files;
              if (files && files.length > 0) {
                e.preventDefault();
                void handleFiles(files);
              }
            }}
```

- [ ] **Step 7: Render non-image attachments as a file chip (don't `<img>` a PDF)**

Replace the attachment-preview `.map` body (747-760) with a kind-aware render:

```tsx
              {attachments.map((a) => {
                const kind = attachmentKind(a.contentType);
                return (
                  <span key={a.objectPath} className="group relative flex h-14 items-center gap-2 overflow-hidden rounded-lg pr-6 shadow-[inset_0_0_0_1px_var(--border-strong)]">
                    {kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, no optimizer config
                      <img src={a.url} alt={a.name} className="h-14 w-14 object-cover" />
                    ) : (
                      <span className="flex h-14 w-14 items-center justify-center bg-[var(--surface-inset)] text-[10px] font-semibold uppercase text-[var(--text-secondary)]">
                        {kind === "pdf" ? "PDF" : "TXT"}
                      </span>
                    )}
                    {kind !== "image" ? (
                      <span className="max-w-[8rem] truncate pr-1 text-xs text-[var(--text-secondary)]">{a.name}</span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => setAttachments((prev) => prev.filter((p) => p.objectPath !== a.objectPath))}
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xs text-[var(--text-secondary)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--priority-bright)]"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
```

- [ ] **Step 8: Surface `uploadError` near the composer**

Immediately after the attachment-preview block's closing `) : null}` (after line 767), add:

```tsx
          {uploadError ? (
            <div className="px-1 text-xs text-[var(--priority-bright)]" role="alert">{uploadError}</div>
          ) : null}
```

- [ ] **Step 9: Typecheck + lint changed file**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Run: `pnpm exec eslint src/app/arc/_components/composer.tsx`
Expected: no new errors. (Scope eslint to the changed file — repo-wide lint reports ~31k vendored problems.)

- [ ] **Step 10: Commit**

```bash
git add src/app/arc/_components/composer.tsx
git commit -m "feat(arc): composer accepts PDF/text, shows errors, file chips for non-images"
```

---

### Task A4: Sent-message render — file chip for non-image attachments

**Files:**
- Modify: `src/app/arc/_components/message-list.tsx:768-777`

- [ ] **Step 1: Import the kind helper**

Add to imports:

```ts
import { attachmentKind } from "@/lib/arc-chat/attachment-types";
```

- [ ] **Step 2: Make the attachment map kind-aware**

Replace the `message.attachments.map` block (770-775) with:

```tsx
            {message.attachments.map((a) =>
              attachmentKind(a.contentType) === "image" ? (
                <a key={a.objectPath} href={a.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--border-strong)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, no optimizer config */}
                  <img src={a.url} alt={a.name} className="h-24 w-24 object-cover transition hover:opacity-90" />
                </a>
              ) : (
                <a key={a.objectPath} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]">
                  <span className="font-semibold uppercase">{attachmentKind(a.contentType) === "pdf" ? "PDF" : "TXT"}</span>
                  <span className="max-w-[12rem] truncate">{a.name}</span>
                </a>
              ),
            )}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`

```bash
git add src/app/arc/_components/message-list.tsx
git commit -m "feat(arc): render non-image attachments as file chips in chat"
```

---

### Task A5: Runner — pure builder that maps attachments to model content blocks

**Files:**
- Create: `apps/arc-runner/src/attachments.ts`
- Test: `apps/arc-runner/src/attachments.test.ts`
- Modify: `apps/arc-runner/src/types.ts:36` (type `attachments` properly)

Note: run runner tests from `apps/arc-runner` with `npm test` (this package uses npm + vitest, separate from the pnpm workspace).

- [ ] **Step 1: Type the attachments field**

In `apps/arc-runner/src/types.ts`, add near the top-level type exports:

```ts
export type ArcAttachment = { url: string; objectPath: string; contentType: string; name: string };
```

Replace line 36 `attachments?: unknown[];` with:

```ts
  attachments?: ArcAttachment[];
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/arc-runner/src/attachments.test.ts
import { describe, expect, it } from "vitest";
import { buildTurnContent } from "./attachments";
import type { ArcAttachment } from "./types";

const img: ArcAttachment = { url: "https://gcs/x.png", objectPath: "a", contentType: "image/png", name: "x.png" };
const pdf: ArcAttachment = { url: "https://gcs/y.pdf", objectPath: "b", contentType: "application/pdf", name: "y.pdf" };

describe("buildTurnContent", () => {
  it("returns the plain string when there are no attachments", () => {
    expect(buildTurnContent("hello", [])).toBe("hello");
    expect(buildTurnContent("hello", undefined)).toBe("hello");
  });

  it("returns content blocks with the text first when attachments exist", () => {
    const content = buildTurnContent("look at these", [img, pdf]);
    expect(Array.isArray(content)).toBe(true);
    const blocks = content as Array<Record<string, unknown>>;
    expect(blocks[0]).toEqual({ type: "text", text: "look at these" });
  });

  it("maps an image to a url image block", () => {
    const blocks = buildTurnContent("x", [img]) as Array<Record<string, unknown>>;
    expect(blocks).toContainEqual({ type: "image", source: { type: "url", url: "https://gcs/x.png" } });
  });

  it("maps a pdf to a url document block", () => {
    const blocks = buildTurnContent("x", [pdf]) as Array<Record<string, unknown>>;
    expect(blocks).toContainEqual({
      type: "document",
      source: { type: "url", url: "https://gcs/y.pdf" },
      title: "y.pdf",
    });
  });

  it("drops unsupported types rather than emitting a broken block", () => {
    const vid: ArcAttachment = { url: "https://gcs/v.mp4", objectPath: "c", contentType: "video/mp4", name: "v.mp4" };
    const blocks = buildTurnContent("x", [vid, img]) as Array<Record<string, unknown>>;
    // text block + the one image only
    expect(blocks).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `apps/arc-runner`): `npm test -- attachments`
Expected: FAIL — cannot find module `./attachments`.

- [ ] **Step 4: Write minimal implementation**

```ts
// apps/arc-runner/src/attachments.ts
import type { MessageParam } from "@anthropic-ai/sdk/resources";

import type { ArcAttachment } from "./types";

type ContentBlocks = Exclude<MessageParam["content"], string>;

/**
 * Build the model input for a turn. With no attachments we return the plain
 * prompt string (unchanged behavior). With attachments we return Anthropic
 * content blocks — text first, then a url image/document block per supported
 * file — so Arc actually sees what the operator uploaded. GCS signed read URLs
 * are fetched server-side by the API; unsupported types are dropped (the UI
 * already blocks them, this is defense-in-depth).
 */
export function buildTurnContent(
  text: string,
  attachments: ArcAttachment[] | undefined,
): string | ContentBlocks {
  const usable = (attachments ?? []).filter(
    (a) => a.contentType.startsWith("image/") || a.contentType === "application/pdf",
  );
  if (usable.length === 0) return text;

  const blocks: ContentBlocks = [{ type: "text", text }];
  for (const a of usable) {
    if (a.contentType.startsWith("image/")) {
      blocks.push({ type: "image", source: { type: "url", url: a.url } });
    } else {
      blocks.push({ type: "document", source: { type: "url", url: a.url }, title: a.name });
    }
  }
  return blocks;
}
```

Note: `text/*` files are intentionally NOT mapped here (URL document source is PDF-only in the Anthropic API). Text-file inlining is Task A6.

- [ ] **Step 5: Run test to verify it passes**

Run (from `apps/arc-runner`): `npm test -- attachments`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/arc-runner/src/attachments.ts apps/arc-runner/src/attachments.test.ts apps/arc-runner/src/types.ts
git commit -m "feat(arc-runner): pure builder mapping attachments to model content blocks"
```

---

### Task A6: Runner — inline text-file attachments as text blocks

**Files:**
- Modify: `apps/arc-runner/src/attachments.ts`
- Modify: `apps/arc-runner/src/attachments.test.ts`

- [ ] **Step 1: Add a failing test for text inlining**

Append to `attachments.test.ts`:

```ts
describe("inlineTextAttachments", () => {
  it("returns text blocks for text/* attachments, capped", async () => {
    const txt: ArcAttachment = { url: "https://gcs/n.md", objectPath: "d", contentType: "text/markdown", name: "n.md" };
    const fakeFetch = async () => ({ ok: true, text: async () => "# Notes\nbody" }) as Response;
    const { inlineTextAttachments } = await import("./attachments");
    const blocks = await inlineTextAttachments([txt], fakeFetch as typeof fetch);
    expect(blocks[0].type).toBe("text");
    expect((blocks[0] as { text: string }).text).toContain("n.md");
    expect((blocks[0] as { text: string }).text).toContain("# Notes");
  });

  it("skips non-text and failed fetches", async () => {
    const img: ArcAttachment = { url: "https://gcs/x.png", objectPath: "a", contentType: "image/png", name: "x.png" };
    const bad: ArcAttachment = { url: "https://gcs/b.txt", objectPath: "e", contentType: "text/plain", name: "b.txt" };
    const fakeFetch = async () => ({ ok: false, text: async () => "" }) as Response;
    const { inlineTextAttachments } = await import("./attachments");
    expect(await inlineTextAttachments([img], fetch)).toHaveLength(0);
    expect(await inlineTextAttachments([bad], fakeFetch as typeof fetch)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `apps/arc-runner`): `npm test -- attachments`
Expected: FAIL — `inlineTextAttachments` is not exported.

- [ ] **Step 3: Implement `inlineTextAttachments` and fold it into a single async builder**

Add to `apps/arc-runner/src/attachments.ts`:

```ts
const TEXT_CAP = 50_000;

/** Fetch text/* attachments and return them as text content blocks (capped). */
export async function inlineTextAttachments(
  attachments: ArcAttachment[],
  fetchImpl: typeof fetch = fetch,
): Promise<ContentBlocks> {
  const out: ContentBlocks = [];
  for (const a of attachments) {
    if (!a.contentType.startsWith("text/")) continue;
    try {
      const res = await fetchImpl(a.url);
      if (!res.ok) continue;
      const body = (await res.text()).slice(0, TEXT_CAP);
      out.push({ type: "text", text: `Attached file ${a.name}:\n\n${body}` });
    } catch {
      // ignore unreadable attachment; UI already confirmed the upload
    }
  }
  return out;
}

/** Async variant of buildTurnContent that also inlines text files. */
export async function buildTurnContentAsync(
  text: string,
  attachments: ArcAttachment[] | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | ContentBlocks> {
  const list = attachments ?? [];
  const base = buildTurnContent(text, list);
  const textBlocks = await inlineTextAttachments(list, fetchImpl);
  if (typeof base === "string") {
    return textBlocks.length > 0 ? [{ type: "text", text }, ...textBlocks] : text;
  }
  return [...base, ...textBlocks];
}
```

- [ ] **Step 4: Run to verify it passes**

Run (from `apps/arc-runner`): `npm test -- attachments`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/arc-runner/src/attachments.ts apps/arc-runner/src/attachments.test.ts
git commit -m "feat(arc-runner): inline text-file attachments as capped text blocks"
```

---

### Task A7: Runner — feed multimodal content into the SDK query

**Files:**
- Modify: `apps/arc-runner/src/arc.ts` — `runArcQuery` signature/usage (69-144) and `runArcTurn` (146-187)

- [ ] **Step 1: Add a content helper that yields the SDK input**

At the top of `arc.ts`, add the import:

```ts
import type { MessageParam } from "@anthropic-ai/sdk/resources";
```

Add this helper above `runArcQuery`:

```ts
/** Adapt our message content into the SDK's prompt input. A plain string stays a
 *  string (unchanged path); content blocks are wrapped in a single streamed
 *  SDKUserMessage so images/documents reach the model. */
function promptInput(content: string | MessageParam["content"], sessionId: string) {
  if (typeof content === "string") return content;
  async function* once() {
    yield {
      type: "user" as const,
      session_id: sessionId,
      parent_tool_use_id: null,
      message: { role: "user" as const, content },
    };
  }
  return once();
}
```

- [ ] **Step 2: Change `runArcQuery` to accept content blocks**

In the `runArcQuery` opts type (69-80) replace `prompt: string;` with:

```ts
  content: string | MessageParam["content"];
```

Then change the `query({ prompt: opts.prompt, ... })` call (97-98) to:

```ts
  for await (const message of query({
    prompt: promptInput(opts.content, opts.ctx.scope.conversationId ?? "arc-turn"),
```

- [ ] **Step 3: Update every `runArcQuery({ ... prompt })` caller to pass `content`**

There are 4 call sites (`runArcTurn`, `runArcOpportunityDraft`, `runArcOpportunityScan`, `runArcCampaignTask`). For the three non-chat callers, just rename the key `prompt:` → `content:` (they pass strings — unchanged behavior). For `runArcTurn` (172-186), replace:

```ts
  const preamble = formatHistory(payload.history);
  const prompt = preamble ? `${preamble}\n\nCurrent message:\n${payload.message}` : payload.message;

  return runArcQuery({
    step,
    mode: payload.mode,
    ctx,
    client,
    prompt,
```

with:

```ts
  const preamble = formatHistory(payload.history);
  const text = preamble ? `${preamble}\n\nCurrent message:\n${payload.message}` : payload.message;
  const content = await buildTurnContentAsync(text, payload.attachments);

  return runArcQuery({
    step,
    mode: payload.mode,
    ctx,
    client,
    content,
```

Add the import at the top of `arc.ts`:

```ts
import { buildTurnContentAsync } from "./attachments";
```

- [ ] **Step 4: Typecheck the runner**

Run (from `apps/arc-runner`): `npx tsc --noEmit`
Expected: no errors. If the SDK rejects the `session_id` field on the yielded message, read `apps/arc-runner/node_modules/@anthropic-ai/claude-agent-sdk/entrypoints/sdk/coreTypes.d.ts` (`SDKUserMessage` ~line 414) and match the exact required fields — DO NOT guess.

- [ ] **Step 5: Run the full runner test suite**

Run (from `apps/arc-runner`): `npm test`
Expected: PASS (existing tests + new attachment tests).

- [ ] **Step 6: Commit**

```bash
git add apps/arc-runner/src/arc.ts
git commit -m "feat(arc-runner): pass attachment content blocks to the model (multimodal)"
```

---

### Task A8: Multimodal end-to-end spike (verification gate)

This de-risks the one unknown: whether claude-code's subscription transport actually forwards image blocks to the model. Do this BEFORE claiming Item A works.

**Files:** none (manual verification)

- [ ] **Step 1: Build the runner**

Run (from `apps/arc-runner`): `npm run build` (or `npx tsc`). Expected: clean.

- [ ] **Step 2: Drive one real turn with an image attachment**

Using the local dev app + runner (or a `vitest` integration harness that calls `runArcTurn` with a payload whose `attachments` contains one real public image URL and `message` = "Describe the attached image in one sentence."), confirm Arc's reply describes the actual image contents (not a generic "I can't see images" response).

- [ ] **Step 3: Record the result**

If it works: note it in the PR description. If claude-code does NOT forward image blocks, STOP and report — the fallback is to pass attachment URLs as a text note (`Operator attached: <name> <url>`) so Arc at least acknowledges them, and to rely on `generate_image` for visual output. Do not silently ship a non-working multimodal path.

---

## Item B — Media-gen prod diagnosis

### Task B1: Secret-safe diagnostics endpoint

**Files:**
- Create: `src/app/api/v1/arc/media/diagnose/route.ts`
- Test: `src/app/api/v1/arc/media/diagnose/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/v1/arc/media/diagnose/route.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/operator", () => ({ requireOperator: vi.fn(async () => {}) }));

describe("GET /api/v1/arc/media/diagnose", () => {
  afterEach(() => {
    delete process.env.ARC_MEDIA_ENABLED;
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
  });

  it("reports disabled + no key, leaking no secret value", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/v1/arc/media/diagnose"));
    const json = await res.json();
    expect(json.mediaEnabled).toBe(false);
    expect(json.geminiKeyPresent).toBe(false);
    expect(JSON.stringify(json)).not.toContain("sk-");
  });

  it("reports key present as a boolean, never the value", async () => {
    process.env.ARC_MEDIA_ENABLED = "1";
    process.env.GEMINI_API_KEY = "sk-secret-value-1234";
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/v1/arc/media/diagnose"));
    const json = await res.json();
    expect(json.mediaEnabled).toBe(true);
    expect(json.geminiKeyPresent).toBe(true);
    expect(JSON.stringify(json)).not.toContain("secret-value");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/app/api/v1/arc/media/diagnose/route.test.ts`
Expected: FAIL — cannot find `./route`.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/v1/arc/media/diagnose/route.ts
import { NextResponse } from "next/server";

import { requireOperator } from "@/lib/auth/operator";
import { getMediaProvider, isMediaGenEnabled } from "@/lib/media";

export const runtime = "nodejs";

/**
 * Operator-gated, secret-safe media-gen diagnostic. Reports whether the gate is
 * on, whether a key is present (boolean only), the configured model env, and —
 * when `?probe=1` — runs a tiny live image gen + video start to prove the key
 * actually has Imagen/Veo access. Never returns any secret value.
 */
export async function GET(request: Request): Promise<NextResponse> {
  await requireOperator();
  const url = new URL(request.url);
  const probe = url.searchParams.get("probe") === "1";

  const report: Record<string, unknown> = {
    mediaEnabled: isMediaGenEnabled(),
    geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
    imageModelEnv: process.env.GEMINI_IMAGE_MODEL ?? null,
    videoModelEnv: process.env.GEMINI_VIDEO_MODEL ?? null,
  };

  if (probe && isMediaGenEnabled()) {
    const provider = getMediaProvider();
    report.imageProbe = await probeImage(provider);
    report.videoProbe = await probeVideoStart(provider);
  }

  return NextResponse.json(report);
}

async function probeImage(provider: ReturnType<typeof getMediaProvider>) {
  if (!provider) return { ok: false, error: "provider unavailable" };
  try {
    const media = await provider.generateImage({ prompt: "a plain blue square, minimal" });
    return { ok: true, model: media.model, bytes: media.bytes.length };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

async function probeVideoStart(provider: ReturnType<typeof getMediaProvider>) {
  if (!provider || !provider.startVideo) return { ok: false, error: "video unsupported by provider" };
  try {
    const start = await provider.startVideo({ prompt: "a calm ocean wave, 2 seconds" });
    return { ok: true, model: start.model, operationStarted: Boolean(start.operationName) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}
```

Note: confirm `MediaProvider`'s method names (`generateImage`, `startVideo`) and `ImageGenInput`/`VideoGenInput` shapes against `src/lib/media/types.ts` before finalizing — adjust the probe calls to match the real signatures (the research saw `generateImage`, `startVideo`, `pollVideo` on the Gemini provider).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/app/api/v1/arc/media/diagnose/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`

```bash
git add src/app/api/v1/arc/media/diagnose/
git commit -m "feat(arc): secret-safe media-gen diagnostics endpoint"
```

---

### Task B2: Read the prod answer (investigation, no code)

**Files:** none

- [ ] **Step 1: Inspect Vercel config** via the Vercel MCP — confirm presence of `ARC_MEDIA_ENABLED` and `GEMINI_API_KEY` on the marketing project (values are masked; presence + last build/runtime errors are enough).
- [ ] **Step 2: Hit the deployed diagnostic** while signed in as operator: `GET /api/v1/arc/media/diagnose?probe=1`. Record `mediaEnabled`, `geminiKeyPresent`, and the probe `error` strings.
- [ ] **Step 3: Map the result to a fix** and report to Evan:
  - `mediaEnabled:false` → set `ARC_MEDIA_ENABLED=1` (and/or add `GEMINI_API_KEY`) on Vercel; redeploy.
  - `imageProbe.ok:false` with a model/permission error → the key lacks Imagen access or the model id is wrong (set `GEMINI_IMAGE_MODEL` to an available model).
  - `videoProbe.ok:false` → the key lacks Veo access (this is the "no videos" cause); enable Veo on the key or set `GEMINI_VIDEO_MODEL` to an accessible model.
  - All `ok:true` → gen works; the "bad images" complaint is prompt/model quality — tune the default model or the prompt-hardening directive.

---

## Item C — UI bug enumeration + fixes (discovery-first)

### Task C1: Drive the chat and enumerate concrete bugs

**Files:** none (produces a follow-up plan)

- [ ] **Step 1: Run the app** (`pnpm dev`) and use the preview tools to open `/arc`.
- [ ] **Step 2: Exercise** send, streaming reply, attach image + PDF, paste, drag-drop, thread switch, mode/route switch, slash + @ mention, voice, retry, action cards/approval. Capture console errors (`preview_console_logs`), network failures (`preview_network`), and visual breakage (`preview_eval` DOM/computed-style checks — NOT `preview_screenshot`, which hangs on the particle canvas per repo notes).
- [ ] **Step 3: Write the enumerated bug list** to `docs/superpowers/specs/2026-06-23-arc-chat-ui-bugs.md` with repro + severity, share with Evan, and only then write a fix plan. Do not guess-fix ambiguous "bugs."

---

## Self-Review notes

- **Spec coverage:** Item A (frontend A2-A4, runner A5-A8) ✓; Item B (B1 endpoint, B2 prod read) ✓; Item C (C1 discovery) ✓. Non-goal `.docx/.xlsx` explicitly excluded in A1 allowlist.
- **Type consistency:** `ArcAttachment` defined once in runner `types.ts` (A5) and reused in `attachments.ts`/`arc.ts`; `buildTurnContent`/`buildTurnContentAsync`/`inlineTextAttachments` names match across A5-A7; `attachmentKind`/`isAcceptedAttachment`/`ACCEPTED_ATTACHMENT_MIME` names match across A1-A4.
- **Known residual risk:** A8 spike gates the multimodal claim; B1 probe method names must be reconciled with `src/lib/media/types.ts`.
