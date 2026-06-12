import Link from "next/link";

import { getConnections } from "@/lib/connections/read-model";
import { getAppSettings, getSupportContactEmail } from "@/lib/settings/store";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { StatusPill } from "../_components/page-header";
import { SettingsSection } from "./settings-section";

type HomeCard = {
  title: string;
  detail: string;
  href: string;
  action: string;
  done: boolean;
};

function score(cards: HomeCard[]): number {
  return Math.round((cards.filter((card) => card.done).length / cards.length) * 100);
}

function tone(done: boolean) {
  return done ? "green" : "amber";
}

export async function SettingsHome() {
  const settings = await getAppSettings();
  const connections = await getConnections();
  const emailReady = connections.some((connection) => connection.kind === "email" && connection.status === "connected");
  const socialReady = connections.some((connection) => connection.kind === "social" && connection.status === "connected");
  const hasLogo = Boolean(settings.brandLogoUrl);
  const hasSupport = Boolean(settings.supportEmail || getSupportContactEmail(settings));
  const hasBehavior =
    settings.assistantTone !== "direct" ||
    settings.assistantResponseStyle !== "balanced" ||
    settings.approvalStrictness !== "standard" ||
    settings.markDefaultMode !== "act" ||
    settings.markDefaultRoute !== "fast";

  const cards: HomeCard[] = [
    {
      title: "Branding",
      detail: hasLogo ? "Logo and names are customized." : "Names are set. Add a logo when you want the app to feel fully yours.",
      href: "/settings?section=branding",
      action: hasLogo ? "Review branding" : "Add logo",
      done: Boolean(settings.workspaceName && settings.productLabel && settings.assistantName),
    },
    {
      title: "Appearance",
      detail: `${settings.appearanceAccent} accent, ${settings.appearanceDensity} density, ${settings.appearanceMotion} motion.`,
      href: "/settings?section=appearance",
      action: "Tune UI",
      done: true,
    },
    {
      title: "Agent behavior",
      detail: hasBehavior ? "Chat defaults have been tuned." : "Using safe default chat behavior.",
      href: "/settings?section=behavior",
      action: "Tune agent",
      done: true,
    },
    {
      title: "Connections",
      detail: emailReady || socialReady ? "At least one outbound connection is ready." : "Connect email or social when you want dispatch paths ready.",
      href: "/settings?section=connections",
      action: "Open setup",
      done: emailReady || socialReady,
    },
    {
      title: "Account",
      detail: hasSupport ? "Support contact is available." : "Add a support contact so nontechnical users know where to go.",
      href: "/settings?section=account",
      action: "Review account",
      done: hasSupport,
    },
  ];
  const percent = score(cards);

  return (
    <SettingsSection
      description="Start here. This shows what is configured, what needs attention, and where to go next."
      title="Settings home"
      actions={<StatusPill tone={percent >= 80 ? "green" : "amber"}>{percent}% configured</StatusPill>}
    >
      <div className="grid gap-4">
        <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-[var(--text-primary)]">{settings.workspaceName}</div>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                {settings.productLabel} is set up for {settings.workspaceProfile === "individual" ? "an individual operator" : settings.workspaceProfile === "agency" ? "agency or client work" : "a company workspace"}.
              </p>
            </div>
            <StatusPill tone={isSupabaseAdminConfigured() ? "green" : "amber"}>
              {isSupabaseAdminConfigured() ? "Saving enabled" : "Preview mode"}
            </StatusPill>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-inset)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <Link
              className="group rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4 transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-inset)]"
              href={card.href}
              key={card.title}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[var(--text-primary)]">{card.title}</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{card.detail}</p>
                </div>
                <StatusPill tone={tone(card.done)}>{card.done ? "Ready" : "Needs setup"}</StatusPill>
              </div>
              <div className="mt-3 text-xs font-bold text-[var(--accent-contrast)] group-hover:text-[var(--text-primary)]">
                {card.action}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SettingsSection>
  );
}
