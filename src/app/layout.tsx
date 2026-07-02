import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";

import { buildAppTitle } from "@/lib/branding/page-title";

import "./globals.css";
import { ConsoleFrame } from "./_components/console-frame";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { resolveBrandIdentity } from "@/lib/brand-kit/identity";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspacesForUser } from "@/lib/auth/workspace-admin";
import { roleLabel } from "@/lib/auth/workspace-roles";
import { getOperatorProfile } from "@/lib/auth/operator-profile";

const WORKSPACE_TYPE_LABEL: Record<string, string> = {
  individual: "Personal",
  company: "Company",
  agency: "Agency",
};

// Geist — the modern product grotesk (Linear/Vercel-grade). One family carries
// display, headings, and body so the UI reads as a single, intentional system.
// `display` and `serif` variables are kept (pointed at Geist) so existing
// `font-display` / `font-serif` usages resolve without per-component edits.
const display = Geist({
  subsets: ["latin"],
  variable: "--ff-display",
  display: "swap",
});

const headline = Geist({
  subsets: ["latin"],
  variable: "--ff-serif",
  display: "swap",
});

const body = Geist({
  subsets: ["latin"],
  variable: "--ff-body",
  display: "swap",
});

// Geist Mono — technical face for identifiers, scores, timestamps, tabular metrics.
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--ff-mono",
  display: "swap",
});

// Fraunces — the editorial serif signature, used ONLY for the auth-screen headlines
// (an intentional, confident type moment). The app-wide `--ff-serif` stays Geist.
const editorial = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--ff-editorial",
  display: "swap",
});

const serif = headline;

export async function generateMetadata(): Promise<Metadata> {
  const { assistantName, brandFaviconUrl } = await getAppSettings();
  const identity = await resolveBrandIdentity();
  const resolvedFavicon = identity.faviconUrl ?? brandFaviconUrl;
  return {
    title: buildAppTitle({ brand: assistantName, workspaceDisplayName: identity.displayName }),
    description: "Campaign planning, approvals, CRM, and performance workspace for service businesses.",
    icons: {
      icon: resolvedFavicon,
      apple: resolvedFavicon,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // These four reads are independent — run them in parallel so their latencies
  // overlap instead of stacking on every navigation (the shared root layout is
  // the per-page tax). getCurrentWorkspaceContext (below) is React cache()-wrapped,
  // so the dependent active-workspace lookup is effectively free.
  const [settings, identity, operator, userWorkspaces] = await Promise.all([
    getAppSettings(),
    resolveBrandIdentity(),
    getOperatorProfile(),
    listWorkspacesForUser(),
  ]);
  const activeWorkspaceId =
    userWorkspaces.length > 0 ? (await getCurrentWorkspaceContext().catch(() => null))?.workspaceId ?? undefined : undefined;
  const switcherWorkspaces = userWorkspaces.map((workspace) => ({
    id: workspace.workspaceId,
    name: workspace.workspaceName,
    plan: `${WORKSPACE_TYPE_LABEL[workspace.workspaceType] ?? "Workspace"} · ${roleLabel(workspace.role)}`,
  }));

  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${serif.variable} ${body.variable} ${mono.variable} ${editorial.variable}`}
      data-accent={settings.appearanceAccent}
      data-density={settings.appearanceDensity}
      data-motion={settings.appearanceMotion}
    >
      <body className="min-h-full flex flex-col">
        <ConsoleFrame
          agentName={getAgentDisplayName(settings.assistantName)}
          brand={{
            workspaceName: identity.displayName ?? settings.workspaceName,
            productLabel: settings.productLabel,
            shortName: identity.shortMark ?? settings.brandShortName,
            logoUrl: identity.logoUrl ?? settings.brandLogoUrl,
          }}
          operator={operator}
          workspaces={switcherWorkspaces}
          activeWorkspaceId={activeWorkspaceId}
        >
          {children}
        </ConsoleFrame>
      </body>
    </html>
  );
}
