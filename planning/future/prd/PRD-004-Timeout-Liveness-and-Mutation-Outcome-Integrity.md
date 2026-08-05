# PRD — Timeout, Liveness, and Mutation-Outcome Integrity

- **Status:** Proposed; implementation not started
- **Original PRD date:** 2026-08-02
- **Standalone extraction/revision:** 2026-08-03
- **Release:** Version unassigned — standalone minor release
- **Original source/index:** [v2.3.5 PRD](../../v2.3.5/prd.md)
- **Unchanged historical ledger:** [v2.3.5 release changelog](../../v2.3.5/release-changelog.md)

## Consolidation rationale

This PRD deliberately keeps three implementation workstreams in one standalone release:

1. authoritative command identity, progress transport, and timeout policy;
2. page-aware, chunked execution for long reads and join-time scope discovery; and
3. bounded execution receipts, duplicate suppression, and mutation-outcome recovery.

They are one safety contract rather than independently releasable features. The authoritative command ID is also the progress, terminal-routing, duplicate-suppression, and receipt key. Progress stages drive timeout classification. `variable_delete` crosses both page orchestration and the receipt-before-mutation boundary. Splitting these workstreams would either duplicate the protocol or leave an intermediate release unable to distinguish a clean timeout from a mutation whose result was lost.

The phase boundaries below remain the review and implementation sequence. Consolidation changes release packaging only: it preserves the originating v2.3.5 findings, decisions, evidence classifications, compatibility limits, and seven acceptance criteria, then adds explicit standalone-readiness, versioning, and scheduled-baseline gates.

## Release identity

This work ships as one version-unassigned minor release. When scheduled, it updates the then-current version across `package.json`, the root lockfile, both `server.json` fields, root `manifest.json`, the plugin About handshake, and every generated/bundle surface enforced by `check:versions` and `check:plugin`.

The implementation baseline must contain the v2.3.3 page-coverage, batch-envelope, partial-mutation, peer-binding, channel-recovery, and structured-error guarantees cited below, plus any earlier standalone PRDs already merged. Phase 1 revalidates the command/tool inventory against that scheduled predecessor rather than assuming no intervening release.

The public `command_status` tool is additive. Progress notifications and receipt replay are additive. Structured timeout codes intentionally replace generic timeout prose. No rollback, transaction, or automatic mutation retry is introduced.

## Historical provenance

This standalone PRD consolidates the complete contract previously indexed as v2.3.5. The original path is now a compatibility index, the pre-split source is preserved by the commit permalink recorded there, and the companion ledger remains unchanged.

References to Changes 12, 29, and 30 and to D9, D14, and Q12 refer to the completed [v2.3.3 PRD](<../../completed/v2.3.3-Plugin-Type-Check-Restoration-&-Safety-Contract-Gap-Closure/prd.md>) and [v2.3.3 release changelog](<../../completed/v2.3.3-Plugin-Type-Check-Restoration-&-Safety-Contract-Gap-Closure/release-changelog.md>). Historical measurements, channel identifiers, counts, hashes, and evidence qualifications below remain part of the decision record; they are not claims that this PRD has been implemented.

## 1. Executive summary

The current system has individually reasonable timers that do not compose into one reliable command protocol. A page load is bounded at 10 seconds, an MCP→Figma request initially expires at 30 seconds, any plugin progress changes that to 60 seconds of inactivity, the socket route expires after five minutes of inactivity, and callers may impose an independent total deadline. Some handlers stream progress, some report only between large units, and some report none. Expiring the MCP-side request does not cancel plugin execution.

This produces two different problems:

1. Long reads can fail generically even though useful work or bounded page isolation is still progressing.
2. More seriously, a mutating command can continue after the caller times out, separating the actual mutation from the truthful result envelope and inviting an unsafe blind retry.

This release adopts one combined solution: a **page-orchestrated, progress-preserving, outcome-aware command protocol**. It combines time-based liveness, MCP progress forwarding, command-aware deadlines, command-ID deduplication, and bounded execution receipts. Merely increasing timeout constants is explicitly rejected.

