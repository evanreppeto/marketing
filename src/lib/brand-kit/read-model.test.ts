import { beforeEach, describe, expect, it, vi } from "vitest";

import { NEUTRAL_DEFAULTS } from "@/domain";
import { listNodes } from "@/lib/knowledge-graph/read-model";
import { getBusinessProfile, listPersonaDefinitions } from "./persistence";
import { getBusinessContext } from "./read-model";

vi.mock("@/lib/knowledge-graph/read-model", () => ({ listNodes: vi.fn() }));
vi.mock("./persistence", () => ({
  getBusinessProfile: vi.fn(),
  listPersonaDefinitions: vi.fn(),
}));

const listNodesMock = vi.mocked(listNodes);
const getProfileMock = vi.mocked(getBusinessProfile);
const listPersonasMock = vi.mocked(listPersonaDefinitions);

describe("getBusinessContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPersonasMock.mockResolvedValue([]);
    listNodesMock.mockResolvedValue({
      status: "live",
      nodes: [
        {
          id: "fact-1",
          kind: "brand_fact",
          label: "Response promise",
          body: "Answer quickly.",
          summary: "Fast support.",
          trustTier: "trusted",
        },
      ],
      edges: [],
      generatedAt: "2026-06-23T00:00:00.000Z",
    });
  });

  it("uses active Brand Kit profile and trusted Brain facts for Arc", async () => {
    getProfileMock.mockResolvedValue({
      ...NEUTRAL_DEFAULTS,
      displayName: "Acme Co",
      status: "active",
    });

    const context = await getBusinessContext("org-1");

    expect(context.businessName).toBe("Acme Co");
    expect(context.brainFacts).toEqual(["Response promise: Fast support."]);
  });

  it("keeps Arc neutral and suppresses Brain facts until the Brand Kit is active", async () => {
    getProfileMock.mockResolvedValue({
      ...NEUTRAL_DEFAULTS,
      displayName: "Draft Co",
      status: "draft",
    });

    const context = await getBusinessContext("org-1");

    expect(context.businessName).toBe("the business");
    expect(context.brainFacts).toEqual([]);
  });
});
