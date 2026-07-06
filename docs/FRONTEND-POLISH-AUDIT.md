# Frontend Workflow & Polish Audit — 2026-07-05

A walkthrough of the whole app (all 18 `public/build-*.html` mockup screens) focused on
**workflow coherence, premium feel, and "does it work when you click it."** This is a
frontend-quality pass, run in parallel with the backend/hydration epic — it deliberately
**excludes** the per-screen wiring that the "Hydrate …" tickets (BSR-317, BSR-327–333)
already own.

Reviewer: frontend pass. Live server: `pnpm dev` → `http://localhost:6001` (rewrite serves
`build-home.html` at `/`; every other screen is a static asset).

---

## Verdict: the design is genuinely premium and the workflow holds together

Walked the full loop the product promises and it is coherent end-to-end:

**Opportunity (evidence-backed) → Campaign package (per-piece approval) → Outbox (locked
until you confirm) → Analytics (Arc's read + next iteration) → Brain / Personas (what Arc
learned).**

What's strong (keep this bar):

- **The approval-safe principle is visible on every screen** — "Outbound stays locked until
  you launch" (campaign builder), "Arc never sends… every send is your call" (outbox),
  "Arc's interpretation — not an automated decision" (analytics), and the Trusted / Observed /
  Awaiting-review trichotomy in Brain. This is the product's soul and it's rendered well.
- **Evidence & provenance are obvious** — 3 corroborating sources on each opportunity,
  "Real media · from your Library" tags on assets, source chips (NOAA, Meta Ad Library).
- **Persona Revenue Intelligence is surfaced** — persona pills across CRM, lead score / LTV /
  next-best-action / recommended CTA / message angle / proof points on the record page.
- **High craft** — serif display headings, restrained charcoal/red palette, the live
  force-directed knowledge graph in Brain, the cinematic Arc composer (mention chips,
  Draft-mode toggle, model picker). Reads as a real premium product, not a template.
- **No missing screens.** The nav has every piece the workflow needs, plus empty states and
  an onboarding wizard.

The seams show only when you **interact** — because it's still a static mockup. Those seams
fall into two buckets:

1. **Backend/hydration** (dead action buttons: approve / revise / deploy, create/draft/dismiss,
   bulk actions) — **already owned** by the hydration epic. Not re-filed here.
2. **Frontend-only** (navigation incoherence, decorative controls, cosmetic leaks) — **filed
   below.** These are safe to fix without touching the backend and directly improve the
   polished-product feel today.

---

## Frontend-only findings → Linear tickets

All under project **Marketing Technologies** (team BSR).

> **Status — 2026-07-06:** BSR-340–344 are all **implemented + browser-verified** and moved to **In Review**
> on branch `claude/wizardly-panini-a39319` (12 files changed, `build-arc.html` deleted; uncommitted).
> If you're doing the hydration port, these fixes are already in the static gallery — carry them forward,
> don't redo them. See each ticket's completion comment for specifics.

