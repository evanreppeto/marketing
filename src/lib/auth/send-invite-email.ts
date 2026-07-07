import { resolveBrandEmailTheme, sendBrandedEmail } from "@/lib/email";

import { lookupWorkspaceInviteByCode } from "./workspace-invites";

export type SendInviteEmailResult = {
  acceptUrl: string;
  emailed: boolean;
  emailError: string | null;
};

/**
 * Sends the branded workspace-invite email, pointing recipients at the
 * `/accept-invite/[code]` screen (which shows the workspace, inviter, and role
 * before they create an account or sign in). Shared by the team-settings action
 * and the programmatic invite API so both behave identically. Never throws — the
 * caller surfaces `emailed`/`emailError` so a delivery failure doesn't lose the
 * invite (the code + link still work).
 */
export async function sendWorkspaceInviteEmail(params: {
  code: string;
  invitedEmail: string;
  origin: string;
}): Promise<SendInviteEmailResult> {
  const acceptUrl = `${params.origin}/accept-invite/${encodeURIComponent(params.code)}`;
  try {
    const details = await lookupWorkspaceInviteByCode(params.code);
    const workspaceName = details.ok ? details.workspaceName : undefined;
    const inviterName = details.ok ? details.inviterName : null;
    // Workspace brand in the header (theme), Arc in the "powered by" footer.
    const theme = await resolveBrandEmailTheme();
    const product = { name: "Arc", logoUrl: `${params.origin}/icon.png` };
    const sent = await sendBrandedEmail({
      to: params.invitedEmail,
      subject: `You're invited to join ${workspaceName ?? product.name}`,
      heading: `Join ${workspaceName ?? product.name}`,
      bodyBlocks: [
        `${inviterName ? `${inviterName} invited you` : "You've been invited"} to collaborate in ${workspaceName ?? "the workspace"} on ${product.name}.`,
        "Click below to accept your invitation and set up your account.",
      ],
      cta: { label: "Accept invitation", url: acceptUrl },
      theme,
      product,
    });
    return { acceptUrl, emailed: sent.ok, emailError: sent.ok ? null : sent.error ?? null };
  } catch (error) {
    return {
      acceptUrl,
      emailed: false,
      emailError: error instanceof Error ? error.message : "Invite email could not be sent.",
    };
  }
}
