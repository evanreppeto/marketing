import { redirect } from "next/navigation";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { AuthShell } from "@/components/ui/auth-shell";

import { WelcomeAccountForm } from "./welcome-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finish setup" };

export default async function WelcomePage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx) redirect("/login?from=%2Fwelcome");
  return (
    <AuthShell
      headline={
        <>
          You&rsquo;ve joined <span className="italic text-[var(--accent)]">{ctx.workspaceName}</span>.
        </>
      }
      supporting="Set your name and a password to finish. Arc already knows this workspace's brand and context — you're picking up where the team is."
    >
      <WelcomeAccountForm workspaceName={ctx.workspaceName} role={ctx.role ?? "member"} />
    </AuthShell>
  );
}
