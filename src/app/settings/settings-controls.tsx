"use client";

import { useMemo, useState } from "react";

import { Button, StatusPill } from "../_components/page-header";

type CtaRule = {
  persona: string;
  cta: string;
};

type SettingsTab = "autonomy" | "guardrails" | "ctas" | "voice";

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; detail: string }> = [
  { id: "autonomy", label: "Autonomy", detail: "How much Mark can prepare" },
  { id: "guardrails", label: "Guardrails", detail: "Safety checks before approval" },
  { id: "ctas", label: "CTA rules", detail: "Persona action language" },
  { id: "voice", label: "Brand voice", detail: "Copy posture for drafts" },
];

const AUTONOMY_LEVELS = [
  { id: "0", label: "Level 0", detail: "Observe only" },
  { id: "1", label: "Level 1", detail: "Draft only" },
  { id: "2", label: "Level 2", detail: "Human approval required" },
  { id: "3", label: "Level 3", detail: "Internal enrichment only" },
  { id: "4", label: "Level 4", detail: "Controlled autopilot - not enabled" },
];

export function SettingsControls({
  initialGuardrails,
  initialCtaRules,
}: {
  initialGuardrails: string[];
  initialCtaRules: CtaRule[];
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("autonomy");
  const [autonomy, setAutonomy] = useState("2");
  const [guardrails, setGuardrails] = useState(initialGuardrails.map((rule) => ({ rule, enabled: true })));
  const [ctaRules, setCtaRules] = useState(initialCtaRules);
  const [brandVoice, setBrandVoice] = useState(
    "Local, direct, reassuring, restoration-specific, and evidence-backed. Avoid hype, guarantees, and insurance outcome promises.",
  );
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const enabledCount = useMemo(() => guardrails.filter((rule) => rule.enabled).length, [guardrails]);

  function saveLocalDraft() {
    setSavedAt(new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date()));
  }

  return (
    <section className="signal-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="signal-eyebrow">Editable operator settings</div>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-[var(--text-primary)]">Local settings draft</h2>
          <p className="mt-1 max-w-[74ch] text-sm leading-6 text-[var(--text-secondary)]">
            Pick a section, edit it, and save the local preview. This does not enable outbound execution.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="amber">Outbound locked</StatusPill>
          <StatusPill tone={savedAt ? "green" : "gray"}>{savedAt ? `Saved ${savedAt}` : "Unsaved"}</StatusPill>
        </div>
      </div>

      <div className="grid min-h-[560px] gap-0 xl:grid-cols-[230px_minmax(0,1fr)_280px]">
        <nav aria-label="Settings sections" className="border-b border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 xl:border-b-0 xl:border-r">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {SETTINGS_TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  aria-pressed={selected}
                  className={`cursor-pointer rounded-lg border px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] ${
                    selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]" : "border-[var(--border-hairline)] bg-[var(--surface-inset)]"
                  }`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  <span className="block text-sm font-black text-[var(--text-primary)]">{tab.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{tab.detail}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-w-0 p-4">
          {activeTab === "autonomy" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {AUTONOMY_LEVELS.map((level) => {
                const selected = autonomy === level.id;
                const disabled = level.id === "4";
                return (
                  <label
                    className={`cursor-pointer rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_18px_oklch(0.74_0.115_232/0.18)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-inset)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                    } ${disabled ? "opacity-60" : ""}`}
                    key={level.id}
                  >
                    <input
                      checked={selected}
                      className="sr-only"
                      disabled={disabled}
                      name="autonomy"
                      onChange={() => setAutonomy(level.id)}
                      type="radio"
                      value={level.id}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-[var(--text-primary)]">{level.label}</span>
                      {selected ? <StatusPill tone="blue">Active</StatusPill> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{level.detail}</p>
                  </label>
                );
              })}
            </div>
          ) : null}

          {activeTab === "guardrails" ? (
            <div className="grid gap-2">
              {guardrails.map((item, index) => (
                <label
                  className="grid cursor-pointer gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-3 transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] sm:grid-cols-[auto_minmax(0,1fr)]"
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
          ) : null}

          {activeTab === "ctas" ? (
            <div className="grid gap-3">
              {ctaRules.map((rule, index) => (
                <label className="grid gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center" key={rule.persona}>
                  <span className="font-bold text-[var(--text-primary)]">{rule.persona}</span>
                  <input
                    className="min-h-10 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
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
          ) : null}

          {activeTab === "voice" ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold text-[var(--text-primary)]">Brand voice instruction</span>
                <textarea
                  className="mt-2 min-h-44 w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                  onChange={(event) => setBrandVoice(event.target.value)}
                  value={brandVoice}
                />
              </label>
            </div>
          ) : null}
        </div>

        <aside className="border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4 xl:border-l xl:border-t-0">
          <div className="signal-eyebrow">Current preview</div>
          <dl className="mt-4 space-y-3">
            <SettingStat label="Autonomy" value={`Level ${autonomy}`} />
            <SettingStat label="Guardrails" value={`${enabledCount}/${guardrails.length}`} />
            <SettingStat label="Outbound" value="Locked" />
            <SettingStat label="Saved" value={savedAt ?? "Not saved"} />
          </dl>
          <div className="mt-4 grid gap-2">
            <Button onClick={saveLocalDraft} size="sm" variant="primary">
              Save local draft
            </Button>
            <Button
              onClick={() => {
                setAutonomy("2");
                setGuardrails(initialGuardrails.map((rule) => ({ rule, enabled: true })));
                setCtaRules(initialCtaRules);
                setSavedAt(null);
              }}
              size="sm"
              variant="ghost"
            >
              Reset preview
            </Button>
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">
            Persistence to Supabase should be added after we define the settings table. For now, these controls make the app usable without pretending to launch anything.
          </p>
        </aside>
      </div>
    </section>
  );
}

function SettingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <dt className="text-xs font-semibold text-[var(--text-muted)]">{label}</dt>
      <dd className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{value}</dd>
    </div>
  );
}
