"use client";

import { useActionState, useRef, useState } from "react";

import { applyIndustryTemplate } from "@/domain";
import { Button } from "../_components/page-header";
import { saveBrandKitAction, type BrandKitActionState } from "./brand-kit-actions";

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

const textareaClass =
  "min-h-24 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)] resize-y";

const subsectionHeadingClass = "text-xs font-medium text-[var(--text-muted)] mb-3 mt-1";

function Feedback({ state }: { state: BrandKitActionState }) {
  if (!state) return null;
  return (
    <span className={`text-xs font-semibold ${state.ok ? "text-[var(--ok-text)]" : "text-[var(--priority-text)]"}`}>
      {state.message}
    </span>
  );
}

export function BrandKitForm({
  initialDisplayName,
  initialLegalName,
  initialTagline,
  initialDescription,
  initialIndustry,
  initialWebsiteUrl,
  initialFaviconUrl,
  initialShortMark,
  initialLogoUrl,
  initialServiceAreas,
  initialTone,
  initialVoiceGuidance,
  initialPreferredPhrases,
  initialBannedPhrases,
  initialServices,
  initialDisallowedClaims,
  initialComplianceNotes,
  initialProofPoints,
  initialStatus,
  templates,
}: {
  initialDisplayName: string;
  initialLegalName: string;
  initialTagline: string;
  initialDescription: string;
  initialIndustry: string;
  initialWebsiteUrl: string;
  initialFaviconUrl: string;
  initialShortMark: string;
  initialLogoUrl: string;
  initialServiceAreas: string;
  initialTone: string;
  initialVoiceGuidance: string;
  initialPreferredPhrases: string;
  initialBannedPhrases: string;
  initialServices: string;
  initialDisallowedClaims: string;
  initialComplianceNotes: string;
  initialProofPoints: string;
  initialStatus: string;
  templates: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveBrandKitAction, null);

  // Identity fields
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [legalName, setLegalName] = useState(initialLegalName);
  const [tagline, setTagline] = useState(initialTagline);
  const [description, setDescription] = useState(initialDescription);
  const [industry, setIndustry] = useState(initialIndustry);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl);
  const [faviconUrl, setFaviconUrl] = useState(initialFaviconUrl);
  const [shortMark, setShortMark] = useState(initialShortMark);
  const [serviceAreas, setServiceAreas] = useState(initialServiceAreas);
  const [status, setStatus] = useState(initialStatus);

  // Logo upload (same pattern as BrandingSettingsForm)
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [logoUpload, setLogoUpload] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [logoFileName, setLogoFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice fields
  const [tone, setTone] = useState(initialTone);
  const [voiceGuidance, setVoiceGuidance] = useState(initialVoiceGuidance);
  const [preferredPhrases, setPreferredPhrases] = useState(initialPreferredPhrases);
  const [bannedPhrases, setBannedPhrases] = useState(initialBannedPhrases);

  // Services
  const [services, setServices] = useState(initialServices);

  // Guardrails
  const [disallowedClaims, setDisallowedClaims] = useState(initialDisallowedClaims);
  const [complianceNotes, setComplianceNotes] = useState(initialComplianceNotes);

  // Proof points
  const [proofPoints, setProofPoints] = useState(initialProofPoints);

  function readLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Choose an image file.");
      return;
    }
    if (file.size > 550_000) {
      setUploadError("Use a logo under 550 KB for now.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUpload(typeof reader.result === "string" ? reader.result : "");
      setLogoFileName(file.name);
      setUploadError("");
    };
    reader.onerror = () => setUploadError("Couldn't read that logo file.");
    reader.readAsDataURL(file);
  }

  function handleTemplateChange(templateId: string) {
    if (!templateId) return;
    const applied = applyIndustryTemplate(templateId);
    // Prefill only currently-empty fields to avoid clobbering user input.
    if (!displayName) setDisplayName(applied.displayName);
    if (!industry && applied.industry) setIndustry(applied.industry);
    if (!tone && applied.tone) setTone(applied.tone);
    if (!services && applied.services.length > 0) setServices(applied.services.join("\n"));
    if (!voiceGuidance && applied.voiceGuidance) setVoiceGuidance(applied.voiceGuidance);
    if (!preferredPhrases && applied.preferredPhrases.length > 0)
      setPreferredPhrases(applied.preferredPhrases.join("\n"));
    if (!bannedPhrases && applied.bannedPhrases.length > 0)
      setBannedPhrases(applied.bannedPhrases.join("\n"));
  }

  return (
    <form action={action} className="grid gap-6">
      {/* Template quick-start */}
      <div className="grid gap-1.5">
        <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="brand-kit-template">
          Quick-start template
        </label>
        <select
          className={inputClass}
          id="brand-kit-template"
          onChange={(e) => handleTemplateChange(e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>
            Apply an industry template to prefill empty fields
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">
          Only fills empty fields - anything you have already typed stays untouched.
        </span>
      </div>

      {/* Identity */}
      <div className="grid gap-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <p className={subsectionHeadingClass}>Identity</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Display name</span>
            <input
              className={inputClass}
              name="displayName"
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Big Shoulders Restoration"
              value={displayName}
            />
            <span className="text-xs text-[var(--text-muted)]">
              The name Arc uses in all copy and campaign context.
            </span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Legal name</span>
            <input
              className={inputClass}
              value={legalName}
              name="legalName"
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Big Shoulders Restoration LLC"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Tagline</span>
            <input
              className={inputClass}
              value={tagline}
              name="tagline"
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Chicago's trusted restoration team"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Industry</span>
            <input
              className={inputClass}
              value={industry}
              name="industry"
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="home_property_services"
            />
            <span className="text-xs text-[var(--text-muted)]">
              Set by the template above, or enter a custom value.
            </span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Website URL</span>
            <input
              className={inputClass}
              value={websiteUrl}
              name="websiteUrl"
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://bigshouldersrestoration.com"
              type="url"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Short mark</span>
            <input
              className={inputClass}
              value={shortMark}
              name="shortMark"
              onChange={(e) => setShortMark(e.target.value)}
              placeholder="BSR"
            />
            <span className="text-xs text-[var(--text-muted)]">
              Shown in the sidebar when no logo is uploaded.
            </span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Favicon URL</span>
            <input
              className={inputClass}
              value={faviconUrl}
              name="faviconUrl"
              onChange={(e) => setFaviconUrl(e.target.value)}
              placeholder="/icon.png"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Logo URL</span>
            <input
              className={inputClass}
              name="logoUrl"
              onChange={(e) => {
                setLogoUrl(e.target.value);
                setLogoUpload("");
              }}
              placeholder="/brand/logo.png or https://..."
              value={logoUrl}
            />
          </label>
        </div>

        <div className="grid gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">Upload logo</div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              PNG, JPG, WebP, GIF, or SVG up to 550 KB. Stored inline - no storage setup needed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => readLogo(e.target.files?.[0])}
              type="file"
            />
            <Button onClick={() => fileInputRef.current?.click()} size="sm" type="button" variant="ghost">
              Choose logo
            </Button>
            <span className="text-xs text-[var(--text-muted)]">{logoFileName || "No logo selected"}</span>
            <Button
              onClick={() => {
                setLogoUpload("");
                setLogoUrl("");
                setLogoFileName("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove logo
            </Button>
          </div>
          {uploadError ? <p className="text-xs font-semibold text-[var(--priority-text)]">{uploadError}</p> : null}
        </div>
        <input name="logoUpload" type="hidden" value={logoUpload} />

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Description</span>
          <textarea
            className={textareaClass}
            value={description}
            name="description"
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short paragraph Arc and the console use to describe your business."
          />
          <span className="text-xs text-[var(--text-muted)]">Up to ~74 words. Arc reads this when building campaign context.</span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Service areas</span>
          <textarea
            className={textareaClass}
            value={serviceAreas}
            name="serviceAreas"
            onChange={(e) => setServiceAreas(e.target.value)}
            placeholder={"Chicago, IL\nNorthwest suburbs\nLake County"}
          />
          <span className="text-xs text-[var(--text-muted)]">One geographic area per line.</span>
        </label>
      </div>

      {/* Voice */}
      <div className="grid gap-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <p className={subsectionHeadingClass}>Voice</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Tone</span>
            <select
              className={inputClass}
              name="tone"
              onChange={(e) => setTone(e.target.value)}
              value={tone}
            >
              <option value="balanced">Balanced</option>
              <option value="direct">Direct</option>
              <option value="friendly">Friendly</option>
              <option value="formal">Formal</option>
              <option value="professional">Professional</option>
              <option value="reassuring">Reassuring</option>
              <option value="sales">Sales-focused</option>
              <option value="warm">Warm</option>
            </select>
            <span className="text-xs text-[var(--text-muted)]">
              Arc applies this tone to all generated copy by default.
            </span>
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Voice guidance</span>
          <textarea
            className={textareaClass}
            value={voiceGuidance}
            name="voiceGuidance"
            onChange={(e) => setVoiceGuidance(e.target.value)}
            placeholder="Sound like a trusted local expert - not a national brand. Use first names when possible."
          />
          <span className="text-xs text-[var(--text-muted)]">
            Free-form style notes shown to Arc before drafting any copy.
          </span>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Preferred phrases</span>
          <textarea
            className={textareaClass}
            value={preferredPhrases}
            name="preferredPhrases"
            onChange={(e) => setPreferredPhrases(e.target.value)}
            placeholder={"we're there when it matters\ncertified and insured\nno hidden fees"}
          />
          <span className="text-xs text-[var(--text-muted)]">One phrase per line. Arc weaves these in where natural.</span>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Banned phrases</span>
          <textarea
            className={textareaClass}
            value={bannedPhrases}
            name="bannedPhrases"
            onChange={(e) => setBannedPhrases(e.target.value)}
            placeholder={"cheapest in town\nguaranteed results\nlimited time only"}
          />
          <span className="text-xs text-[var(--text-muted)]">One phrase per line. Arc will never use these in copy.</span>
        </label>
      </div>

      {/* Services */}
      <div className="grid gap-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <p className={subsectionHeadingClass}>Services</p>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Service list</span>
          <textarea
            className={textareaClass}
            value={services}
            name="services"
            onChange={(e) => setServices(e.target.value)}
            placeholder={"Water damage restoration\nFire and smoke cleanup\nMold remediation\nEmergency board-up"}
          />
          <span className="text-xs text-[var(--text-muted)]">
            One service per line. Arc uses this list when building campaign targeting and copy.
          </span>
        </label>
      </div>

      {/* Guardrails */}
      <div className="grid gap-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <p className={subsectionHeadingClass}>Guardrails</p>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Disallowed claims</span>
          <textarea
            className={textareaClass}
            value={disallowedClaims}
            name="disallowedClaims"
            onChange={(e) => setDisallowedClaims(e.target.value)}
            placeholder={"False or unverifiable claims\nMisleading pricing or fake urgency\nGuarantees of outcomes outside the business's control"}
          />
          <span className="text-xs text-[var(--text-muted)]">
            One claim type per line. Arc checks copy against this list before approval.
          </span>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Compliance notes</span>
          <textarea
            className={textareaClass}
            value={complianceNotes}
            name="complianceNotes"
            onChange={(e) => setComplianceNotes(e.target.value)}
            placeholder="Keep claims truthful and substantiated. Avoid promises the business cannot guarantee."
          />
          <span className="text-xs text-[var(--text-muted)]">
            Free-form guidance shown to Arc and reviewers before any approval decision.
          </span>
        </label>
      </div>

      {/* Proof points */}
      <div className="grid gap-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <p className={subsectionHeadingClass}>Proof</p>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Proof points</span>
          <textarea
            className={textareaClass}
            value={proofPoints}
            name="proofPoints"
            onChange={(e) => setProofPoints(e.target.value)}
            placeholder={"500+ jobs completed\n4.9-star average review\nFully licensed and insured in Illinois"}
          />
          <span className="text-xs text-[var(--text-muted)]">
            One credibility fact per line. Arc uses these to back claims in campaigns.
          </span>
        </label>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            checked={status === "active"}
            className="sr-only"
            onChange={(e) => setStatus(e.target.checked ? "active" : "draft")}
            type="checkbox"
          />
          <span
            className={`inline-flex h-5 w-9 items-center rounded-full border transition ${
              status === "active"
                ? "border-[var(--accent-border-strong)] bg-[var(--accent)]"
                : "border-[var(--border-hairline)] bg-[var(--surface-soft)]"
            }`}
          >
            <span
              className={`h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                status === "active" ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {status === "active" ? "Active - Arc is using this brand profile" : "Draft - not yet active"}
          </span>
        </label>
        <input name="status" type="hidden" value={status} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} size="sm" type="submit" variant="primary">
          Save brand profile
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
