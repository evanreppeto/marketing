"use client";

import { type ReactNode, useState } from "react";

import { Button, Panel, StatusPill } from "../_components/page-header";
import { SettingsNav } from "./settings-nav";
import { SettingsSection } from "./settings-section";
import { type SettingsSectionId } from "./settings-sections";

type CtaRule = {
  persona: string;
  cta: string;
};

type GuardrailDraft = { rule: string; enabled: boolean };
type StoredSettingsDraft = {
  autonomy?: string;
  guardrails?: GuardrailDraft[];
  ctaRules?: CtaRule[];
  brandVoice?: string;
  savedAt?: string;
};

const SETTINGS_STORAGE_KEY = "bsr-mark-settings-draft-v1";

const DEFAULT_BRAND_VOICE =
  "Local, direct, reassuring, restoration-specific, and evidence-backed. Avoid hype, guarantees, and insurance outcome promises.";

const AUTONOMY_LEVELS = [
  { id: "0", label: "Level 0", detail: "Observe only" },
  { id: "1", label: "Level 1", detail: "Draft only" },
  { id: "2", label: "Level 2", detail: "Human approval required" },
  { id: "3", label: "Level 3", detail: "Internal enrichment only" },
  { id: "4", label: "Level 4", detail: "Controlled autopilot — not enabled" },
];

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

export function SettingsControls({
  initialGuardrails,
  initialCtaRules,
  connections,
}: {
  initialGuardrails: string[];
  initialCtaRules: CtaRule[];
  connections: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<SettingsSectionId>("automation");
  const [autonomy, setAutonomy] = useState(() => {
    const stored = readStoredDraft();
    return isAllowedAutonomy(stored?.autonomy) ? stored.autonomy : "2";
  });
  const [guardrails, setGuardrails] = useState(() => {
    const stored = readStoredDraft();
    return initialGuardrails.map((rule) => ({
      rule,
      enabled: stored?.guardrails?.find((item) => item.rule === rule)?.enabled ?? true,
    }));
  });
  const [ctaRules, setCtaRules] = useState(() => {
    const stored = readStoredDraft();
    return initialCtaRules.map((rule) => ({
      persona: rule.persona,
      cta: stored?.ctaRules?.find((item) => item.persona === rule.persona)?.cta ?? rule.cta,
    }));
  });
  const [brandVoice, setBrandVoice] = useState(() => {
    const stored = readStoredDraft();
    return typeof stored?.brandVoice === "string" && stored.brandVoice.trim() ? stored.brandVoice : DEFAULT_BRAND_VOICE;
  });
  const [savedAt, setSavedAt] = useState<string | null>(() => {
    const stored = readStoredDraft();
    return typeof stored?.savedAt === "string" ? stored.savedAt : null;
  });

  function saveLocalDraft() {
    const nextSavedAt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    const draft: StoredSettingsDraft = { autonomy, guardrails, ctaRules, brandVoice, savedAt: nextSavedAt };
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(draft));
    setSavedAt(nextSavedAt);
  }

  function resetDraft() {
    setAutonomy("2");
    setGuardrails(initialGuardrails.map((rule) => ({ rule, enabled: true })));
    setCtaRules(initialCtaRules.map((rule) => ({ ...rule })));
    setBrandVoice(DEFAULT_BRAND_VOICE);
    setSavedAt(null);
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
      <SettingsNav active={activeTab} onSelect={setActiveTab} />

      <div className="min-w-0 space-y-5">
        {activeTab === "automation" ? (
          <SettingsSection
            description="How much Mark can prepare on its own. Outbound execution stays locked regardless of level."
            title="Automation"
          >
            <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
              <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="autonomy-level">
                Autonomy level
              </label>
              <select
                className={inputClass}
                id="autonomy-level"
                onChange={(event) => setAutonomy(event.target.value)}
                value={autonomy}
              >
                {AUTONOMY_LEVELS.filter((level) => level.id !== "4").map((level) => (
                  <option key={level.id} value={level.id}>
                    {`${level.label} — ${level.detail}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill tone="amber">Outbound locked</StatusPill>
              <span className="text-xs leading-5 text-[var(--text-muted)]">
                No send, publish, launch, spend, or contact without explicit human approval.
              </span>
            </div>
          </SettingsSection>
        ) : null}

        {activeTab === "guardrails" ? (
          <SettingsSection description="Safety checks applied before anything reaches an approval queue." title="Guardrails">
            <div className="grid gap-2">
              {guardrails.map((item, index) => (
                <label
                  className="grid cursor-pointer items-start gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-3 transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] sm:grid-cols-[auto_minmax(0,1fr)]"
                  key={item.rule}
                >
                  <input
                    checked={item.enabled}
                    className="mt-1 h-4 w-4 cursor-pointer accent-[var(--accent)]"
                    onChange={(event) => {
                      const next = [...guardrails];
                      next[index] = { ...item, enabled: event.target.checked };
                      setGuardrails(next);
                    }}
                    type="checkbox"
                  />
                  <span className="text-sm leading-6 text-[var(--text-secondary)]">{item.rule}</span>
                </label>
              ))}
            </div>
          </SettingsSection>
        ) : null}

        {activeTab === "cta-rules" ? (
          <SettingsSection description="The action language Mark uses per persona in internal guidance." title="CTA rules">
            <div className="grid gap-2">
              {ctaRules.map((rule, index) => (
                <label className="grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center" key={rule.persona}>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{rule.persona}</span>
                  <input
                    className={inputClass}
                    onChange={(event) => {
                      const next = [...ctaRules];
                      next[index] = { ...rule, cta: event.target.value };
                      setCtaRules(next);
                    }}
                    value={rule.cta}
                  />
                </label>
              ))}
            </div>
          </SettingsSection>
        ) : null}

        {activeTab === "brand-voice" ? (
          <SettingsSection description="Copy posture Mark follows when drafting outbound-facing content." title="Brand voice">
            <textarea
              className="min-h-32 w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              onChange={(event) => setBrandVoice(event.target.value)}
              value={brandVoice}
            />
          </SettingsSection>
        ) : null}

        {activeTab === "connections" ? connections : null}

        {activeTab === "connections" ? null : (
          <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-[var(--text-muted)]">
              {savedAt ? `Saved ${savedAt} · ` : ""}Stored in this browser only — does not enable outbound.
            </p>
            <div className="flex gap-2">
              <Button onClick={resetDraft} size="sm" variant="ghost">
                Reset
              </Button>
              <Button onClick={saveLocalDraft} size="sm" variant="primary">
                Save changes
              </Button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function readStoredDraft(): StoredSettingsDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredSettingsDraft) : null;
  } catch {
    return null;
  }
}

function isAllowedAutonomy(value: unknown): value is string {
  return typeof value === "string" && AUTONOMY_LEVELS.some((level) => level.id === value && level.id !== "4");
}
