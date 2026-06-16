"use client";

import { useState } from "react";

import { Button } from "@/app/_components/page-header";

/**
 * Copy arbitrary text to the clipboard with a transient "Copied" confirmation.
 * Client-only — touches nothing external. Falls back to a select-and-prompt hint
 * when the Clipboard API is unavailable (e.g. insecure context / denied permission).
 */
export function CopyTextButton({ text, label = "Copy text", size = "sm" }: { text: string; label?: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Button type="button" variant="ghost" size={size} onClick={copy} aria-live="polite">
      {copied ? "Copied" : failed ? "Press Ctrl/Cmd+C" : label}
    </Button>
  );
}
