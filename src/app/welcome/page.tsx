import { redirect } from "next/navigation";

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import { WelcomeAccountForm } from "./welcome-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finish setup" };

export default async function WelcomePage() {
  const ctx = await getCurrentWorkspaceContext().catch(() => null);
  if (!ctx) redirect("/login?from=%2Fwelcome");
  return (
    <main className="chicago-dark grid min-h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)] md:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
      <section className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[500px]">
          <WelcomeAccountForm workspaceName={ctx.workspaceName} role={ctx.role ?? "member"} />
        </div>
      </section>
    </main>
  );
}
