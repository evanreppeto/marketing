"use client";

import { StatusPill } from "@/app/_components/page-header";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { SectionHeader } from "./section-header";

/**
 * Measurement = readiness, not live performance. This view stays deliberately
 * plain: what evidence exists now, what we'll measure once the campaign is live,
 * and what stays off-limits until real delivery + outcome data lands.
 */
export function PerformanceTab({ detail }: { detail: LiveCampaignWorkspace }) {
  const { approvals, assets, media, sources } = detail;
  const waiting = approvals.filter((approval) => !/approved|declined|archived|rejected/i.test(approval.status));
  const approved = approvals.filter((approval) => /approved/i.test(approval.status));

  const readinessItems = [
    { label: "Creative package", complete: assets.length > 0, detail: assets.length > 0 ? `${assets.length} deliverable${assets.length === 1 ? "" : "s"} attached` : "Needs campaign deliverables" },
    { label: "Evidence trail", complete: sources.length > 0, detail: sources.length > 0 ? `${sources.length} source record${sources.length === 1 ? "" : "s"} linked` : "Needs source records" },
    { label: "Media proof", complete: media.length > 0, detail: media.length > 0 ? `${media.length} media signal${media.length === 1 ? "" : "s"} attached` : "No image, video, or file signals" },
    {
      label: "Approval path",
      complete: approvals.length > 0,
      detail:
        approvals.length === 0
          ? "Needs approval records"
          : waiting.length > 0
            ? `${waiting.length} decision${waiting.length === 1 ? "" : "s"} waiting`
            : `${approved.length} approved record${approved.length === 1 ? "" : "s"}`,
    },
  ];
  const readyCount = readinessItems.filter((item) => item.complete).length;
  const pct = Math.round((readyCount / readinessItems.length) * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-5 py-4 shadow-[var(--elev-panel)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="signal-eyebrow">Measurement</span>
          <StatusPill tone="amber">Outbound locked</StatusPill>
        </div>
        <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">Readiness, not performance</h2>
        <p className="mt-2 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">
          There&rsquo;s no live results data yet. This shows whether the package has the records needed before anyone can
          make reliable claims — and what stays off-limits until real delivery and outcome data lands.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <SectionHeader tone="blue" eyebrow="Readiness" detail="Evidence that exists right now." count={readinessItems.length} />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">{readyCount}/{readinessItems.length}</span>
            <StatusPill tone={readyCount === readinessItems.length ? "green" : "amber"}>{pct}%</StatusPill>
          </div>
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {readinessItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="font-bold text-[var(--text-primary)]">{item.label}</div>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{item.detail}</p>
              </div>
              <StatusPill tone={item.complete ? "green" : "gray"}>{item.complete ? "Ready" : "Missing"}</StatusPill>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <SectionHeader tone="blue" eyebrow="What we&rsquo;ll measure once live" detail="Plain-language checkpoints for useful reporting." count={MEASUREMENT_PLAN.length} />
        </div>
        <div className="divide-y divide-[var(--border-hairline)]">
          {MEASUREMENT_PLAN.map((item) => (
            <div key={item.area} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[var(--text-primary)]">{item.area}</span>
                <StatusPill tone="amber">{item.currentSignal}</StatusPill>
              </div>
              <p className="mt-1.5 text-sm font-semibold leading-6 text-[var(--text-primary)]">{item.question}</p>
              <p className="mt-1 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">{item.nextStep}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.07)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[oklch(0.82_0.13_85/0.28)] px-5 py-4">
          <SectionHeader tone="amber" eyebrow="Not claimable yet" detail="Locked until real outcome data exists." count={LOCKED_CLAIMS.length} />
        </div>
        <ul className="divide-y divide-[var(--border-hairline)]">
          {LOCKED_CLAIMS.map((claim) => (
            <li key={claim.title} className="px-5 py-3">
              <div className="font-bold text-[var(--text-primary)]">{claim.title}</div>
              <p className="mt-0.5 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">{claim.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const MEASUREMENT_PLAN = [
  {
    area: "Reach",
    currentSignal: "Needs delivery data",
    question: "Did the target audience actually see this campaign?",
    nextStep: "Connect approved sending, publishing, or ad-platform results before reporting impressions, sends, clicks, or engagement.",
  },
  {
    area: "Response",
    currentSignal: "Needs lead events",
    question: "Did anyone call, submit a form, upload photos, or ask for help?",
    nextStep: "Track internal CTA, form, phone, and photo-upload events with the campaign id attached to each response.",
  },
  {
    area: "Quality",
    currentSignal: "Needs outcome data",
    question: "Were the responses from the right property, partner, or restoration scenario?",
    nextStep: "Join responses to lead, company, contact, job, and partner handoff records before ranking campaign quality.",
  },
  {
    area: "ROI",
    currentSignal: "Needs booked work",
    question: "Did the campaign lead to booked jobs or measurable revenue?",
    nextStep: "Only report ROI after approved campaigns are linked to outcomes, booked jobs, revenue, and attribution confidence.",
  },
] as const;

const LOCKED_CLAIMS = [
  { title: "Ad performance", detail: "No live platform delivery data is attached yet, so clicks, impressions, CTR, and spend are not available." },
  { title: "Lead volume", detail: "No response events are linked yet, so the package cannot claim calls, forms, photo uploads, or conversions." },
  { title: "Revenue impact", detail: "No booked job or outcome attribution is linked yet, so ROI and revenue claims remain unavailable." },
  { title: "Optimization", detail: "No automatic sending, spending, publishing, or audience changes can run from this package without approval." },
] as const;
