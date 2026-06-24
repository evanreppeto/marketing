import Link from "next/link";

import { buttonClasses, Panel } from "../_components/page-header";

export function UsageSettings() {
  return (
    <Panel className="p-5">
      <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
        Usage &amp; billing
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-6 text-[var(--text-secondary)]">
        Token usage, run volume, and plan limits live on the full usage report.
      </p>
      <div className="mt-4 inline-flex">
        <Link className={buttonClasses({ size: "sm" })} href="/usage">
          Open usage report&nbsp;→
        </Link>
      </div>
    </Panel>
  );
}
