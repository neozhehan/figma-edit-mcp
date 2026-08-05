# Future Initiative: MCP Specification Update (2026-07-28)

This document is the product and implementation specification for migrating
`figma-edit-mcp` to the Model Context Protocol revision dated **2026-07-28**.
It is based on the normative specification and changelog published at:

- <https://modelcontextprotocol.io/specification/2026-07-28/changelog>
- <https://modelcontextprotocol.io/specification/2026-07-28/>

The goal is not merely to update an SDK package. The 2026-07-28 revision changes
the protocol's lifecycle model from initialized, connection-scoped sessions to
stateless, self-contained requests. This project currently keeps the active
Figma channel and editable scope as process-global state after `channel_join`,
so a package bump alone would leave the server semantically non-compliant even
if requests happened to parse.

The migration therefore has two inseparable parts:

1. implement the modern MCP wire contract exactly; and
2. replace implicit cross-call Figma binding with an explicit, server-minted
   handle passed in ordinary tool arguments.

The governing product rule remains the same as the rest of this project:

> **Golden Rule:** maximize **first-call correctness** and **one-round-trip
> recovery**, while preserving the Figma plugin as the authoritative write
> safety boundary.

---

## Release identity

> [!IMPORTANT]
> This is a placeholder **future major release**. The release number is not
> assigned here. Requiring `connectionHandle` on every Figma-dependent tool,
> removing the initialization-era protocol, and changing every MCP result
> envelope are intentionally breaking changes.

The release supports exactly one MCP protocol version:

```text
2026-07-28
```

The compatibility posture is a clean cutover:

- no `initialize` or `notifications/initialized` compatibility path;
- no support for protocol versions `2025-11-25` or earlier;
- no dual-era server mode;
- no `Mcp-Session-Id` generation, acceptance semantics, or state lookup;
- no legacy HTTP+SSE transport;
- no old task surface;
- no implicit Figma binding based on stdio process lifetime;
- no fallback that accepts requests missing modern per-request `_meta`.

The public MCP transport remains **stdio only**. The HTTP/WebSocket process in
`src/socket.ts` is the internal Figma relay, not an MCP Streamable HTTP endpoint.
This release does not add a public HTTP MCP transport.

### Public tool-shape change

The current `channel_join` call creates an implicit process-global binding. In
this release it becomes an explicit state-handle creator:

```ts
type ChannelJoinInput = {
  channel: string; // existing four-character code shown by the Figma plugin
};

type ChannelJoinResult = {
  connectionHandle: string;
  // Existing plugin/server versions and editable-scope payload follow.
};
```

Every tool that reads from or writes to the live Figma document requires:

```ts
connectionHandle: string;
```

The release adds one cleanup tool:

```ts
channel_release({ connectionHandle })
```

`channel_join` no longer releases an earlier binding. Multiple handles may
exist concurrently and may be intentionally shared with another agent. Tool
lists remain static regardless of how many handles exist.

The existing four-character channel code and plugin UI remain unchanged. This
Initiative changes how an established binding is referenced after
`channel_join`; it does not redesign the existing connection workflow.

The current baseline exposes 45 tools. On that baseline this release has a net
increase of one tool. If another future initiative lands first, Phase 0 must
recalculate the count and apply the handle invariant to the then-current tool
inventory.

### SDK release gate

As measured on **2026-08-05**:

- the repository pins `@modelcontextprotocol/sdk` `1.29.0`;
- the latest published SDK is `1.30.0`;
- SDK `1.30.0` still reports `LATEST_PROTOCOL_VERSION = "2025-11-25"`;
- SDK `1.30.0` still installs `initialize`, `ping`, `logging/setLevel`, old
  resource subscriptions, and the `2025-11-25` task model;
- SDK `1.30.0` does not provide the required modern `server/discover`, request
  metadata, result discriminator, caching, or subscription behavior.

Therefore **neither 1.29.0 nor 1.30.0 is an acceptable implementation base**.
Phase 0 must pin the first stable TypeScript SDK release that passes the
behavioral gates in this Initiative. A package version number or generated
draft type file is not evidence of runtime support.

If no conforming stable SDK exists when implementation begins, the release is
blocked. Do not patch `node_modules`, import unpublished draft internals, or
claim compliance from a locally reconstructed subset. A separately approved
decision would be required to vendor and maintain a modern protocol runtime.

---

## Current-state findings

| Area | Current project behavior | 2026-07-28 requirement | Migration consequence |
| :- | :- | :- | :- |
| MCP SDK | `@modelcontextprotocol/sdk@1.29.0`; runtime is initialization-era | Modern stateless runtime | Replace only after behavioral gate passes |
| Startup | `McpServer` connects to `StdioServerTransport`; SDK waits for `initialize` | No initialization handshake | Remove lifecycle dependency and modernize raw round-trip tests |
| Protocol test | `src/mcp_server/tests/roundtrip.ts` sends `initialize` with `2024-11-05`, then `notifications/initialized` | Every request carries version and capabilities in `_meta` | Rewrite from the first byte |
| Server discovery | Server identity, capabilities, and instructions are returned by `initialize` | Servers MUST implement `server/discover` | Add mandatory cacheable discovery RPC |
| Result envelope | Tool/resource/prompt results omit `resultType`; server identity is not repeated | Every result has `resultType`; server identity SHOULD be in result `_meta` | Add one central result decorator for every successful result |
| Figma state | `figma-client.ts` stores one global `bindingState`; later calls omit any binding identity | Cross-call state MUST be referenced by an explicit identifier | Return and require `connectionHandle` |
| Relay state | One MCP peer is attached to one channel; detach clears its routes | Process/connection is not a session | Make relay state handle-keyed and reconnectable |
| Lists | High-level SDK builds tools/resources/prompts from registration state and advertises `listChanged: true` | Lists MUST NOT vary per connection; deterministic order SHOULD be used | Freeze order, remove unsupported list-change claims, add cache hints |
| Caching | List/read results have no `ttlMs` or `cacheScope` | Required on discovery, list, template-list, and resource-read complete results | Add explicit cache policy |
| Resources | Five static guide resources; read failure is returned as a synthetic `# Error` resource | Missing resource is `-32602`; internal read failure is an error | Stop converting read failures into successful content |
| Progress | Plugin progress resets internal timeouts and is written to `stderr`; no MCP progress is sent | Request-scoped progress only after `progressToken` opt-in | Bridge plugin progress to the originating MCP request |
| Cancellation | No end-to-end MCP cancellation path into the Figma command | stdio cancellation uses `notifications/cancelled` | Add request, relay-route, and plugin cancellation propagation |
| Logging | Project logger writes to `stderr` | Protocol Logging is deprecated; `stderr` is preferred for stdio | Keep `stderr`; do not advertise Logging or emit `notifications/message` |
| Tool schemas | Zod schemas are recursively strict, but the SDK path assumes object output schemas | Full JSON Schema 2020-12; output and structured content may be any JSON | Remove object-only infrastructure assumptions and test emitted schemas |
| Tasks | Project does not intentionally use tasks, but the installed SDK contains old experimental handlers/types | Tasks moved to `io.modelcontextprotocol/tasks`; old task surface removed | Advertise no task extension and prove no task methods/results are emitted |
| HTTP MCP | None; `src/socket.ts` is a relay | Streamable HTTP has new POST/header/security rules | Record as non-applicable and prevent the relay from being mistaken for MCP |
| Package metadata | Root manifest is authoritative, but `src/mcp_server/` contains stale package/lock files | One auditable protocol runtime | Delete the nested package and lockfile island |

---

## Source changelog coverage

This table maps every 2026-07-28 changelog item to an explicit action or an
explicit non-applicability decision. "No code" means the project does not
implement the affected optional surface; it does not mean the item was ignored.

### Major changes

| # | Changelog change | Applicability | Initiative section |
| :-: | :- | :- | :- |
| 1 | Remove protocol sessions and `Mcp-Session-Id`; make lists connection-independent | Direct and architectural | Sections 4 and 7 |
| 2 | Remove `initialize`/`initialized`; put protocol version, client capabilities, and identity in every request `_meta`; put server identity in result `_meta` | Direct | Sections 2 and 6 |
| 3 | Add mandatory `server/discover` | Direct | Section 3 |
| 4 | Replace HTTP GET and old resource subscriptions with `subscriptions/listen` | Core handler required; no dynamic notifications are advertised | Section 8 |
| 5 | Remove `ping`, `logging/setLevel`, and roots-list-changed; use per-request log level | Direct removal; protocol Logging deliberately not adopted | Sections 2 and 11 |
| 6 | Move tasks from core to `io.modelcontextprotocol/tasks`; redesign methods | Current project has no task need | Section 11 |
| 7 | Replace server-initiated requests with MRTR `InputRequiredResult` | No current server-to-client request use | Section 11 |
| 8 | Require `resultType` on every result | Direct | Section 6 |
| 9 | Remove SSE resumability and redelivery | No public HTTP MCP transport | Section 5 |

### Minor changes

| # | Changelog change | Applicability | Initiative section |
| :-: | :- | :- | :- |
| 1 | Add capability `extensions` maps | Direct schema support; server advertises none | Sections 3 and 11 |
| 2 | Define OpenTelemetry trace-context `_meta` conventions | Direct request-context handling | Section 12 |
| 3 | Return `tools/list` in deterministic order | Direct | Section 7 |
| 4 | Require Streamable HTTP method/name headers and support `x-mcp-header` | Not applicable to stdio-only public MCP | Section 5 |
| 5 | Require `ttlMs` and `cacheScope` on cacheable results | Direct | Section 7 |
| 6 | Change resource-not-found from `-32002` to `-32602` | Direct | Sections 7 and 13 |
| 7 | Validate authorization response `iss` | No HTTP authorization client/server in this project | Section 5 |
| 8 | Set Dynamic Client Registration `application_type` | No HTTP authorization client in this project | Section 5 |
| 9 | Bind stored client credentials to authorization issuer | No client credential store in this project | Section 5 |
| 10 | Support full JSON Schema 2020-12 and any JSON `structuredContent`; constrain `$ref` resolution and composition cost | Direct | Section 10 |
| 11 | Remove URL elicitation completion notification and `elicitationId` | Project does not perform elicitation | Section 11 |
| 12 | Partition MCP JSON-RPC error codes; use `-32020`, `-32021`, `-32022` | Direct protocol layer | Section 13 |

