import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * runCsvImport glue: the guards (not connected / no persona / no rows) and that a
 * parsed CSV reaches importContactsFromSource with the right options. The parsing +
 * mapping + dedup itself is covered by src/domain/__tests__/csv-import.test.ts.
 */

const readModel = vi.hoisted(() => ({ listWorkspaceConnectors: vi.fn(), resolveConnectorCredentialRef: vi.fn() }));
vi.mock("./read-model", () => readModel);

const config = vi.hoisted(() => ({ getConnectorConfig: vi.fn() }));
vi.mock("./config", () => config);

const engine = vi.hoisted(() => ({ importContactsFromSource: vi.fn(async () => ({ imported: 2, updated: 0, skipped: 0, failed: 0, enriched: 0, pages: 1, errors: [] })) }));
// Keep asOfficialPersona real; stub only the engine call.
vi.mock("@/lib/integrations/crm/import-run", async (orig) => ({ ...(await orig<object>()), importContactsFromSource: engine.importContactsFromSource }));

vi.mock("@/lib/supabase/server", () => ({ isSupabaseAdminConfigured: () => true, getSupabaseAdminClient: () => ({}) }));

import { runCsvImport } from "./import";

const CSV = "name,email,company\nJordan Vega,jordan@acme.com,Acme\nDana W,dana@ns.com,North Shore";
const connected = [{ key: "csv-import", kind: "import_source", status: "connected" }];

beforeEach(() => {
  vi.clearAllMocks();
  readModel.listWorkspaceConnectors.mockResolvedValue(connected);
  config.getConnectorConfig.mockResolvedValue({ defaultPersona: "persona_homeowner_emergency" });
});

describe("runCsvImport", () => {
  it("refuses when the connector isn't connected", async () => {
    readModel.listWorkspaceConnectors.mockResolvedValue([{ key: "csv-import", kind: "import_source", status: "not_configured" }]);
    expect(await runCsvImport({ workspaceId: "ws", orgId: "org", csvText: CSV })).toEqual({ ok: false, error: "csv_import_not_connected" });
    expect(engine.importContactsFromSource).not.toHaveBeenCalled();
  });

  it("refuses when no default persona is configured", async () => {
    config.getConnectorConfig.mockResolvedValue({});
    expect(await runCsvImport({ workspaceId: "ws", orgId: "org", csvText: CSV })).toEqual({ ok: false, error: "missing_default_persona" });
    expect(engine.importContactsFromSource).not.toHaveBeenCalled();
  });

  it("refuses an empty / header-only CSV before touching the engine", async () => {
    expect(await runCsvImport({ workspaceId: "ws", orgId: "org", csvText: "name,email" })).toEqual({ ok: false, error: "no_rows" });
    expect(engine.importContactsFromSource).not.toHaveBeenCalled();
  });

  it("parses the CSV and runs the engine with the persona + csv source", async () => {
    const res = await runCsvImport({ workspaceId: "ws", orgId: "org", csvText: CSV });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.imported).toBe(2);
      expect(res.parse.totalRows).toBe(2);
      expect(res.parse.mappedColumns).toMatchObject({ email: "email", company: "company" });
    }
    const calls = engine.importContactsFromSource.mock.calls as unknown as Array<
      [{ options: Record<string, unknown>; source: { listContacts: () => Promise<{ contacts: Array<{ id: string }> }> } }]
    >;
    const call = calls[0][0];
    expect(call.options).toMatchObject({ defaultPersona: "persona_homeowner_emergency", personaProperty: "persona", source: "csv" });
    // The source pages the two parsed contacts through the shared engine.
    const page = await call.source.listContacts();
    expect(page.contacts.map((c) => c.id)).toEqual(["csv:jordan@acme.com", "csv:dana@ns.com"]);
  });
});
