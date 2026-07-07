"use client";

import { useState } from "react";

// Shows the shareable accept-invite link after an invite is created, with a
// one-tap copy. The absolute URL is resolved server-side (from request headers)
// and passed in, so this stays a thin client component with no effects.
export function CopyInviteLink({
  url,
  code,
  forEmail,
  emailed,
}: {
  url: string;
  code: string;
  forEmail?: string;
  emailed?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — the field is selectable as a fallback.
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-3.5">
      <p className="text-[0.85rem] text-[var(--text-primary)]">
        Invite created{forEmail ? ` for ${forEmail}` : ""}.
        {forEmail ? (emailed ? " We emailed them a link to join." : " We couldn't send the email — share the link below instead.") : ""}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Invite link"
          className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-[color:var(--border-panel)] bg-[var(--surface-inset)] px-3 font-[family-name:var(--font-mono)] text-[0.8rem] text-[var(--text-secondary)] outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="min-h-[38px] shrink-0 rounded-lg bg-[var(--accent)] px-3.5 text-[0.85rem] font-semibold text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[color:color-mix(in_srgb,var(--accent)_92%,white)] active:translate-y-px"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="mt-2 text-[0.72rem] text-[var(--text-muted)]">
        Or share the code{" "}
        <span className="font-[family-name:var(--font-mono)] tracking-[0.1em] text-[var(--text-secondary)]">{code}</span> — they can enter it
        on the join screen.
      </p>
    </div>
  );
}