### Deprecated features

| # | Deprecated feature | Project decision |
| :-: | :- | :- |
| 1 | Roots, Sampling, and Logging | Do not advertise or adopt them. Keep explicit tool arguments/resources and `stderr` logging. |
| 2 | HTTP+SSE transport | Do not implement it. |
| 3 | Sampling `includeContext: "thisServer" | "allServers"` | No Sampling implementation. |
| 4 | OAuth Dynamic Client Registration | No HTTP authorization implementation. If a future HTTP transport is added, prefer Client ID Metadata Documents. |

### Other schema and process changes

- Numeric `minimum`, `maximum`, and `default` values are numbers, not
  integer-only metadata. Emitted-schema tests must preserve fractional bounds.
- The feature lifecycle/deprecation registry is an upstream governance rule.
  Project documentation should label unsupported/deprecated MCP features using
  the same terminology but requires no runtime feature.
- SEP workflow governance changes require no product implementation.

---

## Explicit non-goals

- No backward compatibility with initialization-based MCP clients.
- No support for any MCP protocol version other than `2026-07-28`.
- No public Streamable HTTP endpoint in this release.
- No HTTP+SSE endpoint, GET event stream, DELETE session endpoint, session ID,
  SSE event ID, `Last-Event-ID`, or replay store.
- No MCP OAuth server, OAuth client, Dynamic Client Registration, Client ID
  Metadata Document hosting, or authorization-server issuer store.
- No Roots, Sampling, or protocol Logging implementation.
- No `notifications/message` output, even when a client includes the deprecated
  per-request log-level field. The field is validated but ignored.
- No Tasks extension advertisement or task result.
- No `tasks/get`, `tasks/update`, `tasks/cancel`, `tasks/list`, or
  `tasks/result` handlers.
- No `InputRequiredResult` in the initial migration. All supported requests
  return `resultType: "complete"` or a JSON-RPC error.
- No server-initiated JSON-RPC requests on stdout.
- No `resources/subscribe` or `resources/unsubscribe` compatibility handler.
- No list mutation based on connection handle, Figma scope, channel, prior tool
  calls, client identity, or stdio process history.
- No network dereferencing of JSON Schema `$ref` values.
- No use of `x-mcp-header`; it is an HTTP transport feature and all public MCP
  traffic remains stdio.
- No implicit release of Figma handles when the stdio process exits. Handle
  lifetime belongs to the relay registry, plugin disconnect, relay restart, and
  explicit `channel_release`.
- No cancellation rollback guarantee. Cancellation stops future work where
  practical; it cannot reverse a mutation already accepted by Figma.
- No redesign of the existing four-character channel code or internal Figma
  relay. Those concerns are outside this MCP-spec migration.

---

## Product decisions

> [!NOTE]
> **D1 - Modern-only, not dual-era.** Supporting both initialization-era and
> modern semantics would preserve the very connection-state ambiguity this
> release is removing. `server/discover` and per-request `_meta` are the only
> lifecycle.

> [!NOTE]
> **D2 - SDK support is proven behaviorally.** The accepted SDK must pass raw
> wire tests and the official conformance suite. A draft type file, an export
> named `spec.types`, or a semver bump does not establish runtime compliance.

> [!NOTE]
> **D3 - Stdio remains the MCP boundary.** The local HTTP/WebSocket relay is
> private application infrastructure. It must never accept MCP JSON-RPC or be
> documented as a Streamable HTTP endpoint.

> [!NOTE]
> **D4 - Figma binding becomes an explicit handle.** A stdio process is not a
> chat, agent, task, or session. Every Figma-dependent tool carries an opaque
> `connectionHandle` in its ordinary arguments.

> [!NOTE]
> **D5 - The relay owns handle durability.** The socket relay already owns the
> plugin connection and command routing. It will mint and retain handles so a
> handle can survive an MCP stdio process restart without depending on that
> process's memory.

> [!NOTE]
> **D6 - Preserve the existing channel workflow.** `channel_join` continues to
> accept the four-character `channel` shown by the Figma plugin. The call now
> returns an opaque `connectionHandle`; that state-reference change is the only
> connection change owned by this release.

> [!NOTE]
> **D7 - Handle lifetime is explicit.** A handle remains valid until
> `channel_release`, plugin disconnect, or relay restart. It is never inferred
> from the lifetime of an MCP stdio process or request stream.

> [!NOTE]
> **D8 - Static discovery is publicly cacheable.** Tool, prompt, resource, and
> server discovery results are package-defined and authorization-independent.
> They use `cacheScope: "public"`, a one-hour TTL, deterministic ordering, and
> no list-change capability.

> [!NOTE]
> **D9 - Every successful result is decorated centrally.** `resultType` and
> server identity are protocol fields, not fields each tool author should have
> to remember. One response decorator covers tools, prompts, resources,
> discovery, lists, empty results, and subscription closure.

> [!NOTE]
> **D10 - Tool payloads remain distinct from protocol envelopes.**
> `structuredContent` continues to hold domain output and the structured
> Figma error envelope. `resultType` and protocol `_meta` live on the enclosing
> MCP result, not inside the tool payload or its `outputSchema`.

> [!NOTE]
> **D11 - Progress is opt-in and request-scoped.** Internal plugin progress is
> converted to `notifications/progress` only when the originating request
> supplied `progressToken`. It never flows through `subscriptions/listen`.

> [!NOTE]
> **D12 - Cancellation propagates to the work owner.** A cancelled stdio
> request removes its relay route, suppresses late output, and signals the
> plugin. Long scans and batches check cancellation at yield/chunk boundaries.

> [!NOTE]
> **D13 - No protocol Logging.** The existing `stderr` logger is already the
> preferred stdio observability path. The server does not advertise the
> deprecated Logging capability and never sends `notifications/message`.

> [!NOTE]
> **D14 - Core MRTR support does not force an MRTR workflow.** This server does
> not need client roots, sampling, or elicitation. It accepts modern request
> schemas but returns only complete results. A future feature that needs client
> input must use MRTR and integrity-protected `requestState`, never an
> unsolicited server request.

> [!NOTE]
> **D15 - Do not advertise Tasks speculatively.** Figma operations are bounded
> interactive calls today, and the current bridge is not a durable job store.
> The Tasks extension remains absent until a separate initiative defines
> durable creation, polling, update, cancellation, authorization, and TTL.

> [!NOTE]
> **D16 - JSON Schema 2020-12 is the emitted and validated dialect.** Tool
> inputs retain a root object type, outputs may be any JSON schema, and
> `structuredContent` preserves every JSON value. External network references
> are rejected rather than fetched.

> [!NOTE]
> **D17 - Subscription support is honest.** The core
> `subscriptions/listen` method is implemented, but this release advertises no
> changing lists or resource updates. The server acknowledges an empty subset
> and emits no change notification.

> [!NOTE]
> **D18 - Existing Figma safety controls are unchanged.** A handle authorizes
> routing to one plugin connection; it does not bypass editable scope, exact
> names, locks, instance interiors, remote-asset rules, permission axes, batch
> preflight, or scope-root controls.

> [!NOTE]
> **D19 - Trace metadata is observability, never identity.** W3C trace context
> may correlate the MCP request, relay frame, plugin command, and `stderr`
> diagnostics. It must not select a handle, grant access, or affect behavior.

> [!NOTE]
> **D20 - Removed protocol methods fail as protocol errors.** Unknown modern
> methods return `-32601`. A legacy `initialize` attempt also receives an
> actionable message naming `2026-07-28`; it is never silently interpreted as
> a modern request.

---

## Priority and ownership

| Section | Capability | Priority | Primary implementation areas |
| :-: | :- | :-: | :- |
| 1 | SDK/spec source and dependency cleanup | P0 | `package.json`, lockfiles, protocol checks |
| 2 | Stateless request validation and version errors | P0 | MCP server construction/transport middleware |
| 3 | `server/discover` and capabilities | P0 | MCP server registration and shared metadata |
| 4 | Explicit Figma connection handles | P0 | `tools/channel.ts`, `figma-client.ts`, `socket.ts`, shared relay protocol |
| 5 | Modern stdio transport and lifecycle | P0 | `server.ts`, transport tests |
| 6 | Required result envelopes | P0 | `tools/_result.ts`, protocol response wrapper, all result handlers |
| 7 | Caching, deterministic lists, resource errors | P0 | tool/resource/prompt list handlers, `resources.ts` |
| 8 | `subscriptions/listen` | P1 | protocol server, subscription registry |
| 9 | MCP progress and cancellation | P0 | request context, `figma-client.ts`, relay and plugin progress/cancel paths |
| 10 | JSON Schema 2020-12 | P0 | schema conversion/validation, tool registration wrapper |
| 11 | Removed/deprecated features and extensions | P0 | capability declaration and forbidden-route tests |
| 12 | Trace context and stderr observability | P1 | request context, logger, relay metadata |
| 13 | Error code allocation and resource-not-found behavior | P0 | protocol errors, resource handlers, tests |
| 14 | Documentation and package metadata | P1 | README, guides, manifests, CHANGELOG, SAFETY |
| 15 | Conformance and release verification | P0 | raw round-trip tests, official conformance, CI scripts |

---

## 1. SDK, schema source, and dependency baseline (P0)

### 1.1 Behavioral SDK admission gate

Pin an exact stable SDK version only after a disposable probe proves all of the
following in its runtime exports and behavior:

1. `LATEST_PROTOCOL_VERSION` is exactly `2026-07-28`.
2. `SUPPORTED_PROTOCOL_VERSIONS` includes `2026-07-28`.
3. A modern-only server can disable or omit legacy protocol versions.
4. `RequestMetaObject` requires:
   - `io.modelcontextprotocol/protocolVersion`;
   - `io.modelcontextprotocol/clientCapabilities`;
   - optional `io.modelcontextprotocol/clientInfo`;
   - optional `io.modelcontextprotocol/logLevel`.
