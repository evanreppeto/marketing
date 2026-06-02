import { IntelligencePanel } from "../_components/intelligence-panel";
import { StatusPill } from "../_components/page-header";
import { SettingsControls } from "./settings-controls";

const guardrails = [
  "No email, SMS, ad launch, page publishing, spend change, or contact action without explicit human approval.",
  "Avoid insurance coverage promises, claim approval promises, payout guarantees, or guaranteed response/outcome language.",
  "Keep hail-only, wind-only, roof-only, and unrelated remodeling assumptions out of BSR campaigns unless a human changes scope.",
  "Every outbound-facing draft needs evidence, risk flags, and a readable approval item.",
];

const ctaRules = [
  ["Emergency homeowner", "Call Now / Upload Photos"],
  ["Property manager", "Request Vendor Packet"],
  ["Insurance agent", "Refer a Client"],
  ["Trade partner", "Become a Partner"],
  ["HOA / landlord", "Request Building Review"],
];

export default function SettingsPage() {
  return (
    <>
      <header className="module-rise mb-4 rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-5 py-4 shadow-[var(--elev-panel)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="signal-eyebrow">Settings</span>
          <StatusPill tone="amber">Approval required</StatusPill>
          <StatusPill tone="amber">Outbound locked</StatusPill>
        </div>
        <h1 className="mt-2 max-w-3xl text-[clamp(1.55rem,2.5vw,2.4rem)] font-black leading-[1.02] tracking-[-0.04em] text-[var(--text-primary)]">
          Mark settings and approval guardrails.
        </h1>
        <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">
          Edit local operator rules for the app preview. Outbound execution stays locked until a separate approved workflow exists.
        </p>
      </header>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0">
          <SettingsControls
            initialCtaRules={ctaRules.map(([persona, cta]) => ({ persona, cta }))}
            initialGuardrails={guardrails}
          />
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: "Configured operating posture",
              persona: "All personas",
              confidence: "Policy defined",
              journeyStage: "Human approval required",
              urgency: "Always on",
              attentionReason: "Mark can prepare growth work, but humans decide whether anything moves externally.",
              nextBestAction: "Keep all outbound-facing content in approval queue records with evidence and guardrail notes.",
              cta: "Use persona-specific CTAs only as internal guidance until an approved asset exists.",
              messageAngle: "Local BSR restoration, mitigation, documentation, rebuild, and partner handoff.",
              guardrailStatus: "No send, publish, launch, spend, or contact automation is enabled.",
              scores: [
                { label: "Autonomy", value: "L2", detail: "Human approval required", tone: "amber" },
                { label: "Outbound", value: "Locked", detail: "No execution controls", tone: "green" },
                { label: "Evidence", value: "Required", detail: "Before approval", tone: "blue" },
              ],
              proofPoints: guardrails,
              outboundLocked: true,
            }}
          />
        </aside>
      </div>
    </>
  );
}
