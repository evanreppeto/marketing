"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  FileBadge,
  MessageSquareQuote,
  Palette,
  Save,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { Button, Panel, StatusPill } from "@/app/_components/page-header";
import { cx, theme } from "@/app/_components/theme";
import { applyIndustryTemplate, INDUSTRY_TEMPLATES, type BusinessProfile } from "@/domain";
import { saveBrandKitAction, type BrandKitActionState } from "@/app/settings/brand-kit-actions";

type EditorTab = "company" | "voice" | "palette" | "proof" | "rules";

const sectionStyles: Record<
  EditorTab,
  {
    bar: string;
    border: string;
    surface: string;
  }
> = {
  company: {
    bar: "bg-[var(--accent)]",
    border: "border-l-[var(--accent-border-strong)]",
    surface: "bg-[color-mix(in_srgb,var(--accent-soft)_18%,var(--surface-panel))]",
  },
  voice: {
    bar: "bg-[var(--accent-contrast)]",
    border: "border-l-[var(--accent-border)]",
    surface: "bg-[color-mix(in_srgb,var(--accent-soft)_12%,var(--surface-panel))]",
  },
  palette: {
    bar: "bg-[var(--accent)]",
    border: "border-l-[var(--accent-border-strong)]",
    surface: "bg-[color-mix(in_srgb,var(--accent-soft)_16%,var(--surface-panel))]",
  },
  proof: {
    bar: "bg-[var(--ok)]",
    border: "border-l-[var(--ok-border)]",
    surface: "bg-[color-mix(in_srgb,var(--ok-soft)_16%,var(--surface-panel))]",
  },
  rules: {
    bar: "bg-[var(--warn)]",
    border: "border-l-[var(--warn-border)]",
    surface: "bg-[color-mix(in_srgb,var(--warn-soft)_16%,var(--surface-panel))]",
  },
};

type FormValues = {
  displayName: string;
  legalName: string;
  tagline: string;
  description: string;
  industry: string;
  websiteUrl: string;
  faviconUrl: string;
  shortMark: string;
  logoUrl: string;
  serviceAreas: string;
  tone: string;
  voiceGuidance: string;
  preferredPhrases: string;
  bannedPhrases: string;
  services: string;
  proofPoints: string;
  disallowedClaims: string;
  complianceNotes: string;
  status: string;
  paletteHeadingFont: string;
  paletteBodyFont: string;
  primaryHex: string;
  primaryLabel: string;
  secondaryHex: string;
  secondaryLabel: string;
  accentHex: string;
  accentLabel: string;
  darkHex: string;
  darkLabel: string;
  lightHex: string;
  lightLabel: string;
};

const tabs: Array<{
  id: EditorTab;
  label: string;
  detail: string;
  icon: React.ReactNode;
}> = [
  {
    id: "company",
    label: "Company",
    detail: "Name, website, offerings, markets, logo.",
    icon: <Building2 aria-hidden />,
  },
  {
    id: "voice",
    label: "Voice",
    detail: "Tone, phrases to use, phrases to avoid.",
    icon: <MessageSquareQuote aria-hidden />,
  },
  {
    id: "palette",
    label: "Palette",
    detail: "Brand colors and fonts.",
    icon: <Palette aria-hidden />,
  },
  {
    id: "proof",
    label: "Offerings & proof",
    detail: "What the company sells or provides.",
    icon: <FileBadge aria-hidden />,
  },
  {
    id: "rules",
    label: "Rules",
    detail: "Claims, compliance, and whether Arc can use it.",
    icon: <ShieldCheck aria-hidden />,
  },
];

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

const textareaClass =
  "min-h-24 w-full resize-y rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