| Ticket | Pri | Summary |
|---|---|---|
| [BSR-340](https://linear.app/big-shoulders-restoration/issue/BSR-340) | High | **Nav coherence.** "Campaigns" resolves to two different pages (Arc rail → `build-campaign-builder.html`; everywhere else → `build-campaigns.html`). ⌘K palette routes Campaigns/CRM/New-campaign/Add-a-lead to bare `/campaigns` `/crm` that 404 in the static gallery. Sidebar, Arc rail, and ⌘K give three different answers. |
| [BSR-341](https://linear.app/big-shoulders-restoration/issue/BSR-341) | Med | **Stale Arc rails.** `build-arc.html` + `build-arc-empty.html` ship a 10-item rail missing **Studio** (vs the 12-item standard). `build-arc.html` is also **orphaned** — nothing links to it (live Arc is `build-arc-v2.html`). Retire it; fix the empty-state rail. |
| [BSR-342](https://linear.app/big-shoulders-restoration/issue/BSR-342) | Med | **Fake search boxes.** CRM (`#filter`), Brain (`.gsearch`), Library (`.lsearch`) render interactive inputs that neither filter nor open ⌘K — a UX trap, since Campaigns/Personas/Settings search *does* work. |
| [BSR-343](https://linear.app/big-shoulders-restoration/issue/BSR-343) | Med | **Tenant-name drift.** Demo customer is "Summit Restoration" on 3 screens and "Big Shoulders Restoration" on 4. (App-chrome brand "Arc Marketing / RESTORATION workspace" is consistent — that's fine.) Normalize to **Summit** per BSR-336. |
| [BSR-344](https://linear.app/big-shoulders-restoration/issue/BSR-344) | Low | **Raw identifiers leaking into UI.** `real FKs` (crm-record), `executeResendDispatch` (outbox), `business_profiles.brand_palette` / `brand_palette.fonts` (brand), `NBA JOIN PENDING` (crm-record). Keep operator-meaningful tags ("wired", "needs sync", "partial", "approval-gated"); drop table/column/function names. |

### File:line index (for whoever picks these up)

- **BSR-340** — `public/build-arc-v2.html:800`, `public/build-arc-embed.html:804` (Campaigns→builder);
  `public/gallery-cmdk.js:31,32,44,45` (bare routes) + `:159` (`go()` full-nav rule);
  `public/gallery-nav.js:4-21` (MAP is the intended source of truth).
- **BSR-341** — `public/build-arc.html:551-563`, `public/build-arc-empty.html:126-138` (10-item rails).
- **BSR-342** — `public/build-crm.html:~228`, `public/build-brain.html:~290`, `public/build-library.html:~300`.
- **BSR-343** — Summit: `build-campaign-builder.html`, `build-settings.html`, `build-studio.html`.
  Big Shoulders: `build-arc-v2.html`, `build-arc-embed.html`, `build-brain.html`, `build-brand.html`.
- **BSR-344** — `build-crm-record.html:312,380,398`; `build-outbox.html:252`;
  `build-brand.html:398,405` (+ toasts `:631,643,656`); `build-settings.html:309,441`.

---

## Notes that did **not** become tickets

- **Table horizontal-scroll on narrow viewports.** CRM/Campaigns tables (~973px) scroll
  horizontally below ~1000px and clip the last column. `body` itself does not overflow
  (scroll is contained). This is a **desktop-first operator console**, so it's acceptable;
  the clipping I first saw was the preview iframe locked at 732px, not a desktop bug. Flag only.
- **Arc screens don't include `gallery-*.js`.** `build-arc-v2.html` / `build-arc-embed.html`
  inline their own nav + cmdk + panes instead of the shared helpers. It works (nav rail opens,
  Arc is marked active), but it's a **maintenance trap**: any change to the shared gallery
  scripts must be hand-mirrored into two ~156 KB files, and the BSR-340 Campaigns-target drift
  is exactly that trap already biting. BSR-327 (Arc hydration) should collapse this divergence.
- **6 personas shown vs the 12-persona domain contract.** Personas screen shows 6, labeled
  "org-defined." Consistent with a tenant defining a subset — not a bug, noted for awareness.
- **No sign-in front door** in the deployed gallery — already tracked by **BSR-325**.

---

## What's explicitly out of scope here (owned by the hydration epic)

Dead **action** affordances are expected in a mockup and are replaced when each screen is
wired. Do not re-file these as frontend bugs — they belong to:

- Home CTAs / quick-actions → **BSR-317**
- Arc "Ask Arc" / send / approvals → **BSR-327**
- Campaign-builder approve / request-revision / deploy → campaign hydration
- Opportunities create / draft / dismiss → opportunities hydration
- CRM add-contact / bulk actions, Studio generate, Library upload, Brand/Settings `data-fb`
  preview buttons → their respective **BSR-328–333** hydration tickets
