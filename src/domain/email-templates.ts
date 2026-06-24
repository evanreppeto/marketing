// Pure, I/O-free transactional email renderer. Produces an email-safe HTML body
// (inline styles, no external CSS) plus a plaintext alternative. The single brand
// shell used by both app-driven sends and the hosted-template export script.

export type BrandEmailTheme = {
  appName: string;
  logoUrl?: string | null;
  /** Hex color for the CTA button + heading accent. */
  accentColor: string;
};

export type EmailCta = { label: string; url: string };

export type BrandedEmailInput = {
  heading: string;
  bodyBlocks: string[];
  cta?: EmailCta;
  theme: BrandEmailTheme;
  footerNote?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeAccent(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : "#0B0B0C";
}

export function renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const { heading, bodyBlocks, cta, theme, footerNote } = input;
  const accent = safeAccent(theme.accentColor);

  const logo = theme.logoUrl
    ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(theme.appName)}" height="32" style="height:32px;display:block" />`
    : `<strong style="font-size:18px;color:#0B0B0C">${escapeHtml(theme.appName)}</strong>`;

  const paragraphs = bodyBlocks
    .map((block) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f1f23">${escapeHtml(block)}</p>`)
    .join("");

  const button = cta
    ? `<a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${escapeHtml(accent)};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600">${escapeHtml(cta.label)}</a>`
    : "";

  const footer = footerNote
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#8a8a8f">${escapeHtml(footerNote)}</p>`
    : "";

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f4;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="padding-bottom:24px">${logo}</td></tr>
<tr><td><h1 style="margin:0 0 16px;font-size:20px;color:#0B0B0C">${escapeHtml(heading)}</h1>${paragraphs}${button ? `<div style="margin:24px 0">${button}</div>` : ""}${footer}</td></tr>
</table></td></tr></table></body></html>`;

  const textLines = [heading, "", ...bodyBlocks];
  if (cta) textLines.push("", `${cta.label}: ${cta.url}`);
  if (footerNote) textLines.push("", footerNote);
  const text = textLines.join("\n");

  return { html, text };
}
