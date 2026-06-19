# Brand Identity → Arc (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a brand color palette + fonts to the brand profile, editable on `/brand`, and wire the palette plus the currently-dropped logo/tagline/description/website/service-areas into Arc's business context + prompt.

**Architecture:** Extend the pure `BusinessProfile` domain model with a `brandPalette` field (new `brand_palette` jsonb column), surface it in the `/brand` editor, and add it + the dropped identity fields to `assembleArcContext` → `ArcBusinessContext`. The existing `GET /api/v1/arc/brand/context` route already returns `assembleArcContext` output, so the only Arc-side change is rendering it in the runner's `fromAppContext`.

**Tech Stack:** TypeScript, Vitest, Next.js 16, Supabase (jsonb), `@anthropic-ai/claude-agent-sdk`.

**Test commands:** app — `pnpm test <path>`; runner — `pnpm --filter @bsr/arc-runner exec vitest run <path>`.

**Verified facts:**
- `src/domain/brand-kit.ts`: `BusinessProfile` (line 39), `NEUTRAL_DEFAULTS` (91), `parseBusinessProfile` (148), `HEX_COLOR = /^#[0-9a-fA-F]{6}$/` (191), `validateBusinessProfile` (194), `assembleArcContext` (337), `ArcBusinessContext` (318). Helpers `asString`/`asNullableString`/`asStringArray` exist.
- `src/lib/brand-kit/persistence.ts`: `upsertBusinessProfile` builds a snake_case `row` then `parseBusinessProfile(data)`.
- `src/lib/brand-kit/form.ts`: `buildBusinessProfileFromForm(formData, current)` spreads `...current` then overrides from form fields; `str()` helper reads trimmed strings.
- Editor: `src/app/brand/_components/brand-profile-editor.tsx` — tabbed (`EditorTab = "company"|"voice"|"proof"|"rules"`), `FormValues`, `toValues`, `inputClass`, posts via `saveBrandKitAction` (`src/app/settings/brand-kit-actions.ts`).
- Runner: `apps/arc-runner/src/business-context.ts` — `AppBusinessContext` + `fromAppContext` + `BSR_CONTEXT` fallback.
- Latest migration timestamp is `20260619154500`; business_profiles created in `20260616140000_brand_kit_foundation.sql`.

---

## File Structure
- `src/domain/brand-kit.ts` — `BrandColor`/`BrandPalette` types, `NEUTRAL_DEFAULTS`, `parseBrandPalette`, `parseBusinessProfile`, `validateBusinessProfile`, `ArcBusinessContext`, `assembleArcContext` (+ test)
- `supabase/migrations/20260619160000_brand_palette.sql` — new column
- `src/lib/brand-kit/persistence.ts` — write `brand_palette`
- `src/lib/brand-kit/form.ts` — parse palette form fields (+ test if one exists)
- `src/app/brand/_components/brand-profile-editor.tsx` — palette tab/UI
- `src/app/brand/page.tsx` — snapshot swatch strip
- `apps/arc-runner/src/business-context.ts` — render palette + identity (+ test)

---

## Task 1: Domain — palette types, parse, validate

**Files:** `src/domain/brand-kit.ts`; test `src/domain/__tests__/brand-kit.test.ts`

- [ ] **Step 1: Add the failing tests** to `brand-kit.test.ts`

