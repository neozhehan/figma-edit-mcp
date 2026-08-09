# Adversarial review — MCP Specification Update (2026-07-28), Rev 2

**Reviewed document:** [initiative.md](initiative.md) (Rev 2, 2026-08-05)
**Review date:** 2026-08-05
**Method:** every repository claim checked against the working tree; every protocol
claim checked against the published 2026-07-28 changelog, base-protocol page,
versioning page, stdio transport page, subscriptions page, progress page, and
`schema/2026-07-28/schema.ts`; the pinned and latest SDK artifacts inspected
directly.

The Initiative's factual base is sound. Everything below is either a design
decision that costs more than it is worth, a gap between the plan and the
repository, or a precision defect that would mislead an implementer.

## How recommendations are prioritized

Every recommendation is written against the project's Golden Rule:

> Maximize **first-call correctness** and **one-round-trip recovery**, while
> preserving the Figma plugin as the authoritative write safety boundary.

Where a protocol requirement and the Golden Rule pull in different directions,
the protocol requirement wins and the recommendation says how to keep recovery
actionable within it. Where the Initiative adds work that no part of the
2026-07-28 specification requires, the recommendation is to cut it.

Severity:

- **B (blocking)** — resolve before the Initiative is ratified. Each one either
  breaks a release, contradicts a stated non-goal, or removes a recovery path
  the project already has.
- **C (correctness/precision)** — fix in place. Each one would mislead an
  implementer or fails to render.

---

## Headline recommendation

Findings B2, B3, B5, and B10 all descend from one decision that the Initiative
never examines: **multiple concurrent connection handles**.

The 2026-07-28 statelessness rule requires only that state spanning requests be
named by an explicit identifier the client passes on each request. A single
binding per relay, named by an explicit handle, satisfies that rule completely.
Concurrent handles are an additional product feature. No part of the
specification asks for them.

Everything expensive and risky in Section 4 comes from that extra: the relay
handle registry, restart durability, handles that are shareable between agents,
cross-handle routing tests, and live smoke steps 4 through 8. It also silently
retires three existing error codes whose whole purpose is one-round-trip
recovery from connection failure.

**Recommendation.** Split the decision out and answer it explicitly.

- *Preferred:* scope this release to **one active handle per relay**.
  `channel_join` still returns an explicit `connectionHandle`, every Figma tool
  still requires it, `bindingState` still dies, and the server is fully
  compliant — but `CHANNEL_IN_USE`, `CHANNEL_NOT_BOUND`, and the
  `details.releasedChannel` recovery all keep working unchanged, and the relay
  keeps its current peer model. First-call correctness and one-round-trip
  recovery are preserved at a fraction of the migration cost.
- *If concurrency is genuinely wanted:* make it a separate initiative with its
  own relay design, threat model, and error-contract rewrite. Do not carry it as
  an unremarked rider on a protocol migration.

---

## Blocking findings

### ✅ B1 — Section 9 collides with Initiative 02, which this document never mentions

**Evidence.** [Initiative 02 — Timeout, Liveness, and Mutation-Outcome
Integrity](../02%20-%20Timeout,%20Liveness,%20and%20Mutation-Outcome%20Integrity/initiative.md)
is a proposed release covering MCP progress forwarding (D3), replacement of
`sendCommandToFigma(..., timeoutMs = 30000)` and the 60-second post-progress
bound with a command-aware policy (D4), cancellation acknowledgement (D7), and
bounded execution receipts plus a new public `command_status` tool (D5).
Section 9 of this Initiative rewrites the same subsystem. Section 14's "Future
initiative interaction" lists only Initiatives 03 and 04. Initiative 01 is also
absent, although Section 4.6 adds two codes to the registry 01 is burning down.