5. The runtime implements `server/discover`.
6. Every result schema requires `resultType`.
7. Result metadata supports `io.modelcontextprotocol/serverInfo`.
8. Cacheable results require `ttlMs` and `cacheScope`.
9. The stdio server accepts requests before any initialization exchange.
10. The modern server does not install or accept legacy routes under the
    selected version.
11. Tool `outputSchema` accepts any JSON Schema 2020-12 object.
12. Tool `structuredContent` accepts any JSON value.
13. `subscriptions/listen` and modern cancellation are available at the
    low-level server API.
14. The old core task model is not advertised under `2026-07-28`.

Add `scripts/check-mcp-runtime.ts` to encode these probes. Run it in CI before
the server build and after dependency updates. The script must inspect behavior,
not grep package source comments.

### 1.2 Official schema as contract oracle

Use the released 2026-07-28 TypeScript/JSON schema distributed by the accepted
SDK or official specification artifact as the protocol type source. Do not
copy a hand-maintained approximation into the repository.

Tests may keep small literal fixtures for wire-level assertions, but those
fixtures must validate through the official schema and fail when required
fields are removed.

### 1.3 Remove the nested dependency island

Delete the stale package artifacts under `src/mcp_server/`:

- `src/mcp_server/package.json`;
- `src/mcp_server/package-lock.json`;
- `src/mcp_server/bun.lock`.

The root `package.json` and root lockfiles remain the sole dependency source.
Extend dependency checks so a future nested package/lockfile reintroduction
fails CI.

### 1.4 Conformance package gate

Pin an exact `@modelcontextprotocol/conformance` version that explicitly tests
the 2026-07-28 modern server era. The latest package number alone is not enough;
run its tier/capability listing and assert that it includes modern stateless
versioning, discovery, result types, caching, and stdio cases.

### Acceptance criteria

- The runtime probe rejects SDK 1.29.0 and 1.30.0.
- One exact compliant SDK version is pinned at the root only.
- No nested MCP package or lockfile remains.
- The built server reports only `2026-07-28`.
- Official conformance is a required release command, not an optional local
  experiment.

---

## 2. Stateless request validation and version negotiation (P0)

### Request contract

Every JSON-RPC request must carry `_meta` inside `params`:

```ts
type ModernRequestMeta = {
  progressToken?: string | number;
  "io.modelcontextprotocol/protocolVersion": "2026-07-28";
  "io.modelcontextprotocol/clientCapabilities": ClientCapabilities;
  "io.modelcontextprotocol/clientInfo"?: Implementation;
  "io.modelcontextprotocol/logLevel"?: LoggingLevel;
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
  [key: string]: unknown;
};
```

Rules:

- Validate metadata independently on every request.
- Do not cache protocol version, capabilities, client identity, or log level
  from an earlier request.
- An empty client-capabilities object means no optional capabilities.
- Client identity is informational only and never selects behavior.
- Missing `_meta`, version, or capabilities is `-32602` Invalid Params.
- A requested version other than `2026-07-28` is `-32022`
  `UnsupportedProtocolVersion`, with:

```json
{
  "supported": ["2026-07-28"],
  "requested": "<received value>"
}
```

- A missing required client capability, if any future path requires one, is
  `-32021` with exact `requiredCapabilities` data.
- Unknown extension capability entries are retained as request metadata but do
  not enable behavior the server did not advertise.
- Requests may be interleaved from unrelated clients, tasks, or conversations
  on the same stdio process.

### Legacy method behavior

The server does not register `initialize`. A request for `initialize` returns
`-32601` and an actionable message:

```text
This server implements modern MCP 2026-07-28 only. Send server/discover or any
supported request with the required per-request _meta fields.
```

Include `data.supportedVersions: ["2026-07-28"]` as a diagnostic extension.
Do not return an initialization result.

The following methods are likewise absent and return `-32601`:

- `ping`;
- `logging/setLevel`;
- `resources/subscribe`;
- `resources/unsubscribe`;
- `tasks/list`;
- `tasks/result`;
- legacy task methods not adopted by this release.

`notifications/initialized` and `notifications/roots/list_changed` are unknown
notifications and have no effect.

### Request IDs

- Accept string and integer request IDs, never `null`.
- Track only concurrently active IDs. A completed ID may be reused later.
- Duplicate active IDs are rejected without corrupting either active route.
- Tool retry after a protocol error or MRTR-like future flow uses a new ID.

### Acceptance criteria

- A valid `tools/list` request succeeds as the first message on stdio.
- The same method without required `_meta` fails with `-32602`.
- An unsupported version fails with exact `-32022` data and no handler side
  effect.
- Two interleaved requests with different client capabilities are each served
  only from their own metadata.
- A prior request cannot grant a capability to a later request.
- `initialize` never changes subsequent behavior.

---

## 3. Mandatory `server/discover` (P0)

Register `server/discover` before connecting the transport. It accepts no
operation-specific parameters beyond standard request `_meta`.

The complete result is:

```ts
type DiscoverResult = {
  resultType: "complete";
  supportedVersions: ["2026-07-28"];
  capabilities: {
    tools: {};
    resources: {};
    prompts: {};
  };
  instructions: string;
  ttlMs: 3_600_000;
  cacheScope: "public";
  _meta: {
    "io.modelcontextprotocol/serverInfo": {
      name: typeof SERVER_NAME;
      version: typeof SERVER_VERSION;
      title?: "Figma Edit MCP";
      description?: string;
      websiteUrl?: string;
      icons?: Icon[];
    };
  };
};
```

Capability rules:

- `tools`, `resources`, and `prompts` are present because the server implements
  all three surfaces.
- Omit `listChanged` because registrations are static after startup.
- Omit `resources.subscribe` because guide resources never emit updates.
- Omit `logging`, `completions`, and every deprecated client-facing feature.
- Omit `extensions` or return an empty map. Do not advertise Tasks.
- Discovery is identical before and after channel creation, handle release,
  plugin disconnect, or any Figma operation.

The existing short instruction breadcrumb moves from initialization to
discovery. It should additionally say that `channel_join` returns a
`connectionHandle` that must be passed verbatim to every live-Figma tool.

### Acceptance criteria

- `server/discover` works as the first request.
- The result validates against official `DiscoverResult`.
- Server name/version match the root package-derived version source.
- Discovery is byte-for-byte stable across repeated calls in one process and
  across fresh processes built from the same artifact, except fields explicitly
  documented as build-specific.
- No connection handle, channel code, scope, plugin state, or document identity
  appears in discovery.
- `ttlMs` and `cacheScope` are always present.

---

## 4. Explicit Figma connection handles (P0)

### Problem

`src/mcp_server/figma-client.ts` currently stores one module-global
`bindingState`. A successful `channel_join` changes how every later tool call
behaves even though those calls contain no binding identity. The WebSocket relay
also binds one MCP peer to one channel and tears that state down with the peer.

That design violates the new statelessness rule and makes concurrent unrelated
requests unsafe: one agent can replace the document binding another agent
expects simply by calling `channel_join` on the same stdio process.

### 4.1 Public handle contract

`channel_join` remains the discovery-friendly name but changes semantics:

```ts
type ChannelJoinInput = {
  channel: string; // existing exact four-character plugin code
};

type ChannelJoinSuccess = {
  status: "success";
  connectionHandle: string;
  serverVersion: string;
  pluginVersion: string;
  // Existing scope/document payload.
};
```

Rules:

- Preserve the current four-character channel entry and join behavior.
- After the channel and scope payload are resolved, create and return one opaque
  `connectionHandle` that names that binding.
- Do not invalidate another handle for the same plugin.
- Do not mark `channel_join` idempotent; repeated successful joins create
  distinct handles.
- If scope-payload retrieval fails, delete the partially created handle.
- The serialized text content includes the handle because the model must retain
  and pass it to later tools.

Add:

```ts
type ChannelReleaseInput = {
  connectionHandle: string;
};

type ChannelReleaseResult = {
  released: boolean;
  noOp: boolean;
};
```

`channel_release` is idempotent. Releasing an absent or already released handle
returns `noOp: true`.

### 4.2 Tool schema invariant

Every registered tool is classified as one of:

1. `HANDLE_CREATOR`: `channel_join`;
2. `HANDLE_DESTROYER`: `channel_release`;
3. `FIGMA_BOUND`: every tool that sends a command to the plugin;
4. `STATELESS_NON_FIGMA`: none at the current tool layer, but reserved for
   future server-only tools.

The registration layer injects one required, strict `connectionHandle` string
into every `FIGMA_BOUND` input schema. Injection is centralized so a newly
registered Figma tool cannot accidentally omit it. An inventory test fails when
a tool has no classification.

The field is an ordinary tool argument:

```json
{
  "method": "tools/call",
  "params": {
    "name": "node_info",
    "arguments": {
      "connectionHandle": "fch_...",
      "nodeIds": ["12:34"],
      "properties": ["name", "type"]
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

It is not placed in request `_meta`, because it is application state needed by
the tool and must be visible in `tools/list`.

### 4.3 Request-local command API

Replace ambient `sendCommandToFigma(command, params)` with an explicit context:

```ts
type FigmaRequestContext = {
  connectionHandle: string;
  mcpRequestId: string | number;
  signal: AbortSignal;
  reportProgress?: (update: CommandProgressUpdate) => Promise<void>;
  traceContext?: TraceContext;
};

