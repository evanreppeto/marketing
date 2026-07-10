# Connector plugin framework

Arc reaches the outside world through **connectors**. A connector is a small,
tenant-agnostic plugin declared once in the pure catalog and (for the two
behavioural kinds) backed by a runtime implementation. This doc is the recipe
for adding one. It is deliberately vertical-neutral — Arc serves every company
type, so connectors should too.

## The connector kinds

| kind            | what it does                                                     | how it's used                                                        | writes?                       |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------- |
| `mcp_tool`      | a remote/native tool Arc can call (Higgsfield, Gemini research) | loaded into the runner in draft/act modes via a remote MCP endpoint | approval-gated draft output   |
| `signal_source` | proposes opportunities from a read-only signal                  | `detect()` → `OpportunityCandidate[]` → `upsertOpportunities`        | **only** `opportunities`      |
| `channel`       | an outbound medium (email, SMS, webhook, …)                     | `dispatch()` called **only** by the approved-send path              | nothing until approved        |
| `import_source` | pulls external records IN (CRM contacts, firmographic enrichment) | `runCrmImport(...)` — an **explicit operator action** → gated ingest | **only** CRM rows (companies/contacts/leads) |

### Non-negotiable guardrails

- **Signal sources are read-only.** `detect()` returns candidates. The *only*
  write is to the `opportunities` table, done by the orchestrator — never by the
  connector.
- **Channels never auto-send.** `dispatch()` runs solely through
  `dispatchThroughApprovedChannel()`, which refuses to proceed without an
  `approvalId`. There is no automatic caller anywhere in the repo.
- **Import sources are read-IN only.** They pull from an external system and write
  **only internal CRM rows**, through the existing gated lead-ingestion path
  (`parseLeadIngestionPayload` → `persistLeadIngestion`), idempotently and
  org-scoped. They never write back to the source and never send anything outbound.
- **Credentials live only in the Vault.** The `workspace_connectors` row stores a
  `credential_ref` (a Vault secret id) and non-secret `config`. Plaintext is
  never stored on the row and never sent to the browser.

## Where the pieces live

| layer                      | file                                             | responsibility                                        |
| -------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| pure metadata (no I/O)     | `src/domain/connectors.ts`                       | the descriptor catalog + status math                  |
| runtime behaviour registry | `src/lib/connectors/registry.ts`                 | `detect` / `dispatch` types + self-registration maps  |
| built-in impls             | `src/lib/connectors/builtin/*`                   | one file per connector; self-registers on import      |
| per-workspace state        | `src/lib/connectors/{persistence,config}.ts`     | enable switch, credential ref, `config` jsonb          |
| read model                 | `src/lib/connectors/read-model.ts`               | catalog × workspace rows → views + API summary         |
| signal orchestrator        | `src/lib/connectors/detection.ts`               | run enabled signal sources → `upsertOpportunities`     |
| import orchestrator        | `src/lib/connectors/import.ts`                  | `runCrmImport()` — explicit action → gated CRM ingest  |
| import engine + sources    | `src/lib/integrations/{crm,enrichment}/*`       | HubSpot source + enrichment provider (fixture + live)  |
| approved-send path         | `src/lib/connectors/dispatch.ts`                | the ONLY caller of `channel.dispatch()`                |
| operator UI                | `src/app/(app)/settings/_components/settings-view.tsx` | list / enable / credential / **Test** / costTier badge |
| runner hand-off            | `GET /api/v1/arc/connectors`                     | remote-MCP list (with secrets) + `enabled` list (none) |

## The metadata descriptor

Every connector declares one `ConnectorRegistryEntry` in
`CONNECTOR_REGISTRY` (`src/domain/connectors.ts`):

```ts
{
  key: string;                 // stable id; == workspace_connectors.connector_key and the registry key
  kind: "mcp_tool" | "signal_source" | "channel";
  label: string;
  description: string;
  costTier: "free" | "byo_key" | "metered";   // HYBRID model; free+byo_key bypass metering (BSR-372 meters `metered`)
  verticals: string[];         // industries it's best for; [] = universal
  capability: {                // what it does, by kind
    summary: string;
    opportunityKinds?: string[];   // signal_source: the opportunity `kind`s detect() emits
    channelMedium?: string;        // channel: email | sms | webhook | ...
    toolNamespaces?: string[];     // mcp_tool: tool namespaces
  };
  credentialSchema: {          // what the operator supplies; `none` = nothing
    kind: "api_key" | "oauth" | "none";
    label?: string; hint?: string; optional?: boolean;
  };
  authKind: "api_key" | "oauth" | "none";  // mirrors credentialSchema.kind (widely read)
  access: "read_only" | "gated_write";
  mcpUrl: string | null;       // mcp_tool remote endpoint; null for native / signal / channel
  authHeader?: string;         // mcp_tool credential header
  toolNamespace: string;       // mcp_tool namespace (also the catalog toolNamespace field)
}
```

`connectorRequiresCredential(entry)` is true unless `credentialSchema.kind` is
`none` or `optional` — those connectors go `connected` with no Vault secret and
are set up by flipping the enable switch.

## Recipe: add a `signal_source`

1. **Catalog entry** — add to `CONNECTOR_REGISTRY` with `kind: "signal_source"`,
   `access: "read_only"`, a `capability.opportunityKinds`, and a
   `credentialSchema` (`{ kind: "none" }` for a public source).

