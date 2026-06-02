import { IntelligencePanel } from "../_components/intelligence-panel";
import { StatusPill } from "../_components/page-header";
import { WorkspacePanel } from "../_components/workspace";

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
      <header className="module-rise mb-5 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="signal-eyebrow">Settings</span>
          <StatusPill tone="amber">Approval required</StatusPill>
          <StatusPill tone="amber">Outbound locked</StatusPill>
        </div>
        <h1 className="mt-3 max-w-3xl text-[clamp(1.8rem,3vw,3.2rem)] font-black leading-[0.98] tracking-[-0.05em] text-[var(--text-primary)]">
          Guardrails for Mark and the Growth Intelligence CRM.
        </h1>
        <p className="mt-3 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">
          This app is built around human approval, restoration-specific language, and clear evidence before action.
        </p>
      </header>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Safety model"
            title="Autonomy levels"
            description="MVP behavior is Level 1-2: Mark drafts and prepares, humans approve decisions."
          >
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {[
                ["Level 0", "Observe only"],
                ["Level 1", "Draft only"],
                ["Level 2", "Human approval required"],
                ["Level 3", "Internal enrichment only"],
                ["Level 4", "Controlled autopilot - not enabled"],
              ].map(([level, detail]) => (
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4" key={level}>
                  <div className="font-bold text-[var(--text-primary)]">{level}</div>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
                </div>
              ))}
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Guardrails" title="Do not cross these lines">
            <div className="grid gap-2 p-4">
              {guardrails.map((rule) => (
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-3 text-sm leading-6 text-[var(--text-secondary)]" key={rule}>
                  {rule}
                </div>
              ))}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Persona CTA rules"
            title="Internal landing and CTA guidance"
            description="These are planning rules only. The app does not publish landing pages."
          >
            <div className="divide-y divide-[var(--border-hairline)]">
              {ctaRules.map(([persona, cta]) => (
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[220px_minmax(0,1fr)]" key={persona}>
                  <div className="font-bold text-[var(--text-primary)]">{persona}</div>
                  <div className="text-sm leading-6 text-[var(--text-secondary)]">{cta}</div>
                </div>
              ))}
            </div>
          </WorkspacePanel>
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
