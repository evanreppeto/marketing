# Connector plugin framework

Arc reaches the outside world through **connectors**. A connector is a small,
tenant-agnostic plugin declared once in the pure catalog and (for the two
behavioural kinds) backed by a runtime implementation. This doc is the recipe
for adding one. It is deliberately vertical-neutral — Arc serves every company
type, so connectors should too.

## The three kinds

| kind            | what it does                                                     | how it's used                                                        | writes?                     |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| `mcp_tool`      | a remote/native tool Arc can call (Higgsfield, Gemini research) | loaded into the runner in draft/act modes via a remote MCP endpoint | approval-gated draft output |
| `signal_source` | proposes opportunities from a read-only signal                  | `detect()` → `OpportunityCandidate[]` → `upsertOpportunities`        | **only** `opportunities`    |
| `channel`       | an outbound medium (email, SMS, webhook, …)                     | `dispatch()` called **only** by the approved-send path              | nothing until approved      |

### Non-negotiable guardrails

- **Signal sources are read-only.** `detect()` returns candidates. The *only*
  write is to the `opportunities` table, done by the orchestrator — never by the
  connector.
- **Channels never auto-send.** `dispatch()` runs solely through
  `dispatchThroughApprovedChannel()`, which refuses to proceed without an
  `approvalId`. There is no automatic caller anywhere in the repo.
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
