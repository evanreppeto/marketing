# Brand Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move brand management out of Settings into a top-level Brand workspace that makes company identity, approved knowledge, and source documents visible together.

**Architecture:** Reuse the existing `business_profiles` Brand Kit persistence, `knowledge_nodes` brain read model, and `media_assets` Library read model. Add a server-rendered `/brand` App Router page with a thin view-model helper and reuse the existing client Brand Kit form for edits.

**Tech Stack:** Next.js 16 App Router, React Server Components, existing Supabase read models, Tailwind utility classes, Vitest.

---

### Task 1: Navigation and Settings IA

**Files:**
- Modify: `src/app/_components/nav-icons.tsx`
- Modify: `src/app/_components/console-frame.tsx`
- Modify: `src/app/settings/settings-sections.ts`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/settings/settings-home.tsx`
- Modify: `src/app/settings/branding-settings.tsx`
- Modify: `src/app/settings/settings-sections.test.ts`

- [x] Add a `brand` nav icon and top-level Brand link under Intelligence.
- [x] Remove the Brand Kit settings section from Settings navigation and panel mapping.
- [x] Update settings copy to point business identity work to `/brand`.
- [x] Add a regression assertion that Brand Kit no longer appears in Settings sections.

### Task 2: Brand Workspace Page

**Files:**
- Create: `src/app/brand/page.tsx`
- Create: `src/app/brand/_components/brand-profile-editor.tsx`
- Modify: `src/app/settings/brand-kit-actions.ts`

- [x] Build `/brand` as a server page that loads the current Brand Kit, Brain nodes, proposed nodes, and Library documents.
- [x] Show overview stats, source-backed knowledge cards, document/source cards, and the editable profile form.
- [x] Revalidate `/brand` after Brand Kit saves.

### Task 3: Verification

**Files:**
- Test: `src/app/settings/settings-sections.test.ts`

- [x] Run the targeted settings test.
- [x] Run lint or build if the targeted test passes.