sendCommandToFigma(command, params, context);
```

Every tool callback removes `connectionHandle` from the plugin command payload
and passes it through `FigmaRequestContext`. Do not use `AsyncLocalStorage` as a
replacement for explicit function arguments; request context should remain
visible at the command boundary and straightforward to test.

Delete the module-global `bindingState` and all semantics that infer a current
channel. Pending requests remain process-local transient state, keyed by their
existing command/request identity plus `connectionHandle`, not by cross-call
ambient state.

### 4.4 Relay handle registry

Move durable application binding to the relay process:

```ts
type ConnectionHandleRecord = {
  connectionHandle: string;
  pluginPeerId: string;
  channel: string;
};
```

Relay rules:

- Treat the handle as an opaque server-minted identifier; callers must pass it
  back verbatim and must not infer structure from it.
- A relay WebSocket peer may create or use multiple handles.
- A handle routes each command to the plugin binding created by
  `channel_join`.
- Reconnecting the MCP stdio process and its relay socket does not invalidate a
  handle while the relay and plugin binding remain alive.
- Plugin disconnect invalidates all handles for that peer and rejects all
  pending routes with `PLUGIN_DISCONNECTED`.
- Releasing one handle does not disconnect the plugin or affect sibling
  handles.

### 4.5 Command routing and concurrency

Every relay command frame carries `connectionHandle`. The relay resolves that
handle to the corresponding plugin binding before creating the existing pending
route. Progress, cancellation, and terminal frames continue to use the
project's existing per-command correlation; this Initiative adds handle
selection but does not redesign the relay protocol.

Two handles may issue concurrent commands subject to the relay and plugin's
existing command-processing behavior. A response is accepted only for the
pending route that dispatched the command.

### 4.6 Handle errors

Add stable tool-execution error codes:

| Code | Meaning | Required recovery |
| :- | :- | :- |
| `CONNECTION_HANDLE_UNKNOWN` | The handle is not present in the relay registry | Call `channel_join` again with the current four-character channel code |
| `CONNECTION_HANDLE_PLUGIN_DISCONNECTED` | The bound plugin disconnected | Reopen the plugin and call `channel_join` with its current channel code |

### 4.7 Safety relationship

Handle validation occurs before plugin dispatch, but it is not the write safety
gate. After routing, the plugin still performs all existing controls in
`SAFETY.md` against live state. A valid handle never broadens editable scope or
turns a read-only plugin connection into a writable one.

### Acceptance criteria

- No Figma tool can be called without `connectionHandle` at the emitted MCP
  schema boundary.
- No global current-channel/current-scope state remains in the MCP server.
- Two handles for two plugin channels can be interleaved on one stdio process
  without cross-talk.
- Two handles for one plugin coexist; releasing one leaves the other usable.
- A handle remains usable after restarting only the MCP stdio server and
  reconnecting it to the same still-running relay.
- A relay restart or plugin disconnect yields one actionable
  handle error, not an opaque timeout.
- Release and disconnect paths are deterministic.
- Existing plugin scope/name/lock/instance/remote/permission gates still run on
  every command.

---

## 5. Modern stdio transport and lifecycle (P0)

### 5.1 Stdio wire behavior

Retain newline-delimited UTF-8 JSON-RPC over stdin/stdout:

- exactly one JSON-RPC message per line;
- no embedded literal newline in a wire message;
- no non-MCP output on stdout;
- arbitrary UTF-8 diagnostics may go to stderr;
- the server reads requests and notifications only, never client responses;
- the server writes responses and allowed notifications only, never JSON-RPC
  requests.

The current EOF shutdown test is retained and expanded. Closing stdin is the
primary graceful shutdown signal. Signal handlers remain secondary.

On shutdown:

- stop admitting requests;
- cancel in-flight requests and plugin routes;
- gracefully close server-owned subscriptions where possible;
- close the relay WebSocket;
- do not destroy valid relay-owned connection handles;
- exit promptly with code 0 after stdin EOF.

### 5.2 Restart semantics

An in-flight request is lost if the stdio process terminates. The client may
retry it with a new request ID. This project must not claim automatic replay or
exactly-once semantics, especially for writes.

The explicit `connectionHandle` may be reused after MCP process restart if the
relay and plugin binding remain alive. A retried write remains subject to the
tool's own idempotency and read-before-write guidance.

### 5.3 Public HTTP non-applicability boundary

Document and test that neither `src/socket.ts` nor any other route is a public
MCP endpoint. Therefore the following are intentionally not implemented:

- `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, or `Mcp-Param-*` headers;
- `HeaderMismatch` `-32020` responses;
- POST JSON/SSE response negotiation;
- `Origin` validation for an MCP HTTP endpoint;
- `X-Accel-Buffering` behavior;
- HTTP 202 notification acknowledgments;
- HTTP GET/DELETE MCP behavior;
- Streamable HTTP cancellation by closing response streams;
- OAuth issuer, registration, and credential-binding behavior.

The internal relay retains its current transport and deployment behavior. This
section classifies it as non-MCP infrastructure; it does not redesign it.

If a future release adds public Streamable HTTP, it must implement the complete
2026-07-28 HTTP contract in a separate initiative. It may not expose the
existing relay health route as MCP.

### Acceptance criteria

- Raw stdout contains only valid modern MCP messages.
- Server-initiated JSON-RPC requests are impossible through the server API used
  by this project.
- EOF shuts down promptly without deleting relay-owned handles.
- The public package metadata advertises only stdio.
- A test making an HTTP request to the relay receives relay/health behavior,
  never MCP JSON-RPC discovery or tools.

---

## 6. Required result envelopes and server identity (P0)

### Complete-result decorator

Introduce one protocol-level helper or middleware:

```ts
const SERVER_INFO = {
  name: SERVER_NAME,
  version: SERVER_VERSION,
  title: "Figma Edit MCP",
};

function completeResult<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    resultType: "complete" as const,
    _meta: {
      ...(isRecord(payload._meta) ? payload._meta : {}),
      "io.modelcontextprotocol/serverInfo": SERVER_INFO,
    },
  };
}
```

The production implementation must preserve existing result `_meta` keys and
must reject a payload that attempts to overwrite the reserved server-info key
with a conflicting value.

Apply this to:

- `server/discover`;
- `tools/list`;
- `tools/call`, including `isError: true` tool results;
- `resources/list`;
- `resources/templates/list`;
- `resources/read`;
- `prompts/list`;
- `prompts/get`;
- empty acknowledgments;
- graceful `subscriptions/listen` closure;
- any future completion result.

JSON-RPC error responses do not carry `resultType` or result `_meta`.

### Tool result helper

Refactor `tools/_result.ts` so `toolResult` preserves any JSON value:

```ts
type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

function toolResult(value: JSONValue): CallToolResult;
```

Rules:

- `structuredContent` is exactly the supplied JSON value, including arrays,
  primitives, and `null`.
- The text fallback serializes the same value.
- Raster image behavior may keep image bytes in an image content block, but the
  structured payload remains functionally equivalent.
- `resultType` and server `_meta` are on the enclosing CallToolResult.
- Existing structured tool errors remain `{ error: { code, message, details? } }`
  with `isError: true` and `resultType: "complete"`.
- Do not place protocol version, client capabilities, or connection handles in
  result `_meta`.

### Output schema relationship

`Tool.outputSchema` validates `structuredContent`, not the whole MCP result.
Remove comments/tests that require output schemas to advertise protocol fields.