## 2. Golden Rule

The project's Golden Rule is to maximize **first-call correctness and one-round-trip recovery**. Applied to timeouts:

- A valid long command that is demonstrably making progress should not fail because a shorter unrelated layer cannot see that progress.
- A caller must never infer “nothing changed” from a transport timeout after a write was dispatched.
- A retry must either be proven safe, be resolved through the original command receipt without re-executing, or be preceded by an actionable reconciliation read.
- An agent receiving only the timeout result and the tool list must know whether to wait, retry, query status, reconcile state, or ask the user to reopen Figma.

## 3. Evidence boundary

This PRD separates three evidence classes:

- **Live-confirmed:** a real host or bridge returned the timeout/failure on the named path.
- **Repository-confirmed structural risk:** current timers, handler awaits/traversals, progress sites, and cancellation behavior prove the unsafe budget relationship; normal live calls may still complete quickly.
- **Host-origin:** the message is produced by Figma rather than any repository timer. The product can preserve and contextualize it but cannot remove the host deadline.

The initial 2026-08-02 `utth` normal-path probe completed representative small reads in 1–175ms. The repaired full verifier later measured the opening/final all-pages `node_info(maxDepth:12)` calls at 109,852ms and 106,851ms and the two-node `text_set_content` batch at 119,063ms; all completed successfully. These timings establish healthy live behavior and prove that ordinary valid calls can consume minutes. They are not an induced-timeout stress test and do not close structural findings.

## 4. Current timeout topology

| Owner | Current behavior | Scope | Problem |
| :- | :- | :- | :- |
| Page-load coordinator | 10 seconds per `PageNode.loadAsync()` **nominally; not observably enforced on a cold load — see T2a** | Each page attempt | The bound is expressed correctly in code but was measured live to not constrain a first-touch page load, so composing attempts is worse than `N × 10s`, not equal to it. |
| MCP Figma client | 30 seconds before the first progress frame | Every dispatched command | One generic value ignores command class, page count, and bounded nested work. |
| MCP Figma client after progress | 60 seconds of inactivity | Every command that emitted progress | Better than a total deadline, but handler progress granularity is inconsistent and some long stages emit nothing. |
| Socket bridge | Five minutes of route inactivity, refreshed by progress | One routed command | Correct leak protection; it cannot help when upstream expires first. |
| Phase 14 verifier after Change 30 | Configurable ten-minute SDK outer guard | Test harness only | Intentionally outside the product liveness budget; not a product fix. |
| Figma host | `Unable to establish connection to Figma after 10 seconds` | Host API calls | External and transient. Preserve exact cause and stage; do not misclassify it as a repository timer. |
| Remote component import | Explicit 15-second race | `create_instance` remote import | Correct local pattern: shorter than the command deadline and already actionable. Retain. |

## 5. Findings

### T1 — `node_info` progress can go silent inside one expensive unit

`node_info` reports at selected node/root boundaries. A large subtree, requested JSON export, hostile property access, or one slow host operation after the last heartbeat can exceed the 60-second inactivity bound. Item-count progress is not a liveness guarantee when one item has unbounded cost.

**Proper fix:** convert deep traversal to an iterative/chunked walker that yields, report time-based heartbeats inside the current root, and wrap JSON export/property stages with stage progress. A heartbeat must use the authoritative request ID, never a handler-generated unrelated ID.

### T2 — `variable_delete` composes `N × 10s` page bounds under a 30s silent command bound

Change 29 correctly made page loads sequential, but three worst-case page attempts exactly collide with the initial 30-second client timeout before scan and removal work are counted. The empty-collection path was observed emitting no progress during its document scan.

**Proper fix:** emit accepted/start progress before the first page await; emit before and after every page load and traversal; use the shared page orchestrator; retain the fail-closed `DOCUMENT_SCAN_INCOMPLETE` gate; record an execution receipt before the first `remove()`. Do not extend the page timeout or run page loads concurrently.

