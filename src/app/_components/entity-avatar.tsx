"use client";

import { ArcAvatar } from "@/app/arc/_components/arc-avatar";

import { resolveHumanAvatar, type AvatarOwner } from "./entity-avatar.helpers";

/** One avatar slot for both kinds of board owner: Arc (sphere) and humans
 *  (profile photo, with initials fallback until photos exist). */
export function EntityAvatar({
  owner,
  size = 26,
  pending = false,
}: {
  owner: AvatarOwner;
  size?: number;
  pending?: boolean;
}) {
  if (owner.kind === "agent") {
    return <ArcAvatar size={size} pending={pending} />;
  }

  const view = resolveHumanAvatar(owner);
  return (
    <span
      className="relative flex shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {view.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote profile URL, no optimizer config
        <img
          src={view.url}
          alt={owner.name}
          className="h-full w-full rounded-full object-cover shadow-[inset_0_0_0_1px_var(--border-panel)]"
        />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-full bg-[var(--surface-soft)] text-[9px] font-extrabold text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_var(--border-panel)]">
          {view.initials}
        </span>
      )}
    </span>
  );
}
