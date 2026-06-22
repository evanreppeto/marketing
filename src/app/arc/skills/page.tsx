import { connection } from "next/server";
import Link from "next/link";

import { PageHeader } from "../../_components/page-header";
import { theme } from "../../_components/theme";
import { getAgentName } from "@/lib/settings/agent-name";
import { SLASH_COMMANDS } from "../_components/slash-commands";

/** Distinct line icon per skill (keyed by command id). */
function skillIcon(cmd: string) {
  switch (cmd.replace(/^\//, "")) {
    case "find-leads":
      return (
        <>
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3 3" />
        </>
      );
    case "draft-campaign":
      return <path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8zM11 6.5l2.5 2.5" />;
    case "whats-pending":
      return (
        <>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6.5V10l2.5 1.5" />
        </>
      );
    case "summarize":
      return <path d="M4 6h12M4 10h12M4 14h7" />;
    default:
      return <circle cx="10" cy="10" r="2.5" />;
  }
}

export default async function ArcSkillsPage() {
  await connection();
  const agentName = await getAgentName();

  return (
    <>
      <PageHeader
        title="Skills"
        description={`What ${agentName} can do. Launch a skill to start a chat already set up for it — connectors and plugins land here as they come online.`}
        backHref="/arc"
        backLabel="chat"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        {SLASH_COMMANDS.map((c) => (
          <Link
            key={c.cmd}
            href={`/arc?skill=${c.cmd.slice(1)}`}
            className="group flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-3.5 transition-colors hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-inset)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--border-strong)]">
              <svg viewBox="0 0 20 20" aria-hidden className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                {skillIcon(c.cmd)}
              </svg>
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-[var(--text-primary)]">{c.label}</span>
              <span className="text-xs leading-5 text-[var(--text-muted)]">{c.hint}</span>
            </span>
            <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 -translate-x-1 self-center text-[var(--text-muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-[var(--accent)] group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m8 5 5 5-5 5" />
            </svg>
          </Link>
        ))}
      </div>

      {/* Plugins / connectors — the home for external integrations as they ship. */}
      <div className="mt-8">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <span aria-hidden className="h-2.5 w-px rounded-full bg-[var(--accent)]" />
          Plugins &amp; connectors
        </p>
        <div className={`${theme.surface.dashedEmpty} p-6 text-center`}>
          <p className="text-sm font-medium text-[var(--text-primary)]">Connectors are on the way</p>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-xs leading-5 text-[var(--text-muted)]">
            Soon you&rsquo;ll connect external tools here — like ad-production and creative services —
            so {agentName} can use them inside a chat. Everything stays approval-gated; nothing goes out without your sign-off.
          </p>
        </div>
      </div>
    </>
  );
}
