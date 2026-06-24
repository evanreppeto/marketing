"use client";

import { Copy, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "../_components/page-header";

type InviteResult =
  | { ok: true; code: string; expiresAt: string; emailed?: boolean; emailError?: string | null }
  | { ok: false; message: string; status?: string };

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

export function WorkspaceInviteForm({ workspaceId }: { workspaceId: string }) {
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setCopied(false);
    setResult(null);

    const form = new FormData(event.currentTarget);
    const invitedEmail = String(form.get("invitedEmail") ?? "").trim();
    setSubmittedEmail(invitedEmail);
    const role = String(form.get("role") ?? "member");
    const expiresInDays = Number(form.get("expiresInDays") ?? 14);

    try {
      const response = await fetch("/api/auth/workspace-invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expiresInDays,
          invitedEmail: invitedEmail || undefined,
          role,
          workspaceId,
        }),
      });
      const body = (await response.json()) as InviteResult;
      setResult(body.ok ? body : { ok: false, message: body.message || "Invite code could not be issued.", status: body.status });
    } catch {
      setResult({ ok: false, message: "Invite code could not be issued. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  async function copyInviteCode() {
    if (!result?.ok) return;
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_180px_150px]">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Invite by email (optional)</span>
          <input
            className={inputClass}
            name="invitedEmail"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            type="email"
            value={email}
          />
          <span className="text-xs text-[var(--text-muted)]">We'll email them a join link. Leave blank to just generate a code.</span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Role</span>
          <select className={inputClass} defaultValue="member" name="role">
            <option value="member">Member</option>
            <option value="marketer">Marketer</option>
            <option value="reviewer">Reviewer</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Expires</span>
          <select className={inputClass} defaultValue="14" name="expiresInDays">
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <UserPlus aria-hidden className="h-4 w-4" />}
          {email.trim() ? "Send invite" : "Generate invite code"}
        </Button>
        <span aria-live="polite" className="text-xs font-semibold text-[var(--text-muted)]">
          {pending ? (email.trim() ? "Sending invite..." : "Issuing code...") : null}
        </span>
      </div>

      {result ? (
        <div
          className={`rounded-md border px-4 py-3 ${
            result.ok
              ? "border-[var(--ok-border-soft)] bg-[var(--ok-soft)]"
              : "border-[var(--priority-border-soft)] bg-[var(--priority-soft)]"
          }`}
        >
          {result.ok ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {result.emailed ? (
                  <div className="mb-2 text-sm font-semibold text-[var(--ok-text)]">Invited {submittedEmail}</div>
                ) : submittedEmail && result.emailed === false ? (
                  <div className="mb-2 text-sm font-semibold text-[var(--priority-text)]">Couldn't email them — share this code instead.</div>
                ) : null}
                <div className="text-xs font-medium text-[var(--ok-text)]">Invite code</div>
                <div className="mt-1 font-mono text-xl font-bold tracking-[0.08em] text-[var(--text-primary)]">{result.code}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">Expires {new Date(result.expiresAt).toLocaleDateString()}.</div>
              </div>
              <Button onClick={copyInviteCode} size="sm" type="button" variant="ghost">
                <Copy aria-hidden className="h-4 w-4" />
                {copied ? "Copied" : "Copy code"}
              </Button>
            </div>
          ) : (
            <div className="text-sm font-semibold text-[var(--priority-text)]">{result.message}</div>
          )}
        </div>
      ) : null}
    </form>
  );
}