### T2a — the per-page 10-second bound does not observably constrain a cold page load

**This corrects T2's own premise.** T2 sizes the exposure as `N × 10s`; live measurement on channel `rcvg` (2026-08-02, dedicated *MCP Test* file, three pages) shows the real cost of a first-touch load is several times its nominal bound, so `N × 10s` is a floor rather than a worst case.

Measured with an identical bracket (a ~7s constant harness overhead is included in every row and should be subtracted):

| Call | Elapsed | Net |
| :- | -: | -: |
| `node_info(["0:1","1:2","1:3"], maxDepth 12)` — **pages cold** | 71.7s | **~65s** |
| `page_info(["0:1"])` — overhead control | 6.9s | ~0s |
| `node_info(["1:3"], maxDepth 12)` — 2 descendants, warm | 6.3s | ~0s |
| `node_info(["0:1"], maxDepth 12)` — 62 descendants, warm | 6.7s | ~0s |
| `node_info(["1:2"], maxDepth 12)` — warm | 7.0s | ~0s |
| `node_info(["0:1","1:2","1:3"], maxDepth 12, properties:["parent"])` — **same call, warm, strictly more work** | 7.9s | ~1s |

The cost is neither traversal nor scale: the 62-descendant page is free once warm, and repeating the identical all-pages call with per-node property reads added costs ~1s. The only work unique to the slow call is the first-touch `loadAsync()` of the two non-scope pages, i.e. roughly 30s per cold page. That call returned `coverage.complete: true`, `pagesAttempted: 3`, and **no** `PAGE_LOAD_TIMEOUT` row. Had the 10-second bound constrained those loads, two attempts could have contributed at most ~20s.

**Hypothesis for why the timer does not fire** (stated as a hypothesis; confirming it requires instrumenting the plugin, which forces a rebuild and drops the bound peer): `load()` races `setTimeout(10_000)` against `page.loadAsync()` on the sandbox's single JS thread. If materializing a cold page blocks that thread, the timer callback cannot be dispatched until `loadAsync` settles — by which point `finish()` has already resolved success and cleared it. **Falsifiable prediction:** a synthetic `loadAsync` that blocks the thread for >10s produces success, while one that awaits >10s without blocking produces `PAGE_LOAD_TIMEOUT`. The existing timeout regressions use the second shape, which is why they pass.

**Why this matters beyond arithmetic.** Q12 accepted the per-page bound specifically because "recovery requires an error to exist — a hang returns nothing, the one state the D9 convention cannot recover from." A synchronously blocking host call is the most likely real cause of a hang, and it is precisely the shape the bound cannot interrupt. So the guarantee is weaker than D14/Q12 records, and this release must not treat the page bound as a dependable inner budget when sizing outer deadlines.

**Consequence for this PRD:** requirement "no outer layer is shorter than a nested bounded operation unless visible progress refreshes it first" (§ acceptance) cannot be satisfied by arithmetic over nominal bounds. Either the page orchestrator must emit progress *across* a page load rather than only before and after it, or the bound must be made effective against a blocking host call. The 10-second value remaining behavior-not-contract is unchanged; what changes is that it cannot be relied on as an upper bound.

### T3 — `channel_join`'s scope-payload leg remains exposed to the generic command timer

The scope-payload leg has a historically live `Request to Figma timed out`. Change 12 correctly codes it as `CHANNEL_JOIN_FAILED` with `phase: "scope-payload"`, but coding the error does not make the scope read live.

**Proper fix:** use the same progress-aware command policy for the scope-payload load and descendant scan. Preserve the special join cleanup/released-channel semantics; do not auto-retry a join after it released a healthy predecessor unless the retry is explicitly requested.

### T4 — mutation batches can outlive their caller

