"use client";

import Link from "next/link";

import type { MarkMention } from "@/domain";
import type { MarkMessage } from "@/lib/mark-chat/persistence";

import type { StudioAsset } from "./asset-library";

// The CRM record types that make up a campaign's audience.
const AUDIENCE_TYPES = ["lead", "company", "contact", "property"] as const;
const LABELS: Record<string, string> = {
  lead: "Leads",
  company: "Companies",
  contact: "Contacts",
  property: "Properties",
};

/** The distinct CRM records Mark referenced across the thread — the live audience. */
export function collectAudienceMentions(messages: MarkMessage[]): MarkMention[] {
  const seen = new Set<string>();
  const out: MarkMention[] = [];
  for (const m of messages) {
    for (const mention of m.mentions) {
      if (!(AUDIENCE_TYPES as readonly string[]).includes(mention.type)) continue;
      const key = `${mention.type}:${mention.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mention);
    }
  }
  return out;
}

function personasFromAssets(assets: StudioAsset[]): string[] {
  return Array.from(
    new Set(
      assets
        .map((a) => a.card.rows.find((r) => /persona/i.test(r.name))?.meta)
        .filter((v): v is string => Boolean(v)),
    ),
  );
}

/**
 * The Studio "Audience" tab: who this campaign targets — the persona(s) it's built
 * for, plus the leads / companies / contacts Mark pulled in, linked to their CRM
 * records. Derived from asset rows + thread mentions (no faked fields). Richer
 * per-record intelligence (lead score, urgency, next best action) would come from
 * the leads read-model — documented as a follow-up, not faked here.
 */
export function AudiencePanel({ messages, assets }: { messages: MarkMessage[]; assets: StudioAsset[] }) {
  const mentions = collectAudienceMentions(messages);
  const personas = personasFromAssets(assets);

  const byType = new Map<string, MarkMention[]>();
  for (const m of mentions) byType.set(m.type, [...(byType.get(m.type) ?? []), m]);

  if (personas.length === 0 && mentions.length === 0) {
    return (
      <p className="text-xs leading-5 text-[var(--text-muted)]">
        Who this campaign targets shows up here — the persona it&apos;s built for, plus the leads, companies, and contacts Mark pulls in.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {personas.length > 0 ? (
        <div>
          <p className="signal-eyebrow mb-1.5">Target persona</p>
          <div className="flex flex-wrap gap-1.5">
            {personas.map((p) => (
              <span key={p} className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-contrast)]">
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {AUDIENCE_TYPES.filter((t) => byType.has(t)).map((type) => {
        const items = byType.get(type) ?? [];
        return (
          <div key={type} className="flex flex-col gap-1">
            <p className="signal-eyebrow mb-0.5">
              {LABELS[type] ?? type} · {items.length}
            </p>
            {items.map((m) => (
              <Link
                key={`${m.type}:${m.id}`}
                href={m.href}
                className="truncate rounded-md px-2.5 py-1.5 text-sm text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:text-[var(--text-primary)] hover:shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
              >
                {m.label}
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