function formatTokenLabel(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatIndustryLabel(value: string | null | undefined) {
  if (!value) return "";
  const template = INDUSTRY_TEMPLATES.find((item) => item.id === value);
  return template ? template.label : formatTokenLabel(value);
}

function toValues(profile: BusinessProfile): FormValues {
  return {
    displayName: profile.displayName,
    legalName: profile.legalName ?? "",
    tagline: profile.tagline ?? "",
    description: profile.description ?? "",
    industry: profile.industry ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    faviconUrl: profile.faviconUrl ?? "",
    shortMark: profile.shortMark ?? "",
    logoUrl: profile.logoUrl ?? "",
    serviceAreas: profile.serviceAreas.join("\n"),
    tone: profile.tone,
    voiceGuidance: profile.voiceGuidance ?? "",
    preferredPhrases: profile.preferredPhrases.join("\n"),
    bannedPhrases: profile.bannedPhrases.join("\n"),
    services: profile.services.join("\n"),
    proofPoints: profile.proofPoints.map((proof) => proof.label).join("\n"),
    disallowedClaims: profile.guardrails.disallowedClaims.join("\n"),
    complianceNotes: profile.guardrails.complianceNotes,
    status: profile.status,
    paletteHeadingFont: profile.brandPalette.headingFont,
    paletteBodyFont: profile.brandPalette.bodyFont,
    primaryHex: profile.brandPalette.primary.hex,
    primaryLabel: profile.brandPalette.primary.label,
    secondaryHex: profile.brandPalette.secondary.hex,
    secondaryLabel: profile.brandPalette.secondary.label,
    accentHex: profile.brandPalette.accent.hex,
    accentLabel: profile.brandPalette.accent.label,
    darkHex: profile.brandPalette.dark.hex,
    darkLabel: profile.brandPalette.dark.label,
    lightHex: profile.brandPalette.light.hex,
    lightLabel: profile.brandPalette.light.label,
  };
}

function splitList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function actionTone(state: BrandKitActionState): "green" | "red" | "gray" {
  if (!state) return "gray";
  return state.ok ? "green" : "red";
}

export function BrandProfileEditor({ profile }: { profile: BusinessProfile }) {
  const [state, action, pending] = useActionState(saveBrandKitAction, null);
  const [activeTab, setActiveTab] = useState<EditorTab>("company");
  const [values, setValues] = useState<FormValues>(() => toValues(profile));

  const serviceList = useMemo(() => splitList(values.services), [values.services]);
  const proofList = useMemo(() => splitList(values.proofPoints), [values.proofPoints]);
  const blockedList = useMemo(() => splitList(values.disallowedClaims), [values.disallowedClaims]);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function applyTemplate(templateId: string) {
    if (!templateId) return;
    const applied = applyIndustryTemplate(templateId);
    setValues((current) => ({
      ...current,
      industry: current.industry || applied.industry || "",
      tone: current.tone || applied.tone,
      services: current.services || applied.services.join("\n"),
      voiceGuidance: current.voiceGuidance || applied.voiceGuidance || "",
      preferredPhrases: current.preferredPhrases || applied.preferredPhrases.join("\n"),
      bannedPhrases: current.bannedPhrases || applied.bannedPhrases.join("\n"),
    }));
  }

  return (
    <Panel className="overflow-hidden p-0">
      <form action={action}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="min-w-0">
            <div className="signal-eyebrow">Editor</div>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">Edit brand</h2>
            <p className="mt-1 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">
              Update one section at a time. Everything here becomes the company context Arc uses.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {state ? <StatusPill tone={actionTone(state)}>{state.message}</StatusPill> : null}
            <Button disabled={pending} size="sm" type="submit" variant="primary">
              <Save aria-hidden className="h-4 w-4" />
              {pending ? "Saving..." : "Save brand"}
            </Button>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="border-b border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3 xl:border-b-0 xl:border-r">
            <label className="mb-4 grid gap-1.5 border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Quick start</span>
              <select className={inputClass} defaultValue="" onChange={(event) => applyTemplate(event.target.value)}>
                <option disabled value="">
                  Apply template
                </option>
                {INDUSTRY_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Sections
            </div>
            <div className="grid gap-1.5">
              {tabs.map((tab) => (
                <button
                  aria-current={activeTab === tab.id ? "step" : undefined}
                  className={cx(
                    "group flex w-full items-start gap-3 border-l-2 px-3 py-2.5 text-left transition",
                    activeTab === tab.id
                      ? cx("bg-[var(--surface-inset)] text-[var(--text-primary)]", sectionStyles[tab.id].border)
                      : "border-l-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
                  )}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[var(--accent)] [&>svg]:h-4 [&>svg]:w-4">
                    {tab.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{tab.label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{tab.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 bg-[var(--surface-soft)] p-4 sm:p-5">
            <EditorSection
              active={activeTab === "company"}
              detail="These basics tell Arc who the company is, what it offers, and where it operates."
              title="Company info"
              tone="company"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Display name" name="displayName" onChange={(value) => update("displayName", value)} value={values.displayName} />
                <TextField label="Legal name" name="legalName" onChange={(value) => update("legalName", value)} value={values.legalName} />
                <TextField label="Tagline" name="tagline" onChange={(value) => update("tagline", value)} value={values.tagline} />
                <IndustrySelectField onChange={(value) => update("industry", value)} value={values.industry} />
                <TextField label="Website" name="websiteUrl" onChange={(value) => update("websiteUrl", value)} type="url" value={values.websiteUrl} />
                <TextField label="Short mark" name="shortMark" onChange={(value) => update("shortMark", value)} value={values.shortMark} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FileField
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico"
                  help="Upload the primary logo file. PNG, SVG, WebP, JPG, or ICO."
                  label="Logo file"
                  name="logoFile"
                />
                <FileField
                  accept="image/png,image/svg+xml,image/x-icon,.ico"
                  help="Upload the small browser icon. PNG, SVG, or ICO."
                  label="Favicon file"
                  name="faviconFile"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Logo URL" name="logoUrl" onChange={(value) => update("logoUrl", value)} value={values.logoUrl} />
                <TextField label="Favicon URL" name="faviconUrl" onChange={(value) => update("faviconUrl", value)} value={values.faviconUrl} />
              </div>
              <TextAreaField
                help="One location, region, segment, or market per line."
                label="Markets or service areas"
                name="serviceAreas"
                onChange={(value) => update("serviceAreas", value)}
                rows={4}
                value={values.serviceAreas}
              />
              <TextAreaField
                help="A short, plain-English description of the company."
                label="Company description"
                name="description"
                onChange={(value) => update("description", value)}
                rows={5}
                value={values.description}
              />
            </EditorSection>

            <EditorSection
              active={activeTab === "voice"}
              detail="This controls the language Arc should use and the phrases it should avoid."
              title="Voice"
              tone="voice"
            >
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Tone</span>
                <select className={inputClass} name="tone" onChange={(event) => update("tone", event.target.value)} value={values.tone}>
                  <option value="balanced">Balanced</option>
                  <option value="direct">Direct</option>
                  <option value="friendly">Friendly</option>
                  <option value="formal">Formal</option>
                  <option value="professional">Professional</option>
                  <option value="reassuring">Reassuring</option>
                  <option value="sales">Sales-focused</option>
                  <option value="warm">Warm</option>
                </select>
              </label>
              <TextAreaField
                help="Example: Sound like a trusted local expert. Be clear, calm, and specific."
                label="How should Arc sound?"
                name="voiceGuidance"
                onChange={(value) => update("voiceGuidance", value)}
                rows={5}
                value={values.voiceGuidance}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <TextAreaField
                  help="One phrase per line."
                  label="Preferred phrases"
                  name="preferredPhrases"
                  onChange={(value) => update("preferredPhrases", value)}
                  rows={6}
                  value={values.preferredPhrases}
                />
                <TextAreaField
                  help="One phrase per line."
                  label="Banned phrases"
                  name="bannedPhrases"
                  onChange={(value) => update("bannedPhrases", value)}
                  rows={6}
                  value={values.bannedPhrases}
                />
              </div>
            </EditorSection>

            <EditorSection
              active={activeTab === "palette"}
              detail="The brand colors and fonts Arc cites when packaging creative."
              title="Brand palette"
              tone="palette"
            >
              <div className="grid gap-4">
                {([
                  ["primary", "Primary", values.primaryHex, values.primaryLabel],
                  ["secondary", "Secondary", values.secondaryHex, values.secondaryLabel],
                  ["accent", "Accent", values.accentHex, values.accentLabel],
                  ["dark", "Dark / ink", values.darkHex, values.darkLabel],
                  ["light", "Light / background", values.lightHex, values.lightLabel],
                ] as const).map(([slot, label, hex, name]) => (
                  <ColorRow
                    key={slot}
                    slot={slot}
                    label={label}
                    hex={hex}
                    name={name}
                    onHex={(v) => update(`${slot}Hex` as keyof FormValues, v)}
                    onLabel={(v) => update(`${slot}Label` as keyof FormValues, v)}
                  />
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Heading font</span>
                  <input
                    className={inputClass}
                    name="palette_heading_font"
                    onChange={(e) => update("paletteHeadingFont", e.target.value)}
                    placeholder="e.g. Oswald"
                    value={values.paletteHeadingFont}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Body font</span>
                  <input
                    className={inputClass}
                    name="palette_body_font"
                    onChange={(e) => update("paletteBodyFont", e.target.value)}
                    placeholder="e.g. Inter"
                    value={values.paletteBodyFont}
                  />
                </label>
              </div>
            </EditorSection>

            <EditorSection
              active={activeTab === "proof"}
              detail="Use one line per offering or proof point so Arc can pull clean facts."
              title="Offerings & proof"
              tone="proof"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextAreaField
                  help="One product, service, package, or offer per line."
                  label="Products, services, or offers"
                  name="services"
                  onChange={(value) => update("services", value)}
                  rows={8}
                  value={values.services}
                />
                <TextAreaField
                  help="One proof point per line."
                  label="Proof points"
                  name="proofPoints"
                  onChange={(value) => update("proofPoints", value)}
                  rows={8}
                  value={values.proofPoints}
                />
              </div>
            </EditorSection>

            <EditorSection
              active={activeTab === "rules"}
              detail="Set the claims, compliance notes, and whether this profile is approved for use."
              title="Rules"
              tone="rules"
            >
              <TextAreaField
                help="One claim or phrase type per line."
                label="Claims Arc should avoid"
                name="disallowedClaims"
                onChange={(value) => update("disallowedClaims", value)}
                rows={7}
                value={values.disallowedClaims}
              />
              <TextAreaField
                help="Plain guidance for reviewers and generated copy."
                label="Compliance notes"
                name="complianceNotes"
                onChange={(value) => update("complianceNotes", value)}
                rows={6}
                value={values.complianceNotes}
              />
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
                <span>
                  <span className="block text-sm font-bold text-[var(--text-primary)]">Arc can use this brand</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
                    Turn this on when the profile is ready for campaigns and copy.
                  </span>
                </span>
                <input
                  checked={values.status === "active"}
                  className="h-4 w-4 accent-[var(--accent)]"
                  onChange={(event) => update("status", event.target.checked ? "active" : "draft")}
                  type="checkbox"
                />
              </label>
            </EditorSection>
          </main>

          <aside className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 xl:border-l xl:border-t-0">
            <div className="sticky top-5 grid gap-4">
              <div>
                <div className="signal-eyebrow">Preview</div>
                <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">Arc will use this</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  A quick read of the brand context before saving.
                </p>
              </div>

              <PreviewBlock label="Company" value={values.displayName || "No company name yet"} />
              <PreviewBlock label="Industry" value={formatIndustryLabel(values.industry) || "No industry yet"} />
              <PreviewBlock label="Tone" value={values.voiceGuidance || `Use a ${values.tone} tone.`} />
              <PreviewList empty="No offerings yet" items={serviceList.slice(0, 4)} label="Offerings" />
              <PreviewList empty="No proof points yet" items={proofList.slice(0, 4)} label="Proof" />
              <PreviewList empty="No blocked claims yet" items={blockedList.slice(0, 4)} label="Avoid" />

              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <CheckCircle2 aria-hidden className="h-4 w-4 text-[var(--ok)]" />
                  {values.status === "active" ? "Active for Arc" : "Saved as draft"}
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {values.status === "active"
                    ? "Arc can use this brand when drafting."
                    : "Arc keeps the current active profile until this is ready."}
                </p>
              </div>
            </div>
          </aside>
        </div>

        <input name="logoUpload" type="hidden" value="" />
        <input name="faviconUpload" type="hidden" value="" />
        <input name="status" type="hidden" value={values.status} />
      </form>
    </Panel>
  );
}

function ColorRow({
  slot,
  label,
  hex,
  name,
  onHex,
  onLabel,
}: {
  slot: string;
  label: string;
  hex: string;
  name: string;
  onHex: (v: string) => void;
  onLabel: (v: string) => void;
}) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  return (
    <div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)]">
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        <input
          aria-label={`${label} color`}
          className="h-10 w-14 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)]"
          type="color"
          value={swatch}
          onChange={(e) => onHex(e.target.value)}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Hex</span>
        <input
          className={inputClass}
          name={`palette_${slot}_hex`}
          placeholder="#1B2A4A"
          value={hex}
          onChange={(e) => onHex(e.target.value)}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Label (optional)</span>
        <input
          className={inputClass}
          name={`palette_${slot}_label`}
          placeholder="e.g. Navy"
          value={name}
          onChange={(e) => onLabel(e.target.value)}
        />
      </label>
    </div>
  );
}

function EditorSection({
  active,
  children,
  detail,
  title,
  tone,
}: {
  active: boolean;
  children: React.ReactNode;
  detail: string;
  title: string;
  tone: EditorTab;
}) {
  const style = sectionStyles[tone];
  return (
    <section
      aria-label={title}
      className={active ? cx("overflow-hidden border border-l-4 border-[var(--border-hairline)]", style.border) : "hidden"}
    >
      <div aria-hidden className={cx("h-1", style.bar)} />
      <div className={cx("border-b border-[var(--border-hairline)] px-4 py-3", style.surface)}>
        <div className="signal-eyebrow">Editing</div>
        <h3 className="mt-1 text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
      </div>
      <div className="grid gap-4 bg-[var(--surface-panel)] p-4">{children}</div>
    </section>
  );
}

function TextField({
  label,
  name,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  name: keyof FormValues;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
      <input className={inputClass} name={name} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  );
}

function FileField({
  accept,
  help,
  label,
  name,
}: {
  accept: string;
  help: string;
  label: string;
  name: string;
}) {
  const [fileName, setFileName] = useState("");

  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
      <span className={cx(theme.surface.dashedEmpty, "flex min-h-20 cursor-pointer items-center gap-3 px-3 py-3 text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-inset)]")}>
        <UploadCloud aria-hidden className="h-4 w-4 shrink-0 text-[var(--accent)]" />
        <span className="min-w-0">
          <span className="block font-semibold text-[var(--text-primary)]">{fileName || "Choose file"}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{help}</span>
        </span>
        <input
          accept={accept}
          className="sr-only"
          name={name}
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          type="file"
        />
      </span>
    </label>
  );
}

function IndustrySelectField({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const known = value ? INDUSTRY_TEMPLATES.some((template) => template.id === value) : true;

  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-[var(--text-primary)]">Industry</span>
      <select className={inputClass} name="industry" onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Not set</option>
        {INDUSTRY_TEMPLATES.filter((template) => template.id !== "neutral").map((template) => (
          <option key={template.id} value={template.id}>
            {template.label}
          </option>
        ))}
        {!known ? <option value={value}>{formatIndustryLabel(value)}</option> : null}
      </select>
    </label>
  );
}

function TextAreaField({
  help,
  label,
  name,
  onChange,
  rows,
  value,
}: {
  help?: string;
  label: string;
  name: keyof FormValues;
  onChange: (value: string) => void;
  rows: number;
  value: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
      <textarea
        className={textareaClass}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value}
      />
      {help ? <span className="text-xs leading-5 text-[var(--text-muted)]">{help}</span> : null}
    </label>
  );
}

function PreviewBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{value}</p>
    </div>
  );
}

function PreviewList({ empty, items, label }: { empty: string; items: string[]; label: string }) {
  return (
    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-1.5">
          {items.map((item) => (
            <li className="text-sm leading-5 text-[var(--text-secondary)]" key={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{empty}</p>
      )}
    </div>
  );
}
