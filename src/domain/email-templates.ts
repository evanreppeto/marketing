// Pure, I/O-free transactional email renderer. Produces an email-safe HTML body
// (inline styles, no external CSS) plus a plaintext alternative. The single brand
// shell used by both app-driven sends and the hosted-template export script.

export type BrandEmailTheme = {
  appName: string;
  logoUrl?: string | null;
  /** Initials fallback (e.g. "BS") shown as a monogram when there's no logo. */
  shortMark?: string | null;
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
  /** Product ("powered by") co-branding shown in the footer, e.g. Arc. */
  product?: { name: string; logoUrl?: string | null };
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
  const { heading, bodyBlocks, cta, theme, footerNote, product } = input;
  const accent = safeAccent(theme.accentColor);
  const sans = "-apple-system,Segoe UI,Helvetica,Arial,sans-serif";

  // Header shows the inviting workspace's brand: its logo, or a monogram badge
  // built from its short mark (initials), or its name as a last resort.
  const mark = (theme.shortMark ?? "").trim().slice(0, 3).toUpperCase();
  const workspaceHeader = theme.logoUrl
    ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(theme.appName)}" height="36" style="height:36px;display:block" />`
    : mark
      ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;background:${escapeHtml(accent)};border-radius:10px;color:#ffffff;font-size:15px;font-weight:700;font-family:${sans}">${escapeHtml(mark)}</td><td style="padding-left:12px;font-size:16px;font-weight:600;color:#0B0B0C;font-family:${sans}">${escapeHtml(theme.appName)}</td></tr></table>`
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

  // Footer: "Powered by <product>" co-branding (Arc's mark).
  const productMark = product
    ? product.logoUrl
      ? `<img src="${escapeHtml(product.logoUrl)}" alt="${escapeHtml(product.name)}" height="16" style="height:16px;display:block" />`
      : `<strong style="font-size:13px;color:#0B0B0C;font-family:${sans}">${escapeHtml(product.name)}</strong>`
    : "";
  const productFooter = product
    ? `<tr><td style="padding-top:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #ececeb;padding-top:16px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="font-size:12px;color:#8a8a8f;padding-right:7px;font-family:${sans}">Powered by</td><td valign="middle">${productMark}</td></tr></table></td></tr></table></td></tr>`
    : "";

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f4;padding:24px;font-family:${sans}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="padding-bottom:24px">${workspaceHeader}</td></tr>
<tr><td><h1 style="margin:0 0 16px;font-size:20px;color:#0B0B0C">${escapeHtml(heading)}</h1>${paragraphs}${button ? `<div style="margin:24px 0">${button}</div>` : ""}${footer}</td></tr>
${productFooter}
</table></td></tr></table></body></html>`;

  const textLines = [heading, "", ...bodyBlocks];
  if (cta) textLines.push("", `${cta.label}: ${cta.url}`);
  if (footerNote) textLines.push("", footerNote);
  if (product) textLines.push("", `Powered by ${product.name}`);
  const text = textLines.join("\n");

  return { html, text };
}
