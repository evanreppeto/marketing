import Link from "next/link";
import { redirect } from "next/navigation";

import { listWorkspaceTeamAccess } from "@/lib/auth/workspace-invites";
import { getCurrentWorkspaceContext, type WorkspaceContext } from "@/lib/auth/workspace";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Home — Arc" };

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  marketer: "Marketer",
  reviewer: "Reviewer",
  member: "Member",
  viewer: "Viewer",
};

async function workspaceCounts(orgId: string) {
  const admin = getSupabaseAdminClient();
  const countOf = async (table: string) => {
    const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    return count ?? 0;
  };
  const [campaigns, leads, companies, contacts, approvals] = await Promise.all([
    countOf("campaigns"),
    countOf("leads"),
    countOf("companies"),
    countOf("contacts"),
    countOf("approval_items"),
  ]);
  return { campaigns, leads, companies, contacts, approvals };
}

export default async function HomePage() {
  let ctx: WorkspaceContext;
  try {
    ctx = await getCurrentWorkspaceContext();
  } catch {
    redirect("/login?from=/home");
  }
  if (!ctx.workspaceId) redirect("/onboarding");

  const user = await getSupabaseAuthenticatedUser();
  const firstName = String(user?.user_metadata?.full_name ?? "").trim().split(/\s+/)[0] || "there";
  const access = await listWorkspaceTeamAccess(ctx.workspaceId);
  const memberCount = access.ok ? access.members.length : 1;
  const c = await workspaceCounts(ctx.orgId);
  const isEmpty = c.campaigns + c.leads + c.companies + c.contacts + c.approvals === 0;

  const metrics = [
    { label: "Campaigns", value: c.campaigns },
    { label: "Leads", value: c.leads },
    { label: "Companies", value: c.companies },
    { label: "Contacts", value: c.contacts },
  ];

  return (
    <main className="min-h-screen w-full bg-[var(--canvas)] text-[var(--text-primary)]">
      <header className="border-b border-[color:var(--border-panel)]">
        <div className="mx-auto flex max-w-[64rem] items-center justify-between px-6 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <img src="/icon.png" alt="Arc" className="h-7 w-auto" />
            <span className="text-[0.9rem] font-medium text-[var(--text-primary)]">{ctx.workspaceName}</span>
          </div>
          <nav className="flex items-center gap-5 text-[0.85rem]">
            <Link href="/campaigns" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              Campaigns
            </Link>
            <Link href="/settings/team" className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              Team
            </Link>
            <form action="/api/auth/sign-out" method="post">
              <button type="submit" className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[64rem] px-6 py-14 sm:px-8">
        <p className="font-[family-name:var(--font-mono)] text-[0.72rem] uppercase tracking-[0.14em] text-[var(--accent)]">
          {ROLE_LABEL[ctx.role ?? "owner"] ?? "Member"} · {ctx.orgName}
        </p>
        <h1 className="mt-3 font-serif text-[2.6rem] font-normal leading-[1.05] text-[var(--text-primary)]">
          Welcome, {firstName}.
        </h1>

        {isEmpty ? (
          <>
            <p className="mt-4 max-w-[54ch] text-[1rem] leading-relaxed text-[var(--text-secondary)]">
              Your workspace is ready. Invite your team, and Arc will start finding opportunities and drafting
              campaigns for {ctx.orgName} — nothing reaches a customer until you approve it.
            </p>
            <div className="mt-8 rounded-2xl border border-[color:var(--border-panel)] bg-[var(--surface-panel)] p-6">
              <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Get started</h2>
              <p className="mt-3 text-[0.95rem] text-[var(--text-secondary)]">Bring your team in — then Arc gets to work.</p>
              <Link
                href="/settings/team"
                className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-[var(--accent)] px-5 text-[0.9375rem] font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[color:color-mix(in_srgb,var(--accent)_92%,white)] active:translate-y-px"
              >
                Invite your team
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 max-w-[54ch] text-[1rem] leading-relaxed text-[var(--text-secondary)]">
              Here's where {ctx.orgName} stands. Everything Arc prepares waits for your approval.
            </p>

            <div className="mt-9 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              {/* Focal: waiting for approval */}
              <section className="focal-card rounded-2xl border border-[color:var(--accent-border-strong,var(--border-panel))] bg-[var(--surface-panel)] p-6">
                <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Waiting for you</h2>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="font-[family-name:var(--font-display)] text-[2.8rem] font-semibold leading-none text-[var(--accent)]">
                    {c.approvals}
                  </span>
                  <span className="text-[0.95rem] text-[var(--text-secondary)]">
                    {c.approvals === 1 ? "item needs approval" : "items need approval"}
                  </span>
                </p>
                <p className="mt-3 max-w-[42ch] text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
                  Arc drafts and prepares; you decide what goes out. Outbound stays locked until you approve.
                </p>
              </section>

              {/* Team */}
              <section className="rounded-2xl border border-[color:var(--border-panel)] bg-[var(--surface-panel)] p-6">
                <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Team</h2>
                <p className="mt-3 text-[1.6rem] font-semibold text-[var(--text-primary)]">
                  {memberCount}
                  <span className="ml-2 text-[0.9rem] font-normal text-[var(--text-secondary)]">
                    {memberCount === 1 ? "member" : "members"}
                  </span>
                </p>
                <Link href="/settings/team" className="mt-4 inline-block text-[0.875rem] font-medium text-[var(--accent)] underline-offset-4 hover:underline">
                  Manage team →
                </Link>
              </section>
            </div>

            {/* Metrics */}
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-xl border border-[color:var(--border-panel)] bg-[var(--surface-soft)] p-5">
                  <p className="font-[family-name:var(--font-display)] text-[1.9rem] font-semibold leading-none text-[var(--text-primary)]">
                    {m.value}
                  </p>
                  <p className="mt-1.5 text-[0.8rem] text-[var(--text-muted)]">{m.label}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-8 font-[family-name:var(--font-mono)] text-[0.75rem] tracking-[0.02em] text-[var(--text-muted)]">
          Outbound stays locked until you approve.
        </p>
      </div>
    </main>
  );
}