```typescript
import { parseBrandPalette, parseBusinessProfile, validateBusinessProfile, NEUTRAL_DEFAULTS } from "@/domain/brand-kit";

describe("parseBrandPalette", () => {
  it("maps a full jsonb palette", () => {
    const p = parseBrandPalette({
      primary: { label: "Navy", hex: "#1B2A4A" }, secondary: { label: "", hex: "#C8A24B" },
      accent: { label: "Gold", hex: "#C8A24B" }, dark: { hex: "#101317" }, light: { hex: "#FFFFFF" },
      headingFont: "Oswald", bodyFont: "Inter",
    });
    expect(p.primary).toEqual({ label: "Navy", hex: "#1B2A4A" });
    expect(p.dark).toEqual({ label: "", hex: "#101317" });
    expect(p.headingFont).toBe("Oswald");
  });
  it("defaults missing keys to empty color/font", () => {
    const p = parseBrandPalette({ primary: { hex: "#1B2A4A" } });
    expect(p.primary).toEqual({ label: "", hex: "#1B2A4A" });
    expect(p.secondary).toEqual({ label: "", hex: "" });
    expect(p.bodyFont).toBe("");
  });
  it("returns an all-empty palette for null/garbage", () => {
    expect(parseBrandPalette(null).accent).toEqual({ label: "", hex: "" });
    expect(parseBrandPalette("nope").headingFont).toBe("");
  });
});

describe("parseBusinessProfile brandPalette", () => {
  it("reads brand_palette jsonb", () => {
    const profile = parseBusinessProfile({ display_name: "BSR", brand_palette: { accent: { label: "Gold", hex: "#C8A24B" } } });
    expect(profile.brandPalette.accent).toEqual({ label: "Gold", hex: "#C8A24B" });
  });
  it("defaults to an empty palette when the column is absent", () => {
    expect(parseBusinessProfile({ display_name: "BSR" }).brandPalette).toEqual(NEUTRAL_DEFAULTS.brandPalette);
  });
});

describe("validateBusinessProfile palette hex", () => {
  const base = { ...NEUTRAL_DEFAULTS, displayName: "BSR" };
  it("allows empty palette values", () => {
    expect(validateBusinessProfile(base).ok).toBe(true);
  });
  it("rejects a malformed palette hex", () => {
    const bad = { ...base, brandPalette: { ...base.brandPalette, primary: { label: "", hex: "1B2A4A" } } };
    const r = validateBusinessProfile(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("palette_primary_invalid");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm test src/domain/__tests__/brand-kit.test.ts`).

- [ ] **Step 3: Implement in `src/domain/brand-kit.ts`**

(a) Add types above `BusinessProfile`:
```typescript
export type BrandColor = { label: string; hex: string };
export type BrandPalette = {
  primary: BrandColor;
  secondary: BrandColor;
  accent: BrandColor;
  dark: BrandColor;
  light: BrandColor;
  headingFont: string;
  bodyFont: string;
};
```
(b) Add `brandPalette: BrandPalette;` to the `BusinessProfile` type (after `guardrails`, before `status`).
(c) Add an empty palette constant + use it in `NEUTRAL_DEFAULTS`:
```typescript
const EMPTY_COLOR: BrandColor = { label: "", hex: "" };
export const EMPTY_BRAND_PALETTE: BrandPalette = {
  primary: { ...EMPTY_COLOR }, secondary: { ...EMPTY_COLOR }, accent: { ...EMPTY_COLOR },
  dark: { ...EMPTY_COLOR }, light: { ...EMPTY_COLOR }, headingFont: "", bodyFont: "",
};
```
Add `brandPalette: EMPTY_BRAND_PALETTE,` to `NEUTRAL_DEFAULTS` (before `status: "draft"`).
(d) Add the pure parser (near `asProofPoints`):
```typescript
function asColor(value: unknown): BrandColor {
  const v = (value ?? {}) as Record<string, unknown>;
  return { label: asString(v.label, ""), hex: asString(v.hex, "") };
}
/** Map a raw brand_palette jsonb blob into a BrandPalette, tolerating missing keys. */
export function parseBrandPalette(value: unknown): BrandPalette {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    primary: asColor(raw.primary), secondary: asColor(raw.secondary), accent: asColor(raw.accent),
    dark: asColor(raw.dark), light: asColor(raw.light),
    headingFont: asString(raw.headingFont, ""), bodyFont: asString(raw.bodyFont, ""),
  };
}
```
> Note: `asString(value, "")` returns `""` for non-strings — exactly the empty default we want.
(e) In `parseBusinessProfile` return object, add: `brandPalette: parseBrandPalette(row.brand_palette),` (before `status`).
(f) In `validateBusinessProfile`, before the return, validate palette hexes:
```typescript
  for (const slot of ["primary", "secondary", "accent", "dark", "light"] as const) {
    const hex = profile.brandPalette[slot].hex;
    if (hex.length > 0 && !HEX_COLOR.test(hex)) errors.push(`palette_${slot}_invalid`);
  }
```
(`HEX_COLOR` is the existing 6-digit regex — palette uses the same format as `accent`; native color inputs emit 6-digit hex.)

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/domain/brand-kit.ts src/domain/__tests__/brand-kit.test.ts && git commit -m "feat(brand): BrandPalette domain model — parse + validate"`

---

## Task 2: Domain — wire palette + identity into Arc context

**Files:** `src/domain/brand-kit.ts`; test `src/domain/__tests__/brand-kit.test.ts`

- [ ] **Step 1: Add the failing test**

```typescript
import { assembleArcContext, NEUTRAL_DEFAULTS, NEUTRAL_PERSONAS } from "@/domain/brand-kit";

