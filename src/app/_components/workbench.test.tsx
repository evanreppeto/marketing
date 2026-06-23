import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DossierPanel, MetricBand, MetricCell, WorkbenchFrame } from "./workbench";

describe("workbench primitives", () => {
  it("renders a route frame with actions, tabs, content, and an aside", () => {
    const html = renderToStaticMarkup(
      <WorkbenchFrame
        actions={<button type="button">New mission</button>}
        aside={<DossierPanel title="Selected record">Arc insight</DossierPanel>}
        description="Command center for relationships, opportunities, and revenue."
        eyebrow="CRM"
        tabs={<nav>Leads</nav>}
        title="CRM"
      >
        <MetricBand>
          <MetricCell delta="6 vs 30d" label="Avg lead score" tone="ok" value="78" />
          <MetricCell delta="12% vs 30d" label="Open pipeline" tone="accent" value="$348K" />
        </MetricBand>
      </WorkbenchFrame>,
    );

    expect(html).toContain("CRM");
    expect(html).toContain("New mission");
    expect(html).toContain("Leads");
    expect(html).toContain("Avg lead score");
    expect(html).toContain("Selected record");
    expect(html).toContain("Arc insight");
    expect(html).toContain("xl:grid-cols-[minmax(0,1fr)_390px]");
  });
});
