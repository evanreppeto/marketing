import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentNameProvider, useAgentName } from "./agent-name-context";

function Probe() {
  return <span>{useAgentName()}</span>;
}

describe("useAgentName", () => {
  it("returns 'Agent' when used with no provider", () => {
    expect(renderToStaticMarkup(<Probe />)).toContain("Agent");
  });

  it("returns the provider value", () => {
    const html = renderToStaticMarkup(
      <AgentNameProvider value="Hermes">
        <Probe />
      </AgentNameProvider>,
    );
    expect(html).toContain("Hermes");
    expect(html).not.toContain("Agent");
  });
});
