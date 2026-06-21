import Link from "next/link";
import { AlertTriangle, CheckCircle2, FolderSync, HardDrive, Info, KeyRound } from "lucide-react";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import { type ThemeTone } from "@/app/_components/theme";
import { type GoogleDriveHealth, type GoogleDriveHealthCheck, type GoogleDriveHealthTone } from "@/lib/google-drive/health";

function tone(toneName: GoogleDriveHealthTone): ThemeTone {
  return toneName;
}

function checkIcon(check: GoogleDriveHealthCheck) {
  if (check.status === "ok") return <CheckCircle2 aria-hidden />;
  if (check.status === "blocked" || check.status === "attention") return <AlertTriangle aria-hidden />;
  return <Info aria-hidden />;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function GoogleDriveHealthCard({ health }: { health: GoogleDriveHealth }) {
  return (
    <li className="grid gap-4 border-t border-[var(--border-hairline)] bg-[color-mix(in_srgb,var(--surface-inset)_56%,transparent)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--accent)]">
              <HardDrive aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Google Drive health</h3>
                <StatusPill tone={tone(health.tone)}>{health.label}</StatusPill>
              </div>
              <p className="mt-2 max-w-[76ch] text-sm leading-6 text-[var(--text-secondary)]">{health.summary}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={buttonClasses({ variant: "primary", size: "sm" })} href="/api/integrations/google-drive/connect">
            Connect Drive
          </a>
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/library">
            Open Library
          </Link>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {health.checks.map((check) => (
          <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3" key={check.key}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--accent)] [&>svg]:h-4 [&>svg]:w-4">
                  {checkIcon(check)}
                </span>
                {check.label}
              </span>
              <StatusPill tone={tone(check.tone)}>{check.status}</StatusPill>
            </div>
            <p className="mt-2 break-words text-xs leading-5 text-[var(--text-secondary)]">{check.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden className="h-4 w-4 text-[var(--accent)]" />
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Current operator</div>
          </div>
          <div className="mt-3 grid gap-1 text-xs leading-5 text-[var(--text-secondary)]">
            <span>Connected email: {health.connectedEmail ?? "Not connected"}</span>
            <span>Connected at: {formatDate(health.connectedAt)}</span>
            <span>Last import: {formatDate(health.lastImportAt)}</span>
            {health.lastError ? <span className="text-[var(--priority-text)]">Last error: {health.lastError}</span> : null}
          </div>
        </div>

        <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FolderSync aria-hidden className="h-4 w-4 text-[var(--accent)]" />
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Saved Drive folders</div>
            </div>
            <StatusPill tone={health.errorSourceCount > 0 ? "red" : health.sourceCount > 0 ? "green" : "amber"}>
              {health.sourceCount}
            </StatusPill>
          </div>
          {health.sources.length > 0 ? (
            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {health.sources.slice(0, 4).map((source) => (
                <div className="grid gap-1 py-2 text-xs leading-5 text-[var(--text-secondary)]" key={source.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">{source.label}</span>
                    <StatusPill tone={tone(source.tone)}>{source.status}</StatusPill>
                  </div>
                  <span>
                    Last sync: {formatDate(source.lastSyncedAt)} - {source.lastImportedCount} imported
                  </span>
                  {source.lastError ? <span className="text-[var(--priority-text)]">{source.lastError}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
              Save a Drive folder during import to make it reusable from the Brand source control panel.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
