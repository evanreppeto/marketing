import type { CollectionIcon as IconName, StatusTone } from "../_data/notebook";

const TONE_COLOR: Record<StatusTone, string> = {
  blue: "var(--accent)",
  green: "oklch(0.78 0.14 158)",
  amber: "oklch(0.82 0.13 85)",
  red: "var(--priority)",
  gray: "var(--text-muted)",
  dark: "var(--text-primary)",
};

const PATHS: Record<IconName, string> = {
  play: "M8 5v14l11-7z",
  handshake: "M12 11l3-3 4 4-5 5-2-2-2 2-5-5 4-4 3 3z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5z",
  shield: "M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5l8-3z",
  note: "M5 3h11l3 3v15H5V3zm10 1.5V7h2.5L15 4.5z",
};

export function CollectionIcon({ icon, tone, size = 16 }: { icon: IconName; tone: StatusTone; size?: number }) {
  return (
    <svg aria-hidden="true" fill={TONE_COLOR[tone]} height={size} viewBox="0 0 24 24" width={size}>
      <path d={PATHS[icon]} />
    </svg>
  );
}