Use a real JSON Schema 2020-12 composition for the current success/error tool
payload alternatives instead of making every success field optional solely to
fit the error envelope. Because existing loose success schemas can overlap the
canonical error object (and some tool-specific success payloads legitimately
use an `error: string` field), use `anyOf` unless the branches are proven
disjoint. A typical emitted shape is:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "anyOf": [
    { "$ref": "#/$defs/success" },
    { "$ref": "#/$defs/toolError" }
  ],
  "$defs": { "success": {}, "toolError": {} }
}
```

Exact success-schema tightening is not required merely for protocol migration,
but the modern schema path must no longer force object-only or all-optional
workarounds. Independently of the advertised union, the central result wrapper
validates every `isError: true` structured payload against the canonical
`{error:{code,message,details?}}` schema, so a permissive success branch cannot
hide a malformed error result.

### Acceptance criteria

- Every successful raw wire response contains `resultType: "complete"`.
- Every successful result contains exact server name/version metadata.
- Every `isError: true` tool result remains a successful JSON-RPC result with
  `resultType: "complete"`.
- JSON-RPC errors have no result discriminator.
- Synthetic array, string, number, boolean, and null tool outputs survive
  without object wrapping or conversion to `{}` and validate against matching
  output schemas.
- Every registered tool's success and `isError` branches are exercised through
  the real output validator; overlapping schemas do not make a valid error fail
  `oneOf`, and permissive success schemas cannot admit malformed canonical
  errors.
- Protocol fields never leak into `structuredContent` or tool output schemas.

---

## 7. Caching, deterministic lists, and resources (P0)

### 7.1 Cache policy

All cacheable complete results use this release policy:

| Method | `ttlMs` | `cacheScope` | Reason |
| :- | -: | :- | :- |
| `server/discover` | 3,600,000 | `public` | Build-defined capabilities and identity |
| `tools/list` | 3,600,000 | `public` | Static registration, independent of Figma state |
| `prompts/list` | 3,600,000 | `public` | Static registration |
| `resources/list` | 3,600,000 | `public` | Packaged guide inventory |
| `resources/templates/list` | 3,600,000 | `public` | Static empty/template inventory |
| `resources/read` | 3,600,000 | `public` | Packaged public guide content |

The constants live in one `protocol/cachePolicy.ts` module and are used by
every handler. `ttlMs` is an integer and never negative.

If a future resource depends on an authorization context or contains private
user data, it must use `cacheScope: "private"` and receive an explicit policy
review. Do not infer a cache scope from transport type.

MRTR retries carrying `inputResponses` or `requestState` are not cacheable. This
release emits no such cacheable result.

### 7.2 Deterministic list order

Freeze one canonical registration order for tools, prompts, and resources.
Current domain-grouped tool order may be retained if it is explicit and tested;
do not depend accidentally on filesystem enumeration, dynamic object mutation,
plugin state, or completion timing.

Tests serialize each list result and compare repeated calls. Tool registration
after transport connection is forbidden in production.

### 7.3 Session-independent lists

`tools/list`, `prompts/list`, and `resources/list` must be identical regardless
of:

- whether `channel_join` has been called;
- supplied `connectionHandle` values elsewhere;
- connected Figma document or scope;
- prior success/failure;
- client identity;
- client capabilities that do not select a negotiated extension;
- stdio request order or process uptime.

All Figma tools remain visible before a handle is created. Their schemas and
descriptions state that callers must first obtain a handle through
`channel_join`.

### 7.4 Capability and notification truthfulness

The high-level SDK currently advertises `listChanged: true` automatically.
Override or replace that registration behavior. This release has static lists
and advertises:

```json
{
  "tools": {},
  "resources": {},
  "prompts": {}
}
```

Do not emit list-change notifications during startup registration or later.

### 7.5 Resource errors

Unknown guide URI:

```json
{
  "code": -32602,
  "message": "Resource not found",
  "data": { "uri": "..." }
}
```

Do not return an empty `contents` array and do not synthesize a successful
Markdown resource containing an error.

If a registered packaged file unexpectedly cannot be read, return `-32603`
with a sanitized diagnostic. This is an artifact integrity failure, not a
missing resource selected by the caller.

### Acceptance criteria

- All six cacheable operations carry both cache fields.
- Cache scope is public only for data proven identical across authorization
  contexts.
- Repeated lists preserve exact order.
- Creating, using, releasing, or invalidating handles never changes a list.
- Server capabilities do not claim list changes or resource subscriptions.
- No list-change notification is emitted during registration.
- Unknown resource uses `-32602`; an internal read failure uses `-32603`.

---

## 8. `subscriptions/listen` (P1)

Although this server exposes no changing list or resource notification in this
release, implement the modern core subscription method so stdio clients can use
the standard pattern and receive an honest acknowledgment.

### Request and admission

Accept:

```ts
type SubscriptionFilter = {
  toolsListChanged?: boolean;
  promptsListChanged?: boolean;
  resourcesListChanged?: boolean;
  resourceSubscriptions?: string[];
};
```

Validate the standard modern request `_meta`. The JSON-RPC request ID is the
subscription ID. Active subscription IDs must be unique among in-flight
requests.

Because this release supports no listed notification type, acknowledge an
empty filter:

```json
{
  "method": "notifications/subscriptions/acknowledged",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/subscriptionId": "<listen request id>"
    },
    "notifications": {}
  }
}
```

The acknowledgment is the first message carrying that subscription ID.
Requested but unsupported filter members are omitted, never echoed as though
supported.

The listen request remains open until:

- the client sends `notifications/cancelled` for its request ID;
- stdin/transport closes; or
- the server shuts it down.

### Notification rules

- Never send a notification type not explicitly acknowledged.
- Every subscription-stream message carries
  `io.modelcontextprotocol/subscriptionId`.
- Request-scoped progress and deprecated logging never use this stream.
- Multiple subscriptions can coexist and interleave on stdio.

### Cancellation and graceful closure

On client cancellation, stop the subscription and send no result for the
cancelled request.

When the server initiates graceful closure, follow the final specification and
accepted SDK behavior for server-side cancellation notification plus the
recommended complete result. The final result must include:

```json
{
  "resultType": "complete",
  "_meta": {
    "io.modelcontextprotocol/subscriptionId": "<listen request id>",
    "io.modelcontextprotocol/serverInfo": { "name": "...", "version": "..." }
  }
}
```

Lock the exact ordering against the official conformance suite rather than
inferring it from an older SDK.

### Acceptance criteria

- A listen request receives one correctly correlated acknowledgment first.
- The acknowledged filter is empty under this release's capabilities.
- No list/resource update follows.
- Two concurrent subscriptions remain independently cancellable.
- Client cancellation produces no later message for that subscription.
- Server shutdown follows official graceful-closure ordering and does not hang
  EOF shutdown.

---

## 9. Request-scoped progress, cancellation, and timeouts (P0)

### 9.1 MCP progress bridge

The current plugin already emits `command_progress` through the relay. Extend
the pending request record with the originating MCP progress token and a
request-scoped notification sender.

When `progressToken` is absent:

- plugin progress may refresh internal liveness and appear on stderr;
- no `notifications/progress` is sent to the client.

When `progressToken` is present:

- forward **strictly increasing** updates using the exact supplied token:
  each emitted value satisfies $p_{n+1} > p_n$;
- map the plugin percentage to `progress` and `total: 100`, or forward
  item-based progress/total when both are authoritative;
- preserve relevant human-readable messages;
- coalesce duplicate values produced by rounding or phase boundaries and drop
  decreasing/stale values; do not emit a second terminal percentage when the
  same value was already emitted;
- rate-limit to at most ten notifications per second per request, while always
  permitting the first and final observed progress update;
- stop sending before the terminal response;
- never send progress on a subscription stream.

Reject non-string/non-integer tokens through the official request schema.
Track active tokens so a token reused concurrently cannot cross-correlate
requests.

### 9.2 Stdio cancellation

On `notifications/cancelled`:

1. verify the request ID is currently active;
2. mark its request context cancelled;
3. abort the MCP handler signal;
4. remove or mark the relay pending route so late frames are discarded;
5. cancel the matching plugin command through the project's existing command
  identifier;
6. stop emitting progress and do not send a final MCP response;
7. free request-local buffers and timers.

Unknown, completed, duplicate, or malformed cancellation notifications are
ignored without a response.

### 9.3 Plugin cancellation cooperation

Add plugin command cancellation state keyed by the existing command identifier.
Long-running loops, page scans, exports, variable-consumer scans, and batch
handlers check it at their existing yield/chunk boundaries. New handlers must
accept a cancellation probe in shared progress/page traversal helpers.

Rules:

- No new mutation begins after cancellation is observed.
- A synchronous Figma API call already in progress may finish.
- A mutation already committed is not rolled back or represented as untouched.
- Since the MCP response is suppressed after cancellation, any partial mutation
  is written to sanitized `stderr` diagnostics for operator investigation.
- Cancellation state is removed at terminal completion or request timeout.

### 9.4 Timeout policy

The current internal command timeout is reset indefinitely by progress. Replace
it with two bounds:

- **idle timeout:** 60 seconds with no progress or terminal frame;
- **absolute timeout:** 10 minutes from dispatch, never extended by progress.

Both are configurable for development/live verification but have bounded
production defaults. Timeout follows the same cancellation propagation path as
an explicit client cancellation, then returns an actionable tool execution
error only if the MCP request itself has not already been cancelled.

### Acceptance criteria

- Progress is emitted only for an opted-in active token.
- Progress values are strictly increasing and stop before response; equal,
  rounded, repeated-final, and decreasing plugin updates are coalesced/dropped.
- Two concurrent progress tokens never cross.
- Cancellation reaches the relay and plugin and suppresses all later MCP output
  for that request.
- Cancelled page scans stop at a bounded yield point.
- A cancelled write never claims rollback.
- Progress can refresh idle liveness but cannot defeat the absolute timeout.
- Route, timer, and cancellation maps are empty after completion/cancellation.

---

## 10. JSON Schema 2020-12 and structured content (P0)

### 10.1 Emitted schema dialect

Emit valid JSON Schema 2020-12 for every tool input and output. Include an
explicit `$schema` URI in schema snapshots unless the accepted SDK deliberately
omits it and conformance confirms the default dialect unambiguously.

Input rules:

- root `type` remains `"object"`;
- recursive strictness remains the project default;
- compositions such as `oneOf`/`anyOf` may appear alongside root object type;
- refinements that JSON Schema 2020-12 can express must survive conversion into
  the emitted schema rather than exist only in Zod runtime checks;
- maintain a reviewed inventory of runtime-only semantic refinements that JSON
  Schema cannot express, such as duplicate node identities after normalizing
  `1-2` and `1:2`; keep those checks at the MCP handler boundary and state the
  rule/actionable recovery in field or tool descriptions;
- `minimum`, `maximum`, and `default` retain fractional values when present.

Output rules:

- root may be object, array, primitive, composition, or reference;
- no object-only normalization step may drop a valid schema;
- structured content must validate as its actual JSON type;
- every declared output continues to have a serialized text fallback.

### 10.2 `$ref` policy

This server emits only self-contained schemas with same-document references:

- `#/$defs/...`;
- local `$anchor` references where supported.

It never automatically dereferences `http:`, `https:`, `file:`, or another
network/external URI. Add an emitted-schema audit that rejects any non-local
`$ref`. There is no opt-in network resolver in this release.

### 10.3 Composition resource bounds

Because schemas are static server output, enforce limits at build/test time:

- maximum expanded schema depth: 64;
- maximum total subschemas per tool: 5,000;
- cycle-safe local-reference traversal;
- a five-second per-tool validation budget in schema audit tests;
- explicit failure naming the tool and schema path that exceeds a limit.

At runtime use a JSON Schema 2020-12 validator with bounded recursion and no
network fetcher. Zod remains the authoring API where the accepted SDK supports
lossless conversion.

### 10.4 Existing strictness wrapper migration

Preserve `recursivelyStrictInputSchema`, but adapt it to the accepted SDK/Zod
version without mutating caller-owned schema objects. Keep the explicit
catchall exemption inventory and prove it survives 2020-12 conversion.

Replace the current output-schema workaround that calls `.partial().extend()`
and assumes an object root. The replacement composes success and error schemas
without weakening required success fields.

For every refinement inventory entry, tests distinguish:

- emitted-schema rejection when the rule is representable;
- runtime boundary rejection when it depends on normalization, cross-item
  identity, live state, or another non-JSON-Schema semantic;
- identical acceptance for representative valid inputs.

Do not claim universal runtime/emitted-schema equivalence. The compliance claim
is that emitted schemas are valid and truthful, and that documented runtime-only
rules remain enforced before tool execution.

### 10.5 `x-mcp-header`

Do not annotate any tool input with `x-mcp-header` because the public transport
is stdio. Add a schema audit that either rejects this keyword or classifies it
as intentionally unused. A future HTTP initiative must review sensitivity,
static reachability, primitive types, uniqueness, and header injection before
adopting it.

### Acceptance criteria

- Every emitted input/output schema validates as JSON Schema 2020-12.
- Every input schema has an object root.
- Arrays/primitives are accepted for output and structured content.
- Local `$defs` resolve; external `$ref` fails the build and triggers no fetch.
- Fractional schema bounds remain fractional.
- Strict nested unknown-key tests remain green.
- Runtime and emitted-schema validation agree for every schema-expressible
  discriminated union and at-least-one-field refinement; every intentional
  runtime-only rule is inventoried, documented, and red-proved at the boundary.

