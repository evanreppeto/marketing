import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/workspace", () => ({ getCurrentWorkspaceContext: vi.fn() }));
vi.mock("@/lib/connectors/detection", () => ({ runSignalSourceDetection: vi.fn() }));
vi.mock("./detector", () => ({
  runColdLeadDetection: vi.fn(),
  runWeatherEventDetection: vi.fn(),
  runCompetitorSignalDetection: vi.fn(),
  runNextIterationDetection: vi.fn(),
}));

import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { runSignalSourceDetection } from "@/lib/connectors/detection";

import {
  runColdLeadDetection,
  runCompetitorSignalDetection,
  runNextIterationDetection,
  runWeatherEventDetection,
} from "./detector";
import { runDeterministicOpportunityScan } from "./scan";

const OK = { ok: true as const, count: 0 };
const ctxMock = vi.mocked(getCurrentWorkspaceContext);
const connectorMock = vi.mocked(runSignalSourceDetection);
const detectors = [runColdLeadDetection, runWeatherEventDetection, runCompetitorSignalDetection, runNextIterationDetection].map((d) => vi.mocked(d));

beforeEach(() => {
  ctxMock.mockReset();
  connectorMock.mockReset();
  detectors.forEach((d) => {
    d.mockReset();
    d.mockResolvedValue(OK);
  });
  connectorMock.mockResolvedValue(OK as never);
  ctxMock.mockResolvedValue({ orgId: "org-1", workspaceId: "ws-1" } as never);
});

describe("runDeterministicOpportunityScan", () => {
  it("runs every deterministic detector + connector detection with the workspace scope", async () => {
    await runDeterministicOpportunityScan();
    detectors.forEach((d) => expect(d).toHaveBeenCalledTimes(1));
    expect(connectorMock).toHaveBeenCalledWith({ workspaceId: "ws-1", orgId: "org-1" });
  });

  it("skips connector detection when there is no workspace, but still runs the detectors", async () => {
    ctxMock.mockResolvedValue({ orgId: "org-1", workspaceId: null } as never);
    await runDeterministicOpportunityScan();
    detectors.forEach((d) => expect(d).toHaveBeenCalledTimes(1));
    expect(connectorMock).not.toHaveBeenCalled();
  });

  it("is best-effort — a throwing detector never rejects the pass and the others still run", async () => {
    vi.mocked(runNextIterationDetection).mockRejectedValue(new Error("boom"));
    await expect(runDeterministicOpportunityScan()).resolves.toBeUndefined();
    expect(runColdLeadDetection).toHaveBeenCalledTimes(1);
    expect(connectorMock).toHaveBeenCalledTimes(1);
  });

  it("tolerates an unresolved workspace context (connector detection skipped)", async () => {
    ctxMock.mockRejectedValue(new Error("no workspace"));
    await expect(runDeterministicOpportunityScan()).resolves.toBeUndefined();
    expect(connectorMock).not.toHaveBeenCalled();
    // The CRM/weather/competitor/next-iteration detectors self-scope, so they still run.
    detectors.forEach((d) => expect(d).toHaveBeenCalledTimes(1));
  });
});