`annotation_set` and `instance_set_overrides` can process unbounded sequential arrays without progress. `text_set_content` and `node_delete` report between items/chunks, but one font operation or chunk can remain silent after earlier rows mutated. MCP timeout deletes the pending request; plugin execution is not cancelled.

**Proper fix:** every accepted batch gets a request-keyed execution receipt before its first mutation, time-based progress inside each item, and durable-in-session row accounting after each mutation. A duplicate request ID returns the existing running/terminal receipt and must never execute the mutation twice. The timeout response gives the caller that ID for the read-only `command_status` tool. If the receipt cannot be recovered after disconnect/reload, return `COMMAND_OUTCOME_UNKNOWN` with tool-specific reconciliation instructions—never a clean timeout and never an automatic mutation retry.

### T5 — several reads have no time-based progress

- `annotation_list` recursively walks an arbitrary page/subtree without progress.
- `reaction_list` reports only after a whole requested root.
- `node_export_visual` waits for `exportAsync()` and then serializes a potentially large result without progress.
- `style_list` awaits four host collections sequentially without progress.
- Page-scoped `component_list` performs a page load and synchronous criteria scan without progress.
- `variable_list` discovery, ID lookup, and page-consumer modes have silent lookup/scan stages; document-consumer mode is safer but can still be silent before page traversal.

**Proper fix:** use one shared progress reporter and chunk/yield traversal where synchronous recursion can monopolize the event loop. Emit stage transitions around host awaits and serialization. Query the original receipt first; if a read receipt is truly unavailable, reissuing the read under a new ID is safe. Late responses remain generation/ID fenced and cannot cross-contaminate the replacement request.

### T6 — single-call mutation stages also need outcome classification

Font loading and host application in `text_set_style`, `style_manage`, and related style/application tools can exceed a generic deadline. Figma's separate 10-second connection failure has already appeared on `node_apply_style`.

**Proper fix:** report the stage, preserve host-origin wording/code as origin details, and classify whether mutation began. A timeout before the mutation boundary is a clean failure; a timeout after crossing it is `COMMAND_OUTCOME_UNKNOWN` unless authoritative readback proves a terminal result.

### T7 — the former live verifier could manufacture or hide timeout evidence

Before v2.3.3 Change 30, the Phase 14 verifier used fixed 700ms startup sleeps, a 1.8-second raw-peer response timeout, a fixed 180-second SDK total deadline, discarded server stderr, and started its negative-routing silence timer before dispatching the routed call.

**Fix already implemented and live-replayed in the verifier:** readiness polling retries only the explicit pre-dispatch not-connected race; server/raw diagnostic tails are bounded and printed on failure; the outer guard is configurable and outside the bridge budget; raw waits are configurable and diagnostic; and the negative-route assertion observes after the real call completes. Channel `utth` completed all 64 timed calls and reconciled exactly with no cleanup failure.

T7 is historical prerequisite evidence, not new product implementation scope in this release.

## 6. Required protocol

### D1 — One authoritative command identity

The MCP client-generated request ID is the command identity across MCP server, socket route, plugin UI relay, plugin handler, progress frames, terminal frames, and receipt lookup.

- Handlers must not replace it with a generated ID when one is supplied.
- Every progress/terminal frame must carry that exact ID.
- The socket must continue rejecting wrong-peer, wrong-generation, expired, or late frames.
- Duplicate IDs are protocol events, not new commands.

### D2 — Shared time-based progress reporter

Create one plugin-side `CommandProgressReporter` used by every potentially long handler.

- Emit `accepted` before the first host await or scan.
- Emit named stages such as `loading_page`, `scanning_page`, `reading_property`, `exporting`, `loading_font`, `mutating_item`, `verifying_outcome`, and `serializing_result`.
- A running stage must emit or yield often enough that its maximum silence is less than one third of the owning inactivity deadline, with an implementation ceiling of five seconds.
- Progress is monotonic by sequence number, but percentage may be omitted when total work is not yet known. Never invent a precise percentage.
- Progress delivery remains best-effort telemetry: delivery failure cannot alter mutation accounting or erase a terminal receipt.
- CPU-bound recursion must be chunked and yield; a timer cannot fire while one synchronous traversal monopolizes the plugin event loop.

