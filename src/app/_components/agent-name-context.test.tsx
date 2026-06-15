import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentNameProvider, useAgentName } from "./agent-name-context";

function Probe() {
  return <span>{useAgentName()}</span>;
}

describe("useAgentName", () => {
  it("defaults to Agent with no provider", () => {
    expect(renderToStaticMarkup(<Probe />)).toBe("<span>Agent</span>");
  });

  it("returns the provider's value when wrapped", () => {
    expect(
      renderToStaticMarkup(
        <AgentNameProvider value="Hermes">
          <Probe />
        </AgentNameProvider>,
      ),
    ).toBe("<span>Hermes</span>");
  });
});
