import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import { ConsoleFrame } from "./_components/console-frame";
import { getAuthMode } from "@/lib/auth/auth-mode";
import { getConfiguredOperatorCredentials } from "@/lib/auth/operator-shared";
import { getAgentDisplayName } from "@/lib/arc-chat/agent-config";
import { getAppSettings } from "@/lib/settings/store";
import { resolveBrandIdentity } from "@/lib/brand-kit/identity";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { listWorkspacesForUser } from "@/lib/auth/workspace-admin";
import { roleLabel } from "@/lib/auth/workspace-roles";
import { getSupabaseAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

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

const serif = headline;

type OperatorShellProfile = {
  avatarUrl: string | null;
  email: string | null;
  name: string;
};

function stringFromMetadata(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function getOperatorShellProfile(): Promise<OperatorShellProfile> {
  const configuredEmail = getConfiguredOperatorCredentials()?.email ?? null;
  const fallbackName = configuredEmail?.split("@")[0] || "Evan";

  if (getAuthMode() !== "supabase") {
    return {
      avatarUrl: null,
      email: configuredEmail,
      name: fallbackName,
    };
  }

  const user = await getSupabaseAuthenticatedUser();
  if (!user) {
    return {
      avatarUrl: null,
      email: configuredEmail,
      name: fallbackName,
    };
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataName = stringFromMetadata(metadata, ["full_name", "name", "display_name"]);
  const metadataAvatarUrl = stringFromMetadata(metadata, ["avatar_url", "picture", "photo_url"]);
  let profileName: string | null = null;
  let profileAvatarUrl: string | null = null;

  if (isSupabaseAdminConfigured()) {
    const { data } = await getSupabaseAdminClient()
      .from("profiles")
      .select("full_name,avatar_url")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string | null; avatar_url: string | null }>();

    profileName = data?.full_name?.trim() || null;
    profileAvatarUrl = data?.avatar_url?.trim() || null;
  }

  const email = user.email?.trim().toLowerCase() || configuredEmail;

  return {
    avatarUrl: profileAvatarUrl ?? metadataAvatarUrl,
    email,
    name: profileName ?? metadataName ?? email?.split("@")[0] ?? fallbackName,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { workspaceName, productLabel, brandFaviconUrl } = await getAppSettings();
  const identity = await resolveBrandIdentity();
  const resolvedName = identity.displayName ?? workspaceName;
  const resolvedFavicon = identity.faviconUrl ?? brandFaviconUrl;
  return {
    title: `${resolvedName} | ${productLabel}`,
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
  const settings = await getAppSettings();
  const identity = await resolveBrandIdentity();
  const operator = await getOperatorShellProfile();

  const userWorkspaces = await listWorkspacesForUser();
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
      className={`h-full antialiased ${display.variable} ${serif.variable} ${body.variable} ${mono.variable}`}
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