### D3 — Forward progress through MCP

Plugin progress currently refreshes the bridge but is not exposed as MCP `notifications/progress`. The registered tool boundary must forward request progress when the caller supplies an MCP progress token.

- The official SDK verifier uses `onprogress`, `resetTimeoutOnProgress: true`, an inactivity timeout, and a larger explicit `maxTotalTimeout` safety cap.
- Forwarding failure is diagnostic only and must not cancel or reclassify plugin execution.
- The final tool response remains the only terminal result; a `completed` progress frame is not success.

### D4 — Command-aware timeout policy

Replace `sendCommandToFigma(..., timeoutMs = 30000)` and the hard-coded post-progress 60 seconds with a centralized policy selected by execution class:

```ts
type ExecutionClass = "read" | "mutation" | "join" | "internal";

interface CommandTimeoutPolicy {
  initialInactivityMs: number;
  runningInactivityMs: number;
  maxTotalMs: number;
  executionClass: ExecutionClass;
  recovery: "retry-by-id" | "query-receipt" | "rejoin";
}
```

The concrete durations are behavior, not public contract, but they must satisfy these invariants:

- No outer layer is shorter than a nested bounded operation unless visible progress refreshes it first.
- A route's idle deadline is not shorter than the client running-inactivity deadline.
- A maximum total deadline exists as a leak guard but never silently converts a mutation into a clean failure.
- Tests use injected clocks/timers; no regression waits wall-clock minutes.

### D5 — Bounded execution receipts and duplicate suppression

The plugin maintains a session-bounded receipt store keyed by command ID:

```ts
type CommandReceipt =
  | { state: "accepted" | "running"; command: string; stage: string; lastProgressAt: number }
  | { state: "succeeded"; command: string; result: unknown; completedAt: number }
  | { state: "failed"; command: string; error: unknown; completedAt: number };
```

- Create the receipt before a mutation boundary.
- Update row/stage evidence after each accepted mutation step.
- Store the exact terminal result/error before attempting terminal transport delivery.
- A duplicate ID replays the terminal receipt or reports the existing running state; it never calls the handler again.
- Bound retention by age and count. Never evict a running receipt. Terminal eviction is allowed only after a duration longer than every transport/retry window.
- Add an internal plugin `get_command_receipt` wire command plus a public read-only `command_status` MCP tool. The public tool accepts the `commandId` returned in timeout details and never executes or retries a mutation.
- Plugin reload or loss of the receipt store is explicit unknown state, not proof of non-execution.

### D6 — Structured timeout and unknown-outcome errors

All repository-owned expiries are coded at origin. Generic `Error("Request timed out…")` is forbidden.

`COMMAND_INACTIVITY_TIMEOUT` is allowed only when execution is known not to have crossed a mutation boundary, or for a read whose result can be queried and then safely reissued if no receipt exists. Its details include:

- `commandId`, `command`, `executionClass`;
- `elapsedMs`, `inactivityMs`, `lastProgressAt`, `lastStage`;
- whether dispatch and plugin acceptance were observed;
- the `command_status` query and, only where safe, the subsequent retry action.

`COMMAND_OUTCOME_UNKNOWN` is required when a mutation was dispatched and neither a terminal receipt nor authoritative readback is available. Its details include the same timing/stage fields plus:

- `mutationMayHaveApplied: true`;
- target identities already known to the server;
- any last durable row/stage evidence;
- the exact read tool and operands needed for reconciliation;
- an explicit **do not retry blindly** instruction.

Tool-specific contracts remain stronger where available. `annotation_set` still requires `annotation_list` before retry; batch receipts preserve ordered row accounting; creator survivor evidence and existing partial-mutation vocabulary remain authoritative.

`command_status` returns exactly one of:

- `running` with last stage/progress and an instruction to query again;
- `succeeded` or `failed` with the replayed terminal result/error;
- `unknown` when no receipt exists, with execution-class-specific recovery. For a mutation, `unknown` always carries the same **do not retry blindly** and tool-specific reconciliation instructions as `COMMAND_OUTCOME_UNKNOWN`.

### D7 — Cancellation is acknowledged, never assumed

An SDK cancellation/timeout may request cancellation, but the server must not claim execution stopped unless the plugin acknowledges a pre-mutation cancellation point.

- Reads may cooperatively stop between chunks and return cancelled coverage.
- Batches may stop between items, preserving success/failed/skipped rows already known.
- No cancellation rolls back a completed mutation unless that tool already has an independently verified rollback contract.
- A missing acknowledgement follows D6 unknown-outcome handling.

### D8 — Host-origin timeout preservation

`Unable to establish connection to Figma after 10 seconds` and equivalent host failures remain origin evidence.

- Preserve the host message without relabelling it as the repository's inactivity timer.
- Add command/stage/target context outside the origin payload.
- For reads and known pre-mutation stages, retry once by command ID is permitted.
- For post-mutation stages, follow receipt/reconciliation rules.

## 7. Tool migration matrix

| Tool/group | Required migration |
| :- | :- |
| `node_info` | Iterative chunked traversal; time heartbeat per root/page/property/export stage; coverage survives page failures; same-ID read replay. |
| `variable_delete` | Start progress before page 1; before/after each bounded load and scan; receipt before remove; fail closed on incomplete coverage; no concurrent page loads. |
| `channel_join` / `get_connect_payload` | Join-specific policy; progress-aware scope load/scan; retain released-channel cleanup and cause-specific recovery. |
| `annotation_set` | Receipt before first append; per-item stage/progress; persist verified counts/unknown outcome; same-ID duplicate suppression; list-before-new-ID retry. |
| `instance_set_overrides` | Receipt before first swap; persist authoritative before-state and row after each target; no duplicate execution. |
| `text_set_content` | Heartbeat during font stages; receipt captures font mutation and row outcome; preserve existing partial disclosure. |
| `node_delete` | Progress inside chunks; record each terminal row; a timed-out duplicate ID replays rather than deleting again. |
| `annotation_list`, `reaction_list` | Iterative chunk/yield traversal and time heartbeat inside one root. |
| `node_export_visual` | Export/serialization stages, heartbeat where the host yields, and explicit result-size diagnostics. |
| `style_list`, `component_list`, `variable_list` | Stage progress around each host collection/page and chunked scans for page/document modes. |
| Font/style mutations | Pre-mutation versus post-mutation stage classification; receipt/status reconciliation; preserve host-origin failures. |
| `command_status` | Read-only receipt query/replay by timeout-provided command ID; never dispatch or retry the original mutation. |

## 8. Verification requirements

### Repository tests

- Fake-clock tests red-proof initial inactivity, progress refresh, maximum total, route expiry, and terminal timer cleanup independently.
- A progress frame with the wrong request ID or binding generation cannot refresh another command.
- Every long-handler inventory entry emits `accepted` before its first potentially slow await/scan and uses the shared reporter.
- Chunked walkers emit time-based progress even when one root contains all nodes.
- Three page-load timeouts cannot be pre-empted by the command layer; `variable_delete` still refuses before mutation.
- SDK `onprogress` receives forwarded plugin progress and `resetTimeoutOnProgress` keeps the call alive until the terminal result.
- Mutation timeout after the first row returns/reconciles a truthful receipt; the same command ID never executes a second mutation.
- `command_status` replays known terminal results and returns `unknown` plus tool-specific reconciliation for a lost mutation receipt; it never re-executes the command.
- Receipt replay preserves structured coded errors, batch ordering/counts, partial-mutation evidence, and hostile-value totality.
- Cancellation before mutation is clean; cancellation after mutation never claims rollback.
- Host-origin timeout text remains distinguishable from repository-owned timeout codes.

