import { redirect } from "next/navigation";

import { getCurrentWorkspaceContext, type WorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspaceTeamAccess } from "@/lib/auth/workspace-invites";

import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInviteAction } from "./actions";

export const metadata = { title: "Team — Arc" };

const INVITE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "marketer", label: "Marketer" },
  { value: "reviewer", label: "Reviewer" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  marketer: "Marketer",
  reviewer: "Reviewer",
  member: "Member",
  viewer: "Viewer",
};

const TEAM_ERRORS: Record<string, string> = {
  not_authorized: "Only workspace owners and admins can manage the team.",
  not_configured: "Team management isn't available right now.",
  invalid_input: "Check the details and try again.",
  failed: "Something went wrong. Try again.",
};

const inputClass =
  "min-h-[40px] rounded-lg bg-[var(--surface-inset)] border border-[color:var(--border-panel)] px-3 text-[0.9rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[color:var(--accent)]";

function initialFor(value: string | null) {
  return (value ?? "?").trim().charAt(0).toUpperCase() || "?";
}

function expiryLabel(iso: string | null) {
  if (!iso) return "No expiry";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return days <= 0 ? "Expired" : `Expires in ${days}d`;
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; for?: string; error?: string }>;
}) {
  const params = await searchParams;

  let ctx: WorkspaceContext;
  try {
    ctx = await getCurrentWorkspaceContext();
  } catch {
    redirect("/login?from=/settings/team");
  }
  if (!ctx.workspaceId) redirect("/onboarding");

  const access = await listWorkspaceTeamAccess(ctx.workspaceId);
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";
  const error = params.error ? TEAM_ERRORS[params.error] ?? "Something went wrong. Try again." : null;

  const members = access.ok ? access.members : [];
  const invites = access.ok ? access.invites : [];

  return (
    <main className="min-h-screen w-full bg-[var(--canvas)] text-[var(--text-primary)]">
      <div className="mx-auto w-full max-w-[46rem] px-6 py-12 sm:px-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="Arc" className="h-7 w-auto" />
            <span className="text-[0.85rem] text-[var(--text-muted)]">{ctx.orgName}</span>
          </div>
          <form action="/api/auth/sign-out" method="post">
            <button type="submit" className="text-[0.8125rem] text-[var(--text-muted)] underline-offset-4 hover:text-[var(--text-secondary)] hover:underline">
              Sign out
            </button>
          </form>
        </div>

        <h1 className="mt-9 font-serif text-[2rem] font-normal leading-tight text-[var(--text-primary)]">Team</h1>
        <p className="mt-2 text-[0.925rem] text-[var(--text-secondary)]">
          Invite people to <span className="text-[var(--text-primary)]">{ctx.workspaceName}</span> and manage their access.
        </p>

        {error ? (
          <p role="alert" className="mt-6 rounded-lg border border-[color:color-mix(in_srgb,var(--priority)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--priority)_12%,transparent)] px-3.5 py-2.5 text-[0.85rem]">
            {error}
          </p>
        ) : null}

        {params.code ? (
          <div className="mt-6 rounded-lg border border-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-3.5">
            <p className="text-[0.85rem] text-[var(--text-primary)]">
              Invite created{params.for ? ` for ${params.for}` : ""}. Share this code — they enter it during sign-up:
            </p>
            <p className="mt-2 font-[family-name:var(--font-mono)] text-[1.15rem] tracking-[0.12em] text-[var(--accent)]">{params.code}</p>
          </div>
        ) : null}

        {/* Invite */}
        {isAdmin ? (
          <section className="mt-10">
            <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Invite a teammate</h2>
            <form action={inviteMemberAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input type="email" name="invitedEmail" placeholder="teammate@company.com" className={`${inputClass} flex-1`} />
              <select name="role" defaultValue="member" className={`${inputClass} sm:w-40`} aria-label="Role">
                {INVITE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="min-h-[40px] shrink-0 rounded-lg bg-[var(--accent)] px-4 text-[0.9rem] font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[color:color-mix(in_srgb,var(--accent)_92%,white)] active:translate-y-px"
              >
                Send invite
              </button>
            </form>
            <p className="mt-2 text-[0.75rem] text-[var(--text-muted)]">
              Leave the email blank to create a shareable code anyone can use to join.
            </p>
          </section>
        ) : null}

        {/* Members */}
        <section className="mt-10">
          <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Members · {members.length}
          </h2>
          <ul className="mt-3 divide-y divide-[color:var(--border-panel)] overflow-hidden rounded-xl border border-[color:var(--border-panel)]">
            {members.map((m) => {
              const isSelf = m.userId != null && m.userId === ctx.userId;
              const isOwner = m.role === "owner";
              const canManage = isAdmin && !isSelf && !isOwner && m.status === "active" && m.userId != null;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 bg-[var(--surface-panel)] px-4 py-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[0.8rem] font-semibold text-[var(--text-secondary)]">
                    {initialFor(m.email)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.9rem] text-[var(--text-primary)]">
                    {m.email ?? "Pending member"}
                    {isSelf ? <span className="ml-2 text-[0.75rem] text-[var(--text-muted)]">You</span> : null}
                  </span>
                  {canManage ? (
                    <form action={changeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="memberId" value={m.id} />
                      <select name="role" defaultValue={m.role} className={`${inputClass} min-h-[36px] py-0 text-[0.8rem]`} aria-label="Change role">
                        {INVITE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-[0.8rem] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        Save
                      </button>
                    </form>
                  ) : (
                    <span className="rounded-md bg-[var(--surface-inset)] px-2 py-1 text-[0.75rem] font-medium text-[var(--text-secondary)]">
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  )}
                  {canManage ? (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="memberId" value={m.id} />
                      <button type="submit" className="text-[0.8rem] text-[var(--text-muted)] hover:text-[var(--priority)]">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Pending invites */}
        {invites.length > 0 ? (
          <section className="mt-9">
            <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Pending invites · {invites.length}
            </h2>
            <ul className="mt-3 divide-y divide-[color:var(--border-panel)] overflow-hidden rounded-xl border border-[color:var(--border-panel)]">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 bg-[var(--surface-panel)] px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-[0.875rem] text-[var(--text-secondary)]">
                    {inv.invitedEmail ?? "Shareable code (anyone)"}
                  </span>
                  <span className="rounded-md bg-[var(--surface-inset)] px-2 py-1 text-[0.72rem] font-medium text-[var(--text-secondary)]">
                    {ROLE_LABEL[inv.role] ?? inv.role}
                  </span>
                  <span className="text-[0.72rem] text-[var(--text-muted)]">{expiryLabel(inv.expiresAt)}</span>
                  {isAdmin ? (
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="inviteId" value={inv.id} />
                      <button type="submit" className="text-[0.8rem] text-[var(--text-muted)] hover:text-[var(--priority)]">
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