---

## 11. MRTR, extensions, tasks, and deprecated features (P0)

### 11.1 Multi Round-Trip Requests

The server currently never requests client roots, model sampling, or user
elicitation. Preserve that simpler contract:

- `tools/call`, `prompts/get`, and `resources/read` may structurally accept the
  modern `inputResponses`/`requestState` fields through official request
  schemas, but this release does not issue corresponding input requests;
- ordinary calls return `resultType: "complete"`;
- no result uses `resultType: "input_required"`;
- no server-to-client JSON-RPC request is written to stdout.

If unexpected `inputResponses` or `requestState` are supplied to a path that did
not issue them, reject or ignore according to the accepted SDK and official
schema behavior; pin the decision with conformance. Never interpret them as a
connection handle or Figma authorization.

A future MRTR feature must:

- use only `tools/call`, `prompts/get`, or `resources/read`;
- emit at least one of `inputRequests` or `requestState`;
- check the capability declared on that exact request;
- integrity-protect any security-relevant state;
- bind state to principal, expiry, method, and salient parameter digest;
- use a new JSON-RPC ID on retry;
- never depend on in-memory session continuity.

### 11.2 Tasks extension

Do not advertise `io.modelcontextprotocol/tasks` and do not return
`resultType: "task"`.

The official extension is not required for core 2026-07-28 compliance. The
current plugin relay does not provide the durable task store required to make a
returned `taskId` immediately retrievable after disconnect/restart.

Tests must prove absence of:

- core/legacy `tasks` capabilities;
- extension capability `io.modelcontextprotocol/tasks`;
- `task` request flags from the old model;
- `tasks/list`;
- `tasks/result`;
- `tasks/get`, `tasks/update`, or `tasks/cancel` handlers;
- task notifications;
- `resultType: "task"`.

### 11.3 Roots and Sampling

Do not advertise or invoke deprecated Roots/Sampling. Explicit node IDs,
resource URIs, channel handles, and server configuration remain the project's
context mechanisms.

### 11.4 Logging

Do not advertise `logging`. If a client sends the deprecated
`io.modelcontextprotocol/logLevel`, validate its enum as part of the official
request schema but emit no protocol log messages. Continue writing sanitized
diagnostics to stderr.

### 11.5 URL elicitation removals

The project has no elicitation workflow, so remove no local code. Add forbidden
wire-shape fixtures for `notifications/elicitation/complete` and the removed URL
`elicitationId` if the accepted SDK accidentally exposes old behavior under
`2026-07-28`.

### Acceptance criteria

- Discovery advertises no extensions or deprecated capabilities.
- No server-initiated request can appear on stdout.
- All project calls complete synchronously at the MCP layer or fail.
- Old and new task methods are unavailable.
- Client capability declarations from one request cannot enable another.
- No protocol log notification is emitted under any log-level input.

---

## 12. OpenTelemetry trace context and stderr observability (P1)

### Request context

Parse and carry these optional request `_meta` keys:

- `traceparent`;
- `tracestate`;
- `baggage`.

Validate them using W3C Trace Context/Baggage-compatible parsing. Invalid
values fail with `-32602` if the official SDK does not already perform that
validation.

Create a request-local observability context containing:

- MCP request ID;
- method and tool/resource/prompt name where applicable;
- trace/span identifiers from valid context;
- client name/version for display only;
- internal plugin command ID.

Propagate trace context through relay command frames and progress diagnostics so
one operation can be correlated across MCP server, relay, and plugin. Do not
include raw tool arguments, Figma document content, or image bytes as trace
attributes.

### Logger migration

Keep stderr as the output channel, but make logger calls accept structured
request context. Avoid writing complete thrown objects whose getters or proxies
may be hostile; retain the existing safe error snapshot approach.

No logging behavior depends on `clientInfo`, trace fields, or log level.

### Acceptance criteria

- Valid trace context correlates one request through relay/plugin logs.
- Invalid trace metadata cannot crash the server or alter authorization.
- Raw handles and document payloads do not appear in logs or spans.
- No trace metadata is added to tool `structuredContent`.
- Logging remains entirely on stderr.

---

## 13. Protocol and application error taxonomy (P0)

### JSON-RPC code policy

Use only:

| Code/range | Use in this project |
| :- | :- |
| `-32700` | Parse error |
| `-32600` | Invalid JSON-RPC request |
| `-32601` | Unknown/removed method |
| `-32602` | Invalid params, missing modern metadata, unknown resource/task-like identifier where specified |
| `-32603` | Internal protocol/server failure |
| `-32020` | Reserved for HTTP header mismatch; never emitted by stdio server |
| `-32021` | Missing required client capability |
| `-32022` | Unsupported protocol version |

Do not allocate new project meanings in `-32020..-32099`. Do not add new codes
to legacy `-32000..-32019`. Internal connection/timeout exceptions must become
tool execution errors or standard JSON-RPC errors as appropriate, not pretend to
be MCP-reserved protocol codes.

### Tool execution errors

Existing Figma error codes such as `NAME_MISMATCH`, `NODE_LOCKED`, and
`CONNECTION_HANDLE_UNKNOWN` are strings inside a successful `tools/call` result:

```json
{
  "resultType": "complete",
  "content": [{ "type": "text", "text": "Error [...]" }],
  "structuredContent": {
    "error": {
      "code": "NAME_MISMATCH",
      "message": "...",
      "details": {}
    }
  },
  "isError": true
}
```

These strings do not consume JSON-RPC numeric code space. Preserve the central
error registry and one-step recovery guidance.

### Protocol-versus-tool boundary

Protocol errors:

- malformed JSON-RPC;
- missing required request metadata;
- unsupported protocol version;
- unknown method/tool/resource/prompt;
- structurally invalid method parameters before a tool is selected;
- server internal failure outside tool execution.

Tool execution errors:

- unknown or released Figma connection handle;
- schema-valid but semantically invalid Figma arguments;
- plugin/API failure;
- scope, name, lock, remote, instance, permission, or safety refusal;
- command timeout after tool dispatch.

Keep invalid tool arguments visible to the model as an actionable tool result
where the accepted modern SDK follows SEP-1303 behavior. Pin this with official
conformance and the existing strict-input boundary tests.

### Acceptance criteria

- No project-defined numeric error uses MCP's reserved range.
- Unsupported version and missing capability use exact modern codes/data.
- Unknown resource is `-32602`, not `-32002` and not empty content.
- Figma safety refusals remain in-band tool errors with `resultType: complete`.
- Removed methods are `-32601` and cannot mutate state.

---

## 14. Documentation, manifests, and cross-initiative synchronization (P1)

### User and agent guidance

Update:

- `README.md`;
- `AGENTS.md` only if its lightweight pointer needs wording changes;
- `skills/figma-edit/SKILL.md`;
- `skills/figma-edit/references/constraints.md`;
- `skills/figma-edit/references/workflows.md`;
- `skills/figma-edit/references/tool-selection.md`;
- `skills/figma-edit/references/error-playbook.md`;
- every registered MCP prompt body, including the current
  `swap_overrides_instances` prompt in `src/mcp_server/tools/instance.ts` if it
  still exists when this release lands;
- `SAFETY.md`;
- `CHANGELOG.md`.

Required guidance:

1. Call `channel_join({ channel })` with the existing four-character plugin
  code and retain `connectionHandle`.
2. Pass the handle verbatim to every Figma tool.
3. A handle is opaque; do not parse, shorten, guess, or derive it.
4. Handles are invalidated by plugin disconnect, relay restart, or explicit
  release.
5. Use `channel_release` when work is complete.
6. Handle possession routes to a plugin but does not bypass edit scope.
7. Do not assume one stdio process equals one conversation.
8. Retrying a cancelled/timed-out write may repeat an effect; re-read first.
9. Discovery instructions now arrive through `server/discover`, not
   `initialize`.

### Package and registry metadata

Update `server.json` only to the latest registry schema appropriate at release
time; keep transport `stdio`. Do not claim Streamable HTTP.

Regenerate `manifest.json` tool metadata so:

- `channel_release` is present;
- every Figma tool description names the required handle workflow;
- tool count/order match `tools/list`;
- no initialization/session language remains.

Enumerate `prompts/list` and inspect every `prompts/get` result during contract
synchronization. Prompt text is executable agent guidance: a prompt that tells
the model to call a Figma tool without `connectionHandle` fails the release even
when tool schemas are correct.

Extend `scripts/check-versions.ts` or add a companion check for:

- package/manifest/server version parity;
- protocol version constant parity;
- one root dependency manifest;
- registry transport parity with runtime.

### `SAFETY.md`

Add a protocol/application-state section that distinguishes:

- MCP request metadata validation;
- relay handle routing;
- plugin-side Figma authorization and safety.

The safety matrix does not need one new row per handle-injected tool. Instead,
state a universal pre-dispatch invariant and add rows for `channel_join` and
`channel_release`. Existing tool rows retain their plugin-side controls.

### Future initiative interaction

- Initiative 03's future tools inherit the handle field from central
  classification; its tool count is rebased during implementation.
- Initiative 04's `planId` is already an explicit application handle, but its
  process/session and active-channel wording must change. A plan operation must
  carry both `planId` and the applicable `connectionHandle`, and plan lifetime
  must be explicit rather than tied to stdio process identity.
- No future tool may introduce implicit current-channel, current-plan,
  current-document, or current-agent state.

### Migration table for client examples

| Old flow | Modern flow |
| :- | :- |
| `initialize` then `notifications/initialized` | Optional `server/discover`, then self-contained requests |
| Version/capabilities sent once | Version and client capabilities in every request `_meta` |
| Server identity/instructions from initialize | Identity/capabilities/instructions from `server/discover`; identity repeated in result `_meta` |
| `channel_join({channel})`, then omit channel | `channel_join({channel}) -> connectionHandle`; include it on every Figma tool |
| Process exit releases current binding | Handle remains relay-owned until `channel_release`, plugin disconnect, or relay restart |
| Plugin progress only in terminal logs | MCP progress when the request supplies `progressToken` |
| No cancellation path | `notifications/cancelled` propagates to relay/plugin |