Every regression protecting a production invariant must be red-proofed by breaking the exact protected line, observing the named failure, restoring it, and rerunning green.

### Live verification

- Use a dedicated Figma test file and a fresh channel.
- Discover with `page_info` → `node_info` before mutation and pass names back verbatim.
- Record versions, tool inventory, opening counts, per-call elapsed time, progress stages, and exact final reconciliation.
- Exercise multi-page `node_info` and `variable_delete`; large single-root annotation/reaction reads; export; and all four batch aggregators.
- A healthy normal-path pass proves only the live path exercised. Timeout/late-terminal/receipt-loss cases remain deterministic repository evidence unless the real host produces them.
- Any interrupted mutation run must print the last progress/receipt and an explicit cleanup/reconciliation report.
- Do not run `build:all` or `check:plugin` while preserving a live channel; if a plugin source change requires rebuilding, close the evidence boundary and reconnect under a new recorded channel.

## 9. Compatibility and release posture

- Progress notifications and receipt replay are additive.
- Replacing generic timeout strings with structured codes is an intentional recovery improvement; callers matching prose must migrate to codes.
- `COMMAND_OUTCOME_UNKNOWN` is a new safety refusal, not a claim that mutation occurred.
- Existing page coverage, batch envelopes, partial-mutation fields, channel recovery, and socket peer-binding invariants remain unchanged or become better preserved.
- The page-load 10-second value remains behavior, not public contract.
- No general transaction or rollback is introduced.

## 10. Rejected alternatives

1. **Raise 30/60/180-second timers globally.** Rejected: delays failure without making progress visible or mutation retries safe.
2. **Add heartbeats only.** Rejected: improves liveness but cannot answer whether a write completed when the terminal frame is lost.
3. **Retry every timeout automatically.** Rejected: duplicate annotation appends, repeated override swaps, and other non-idempotent writes can compound mutations.
4. **Split and recombine per-tool timeout exceptions.** Rejected: repeats the current drift. One shared command identity, progress reporter, policy registry, and receipt protocol is the smaller long-term surface.
5. **Assume SDK cancellation stops the plugin.** Rejected: no acknowledgement or rollback currently establishes that fact.

## Open implementation details

The originating PRD ratifies the invariants above but does not decide the following implementation details. They must be resolved explicitly before implementation is called ready; this section records gaps and does not choose answers.

- **Cold blocking page loads:** T2a leaves two permitted directions—emit progress that genuinely spans the host load, or make the inner bound effective against a blocking host call. The recorded hypothesis still requires the stated blocking-versus-awaiting falsification probe. Any resolution must retain sequential page loading and the fail-closed D14 behavior.
- **Concrete policy durations:** D4 intentionally leaves `initialInactivityMs`, `runningInactivityMs`, and `maxTotalMs` as behavior rather than public contract. Their values and the policy for each execution class remain to be selected under D4's ordering invariants.
- **Receipt retention limits:** D5 requires age and count bounds and forbids eviction of running receipts, but it does not choose the limits or enumerate every transport/retry window used to derive the terminal-retention floor.
- **Read receipt lifecycle:** T5 and the migration matrix require querying or replaying an original read receipt, while D5 names a mandatory creation point only for mutations. The implementation must define which reads create receipts, at what point, and for how long, without weakening safe read reissue or same-ID fencing.
- **Duplicate-ID payload mismatch:** D1 and D5 define duplicates as protocol events and prohibit re-execution, but do not define the exact coded result when one ID is reused with a different command or payload.
- **Receipt and status schemas:** D5–D6 define semantic states and required fields, but not the complete wire/output schemas, nested sanitization and size limits, row-evidence shape, or session/channel visibility rules for `get_command_receipt` and `command_status`.
- **Cancellation acknowledgement:** D7 defines truthful semantics but not the cancellation request/acknowledgement frame, acknowledgement timeout, or exact chunk and mutation boundaries for every migrated handler.
- **Mutation and reconciliation inventory:** “Related” and “remaining” font/style/single-call mutations must become a closed inventory. Each mutation needs an explicit boundary plus the authoritative read tool and operands used when its outcome is unknown.
- **Export result-size diagnostics:** The `node_export_visual` migration requires explicit diagnostics but does not define their fields, thresholds, or whether they are progress-only or part of the terminal result.