**Why it matters.** Section 9.4 proposes one global idle bound plus one absolute
bound. Initiative 02 states directly that "merely increasing timeout constants
is explicitly rejected" and requires deadlines selected by execution class,
because a `node_info` all-pages read was measured live at 109,852 ms. A single
60-second idle bound with a 10-minute ceiling is not obviously wrong, but it is
a different answer to a question another initiative has already studied with
live evidence. Two ratified initiatives cannot both own this.

**Recommendation.** Declare the relationship before ratification, in Section 14
and in the Release identity block.

1. State the dependency order. If Initiative 02 lands first, Section 9 becomes a
   protocol-surface adapter over 02's policy: bridge 02's progress reporter to
   `notifications/progress`, and map 02's deadlines rather than restating
   constants.
2. If this release lands first, say explicitly which of 02's decisions it
   pre-empts and which survive, and carry 02's receipt requirement forward —
   it is the mechanism that keeps a timed-out write recoverable in one round
   trip, which is the Golden Rule applied to timeouts.
3. Add Initiative 01 to Section 14 for the error-registry and playbook overlap.

> **Resolved in Rev 3 (2026-08-07), by option 1.** One correction to the finding
> as written: the schedulable counterparty is **PRD-004**, not Initiative 02.
> Initiative 02 is the pre-split umbrella; PRD-004 is the canonical document and
> is ranked second in `planning/BACKLOG.md`. Initiative 05 now names PRD-004 as
> a scheduling precondition and does not start until it ships. Section 9 is an
> adapter over PRD-004's contract and defines no timeout constants; Section 14
> records both PRD-004 and Initiative 01/PRD-001; Phase 0 blocks on PRD-004 and
> rebases the tool inventory over `command_status`. Merging the two releases was
> rejected: the dependency runs one way, this Initiative is blocked on an SDK
> that does not exist, and the combined release could not be reviewed, reverted,
> or live-verified in one pass. This also resolves **B6** and **B10**.

### ❓ B2 — The handle design redesigns the relay, contradicting a stated non-goal

**Evidence.** Section 4.5 says the Initiative "adds handle selection but does not
redesign the relay protocol," and the non-goals say "No redesign of the existing
four-character channel code or internal Figma relay." The relay cannot satisfy
Section 4.4 as written:

- `ConnectedPeer.channel: string | null` — one channel per peer.
- `ChannelState.{plugin, mcp}` — exactly one plugin peer and one MCP peer.
- A second MCP peer on a channel is refused with `CHANNEL_IN_USE`.
- `detachMcpPeer` clears every pending route and deletes the channel when the
  last peer leaves.