### Acceptance criteria

- No living documentation instructs clients to initialize, establish an MCP
  session, or rely on process-global Figma binding.
- All examples include modern `_meta` at the raw protocol level.
- All Figma tool examples include `connectionHandle` or explicitly show it as a
  carried variable.
- Every registered prompt is free of initialization, implicit binding, and
  handle-less Figma calls.
- Registry/package metadata claims only implemented transport/capabilities.
- Future initiative docs are cross-linked where their state assumptions must be
  rebased.

---

## 15. Conformance and test strategy (P0)

### 15.1 Raw modern stdio round trip

Rewrite `src/mcp_server/tests/roundtrip.ts` to send, in order:

1. `server/discover` as the first message;
2. `resources/list`;
3. `resources/read` for a guide;
4. `tools/list`;
5. `prompts/list`;
6. `prompts/get` for the registered prompt;
7. a schema-invalid Figma tool call proving tool-level recovery;
8. a short `subscriptions/listen` plus cancellation.

Every request has a new ID and complete modern `_meta`. Every successful result
is checked for `resultType`, server identity, and cache fields where required.

Do not send `initialize` or `notifications/initialized`.
Assert the returned prompt contains the modern channel/handle workflow and no
handle-less live-Figma example. If Initiative 03 removes that prompt first,
replace the fixture with every then-registered prompt rather than dropping
prompt-content coverage.

### 15.2 Protocol metadata tests

- Missing `_meta` -> `-32602`.
- Missing protocol version -> `-32602`.
- Missing client capabilities -> `-32602`.
- Empty capabilities -> success for ordinary methods.
- Optional clientInfo accepted and behavior-independent.
- Unsupported version -> exact `-32022` data.
- Different capabilities on concurrent requests do not leak.
- Unknown reserved metadata keys are not interpreted by project code.
- Valid/invalid trace context follows Section 12.

### 15.3 Result tests

- Every successful method has `resultType: "complete"`.
- Every result has exact server identity metadata.
- Errors have no result discriminator.
- Tool success and tool error both validate.
- Array/primitive/null structured content survives.
- Tool output schemas validate only structured content, not protocol envelope.

### 15.4 Discovery/list/cache tests

- `server/discover` mandatory shape.
- Only one supported version.
- Exact capabilities, no deprecated/extension claims.
- Every required cacheable result has non-negative integer TTL and scope.
- Repeated tool/resource/prompt lists are byte-stable.
- Handle state cannot vary lists.
- No list-change notification occurs during registration or tool use.

### 15.5 Handle tests

- `channel_join` retains the existing four-character `channel` input and returns
  an opaque `connectionHandle`.
- Every Figma tool schema requires the handle.
- Static tools/resources/prompts require none.
- Unknown, released, and disconnected handle behavior.
- Two channels and two callers interleave without route crossover.
- Duplicate request IDs on different relay peers remain isolated.
- MCP process restart retains a relay-owned handle.
- Plugin/relay restart invalidates it cleanly.
- Release is scoped to exactly one handle.

### 15.6 Progress/cancellation/subscription tests

- No token means no MCP progress.
- Token means strictly increasing, rate-bounded progress on the request
  channel; equal/decreasing/rounded duplicates are suppressed.
- Progress stops before terminal result.
- Client cancellation suppresses response and late notifications.
- Relay/plugin cancellation state is reclaimed.
- Idle versus absolute timeout behavior.
- Subscription acknowledgment ordering and exact subscription IDs.
- Unsupported filters omitted.
- Multiple subscriptions demultiplex correctly.
- Shutdown and client-cancel behavior match official conformance.

### 15.7 Schema tests

- Validate emitted `tools/list` schemas with a JSON Schema 2020-12 validator.
- Assert root object inputs.
- Assert full output-schema type freedom.
- Assert no external `$ref`.
- Assert composition bounds.
- Assert fractional min/max/default preservation.
- Retain recursive unknown-key rejection and catchall-inventory tests.
- Compare runtime parse with emitted-schema validation for representative valid
  and invalid calls governed by schema-expressible rules.
- Snapshot the runtime-only refinement inventory and prove normalized duplicate
  node IDs and each other listed semantic are rejected before tool execution.

### 15.8 Removed-surface tests

Assert runtime `-32601` or ignored-notification behavior for:

- `initialize`;
- `ping`;
- `logging/setLevel`;
- `resources/subscribe`;
- `resources/unsubscribe`;
- `tasks/list`;
- `tasks/result`;
- `notifications/initialized`;
- `notifications/roots/list_changed`;
- `notifications/elicitation/complete`.

Assert no server output contains:

- a server-initiated JSON-RPC request;
- `resultType: "input_required"`;
- `resultType: "task"`;
- `notifications/message`;
- list/resource update notifications.

### 15.9 Official conformance

Add root scripts similar to:

```json
{
  "check:mcp-runtime": "bun run scripts/check-mcp-runtime.ts",
  "test:mcp:wire": "bun run src/mcp_server/tests/roundtrip.ts",
  "test:mcp:conformance": "<pinned 2026-07-28 conformance command>",
  "test:mcp": "bun run check:mcp-runtime && bun run test:mcp:wire && bun run test:mcp:conformance"
}
```

Run server conformance over the built `dist/server.js`, not only TypeScript
source, so bundled SDK behavior and stdio framing are tested.

No expected-failure baseline may suppress a mandatory 2026-07-28 requirement.
Any upstream conformance limitation is documented as a residual test gap and
covered by a raw wire test until the suite catches up.

### 15.10 Red-proof requirement

Every regression test added for this migration is red-proved:

- remove `resultType` and show the exact test fail;
- re-enable initialize and show the removed-surface test fail;
- remove handle injection from one tool and show inventory failure;
- make list output depend on a handle and show cache/list test fail;
- omit cache metadata and show cache contract failure;
- stop propagating cancellation and show route/plugin test fail.

Mocks establish project routing and envelope behavior, not host Figma behavior.
Cancellation points and handle routing need real relay integration; any claim
about cancelling a live Figma operation also needs a live smoke test.

---

## Implementation plan

### Phase 0 - Ratification and external gates

- Assign the major release number.
- Re-read the final 2026-07-28 specification and schema in case post-release
  editorial corrections changed examples without changing normative behavior.
- Run the SDK admission probe against the latest stable SDK.
- Pin a compliant SDK and conformance release; stop if none exists.
- Delete nested MCP package/lock artifacts.
- Add `check:mcp-runtime` before touching server semantics.
- Freeze the current tool/resource/prompt inventory and classify every tool by
  handle behavior.

### Phase 1 - Modern protocol core

- Replace initialization-era server construction with modern-only setup.
- Add per-request metadata/version validation.
- Add modern protocol errors `-32021` and `-32022` where applicable.
- Register `server/discover`.
- Add central `completeResult` and server-info metadata.
- Rewrite the minimal raw round-trip test to start with discovery.
- Verify `initialize`, `ping`, and removed routes are absent.

### Phase 2 - Cacheable, deterministic discovery surfaces

- Define one cache policy module.
- Override high-level SDK auto-capabilities that incorrectly claim list changes.
- Add required cache fields to discovery/lists/resource reads.
- Freeze deterministic order.
- Correct resource error behavior.
- Add session/handle-independent list tests.

### Phase 3 - Explicit handle architecture

- Define the shared handle format, lifecycle, and error contract.
- Preserve the existing four-character channel-code workflow.
- Redesign relay peer/channel state into a handle registry.
- Make relay command frames carry `connectionHandle` and resolve it before
  dispatch.
- Refactor `figma-client.ts` away from global binding state.
- Change `channel_join` to return a handle.
- Add `channel_release`.
- Inject required handle schema into every Figma tool.
- Update every command call site to pass explicit request context.
- Add concurrency/restart/release integration tests before continuing.

### Phase 4 - Progress, cancellation, and request lifecycle

- Bridge plugin progress to MCP progress tokens.
- Add strictly-increasing progress guards and coalescing.
- Propagate stdio cancellation through server, relay, and plugin.
- Add cooperative cancellation checks to shared long-running traversal helpers.
- Introduce idle and absolute timeouts.
- Prove route/timer cleanup and late-frame suppression.

### Phase 5 - Subscriptions and modern notifications

- Register `subscriptions/listen`.
- Implement acknowledgment, correlation, multiple active subscriptions, client
  cancellation, and server shutdown.
- Acknowledge no notification filters under current capabilities.
- Prove request-scoped progress never enters subscription delivery.

### Phase 6 - JSON Schema 2020-12 migration

- Upgrade schema conversion/validation path.
- Preserve recursive strict input behavior.
- Remove object-only output and structured-content assumptions.
- Replace partial-output error workaround with 2020-12 composition.
- Add external-ref and composition-bound audits.
- Inventory schema-expressible and runtime-only refinements.
- Snapshot emitted `tools/list` through the real transport.

### Phase 7 - Observability and documentation

- Add request-scoped trace context and redacted structured stderr logging.
- Update README, guides, skill, error playbook, SAFETY, CHANGELOG, manifest, and
  registry metadata.
- Add the old-to-new protocol and connection-handle migration examples.
- Migrate and test every registered prompt body.
- Synchronize future Initiatives 03 and 04 where they assume implicit state.

### Phase 8 - Release verification

- Run runtime admission check.
- Run server and plugin type checks.
- Run generated-file, suppression, plugin-build, and version checks.
- Run the complete unit/integration suite.
- Run raw built-artifact wire tests.
- Run official 2026-07-28 server conformance with zero mandatory expected
  failures.
- Run live Figma smoke matrix for handle routing, progress, cancellation, and
  unchanged plugin safety gates.
- Inspect built stdout/stderr behavior under Node and Bun supported runtimes.

---

## Live smoke matrix

At minimum, verify with two live Figma plugin instances and one MCP stdio
process:

1. `server/discover` as the first message, with no initialization;
2. repeated stable/cacheable tools/resources/prompts lists before any join;
3. join plugin A with its four-character channel code, obtain handle A, and
   read its scope;
4. join plugin B without releasing A and obtain handle B;
5. interleave page/node reads through A and B and prove no document crossover;
6. perform one safe write through each handle and verify plugin-side scope/name
   enforcement still applies;
7. release A and prove B remains usable;
8. restart the MCP stdio process only and reuse B;
9. restart plugin B and prove B fails with a one-step rejoin recovery;
10. run a page/document scan with `progressToken` and observe strictly
  increasing MCP progress, including duplicate source percentages;
11. cancel a long read and prove progress/result stop and routes are reclaimed;
12. cancel a chunked write before a later chunk, inspect the live document, and
    prove no rollback claim is made;
13. open two subscriptions, observe independent empty acknowledgments, and
    cancel each;
14. send unsupported version, missing metadata, removed methods, and an unknown
    resource and verify exact protocol errors;
15. close stdin with active relay handles and prove prompt process exit without
  destroying the still-valid relay handle.

---

## Success measures

The release is complete only when:

- The server supports exactly MCP `2026-07-28` and no initialization-era
  behavior.
- `server/discover` is implemented and cacheable.
- Every request independently validates protocol version and client
  capabilities.
- Every successful result carries `resultType: "complete"` and server identity
  metadata.
- Every required discovery/list/read result carries correct caching hints.
- Tool, resource, and prompt lists are deterministic and independent of
  connections and prior calls.
- Every live-Figma tool requires an explicit opaque `connectionHandle`.
- No module-global current Figma binding remains in the MCP server.
- Handles survive MCP process restart while the relay/plugin binding remains
  alive and are invalidated by release, plugin disconnect, or relay restart.
- Handle validation does not weaken any plugin safety control.
- Stdio progress is opt-in, correlated, strictly increasing, and
  request-scoped.
- Stdio cancellation reaches the relay/plugin and suppresses late output.
- `subscriptions/listen` follows modern acknowledgment/correlation/cancellation
  semantics while honestly acknowledging no unsupported events.
- No server-initiated JSON-RPC request is emitted.
- No removed/deprecated method or old task route is active.
- JSON Schema 2020-12 is supported without external network dereferencing.
- Any JSON structured content is preserved and validated correctly.
- Resource-not-found uses `-32602`.
- JSON-RPC error allocation respects MCP's reserved range.
- Protocol logging is absent and sanitized observability remains on stderr.
- Public package metadata advertises only stdio.
- The accepted SDK runtime gate, raw built-artifact round trip, full project
  suite, and official 2026-07-28 conformance suite all pass.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| TypeScript SDK lags the released specification | High at planning time | Behavioral admission gate; block rather than patch old runtime |
| A package claims draft support while retaining legacy runtime handlers | High | Raw wire and removed-route tests, not type/export inspection alone |
| Requiring a handle on every tool causes schema drift | High without centralization | Central tool classification/injection plus exhaustive inventory test |
| Global binding state survives in a helper and leaks across callers | High | Delete `bindingState`; explicit context argument at every command boundary; concurrency tests |
| Relay restart loses handles | Certain | Document relay-memory durability and exact rejoin recovery; never claim permanent state |
| A cancelled mutation has already changed Figma | Medium | Cooperative checks, stop-before-next-mutation, no rollback claim, live test and stderr audit |
| Progress keeps a broken operation alive forever | Medium | Separate idle and absolute timeout; absolute bound never refreshes |
| SDK high-level API advertises `listChanged: true` automatically | High on current SDK | Capability snapshot test and low-level handler override/replacement |
| Cache marked public exposes caller-specific data | Low for current static guides, high if surface evolves | Central explicit cache policy; review gate for every new cacheable resource |
| Tool list changes because of a handle or plugin capability | Medium without invariant | Keep all tools unconditional; require handle through schema; byte-stable list tests |
| Result decorator misses an uncommon method | Medium | Official result-union traversal and raw tests for every registered method |
| Object-only schema helper silently drops a valid array/primitive output | High in current helper | Preserve JSONValue exactly; synthetic non-object boundary tests |
| Overlapping success/error output schemas make `oneOf` reject valid results | High with current loose schemas | `anyOf` unless disjointness is proven; central canonical validation for every `isError` result |
| Runtime-only normalized duplicate checks vanish from emitted schema | Certain for some semantics | Explicit runtime-only refinement inventory, truthful descriptions, pre-execution boundary tests; no universal equivalence claim |
| Network `$ref` creates SSRF/fetch DoS | Low if static, severe if introduced | Build-time external-ref rejection; no network resolver |
| Pathological schema composition consumes CPU | Low but plausible | Static depth/subschema/time bounds and runtime validator limits |
| Subscription shutdown ordering differs from draft SEP prose | Medium | Use final schema/spec plus official conformance as authority |
| Deprecated Logging is accidentally enabled by client log level | Medium | Do not advertise; hard test that no `notifications/message` is emitted |
| Old task methods remain reachable through SDK defaults | High on current SDK | Runtime forbidden-method tests and no extension/capability advertisement |
| Internal relay is mistaken for public Streamable HTTP | Medium | Explicit architecture docs, package transport metadata, HTTP negative test |
| Future initiatives reintroduce implicit process state | Medium | Cross-initiative handle rule and registration-time state classification |
| Legacy clients stop working | Certain | Intentional major cutover; clear release notes; no compatibility code |

---

## Provenance

The following findings were verified from the repository and authoritative
2026-07-28 specification during preparation of this Initiative.

| Item | Verified source | Finding |
| :- | :- | :- |
| Server entry | `src/mcp_server/server.ts` | Uses high-level `McpServer` and `StdioServerTransport`; server instructions currently rely on initialization-era SDK behavior |
| Raw lifecycle test | `src/mcp_server/tests/roundtrip.ts` | Sends `initialize` using protocol `2024-11-05`, validates initialization result, then sends `notifications/initialized` |
| Application binding | `src/mcp_server/figma-client.ts` | Stores one module-global `bindingState`; every non-join command requires that implicit binding but receives no explicit handle |
| Channel tool | `src/mcp_server/tools/channel.ts` | `channel_join` replaces/releases the current binding and returns scope, but no reusable opaque handle |
| Relay | `src/socket.ts`, `src/shared/channelProtocol.ts` | Channel state binds one plugin peer to one MCP peer and pending routes are connection/channel scoped |
| Tool registration | `src/mcp_server/tools/index.ts` | Central proxy already provides a suitable enforcement point for strict schemas and universal handle classification |
| Tool results | `src/mcp_server/tools/_result.ts` | Assumes structured payloads are objects and converts non-object values to `{}`; no `resultType`/server-info decorator |
| Resources | `src/mcp_server/resources.ts` | Registers five static packaged guides; catches file errors and returns synthetic successful Markdown error content |
| Logging/progress | `src/mcp_server/logger.ts`, `src/mcp_server/figma-client.ts` | Logs to stderr; plugin progress only refreshes timeout/logs and is not forwarded as MCP progress |
| Dependency baseline | root `package.json` | Pins `@modelcontextprotocol/sdk` 1.29.0, Zod 4.4.3, Node >=20 |
| Stale dependency island | `src/mcp_server/package.json` and local lockfiles | Pins older SDK/Zod and is not the root build authority |
| Build | `tsup.config.ts` | Bundles SDK into `dist/server.js`, so conformance must test the built artifact |
| Registry metadata | `server.json` | Advertises stdio only, matching the selected transport posture |
| Current SDK runtime | `@modelcontextprotocol/sdk` 1.29.0 locally and 1.30.0 published artifact | Both are initialization-era; 1.30.0 reports latest protocol 2025-11-25 and retains removed routes |
| Stateless core | MCP 2026-07-28 basic overview/versioning and SEP-2575 | Every request carries version/capabilities; no initialize; mandatory discover; server identity in result metadata |
| Session removal | SEP-2567 | Cross-call application state uses ordinary explicit handles; lists cannot vary by connection/session |
| Results/MRTR | MCP basic overview and MRTR | Every result has `resultType`; server-to-client requests use `InputRequiredResult`, not unsolicited JSON-RPC requests |
| Caching | MCP caching utility and SEP-2549 | Discovery, lists, templates, and resource reads require non-negative `ttlMs` plus public/private `cacheScope` |
| Stdio | MCP stdio transport | Newline JSON-RPC, no server requests, cancellation notification, EOF shutdown, no header layer |
| Subscriptions | MCP subscriptions pattern | `subscriptions/listen` acknowledgment first, request-ID correlation in `_meta`, explicit opt-in, cancellation/graceful closure |
| Tools/schemas | MCP tools page and SEP-2106 | Deterministic list recommendation; JSON Schema 2020-12; any JSON structured content; external `$ref` and composition safeguards |
| Errors | MCP basic overview/schema | Reserved `-32020..-32099`; modern codes `-32020`, `-32021`, `-32022`; resource missing now `-32602` |
| Deprecated features | MCP deprecated registry and SEP-2577 | Roots, Sampling, Logging, HTTP+SSE, selected sampling context, and DCR are deprecated; new servers should not adopt them |
| Tasks | MCP Tasks extension and SEP-2663 | Tasks are optional extension `io.modelcontextprotocol/tasks`; old `tasks/list`/`tasks/result` model is removed |

---

## Revision history

- **Rev 2, 2026-08-05** - Narrows the Initiative to MCP-spec migration,
  preserves the existing four-character channel workflow, and limits the
  connection change to explicit `connectionHandle` state required by the
  sessionless protocol model.
- **Rev 1, 2026-08-05** - Initial Initiative. Audits every 2026-07-28
  changelog item against the current stdio server; records the non-compliant
  1.29.0/1.30.0 SDK baseline; selects a modern-only, stdio-only cutover;
  replaces process-global Figma binding with relay-owned explicit handles;
  specifies discovery, per-request metadata, result envelopes, cache hints,
  deterministic lists, subscriptions, progress, cancellation, JSON Schema
  2020-12, error allocation, deprecated-feature posture, conformance, rollout,
  tests, risks, and provenance.