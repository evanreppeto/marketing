import Link from "next/link";

import { buttonClasses, StatusPill } from "@/app/_components/page-header";
import type { CampaignActionCard, CampaignActionHub as CampaignActionHubModel, PlainTone } from "./campaign-detail-model";

export function CampaignActionHub({ hub }: { hub: CampaignActionHubModel }) {
  return (
    <section className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] xl:items-start">
        <div>
          <span className="signal-eyebrow">Start here</span>
          <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">{hub.title}</h2>
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-[var(--text-secondary)]">{hub.detail}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={hub.primaryHref} className={buttonClasses({ variant: "primary", size: "sm" })}>
              {hub.primaryLabel}
            </Link>
            <Link href={hub.secondaryHref} className={buttonClasses({ variant: "ghost", size: "sm" })}>
              {hub.secondaryLabel}
            </Link>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {hub.cards.map((card) => (
            <ActionCard key={card.key} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionCard({ card }: { card: CampaignActionCard }) {
  return (
    <Link href={card.href} className={`rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-[var(--elev-panel)] ${cardClass(card.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[var(--text-primary)]">{card.title}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{card.detail}</p>
        </div>
        <StatusPill tone={pillTone(card.tone)}>{card.value}</StatusPill>
      </div>
    </Link>
  );
}

function cardClass(tone: PlainTone) {
  if (tone === "amber") return "border-[var(--warn-border-soft)] bg-[var(--warn-soft)]";
  if (tone === "green") return "border-[var(--ok-border-soft)] bg-[var(--ok-soft)]";
  if (tone === "blue") return "border-[var(--accent-border-strong)] bg-[var(--accent-soft)]";
  if (tone === "red") return "border-[var(--priority-border-soft)] bg-[var(--priority-soft)]";
  return "border-[var(--border-hairline)] bg-[var(--surface-soft)]";
}

function pillTone(tone: PlainTone) {
  if (tone === "red") return "red";
  if (tone === "amber") return "amber";
  if (tone === "green") return "green";
  if (tone === "blue") return "blue";
  return "gray";
}
