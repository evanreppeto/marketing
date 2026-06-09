import { Panel } from "../_components/page-header";

/**
 * One settings card: a titled, optionally-described section with a body. Shared by the
 * editable operator settings and the Connections panel so every section reads the same.
 * `bodyClassName` lets row-based sections (Connections) go edge-to-edge with `p-0`.
 */
export function SettingsSection({
  title,
  description,
  actions,
  bodyClassName = "px-5 py-4",
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-[70ch] text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Panel>
  );
}
