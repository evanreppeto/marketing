import { Sparkline } from "./sparkline";

export type KpiCell = {
  label: string;
  value: string;
  // Trend delta (e.g. "+12.5%"). `dir` colors it: up=green, dn=red, flat=muted.
  delta?: { label: string; dir: "up" | "dn" | "flat" };
  // Optional 30-day series for the inline sparkline (omit for count-style KPIs).
  spark?: { points: number[]; up: boolean };
};

/**
 * The premium KPI stat-strip used on screen headers — the same three-cell metric
 * grid the home dashboard uses (`.metrics` in arc-app.css), so every screen reads
 * as one system. Values are real; a cell renders a delta and/or sparkline only
 * when that data is supplied (count-style KPIs simply show the number).
 */
export function KpiStrip({ items }: { items: KpiCell[] }) {
  if (items.length === 0) return null;
  return (
    <div className="metrics">
      {items.map((m) => (
        <div className="metric" key={m.label}>
          <div className="ml">{m.label}</div>
          <div className="mrow">
            <span className="mv">{m.value}</span>
            {m.delta && m.delta.label && m.delta.label !== "—" ? (
              <span className={`delta ${m.delta.dir}`}>{m.delta.label}</span>
            ) : null}
          </div>
          {m.spark && m.spark.points.length > 1 ? (
            <div className="spark">
              <Sparkline points={m.spark.points} up={m.spark.up} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