2. **Behaviour** — create `src/lib/connectors/builtin/<name>.ts` exporting a
   `SignalSourceConnector` and calling `registerSignalSource(...)` at the bottom.
   `detect(ctx)` reads `ctx.config` / does read-only lookups via `ctx.client` and
   returns `OpportunityCandidate[]`. Use a **stable `subjectId`** so
   `upsertOpportunities`' open-status dedup stops re-scans flooding the inbox.

   ```ts
   export const myConnector: SignalSourceConnector = {
     key: "my-signal",
     detect: (ctx) => [/* OpportunityCandidate[] */],
   };
   registerSignalSource(myConnector);
   ```

3. **Register** — add the file to `src/lib/connectors/builtin/index.ts` so the
   barrel import runs its side effect.

4. The orchestrator `runSignalSourceDetection({ workspaceId, orgId })` picks it
   up automatically once the operator enables it. It feeds every candidate to
   `upsertOpportunities`. Wire a call to it from your scan trigger (mirror
   `runColdLeadDetection`) — never on an automatic outbound path.

## Recipe: add a `channel`

1. **Catalog entry** — `kind: "channel"`, `access: "gated_write"`,
   `capability.channelMedium`. Credential in `credentialSchema` if the provider
   needs one; endpoint-style settings go in `config`, not the Vault.

2. **Behaviour** — `src/lib/connectors/builtin/<name>.ts` exporting a
   `ChannelConnector` + `registerChannel(...)`. `dispatch(input)` performs one
   approved send and returns `{ ok, providerRef? }`. **Re-check `input.approvalId`
   as defence in depth** and never send without it.

3. **Register** in the barrel.

4. Sends flow only through `dispatchThroughApprovedChannel()` from the
   approved-send path. **Do not** call `dispatch()` from anywhere else.

## Recipe: add an `import_source` (BSR-368)

**Why a new kind, and why an explicit action (the model decision).** CRM import and
enrichment *write CRM rows*, so they do **not** fit `signal_source` — whose contract
is "read-only, only ever writes `opportunities`". Overloading `signal_source` would
break that guarantee. They are also not `channel` (nothing goes outbound) or
`mcp_tool` (not an Arc tool call). So they get their own kind, `import_source`, with
two deliberate properties:

1. **It runs as an explicit operator action (`runCrmImport`), not on the automatic
   detection loop.** `runSignalSourceDetection` auto-runs every enabled signal source
   on a scan; an import mutates CRM records, so it must be a deliberate operator click
   (Settings → the connector → **Import now**), never a background job.
2. **It writes only through the existing gated ingest path.** `mapHubspotContacts` →
   `parseLeadIngestionPayload` → `persistLeadIngestion`, idempotent on the source's
   external id (`findExistingLeadByExternalId` resolves an existing lead so a re-import
   updates instead of duplicating), and org-scoped.

Steps:

1. **Catalog entry** — add to `CONNECTOR_REGISTRY` with `kind: "import_source"`,
   `access: "read_only"` (it never writes to the *source*), a `capability.importsInto`
   listing the CRM objects it writes, and a `credentialSchema`. Pick a `costTier`:
   `byo_key` when the workspace uses its own provider (HubSpot), `metered` for a paid
   data vendor (enrichment) — the latter also needs a rate in `CONNECTOR_COST_RATES`.

2. **Source / provider behind an injectable seam** — put the live client in
   `src/lib/integrations/<area>/` behind an interface with a fixture impl, mirroring
   `nwsWeatherEventSource`. CRM import uses `CrmImportSource.listContacts(cursor)`
   (paged, incremental via `updatedAfter`); enrichment uses `EnrichmentProvider.enrich(keys)`.
   Tests exercise the engine with the fixture — **no live network in tests**.

3. **Map + persist** — the shared engine is `importContactsFromSource`
   (`src/lib/integrations/crm/import-run.ts`): map → optional enrichment → validate →
   idempotent persist, **best-effort per record** (one bad row is counted, not fatal).

4. **Orchestrate** — `runCrmImport({ workspaceId, orgId })` resolves the enabled
   connector's credential + config, builds the live source, and (when `lead-enrichment`
   is enabled) layers a **metered** enrichment provider: every lookup passes through
   `meterConnectorCall`, so a call that would breach the workspace spend cap is refused
   (no firmographics, no spend) rather than overspending. Trigger it from an operator
   server action (`runConnectorImport`) — never automatically.

## Per-workspace enable / config / credentials

- Enable switch, credential ref, test outcome: `src/lib/connectors/persistence.ts`
  (`upsertConnectorEnabled` creates the row for no-credential connectors).
- Credentials: `src/lib/connectors/credentials.ts` (Vault `create_secret`).
- Non-secret config (`workspace_connectors.config` jsonb):
  `src/lib/connectors/config.ts` — no migration needed, the column already exists.
- Operator server actions: `src/app/(app)/settings/connectors-actions.ts`
  (`connectConnector`, `toggleConnectorEnabled`, `saveConnectorConfig`,
  `testConnector`, `disconnectConnector`) — all gated by `requireOperator()`.

## Test connection

Health checks live in `src/lib/connectors/health.ts`
(`checkConnectorCredential`). Add a `case "<key>"` that makes a minimal, real
provider call. The Settings → Connections **Test connection** button records the
outcome on the row (`last_test_ok` / `last_test_error`) — mirroring the
Settings → Media self-test. No-credential connectors have nothing to test.

## Runner hand-off

`GET /api/v1/arc/connectors` (bearer + workspace gated) returns:

- `connectors` — enabled **remote-MCP** connectors with decrypted tokens (the
  unchanged runner-loader contract).
- `enabled` — **every** enabled connector as `{ key, kind, costTier, label,
  access, capability }`, **no secrets**, so the runner can see which
  signal_source / channel plugins are live.
