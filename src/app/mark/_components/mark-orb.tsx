import { cx } from "@/app/_components/theme";

/** Mark's living orb avatar — molten gold, CSS-only (see .mark-orb in globals.css).
 *  Recolored from the 21st.dev "Siri Orb"; safe to render many times per thread. */
export function MarkOrb({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("mark-orb shrink-0", className)}
      style={
        {
          width: size,
          height: size,
          "--mark-orb-c1": "#c8a24a",
          "--mark-orb-c2": "#8a6a22",
          "--mark-orb-c3": "#e6d29a",
          "--mark-orb-blur": `${Math.max(size * 0.14, 3.5)}px`,
        } as React.CSSProperties
      }
    />
  );
}
