import { PageHeader } from "../_components/page-header";
import { ConnectionsPanel } from "./connections-panel";
import { SettingsControls } from "./settings-controls";
import { SettingsNav } from "./settings-nav";

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
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Configure how Mark prepares growth work. Outbound execution stays locked until an approved workflow exists."
      />

      <div className="mx-auto w-full max-w-[1040px]">
        <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
          <SettingsNav />
          <div className="min-w-0 space-y-5">
            <SettingsControls
              initialCtaRules={ctaRules.map(([persona, cta]) => ({ persona, cta }))}
              initialGuardrails={guardrails}
            />
            <ConnectionsPanel />
          </div>
        </div>
      </div>
    </>
  );
}