describe("assembleArcContext brand identity", () => {
  it("includes palette + visual identity fields", () => {
    const profile = {
      ...NEUTRAL_DEFAULTS, displayName: "BSR", logoUrl: "https://x/logo.png",
      tagline: "Chicago's restoration crew", description: "We restore.", websiteUrl: "https://bsr.com",
      serviceAreas: ["Chicago", "Suburbs"],
      brandPalette: { ...NEUTRAL_DEFAULTS.brandPalette, accent: { label: "Gold", hex: "#C8A24B" }, headingFont: "Oswald" },
    };
    const ctx = assembleArcContext(profile, NEUTRAL_PERSONAS, []);
    expect(ctx.logoUrl).toBe("https://x/logo.png");
    expect(ctx.tagline).toBe("Chicago's restoration crew");
    expect(ctx.websiteUrl).toBe("https://bsr.com");
    expect(ctx.serviceAreas).toEqual(["Chicago", "Suburbs"]);
    expect(ctx.palette.accent).toEqual({ label: "Gold", hex: "#C8A24B" });
    expect(ctx.palette.headingFont).toBe("Oswald");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

(a) Extend `ArcBusinessContext` (after `brainFacts: string[];`):
```typescript
  palette: BrandPalette;
  logoUrl: string | null;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  serviceAreas: string[];
```
(b) In `assembleArcContext`'s returned object add:
```typescript
    palette: profile.brandPalette,
    logoUrl: profile.logoUrl,
    tagline: profile.tagline,
    description: profile.description,
    websiteUrl: profile.websiteUrl,
    serviceAreas: profile.serviceAreas,
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git add src/domain/brand-kit.ts src/domain/__tests__/brand-kit.test.ts && git commit -m "feat(brand): assembleArcContext carries palette + visual identity"`

---

## Task 3: Persistence + migration

**Files:** `supabase/migrations/20260619160000_brand_palette.sql` (create); `src/lib/brand-kit/persistence.ts` (modify)

- [ ] **Step 1: Create the migration**

`supabase/migrations/20260619160000_brand_palette.sql`:
```sql
-- Brand color palette + fonts for business_profiles (SP1: brand identity -> Arc).
alter table public.business_profiles
  add column if not exists brand_palette jsonb not null default '{}'::jsonb;

comment on column public.business_profiles.brand_palette is
  'Brand color palette + fonts ({primary,secondary,accent,dark,light:{label,hex}, headingFont, bodyFont}). Read into BusinessProfile.brandPalette.';
```

- [ ] **Step 2: Write `brand_palette` in `upsertBusinessProfile`**

In `src/lib/brand-kit/persistence.ts`, add to the `row` object (after `guardrails: profile.guardrails as never,`):
```typescript
    brand_palette: profile.brandPalette as never,
```
(The read path already returns `parseBusinessProfile(data)`, which now maps `brand_palette` — no read change needed.)

- [ ] **Step 3: Verify the read/write path compiles + types**

Run: `pnpm build` (or at least `pnpm test src/domain/__tests__/brand-kit.test.ts` again to confirm domain is green). No persistence unit test exists for this module; the round-trip is covered by `parseBusinessProfile` tests (Task 1) + the build's typecheck. If a `persistence` test file exists for brand-kit, add a round-trip assertion mirroring its style.

- [ ] **Step 4: Commit** — `git add supabase/migrations/20260619160000_brand_palette.sql src/lib/brand-kit/persistence.ts && git commit -m "feat(brand): persist brand_palette jsonb column"`

> **Deploy note:** this migration must be applied to the prod DB manually (Vercel does not run migrations).

---

## Task 4: Brand page editor — palette tab + swatch

**Files:** `src/lib/brand-kit/form.ts`, `src/app/brand/_components/brand-profile-editor.tsx`, `src/app/brand/page.tsx`

- [ ] **Step 1: Parse palette fields in `buildBusinessProfileFromForm`** (`src/lib/brand-kit/form.ts`)

Inside the function, before the `return`, build the palette from form fields (names defined in Step 2). Reuse the local `str()` helper:
```typescript
  const color = (slot: string) => ({
    label: str(formData, `palette_${slot}_label`),
    hex: str(formData, `palette_${slot}_hex`),
  });
  const brandPalette = {
    primary: color("primary"), secondary: color("secondary"), accent: color("accent"),
    dark: color("dark"), light: color("light"),
    headingFont: str(formData, "palette_heading_font"),
    bodyFont: str(formData, "palette_body_font"),
  };
```
Add `brandPalette,` to the returned object (the `...current` spread keeps it if the form omitted the fields — but the editor always submits them, so an explicit value is correct).

- [ ] **Step 2: Add the palette tab to the editor** (`brand-profile-editor.tsx`)

1. `EditorTab` → add `"palette"`: `type EditorTab = "company" | "voice" | "palette" | "proof" | "rules";`
2. `sectionStyles` → add a `palette` entry (reuse the accent treatment):
```typescript
  palette: {
    bar: "bg-[var(--accent)]",
    border: "border-l-[var(--accent-border-strong)]",
    surface: "bg-[color-mix(in_srgb,var(--accent-soft)_16%,var(--surface-panel))]",
  },
```
3. `tabs` array → add (after `voice`): `{ id: "palette", label: "Palette", detail: "Brand colors and fonts.", icon: <Palette aria-hidden /> }` and import `Palette` from `lucide-react`.
4. `FormValues` → add the palette fields:
```typescript
  paletteHeadingFont: string;
  paletteBodyFont: string;
  // per slot:
  primaryHex: string; primaryLabel: string;
  secondaryHex: string; secondaryLabel: string;
  accentHex: string; accentLabel: string;
  darkHex: string; darkLabel: string;
  lightHex: string; lightLabel: string;
```
5. `toValues` → populate them from `profile.brandPalette` (e.g. `primaryHex: profile.brandPalette.primary.hex, primaryLabel: profile.brandPalette.primary.label, … paletteHeadingFont: profile.brandPalette.headingFont, paletteBodyFont: profile.brandPalette.bodyFont`).
6. Add an `EditorSection` for `palette` (between the voice and proof sections), with a `ColorRow` per slot and two font `TextField`s. The form field **names must match Step 1**: `palette_primary_hex`, `palette_primary_label`, …, `palette_heading_font`, `palette_body_font`.

```tsx
<EditorSection active={activeTab === "palette"} detail="The brand colors and fonts Arc cites when packaging creative." title="Brand palette" tone="palette">
  <div className="grid gap-4">
    {([
      ["primary", "Primary", values.primaryHex, values.primaryLabel],
      ["secondary", "Secondary", values.secondaryHex, values.secondaryLabel],
      ["accent", "Accent", values.accentHex, values.accentLabel],
      ["dark", "Dark / ink", values.darkHex, values.darkLabel],
      ["light", "Light / background", values.lightHex, values.lightLabel],
    ] as const).map(([slot, label, hex, name]) => (
      <ColorRow
        key={slot}
        slot={slot}
        label={label}
        hex={hex}
        name={name}
        onHex={(v) => update(`${slot}Hex` as keyof FormValues, v)}
        onLabel={(v) => update(`${slot}Label` as keyof FormValues, v)}
      />
    ))}
  </div>
  <div className="grid gap-4 md:grid-cols-2">
    <TextField label="Heading font" name="paletteHeadingFont" onChange={(v) => update("paletteHeadingFont", v)} value={values.paletteHeadingFont} />
    <TextField label="Body font" name="paletteBodyFont" onChange={(v) => update("paletteBodyFont", v)} value={values.paletteBodyFont} />
  </div>
</EditorSection>
```
> ⚠️ `TextField`'s `name` prop is typed `keyof FormValues` and used as the HTML `name`. The form action reads `palette_heading_font`, not `paletteHeadingFont`. So for the two fonts, do NOT use `TextField` directly — render a plain labeled `<input className={inputClass} name="palette_heading_font" …>` (and `palette_body_font`) bound to `values.paletteHeadingFont`/`paletteBodyFont`. (Or widen `TextField` to accept an explicit `name` string.) The `ColorRow` below uses explicit `name` strings, so it's unaffected.

7. Add the `ColorRow` component near `TextField`:
```tsx
function ColorRow({ slot, label, hex, name, onHex, onLabel }: {
  slot: string; label: string; hex: string; name: string;
  onHex: (v: string) => void; onLabel: (v: string) => void;
}) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  return (
    <div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)]">
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        <input aria-label={`${label} color`} className="h-10 w-14 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)]" type="color" value={swatch} onChange={(e) => onHex(e.target.value)} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Hex</span>
        <input className={inputClass} name={`palette_${slot}_hex`} placeholder="#1B2A4A" value={hex} onChange={(e) => onHex(e.target.value)} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Label (optional)</span>
        <input className={inputClass} name={`palette_${slot}_label`} placeholder="e.g. Navy" value={name} onChange={(e) => onLabel(e.target.value)} />
      </label>
    </div>
  );
}
```
> The native color input and the hex text field are bound to the same value (both call `onHex`), so typing a hex updates the swatch and vice-versa. Only the `name`d text inputs submit (the color input has no `name`).

- [ ] **Step 3: Add a swatch strip to the snapshot** (`src/app/brand/page.tsx`)

In `BrandPage`, render a compact swatch row when any palette hex is set. Add near the Snapshot panel (after the four `SnapshotCard`s, inside that `Panel`), guarded:
```tsx
{(() => {
  const slots = [profile.brandPalette.primary, profile.brandPalette.secondary, profile.brandPalette.accent, profile.brandPalette.dark, profile.brandPalette.light].filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex));
  if (slots.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-hairline)] px-5 py-4">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Palette</span>
      {slots.map((c) => (
        <span key={c.hex + c.label} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span aria-hidden className="h-5 w-5 rounded border border-[var(--border-hairline)]" style={{ backgroundColor: c.hex }} />
          {c.label || c.hex}
        </span>
      ))}
    </div>
  );
})()}
```
(Place it after the closing `</div>` of the snapshot card grid but inside the snapshot `Panel`.)

- [ ] **Step 4: Verify in the preview**

This is browser-observable. Run `preview_start`, open `/brand`, open the editor → "Palette" tab, set a color + font, Save, and confirm the swatch strip renders and the value persists (per the preview verification workflow). Capture a screenshot for the user.
> Local note: if Supabase isn't configured locally, the Save will no-op (`NOT_CONFIGURED`); in that case just confirm the tab/inputs render and the swatch strip appears for a profile that has palette values (verify via the `pnpm build` typecheck instead).

- [ ] **Step 5: Commit** — `git add src/lib/brand-kit/form.ts src/app/brand && git commit -m "feat(brand): palette editor tab + snapshot swatches on /brand"`

---

## Task 5: Runner — render palette + identity in the prompt

**Files:** `apps/arc-runner/src/business-context.ts`; test `apps/arc-runner/src/business-context.test.ts`

- [ ] **Step 1: Add the failing test** (mirror the existing `business-context.test.ts` style)

```typescript
import { fromAppContext } from "./business-context";

const emptyColor = { label: "", hex: "" };
const baseApp = {
  businessName: "BSR", industry: "Restoration", services: [], tone: "calm", voiceGuidance: null,
  preferredPhrases: [], bannedPhrases: [], proofPoints: [], personas: [],
  guardrails: { disallowedClaims: [], complianceNotes: "" },
  palette: { primary: { label: "Navy", hex: "#1B2A4A" }, secondary: emptyColor, accent: { label: "Gold", hex: "#C8A24B" }, dark: emptyColor, light: emptyColor, headingFont: "Oswald", bodyFont: "" },
  logoUrl: "https://x/logo.png", tagline: "Chicago's crew", description: null, websiteUrl: "https://bsr.com", serviceAreas: ["Chicago"],
};

describe("fromAppContext brand identity", () => {
  it("renders palette colors, fonts, logo, tagline, website, service areas", () => {
    const ctx = fromAppContext(baseApp);
    const text = JSON.stringify(ctx);
    expect(text).toContain("#1B2A4A");
    expect(text).toContain("Navy");
    expect(text).toContain("#C8A24B");
    expect(text).toContain("Oswald");
    expect(text).toContain("https://x/logo.png");
    expect(text).toContain("Chicago's crew");
    expect(text).toContain("https://bsr.com");
  });
  it("omits empty palette slots and empty identity fields", () => {
    const ctx = fromAppContext({ ...baseApp, palette: { ...baseApp.palette, primary: emptyColor, accent: emptyColor, headingFont: "", bodyFont: "" }, logoUrl: null, tagline: null });
    const text = JSON.stringify(ctx);
    expect(text).not.toContain("Navy");
    expect(text).not.toContain("logo.png");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @bsr/arc-runner exec vitest run src/tools/../business-context.test.ts` — use the real path `apps/arc-runner/src/business-context.test.ts`).

- [ ] **Step 3: Implement in `apps/arc-runner/src/business-context.ts`**

(a) Add palette + identity to `AppBusinessContext`:
```typescript
  palette: {
    primary: { label: string; hex: string };
    secondary: { label: string; hex: string };
    accent: { label: string; hex: string };
    dark: { label: string; hex: string };
    light: { label: string; hex: string };
    headingFont: string;
    bodyFont: string;
  };
  logoUrl: string | null;
  tagline: string | null;
  description: string | null;
  websiteUrl: string | null;
  serviceAreas: string[];
```
(b) In `fromAppContext`, build a brand-identity addendum and fold it into an existing field so the runner's 5-field shape is unchanged. Append to `industry` (which already carries `services`) or `brandVoice`. Use a new local:
```typescript
  const colorBits = (["primary", "secondary", "accent", "dark", "light"] as const)
    .map((slot) => raw.palette[slot])
    .filter((c) => c.hex.length > 0)
    .map((c) => (c.label ? `${c.label} ${c.hex}` : c.hex));
  const fonts = [raw.palette.headingFont && `Heading: ${raw.palette.headingFont}`, raw.palette.bodyFont && `Body: ${raw.palette.bodyFont}`].filter(Boolean).join(", ");
  const identity = [
    raw.tagline ? `Tagline: ${raw.tagline}.` : null,
    raw.websiteUrl ? `Website: ${raw.websiteUrl}.` : null,
    raw.serviceAreas.length ? `Service areas: ${raw.serviceAreas.join(", ")}.` : null,
    raw.logoUrl ? `Logo: ${raw.logoUrl}.` : null,
    colorBits.length ? `Brand colors: ${colorBits.join(", ")}.` : null,
    fonts ? `Fonts: ${fonts}.` : null,
  ].filter((b): b is string => Boolean(b)).join(" ");
```
Then append `identity` to the `brandVoice` string (e.g. `brandVoice: [voice, identity].filter(Boolean).join(" ")`). Keep `BSR_CONTEXT` and the 5-field return shape unchanged.

- [ ] **Step 4: Run → PASS** + `pnpm --filter @bsr/arc-runner typecheck`.
- [ ] **Step 5: Commit** — `git add apps/arc-runner/src/business-context.ts apps/arc-runner/src/business-context.test.ts && git commit -m "feat(arc): runner renders brand palette + identity in the prompt"`

---

## Task 6: Sweep + build

- [ ] **Step 1:** `pnpm test src/domain/__tests__/brand-kit.test.ts` → pass.
- [ ] **Step 2:** `pnpm --filter @bsr/arc-runner test` → pass.
- [ ] **Step 3:** `pnpm build` → succeeds (the real typecheck gate across domain + persistence + editor + page). `pnpm install` first if deps missing. Fix only feature-caused failures.
- [ ] **Step 4 (if fixups):** `git add -A && git commit -m "test(brand): brand-identity verification fixups"`

---

## Self-Review (plan author)

- **Spec coverage:** data model (palette type + jsonb + parse + validate) → Task 1 + Task 3 migration; Arc wiring (assembleArcContext + ArcBusinessContext) → Task 2; persistence → Task 3; editor + swatch → Task 4; runner render → Task 5; testing/build → Task 6. All spec sections covered.
- **Placeholder scan:** none. The editor task flags the one real footgun explicitly — `TextField`'s `name` is `keyof FormValues` but the server reads snake_case `palette_*` names, so the font inputs use raw `<input name="palette_heading_font">` and `ColorRow` uses explicit `name` strings. Form field names match `buildBusinessProfileFromForm` exactly (`palette_<slot>_hex/_label`, `palette_heading_font`, `palette_body_font`).
- **Type consistency:** `BrandPalette` shape identical across domain (`brand-kit.ts`), the form parser output, and the runner's re-declared `AppBusinessContext.palette`. `HEX_COLOR` (6-digit) reused for palette validation, consistent with the existing `accent` rule. `assembleArcContext` adds exactly the fields `ArcBusinessContext` declares.
- **Safety:** additive migration with default `'{}'` → existing rows parse to `EMPTY_BRAND_PALETTE`; console-theme `accent`/`density`/`motion` untouched; runner keeps its 5-field prompt shape + `BSR_CONTEXT` fallback; no outbound/approval change.
- **Deploy:** app (Vercel) + runner (Cloud Build trigger) + **manual migration apply** (flagged in Task 3).