Section 4.4 requires one peer holding several handles, two handles for one
plugin, and handle survival across an MCP process restart. Each requires
changing that state model. Separately, Section 4.1 claims to "preserve the
current four-character channel entry and join behavior" while also stating
"`channel_join` no longer releases an earlier binding" — but
`joinChannel` performs a mandatory leave-then-join today
([figma-client.ts:578-606](../../../../src/mcp_server/figma-client.ts#L578-L606)).

**Why it matters.** The non-goal is doing real work in the document: it is what
lets a reader believe the relay is out of scope and skip its tests. An
implementer following Section 4.4 would discover mid-phase that Phase 3 contains
an unscoped relay rewrite.

**Recommendation.** Adopt the headline recommendation and scope to one active
handle, which makes the non-goal true. If concurrency is kept, strike the
non-goal, retitle Section 4.4 as a relay redesign, and give it its own
acceptance criteria covering peer/channel state, route ownership, handle
lifetime across peer loss, and the `CHANNEL_IN_USE` replacement. Also correct
Section 4.1: the join *behavior* changes even though the four-character *input*
does not.

### ❓ B3 — The existing channel error contract is left undefined

**Evidence.** Section 4.6 adds `CONNECTION_HANDLE_UNKNOWN` and
`CONNECTION_HANDLE_PLUGIN_DISCONNECTED`. It says nothing about the codes the
handle model makes unreachable or wrong:

- `CHANNEL_NOT_BOUND` — there is no "current binding" to be missing, and its
  `details.releasedChannel` recovery has no meaning once a join stops releasing.
- `CHANNEL_IN_USE` — the single-session reservation it reports is removed.
- `CHANNEL_JOIN_FAILED` with `details.phase: "leave-previous-channel"` — that
  phase no longer exists.
- `PLUGIN_PEER_AMBIGUOUS` and the playbook note explaining where it surfaces.

[error-playbook.md:166-175](../../../../skills/figma-edit/references/error-playbook.md#L166-L175)
documents this model in prose, including the rule "A channel binds exactly one
plugin to one MCP session." Section 14 lists the playbook for update without
noting that these are semantic changes, not wording changes.

**Why it matters.** These codes are the project's one-round-trip recovery for
connection failure. `CHANNEL_NOT_BOUND` naming the exact channel a failed join
cost the caller is the Golden Rule working as designed. Silently orphaning them
regresses connection recovery from "call `channel_join` with this channel code"
to "the agent guesses."

**Recommendation.** Add a code-disposition table to Section 4.6 covering every
existing channel-layer code with one of `retained`, `retired`, or `redefined`,
and the replacement recovery sentence for each retirement. Require the same
one-step recovery quality of the two new codes: `CONNECTION_HANDLE_UNKNOWN`'s
recovery should name the channel code to rejoin when the relay still knows it,
not just say "call `channel_join` again." Add a Section 15 test that every
reachable channel-layer code has a playbook entry.

### ❓ B4 — `scripts/smoke-mcp.mjs` appears nowhere in the Initiative

**Evidence.** [scripts/smoke-mcp.mjs](../../../../scripts/smoke-mcp.mjs) sends
`initialize` with `2024-11-05` and asserts `result.serverInfo.name` and
`result.protocolVersion`. CI runs it against the packed artifact in the
node-smoke job ([ci.yml](../../../../.github/workflows/ci.yml)). The current-state
table, Section 15, the provenance table, and Phase 8 name only
`src/mcp_server/tests/roundtrip.ts` as the protocol test. The live harnesses
(`scripts/live-verify.ts`, `scripts/phase14-live-verify.ts`,
`scripts/live-test-phase1.ts`, `scripts/live-test-phase2.ts`) drive
`channel_join` and tool calls and each needs the handle.

**Why it matters.** The first otherwise-complete implementation would fail CI on
an artifact the Initiative never inventoried, and the live matrix in Section 15
would have no runnable harness behind it.

**Recommendation.** Add to Phase 0 an explicit inventory step: enumerate every
artifact that speaks the MCP wire or drives `channel_join`, and record it in the
provenance table. Name `scripts/smoke-mcp.mjs` in Section 15.1 alongside
`roundtrip.ts`, and name the four live scripts in Section 15.5 and Phase 8. The
live smoke matrix should say which script executes each numbered step.

### ❓ B5 — Handles are unauthenticated bearer capabilities on an unauthenticated relay

**Evidence.** Section 4.4 specifies only that the handle is "opaque." There is no
entropy, format, expiry, or rotation requirement. The Initiative simultaneously
makes handles durable across an MCP process restart and states they "may be
intentionally shared with another agent." The relay performs no `Origin` check on
the WebSocket upgrade ([socket.ts:679](../../../../src/socket.ts#L679)) and serves
its health route with `Access-Control-Allow-Origin: *`. Today the single-MCP-peer
reservation is the de facto access control being removed.

**Why it matters.** After this change, anything that can open a local socket and
present a handle can route writes into a live Figma document. D18 is right that a
handle does not broaden editable scope — the plugin still gates every write — but
the plugin gates *what* may be written, not *who* may ask. Section 5.3 lists the
HTTP protections that are intentionally not implemented, which reads as if the
relay's exposure were unchanged by this release. It is not.

**Recommendation.**

1. Specify the handle value: at least 128 bits from a CSPRNG, no channel, peer
   ID, or timestamp recoverable from it, and a documented prefix for log
   redaction. Section 12 already requires handles not to appear in logs; give
   that rule a matchable shape.
2. Add idle expiry to Section 4.4's lifecycle rules so an abandoned handle does
   not stay live for the relay's lifetime, and make the expiry error carry the
   same one-step rejoin recovery as `CONNECTION_HANDLE_UNKNOWN`.
3. Bind a handle to the relay peer that created it unless cross-agent sharing is
   a stated product requirement. If it is, say so in `SAFETY.md` and justify it.
4. Add a short threat-model paragraph to Section 4.7 and to `SAFETY.md`: what a
   handle authorizes, who can obtain one, and what the plugin still refuses. The
   current text asserts the safety relationship without stating the exposure.

### ❓ ✅ B6 — The proposed command signature collides with the parameter it drops

**Evidence.** The current signature is
`sendCommandToFigma(command, params, timeoutMs = 30000)`
([figma-client.ts:694-698](../../../../src/mcp_server/figma-client.ts#L694-L698)).
Section 4.3 proposes `sendCommandToFigma(command, params, context)` — the same
position, a different meaning, with no statement of where the deadline goes.
Separately, Section 9.4's "idle timeout: 60 seconds" replaces a 30-second
pre-progress bound, so the first-response deadline doubles.

**Why it matters.** A silent parameter substitution in a function called at 45
sites is exactly the kind of change that type-checks in some call shapes and not
others. And doubling the pre-progress deadline is a live-behavior change
presented as a tightening.

**Recommendation.** Put the deadline inside `FigmaRequestContext` as an explicit
field, and say so in Section 4.3. State the current values being replaced (30 s
initial, 60 s post-progress reset, five-minute relay route expiry) next to the
new ones, so the change is legible. If Initiative 02 lands first, take its
command-aware policy instead of a global pair — a bound that fails a valid
110-second read is a first-call-correctness regression.

> **Resolved in Rev 3 (2026-08-07).** Section 4.3 adds `timeoutPolicy` to
> `FigmaRequestContext`, states that the third parameter is being reused with a
> different type, and requires every call site to migrate explicitly with no
> default so a missed site fails to type-check. The replaced values are recorded
> in the current-state findings table and the provenance table. PRD-004 ships
> first, so Section 9.4 takes its command-aware policy and the global 60 s / 10
> min pair is gone.

### ❓ B7 — Pagination is never addressed

**Evidence.** The schema defines
`ListToolsResult extends PaginatedResult, CacheableResult`. `resources/list` and
`prompts/list` are paginated too. Section 7.1 assigns a TTL per method, Section
7.2 freezes list order, and Section 15.4 requires byte-stable repeated lists.
Neither `cursor` nor `nextCursor` appears anywhere in the Initiative.

**Why it matters.** "Byte-stable list" is untestable without a stated position on
cursors, and a cache TTL on a paginated result needs to say whether it applies
per page.

**Recommendation.** Add one rule to Section 7.2: all three lists are returned as
a single page with no `nextCursor`, at the current inventory size, and a test
asserts the absence of a cursor. If a future inventory forces pagination, the
cache policy and order freeze are re-reviewed. Add the cursor assertion to
Section 15.4.

### ❓ B8 — Section priorities contradict the document's own compliance framing

**Evidence.** Section 8 (`subscriptions/listen`) is P1. The specification's base
page says all implementations MUST support the base protocol, versioning, and
the message patterns, and Subscribe-and-Notify is one of the three message
patterns. The changelog-coverage table calls it "Core handler required." Success
measures makes its semantics a release condition. Section 14 is P1 yet contains a
hard release gate: a prompt that calls a Figma tool without `connectionHandle`
"fails the release." P0 and P1 are never defined in the document.

**Why it matters.** A priority column that does not mean "deferrable" and does
not mean anything else gives an implementer no way to sequence work under
pressure.

**Recommendation.** Define P0 and P1 in one sentence each in the Priority and
ownership table — for example, P0 blocks the release, P1 blocks the release but
may land last. Then promote Section 8 to P0, or remove its Success-measures line
and say what a P1 miss would ship as. Move Section 14's prompt gate into Section
15 where the other release gates live, or promote Section 14.

### ❓ B9 — Section 12 contradicts D19

**Evidence.** D19 states that trace metadata "must not select a handle, grant
access, or affect behavior." Section 12 states that invalid `traceparent`,
`tracestate`, or `baggage` values "fail with `-32602`."

**Why it matters.** Rejecting a request because an observability field is
malformed is behavior selected by trace metadata, which D19 forbids. It also
diverges from the W3C and OpenTelemetry convention, which is to ignore a
malformed `traceparent` and start a new trace. A tool call that would have
succeeded is destroyed by a field that has no bearing on the work — a
first-call-correctness regression caused by telemetry.

**Recommendation.** Change Section 12 to: parse trace context defensively;
on a parse failure, drop the field, record a debug line on stderr, and process
the request normally. Add an acceptance criterion that a malformed `traceparent`
does not change the result of an otherwise valid request. Keep the existing
criterion that invalid trace metadata cannot crash the server.

### ✅ B10 — Cancellation routes partial-mutation evidence away from the agent

**Evidence.** Section 9.2 step 6 correctly suppresses the response for a
cancelled request, as the stdio transport requires. Section 9.3 then sends any
partial-mutation record to "sanitized `stderr` diagnostics for operator
investigation." The project's per-row partial-mutation contract —
`partialMutation`, `whatChanged`, `before` in
[_result.ts](../../../../src/mcp_server/tools/_result.ts) — therefore reaches no
one in the agent loop.

**Why it matters.** This is the Golden Rule inverted. The evidence that exists
precisely so a caller can recover in one round trip becomes a log line for a
human. Section 14's guidance ("retrying a cancelled write may repeat an effect;
re-read first") is a mitigation, not a recovery path: a full re-read is the
expensive fallback the partial-mutation contract was built to avoid.

**Recommendation.** Keep the record in band, on the next request rather than the
cancelled one. Have the relay or plugin retain a bounded, request-keyed outcome
record for a cancelled or timed-out command, and make it retrievable by a later
read. Initiative 02's execution receipts plus its read-only `command_status` tool
are exactly this mechanism, which is a second reason to resolve B1 first. State
in Section 9.3 that stderr is a supplement to that record, not the record.

> **Resolved in Rev 3 (2026-08-07)** by the B1 ordering decision. Section 9.3 now
> retains the partial-mutation record in PRD-004's execution receipt, readable
> through `command_status` with the command identifier the client already holds,
> and names stderr a supplement. Section 9's acceptance criteria, Phase 4, and
> Section 15.6 each carry the corresponding check.

---

## Correctness and precision defects

| # | Location | Defect | Recommendation |
|:-:|:-|:-|:-|
| C11 | §6, tool result helper | `function toolResult(value: JSONValue): CallToolResult` will not compile. Every call site passes the `unknown` returned by `sendCommandToFigma`. | Keep the parameter `unknown`. State the guarantee as behavior — every JSON value reaches `structuredContent` unchanged, and non-JSON values are a programming error caught at the boundary — rather than as a parameter type. |
| C12 | §6, `completeResult` | The sample silently overwrites `resultType` and the reserved server-info key; the sentence immediately after requires a conflicting server-info key to be rejected. | Correct the sample to throw on a conflicting `io.modelcontextprotocol/serverInfo`, or delete the sample and keep the prose rule. A sample that contradicts its own rule is the version an implementer will copy. |
| C13 | §4.1, `ChannelReleaseResult` | `{released: boolean; noOp: boolean}` encodes two meaningful states in four combinations; the value of `released` when `noOp` is true is undefined. | Return one field: `outcome: "released" \| "already_released" \| "unknown_handle"`. An agent then needs no inference to decide whether to rejoin — one field, one next action. |
| C14 | §4.2, classification | `channel_join` satisfies the literal `FIGMA_BOUND` definition ("every tool that sends a command to the plugin"): it sends `join` and `get_connect_payload` ([channel.ts:310](../../../../src/mcp_server/tools/channel.ts#L310)). | Redefine `FIGMA_BOUND` as "every tool that sends a command through an existing handle," and state that the creator and destroyer are classified by their role, not by whether they reach the plugin. Otherwise the inventory test contradicts the injection rule. |
| C15 | §2, legacy `initialize` reply | Three names for one concept in adjacent blocks: `data.supported` (‑32022, specified), `data.supportedVersions` (‑32601, invented), `supportedVersions` (`DiscoverResult`). | Use `data.supported` in the `-32601` payload too. A legacy client parsing one shape for both errors recovers without a second failure. |
| C16 | §8, acknowledgment example | The subscription ID is shown as a quoted string. The specification's value is the JSON-RPC request ID verbatim, a number in its example, and §2 requires accepting integer IDs. | Show the ID unquoted and add a sentence: the value is the request ID as received, never stringified. |
| C17 | §8, graceful closure | "Server-side cancellation notification plus the recommended complete result" — the specification defines only the empty `subscriptions/listen` result. No server-sent cancellation notification exists. The hedge "lock the exact ordering against the official conformance suite" is unnecessary. | Replace with the specified behavior: respond to the original request with `{resultType: "complete", _meta: {subscriptionId}}` and then close. Keep conformance as verification, not as the source of the rule. |
| C18 | §3, `DiscoverResult` | `instructions: string` is typed as required; the schema has `instructions?: string`. | Mark it optional and state that this server always sends it. |
| C19 | line 192, deprecated-features table | An unescaped `\|` inside the `includeContext` code span makes a four-cell row in a three-column table. The "No Sampling implementation." cell is dropped on render. | Escape the pipe as `\|`. |
| C20 | §10.1, `$schema` | The hedge about emitting `$schema` is unnecessary: the base page states that a schema without `$schema` defaults to 2020-12. | State the decision plainly — emit `$schema` for explicitness, or omit and rely on the documented default — and drop the conditional. |
| C21 | Risks table | "Object-only schema helper silently drops a valid array/primitive output — High" overstates the current helper: arrays survive, because `typeof [] === "object"`. Primitives and `null` are coerced to `{}`. | Correct the row to name primitives and `null`. An overstated current-state claim weakens the accurate ones next to it. |
| C22 | §7.1, MRTR sentence | "MRTR retries carrying `inputResponses` or `requestState` are not cacheable" is vacuous — `tools/call` is not in the cacheable table at all. | Delete the sentence, or move it to §11.1 as a forward-looking constraint on any future cacheable MRTR result. |
| C23 | §13, error-code table | "-32602 … unknown resource/task-like identifier where specified" — "task-like" is undefined, and tasks are explicitly out of scope. | Replace with "unknown resource URI." Every code's meaning in this table should be checkable against a test. |
| C24 | §9.1, rate limiting | "Always permitting the first and final observed progress update" is not knowable at emit time. | Restate as the implementable rule: hold the most recent suppressed update and flush it immediately before the terminal response. |
| C25 | §1.3, dependency island | Deletes the nested `package.json` and both lockfiles but leaves `src/mcp_server/tsconfig.json` in the same island. | Include it in the deletion list, or state why it is retained. The CI check the section adds should cover it either way. |
| C26 | §14, version parity | Requires `check:versions` to enforce "protocol version constant parity," but the Initiative never says where the `2026-07-28` constant lives. No such constant exists today; the SDK owns it. | Name the module that declares it — `src/shared/protocol.ts` alongside `version.ts` is the existing pattern — and have §3 and §2 read it rather than repeating the literal. |
| C27 | §14, documentation list | Omits `CONTRIBUTING.md`, whose "Adding a new MCP tool" checklist is where the mandatory handle classification has to land for every future tool. | Add it, with the specific edit: a new tool must be classified before registration, and the inventory test names the classification it is missing. |
| C28 | §5.1, shutdown | "The current EOF shutdown test is retained and expanded" understates the change: [server.ts:52-58](../../../../src/mcp_server/server.ts#L52-L58) calls `process.exit(0)` synchronously on stdin end, which forecloses the graceful subscription closure the same section requires. | State that the shutdown handler becomes an async sequence with a bounded deadline, and give the deadline. Add it to the Phase 5 checklist. |
| C29 | §9.1, notation | `$p_{n+1} > p_n$` for "each value is larger than the last." | Use the plain sentence. It matches the rest of the repository's documentation and needs no math rendering to read. |
| C30 | Release identity | The cutover list mixes real removals with surfaces this project never had (`Mcp-Session-Id` semantics, HTTP+SSE, SSE event IDs, replay store). | Split the list into "removed from this project" and "never implemented, recorded as non-applicable." The compatibility posture stays identical and the scope stops looking larger than it is. |

---

## Verified as accurate

Recorded so a later reader does not re-derive it.

**Repository claims.** 45 registered tools; 5 static guide resources; 1 prompt
(`swap_overrides_instances`, [instance.ts:106](../../../../src/mcp_server/tools/instance.ts#L106));
module-global `bindingState`; progress resetting the request timeout with no MCP
progress emitted; the synthetic `# Error` resource on read failure; `toolResult`
coercing non-objects; the `.partial().extend()` output-schema workaround and its
`variable_delete` `error: string` case; the central `registerTool` proxy as the
injection point; nested `package.json`, `package-lock.json`, and `bun.lock`
pinning SDK 1.13.1 and Zod 3.22.4; `tsup` bundling the SDK into `dist/server.js`;
`server.json` advertising stdio only; `roundtrip.ts` sending `initialize` with
`2024-11-05`; root `package.json` pinning SDK 1.29.0, Zod 4.4.3, Node >= 20. The
provenance table is accurate as written.

**SDK gate.** 1.29.0 and 1.30.0 both report
`LATEST_PROTOCOL_VERSION = '2025-11-25'`, neither exports `server/discover`, and
both retain the old task surface. The high-level API sets `listChanged: true`
automatically at three registration sites. `@modelcontextprotocol/conformance`
exists and is published at 0.1.16. The admission gate correctly rejects both
candidate versions.

**Protocol claims.** The changelog coverage table is complete and correctly
mapped: 9 major, 12 minor, 4 deprecated, no misassignments. `_meta` required and
optional fields, the `-32020`/`-32021`/`-32022` allocation and the
`-32000`–`-32019` legacy rule, `-32602` for a missing resource, object-rooted
`inputSchema` against unconstrained `outputSchema`, `structuredContent` as any
JSON value, strictly increasing progress, the prohibition on server-initiated
JSON-RPC requests over stdio, and the `notifications/subscriptions/acknowledged`
shape all match the specification exactly. The Initiative is also right where the
changelog is incomplete: `DiscoverResult extends CacheableResult` in the schema,
so the six-method cache table is correct even though the changelog's caching item
omits discovery.

---

## Suggested revision order

1. Answer the multi-handle question (headline recommendation). It determines the
   content of B2, B3, B5, and B10.
2. Resolve the Initiative 02 relationship (B1) and rewrite Section 9 against the
   answer.
3. Complete the artifact inventory (B4) — cheap, and it changes Phase 0.
4. Apply B6 through B9 and the C-list in place.
5. Re-check that Success measures, the Priority table, and the acceptance
   criteria still agree with each other after the edits.