## 11. Implementation phases

### Phase 1 — Transport and policy foundation

- [ ] Re-audit the scheduled predecessor's command/tool inventory, timeout constants and owners, progress sites, cancellation/receipt behavior, and cited safety guarantees; record all drift while retaining the 2026-08-02 measurements as historical evidence.
- [ ] Resolve every item in **Open implementation details** against that re-audited baseline, record the exact wire/schema/inventory decisions in this PRD, and record explicit human approval before product implementation begins.
- [ ] Add the execution-class timeout policy registry and coded timeout factories.
- [ ] Make request identity authoritative end to end.
- [ ] Forward plugin progress as MCP progress notifications.
- [ ] Add fake-clock transport and wrong-ID/generation regressions.

### Phase 2 — Shared reporter and read migrations

- [ ] Add `CommandProgressReporter` with time-based stage heartbeats.
- [ ] Migrate `node_info`, `annotation_list`, `reaction_list`, `node_export_visual`, `style_list`, `component_list`, and `variable_list`.
- [ ] Replace recursive monopolizing scans with chunked/yielding walkers where needed.

### Phase 3 — Destructive scan and join migration

- [ ] Migrate `variable_delete` without weakening fail-closed coverage.
- [ ] Migrate `get_connect_payload`/`channel_join` while preserving released-channel recovery.
- [ ] Red-proof the page-bound/command-bound budget composition.

### Phase 4 — Receipt store and mutation migrations

- [ ] Add bounded receipt/status/replay protocol and duplicate suppression.
- [ ] Add the public read-only `command_status` tool over the internal receipt query.
- [ ] Migrate `annotation_set`, `instance_set_overrides`, `text_set_content`, and `node_delete` first.
- [ ] Migrate remaining font/style/single-call mutation stages.
- [ ] Add cancellation acknowledgement and `COMMAND_OUTCOME_UNKNOWN` reconciliation.

### Phase 5 — Documentation and live closure

- [ ] Update `SAFETY.md`, agent guides, error playbook, tool descriptions, and public changelog.
- [ ] Assign and apply the standalone minor version across every surface named in **Release identity**.
- [ ] Run focused, full-suite, type, generated, version, suppression, bundle, and diff gates.
- [ ] Red-proof every new invariant.
- [ ] Run the dedicated-file live matrix and reconcile exact opening/closing state.

## 12. Acceptance gate

This standalone minor release is complete only when:

1. No repository-owned timeout reaches a caller as an uncoded generic `Error`.
2. Every potentially long command has time-based liveness visible through both bridge and MCP layers.
3. No mutating command is automatically re-executed after an uncertain timeout.
4. Same-ID replay/status returns one execution's terminal evidence or a truthful running/unknown state.
5. `variable_delete` remains fail closed and no page is skipped to meet a deadline.
6. All timeout, cancellation, late-terminal, duplicate-ID, receipt-loss, and partial-mutation regressions are red-proofed.
7. Live evidence and injected repository evidence are reported separately, with exact cleanup reconciliation.
8. Every open implementation detail is resolved in the approved contract, including duplicate-ID payload mismatch, receipt/status visibility and schemas, receipt lifecycles, cancellation acknowledgement, and the closed mutation/reconciliation inventory.
9. One unique minor version is assigned and applied across every enforced version, manifest, handshake, generated, and bundle surface.
10. The scheduled-baseline re-audit maps every current long-running command and timeout owner to this protocol or an explicit, reviewed exclusion before implementation changes begin.
