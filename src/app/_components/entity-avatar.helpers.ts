/** Pure avatar resolution — no React imports, unit-tested in the node env. */

export type AvatarOwner =
  | { kind: "agent" }
  | { kind: "human"; name: string; profilePictureUrl?: string | null };

export type HumanAvatarView =
  | { kind: "photo"; url: string }
  | { kind: "initials"; initials: string };

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function resolveHumanAvatar(owner: {
  name: string;
  profilePictureUrl?: string | null;
}): HumanAvatarView {
  const url = owner.profilePictureUrl?.trim();
  if (url) return { kind: "photo", url };
  return { kind: "initials", initials: initialsFromName(owner.name) };
}
