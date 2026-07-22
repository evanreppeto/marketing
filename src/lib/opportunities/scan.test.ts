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
const CONNECTOR_OK = { ok: true as const, bySource: {}, total: 0, filtered: 0, refused: {} };
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
  connectorMock.mockResolvedValue(CONNECTOR_OK as never);
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
    await expect(runDeterministicOpportunityScan()).resolves.toEqual({ added: 0, filtered: 0 });
    expect(runColdLeadDetection).toHaveBeenCalledTimes(1);
    expect(connectorMock).toHaveBeenCalledTimes(1);
  });

  it("tolerates an unresolved workspace context (connector detection skipped)", async () => {
    ctxMock.mockRejectedValue(new Error("no workspace"));
    await expect(runDeterministicOpportunityScan()).resolves.toEqual({ added: 0, filtered: 0 });
    expect(connectorMock).not.toHaveBeenCalled();
    // The CRM/weather/competitor/next-iteration detectors self-scope, so they still run.
    detectors.forEach((d) => expect(d).toHaveBeenCalledTimes(1));
  });
});

describe("scan summary", () => {
  it("sums added + filtered across every deterministic detector and connector detection", async () => {
    vi.mocked(runColdLeadDetection).mockResolvedValue({ ok: true, count: 3, filtered: 5 });
    vi.mocked(runWeatherEventDetection).mockResolvedValue({ ok: true, count: 1 });
    vi.mocked(runCompetitorSignalDetection).mockResolvedValue({ ok: true, count: 0, filtered: 2 });
    vi.mocked(runNextIterationDetection).mockResolvedValue({ ok: true, count: 2 });
    connectorMock.mockResolvedValue({ ...CONNECTOR_OK, total: 4, filtered: 1 } as never);

    await expect(runDeterministicOpportunityScan()).resolves.toEqual({ added: 10, filtered: 8 });
  });

  // The number the operator sees must not silently include work from a source
  // that blew up — a failed detector contributes nothing, not a guess.
  it("counts nothing from a detector that failed or errored", async () => {
    vi.mocked(runColdLeadDetection).mockResolvedValue({ ok: true, count: 2, filtered: 1 });
    vi.mocked(runWeatherEventDetection).mockRejectedValue(new Error("boom"));
    vi.mocked(runCompetitorSignalDetection).mockResolvedValue({ ok: false, error: "nope" });

    await expect(runDeterministicOpportunityScan()).resolves.toEqual({ added: 2, filtered: 1 });
  });

  // The distinction the feedback line exists to make: "found nothing" and
  // "found things, none cleared the bar" are different answers.
  it("reports a filtered-only pass as added 0 with a non-zero filtered count", async () => {
    vi.mocked(runColdLeadDetection).mockResolvedValue({ ok: true, count: 0, filtered: 12 });

    await expect(runDeterministicOpportunityScan()).resolves.toEqual({ added: 0, filtered: 12 });
  });
});
