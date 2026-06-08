"use client";

import { useState } from "react";

import { buildCampaignLink } from "@/domain";
import { cx, theme } from "../../_components/theme";
import { Button } from "../../_components/page-header";

export function TrackedLinkBuilder({ campaignId }: { campaignId: string }) {
  const [destination, setDestination] = useState("https://bigshoulders.com/quote");
  const [channel, setChannel] = useState("meta_ad");
  const [copied, setCopied] = useState(false);

  let link = "";
  let error = "";
  try {
    link = buildCampaignLink({ destinationUrl: destination, campaignId, channel: channel || undefined });
  } catch (e) {
    error = e instanceof Error ? e.message : "Invalid URL";
  }

  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Tracked link builder</div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setCopied(false);
          }}
          placeholder="Destination URL"
          className={cx(theme.control.input, "flex-1")}
        />
        <input
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value);
            setCopied(false);
          }}
          placeholder="channel (utm_source)"
          className={cx(theme.control.input, "sm:w-44")}
        />
      </div>
      {error ? (
        <p className="mt-2 text-xs text-[var(--priority-bright)]">{error}</p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]">
            {link}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
    </div>
  );
}
