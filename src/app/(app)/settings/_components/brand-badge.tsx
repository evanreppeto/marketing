"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  siAnthropic,
  siBytedance,
  siFacebook,
  siFigma,
  siGoogle,
  siGoogleanalytics,
  siGoogledrive,
  siGooglegemini,
  siHubspot,
  siInstagram,
  siMailchimp,
  siMeta,
  siNotion,
  siPinterest,
  siResend,
  siThreads,
  siTiktok,
  siX,
  siYoutube,
  siZapier,
} from "simple-icons";

import { EXTRA_BRAND_SVGS } from "./brand-glyphs-extra";

type SimpleIcon = { path: string; hex: string; title: string };

// Real, accurate brand glyphs (Simple Icons — official single-path SVGs). Keyed by
// the display names the connector catalog, connector registry, and provider labels
// actually render, so lookups are exact. Brands Simple Icons has removed for
// trademark reasons (LinkedIn, Slack, Salesforce, OpenAI, Canva, Twilio, Klaviyo,
// Amplitude, Segment, Pipedrive, …) simply aren't in the package; those fall back
// to the initial badge until a licensed glyph is sourced.
const BRAND_GLYPHS: Record<string, SimpleIcon> = {
  Resend: siResend,
  Instagram: siInstagram,
  Facebook: siFacebook,
  "X (Twitter)": siX,
  TikTok: siTiktok,
  YouTube: siYoutube,
  Pinterest: siPinterest,
  Threads: siThreads,
  Mailchimp: siMailchimp,
  "Mailchimp Import": siMailchimp,
  HubSpot: siHubspot,
  "HubSpot CRM Import": siHubspot,
  "Google Analytics": siGoogleanalytics,
  "Meta Pixel": siMeta,
  Figma: siFigma,
  Notion: siNotion,
  "Google Drive": siGoogledrive,
  Zapier: siZapier,
  // Registry labels for the wired connectors
  "Gemini Web Research": siGooglegemini,
  "Media Generation": siGooglegemini,
  "Reviews & Reputation": siGoogle,
  // Model-provider labels
  Google: siGoogle,
  Gemini: siGooglegemini,
  Bytedance: siBytedance,
  Anthropic: siAnthropic,
};

// Official brand color, except near-black logos (X, Threads, Notion, Resend,
// Anthropic) are lifted to ivory so they stay visible on the dark badge.
function glyphColor(hex: string): string {
  const n = Number.parseInt(hex, 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum < 45 ? "var(--text-primary)" : `#${hex}`;
}

/** True when a real brand glyph exists for this display name. */
export function hasBrandGlyph(name: string): boolean {
  return name in BRAND_GLYPHS || name in EXTRA_BRAND_SVGS;
}

/**
 * A connector/provider badge that shows the real brand logo when Simple Icons has
 * one (tinted with the brand's official color, on a matching tinted chip), and
 * falls back to the existing initial badge otherwise. Reuses the caller's badge
 * class (`.clogo` / `.mlogo`) so sizing and shape stay consistent.
 */
export function BrandBadge({
  name,
  initials,
  color,
  className,
  glyphSize = 20,
  style,
}: {
  name: string;
  initials: ReactNode;
  color: string;
  className?: string;
  glyphSize?: number;
  style?: CSSProperties;
}) {
  const icon = BRAND_GLYPHS[name];
  const extra = icon ? undefined : EXTRA_BRAND_SVGS[name];
  const tone = icon ? glyphColor(icon.hex) : extra ? glyphColor(extra.hex) : color;
  const chipStyle: CSSProperties = {
    background: `color-mix(in srgb, ${tone} 13%, transparent)`,
    border: `1px solid color-mix(in srgb, ${tone} 34%, transparent)`,
    color: tone,
    ...style,
  };
  return (
    <span className={className} style={chipStyle}>
      {icon ? (
        <svg viewBox="0 0 24 24" width={glyphSize} height={glyphSize} fill="currentColor" aria-label={icon.title} role="img">
          <path d={icon.path} />
        </svg>
      ) : extra ? (
        <svg
          viewBox={extra.viewBox}
          width={glyphSize}
          height={glyphSize}
          fill="currentColor"
          aria-label={name}
          role="img"
          dangerouslySetInnerHTML={{ __html: extra.inner }}
        />
      ) : (
        initials
      )}
    </span>
  );
}
