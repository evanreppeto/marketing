import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentWorkspaceContext, type WorkspaceContext } from "@/lib/auth/workspace";
import { getCampaignWorkspaceList } from "@/lib/campaigns/read-model";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Campaigns — Arc" };

const STATUS_TONE: Record<string, { bg: string; text: string; dot: string }> = {
  pending_approval: { bg: "color-mix(in srgb, var(--warn) 14%, transparent)", text: "var(--warn)", dot: "var(--warn)" },
  needs_revision: { bg: "color-mix(in srgb, var(--priority) 14%, transparent)", text: "var(--priority)", dot: "var(--priority)" },
  approved: { bg: "color-mix(in srgb, var(--ok) 14%, transparent)", text: "var(--ok)", dot: "var(--ok)" },
  live: { bg: "color-mix(in srgb, var(--ok) 14%, transparent)", text: "var(--ok)", dot: "var(--ok)" },
  draft: { bg: "var(--surface-inset)", text: "var(--text-secondary)", dot: "var(--text-muted)" },
  archived: { bg: "var(--surface-inset)", text: "var(--text-muted)", dot: "var(--text-muted)" },
};

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function tone(s: string) {
  return STATUS_TONE[s] ?? STATUS_TONE.draft;
}

export default async function CampaignsPage() {
  let ctx: WorkspaceContext;
  try {
    ctx = await getCurrentWorkspaceContext();
  } catch {
    redirect("/login?from=/campaigns");
  }
  if (!ctx.workspaceId) redirect("/onboarding");

  const list = await getCampaignWorkspaceList(getSupabaseAdminClient(), "Arc", ctx.orgId);
  const campaigns = list.status === "live" ? list.campaigns : [];
  const totals = list.status === "live" ? list.totals : null;

  return (
    <main className="min-h-screen w-full bg-[var(--canvas)] text-[var(--text-primary)]">
      <header className="border-b border-[color:var(--border-panel)]">
        <div className="mx-auto flex max-w-[64rem] items-center justify-between px-6 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Link href="/home" className="flex items-center gap-2.5">
              <img src="/icon.png" alt="Arc" className="h-7 w-auto" />
              <span className="text-[0.9rem] font-medium text-[var(--text-primary)]">{ctx.workspaceName}</span>
            </Link>
          </div>
          <nav className="flex items-center gap-5 text-[0.85rem]">
            <Link href="/home" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">Home</Link>
            <span className="text-[var(--text-primary)]">Campaigns</span>
            <Link href="/settings/team" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">Team</Link>
            <form action="/api/auth/sign-out" method="post">
              <button type="submit" className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]">Sign out</button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[64rem] px-6 py-12 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-[2.2rem] font-normal leading-tight text-[var(--text-primary)]">Campaigns</h1>
            <p className="mt-2 text-[0.925rem] text-[var(--text-secondary)]">
              What Arc has drafted for {ctx.orgName}. Everything stays locked until you approve it.
            </p>
          </div>
          {totals ? (
            <div className="flex gap-6 text-right">
              <div>
                <p className="font-[family-name:var(--font-display)] text-[1.5rem] font-semibold text-[var(--text-primary)]">{totals.campaigns}</p>
                <p className="text-[0.72rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">Campaigns</p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-display)] text-[1.5rem] font-semibold text-[var(--accent)]">{totals.approvals}</p>
                <p className="text-[0.72rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">Waiting</p>
              </div>
            </div>
          ) : null}
        </div>

        {campaigns.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-[color:var(--border-strong,var(--border-panel))] bg-[var(--surface-soft)] p-10 text-center">
            <p className="text-[1rem] text-[var(--text-primary)]">No campaigns yet.</p>
            <p className="mx-auto mt-2 max-w-[46ch] text-[0.9rem] text-[var(--text-secondary)]">
              Once Arc finds an opportunity, it drafts a campaign here for your review — nothing goes out without your approval.
            </p>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {campaigns.map((c) => {
              const t = tone(c.status);
              return (
                <li
                  key={c.id}
                  className="rounded-2xl border border-[color:var(--border-panel)] bg-[var(--surface-panel)] p-5 transition-colors hover:bg-[var(--surface-raised)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[1.05rem] font-semibold text-[var(--text-primary)]">{c.name}</h2>
                      <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">{statusLabel(c.persona)}</p>
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
                      style={{ backgroundColor: t.bg, color: t.text }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.dot }} aria-hidden />
                      {statusLabel(c.status)}
                    </span>
                  </div>

                  {c.objective ? (
                    <p className="mt-3 max-w-[70ch] text-[0.9rem] leading-relaxed text-[var(--text-secondary)] line-clamp-2">
                      {c.objective}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.78rem] text-[var(--text-muted)]">
                    {c.channels.length > 0 ? <span>{c.channels.join(" · ")}</span> : null}
                    <span>{c.assetCount} {c.assetCount === 1 ? "asset" : "assets"}</span>
                    {c.pendingCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-[var(--warn)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" aria-hidden />
                        {c.pendingCount} waiting for you
                      </span>
                    ) : null}
                    <span className="ml-auto">{c.updatedAt}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 font-[family-name:var(--font-mono)] text-[0.75rem] tracking-[0.02em] text-[var(--text-muted)]">
          Outbound stays locked until you approve.
        </p>
      </div>
    </main>
  );
}
