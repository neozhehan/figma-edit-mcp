# v2.3.5 Release Changelog

This document records v2.3.5 timeout/liveness decisions and implementation status. The implementation contract and task phases live in [prd.md](prd.md).

## Change 2: The per-page bound is not observably enforced (corrects Change 1's T2 premise)

### Author: Claude Opus 5 @ 2026-08-02 9:30pm PT

**Change 1's timing evidence reproduces, and its verifier fixes are correct — but its central budget premise does not survive measurement.** Reviewing [v2.3.3 Change 30](../v2.3.3/release-changelog.md#change-30-timeout-investigation-and-phase-14-live-verifier-hardening) with live verification on channel `rcvg` (dedicated *MCP Test* file). No product or spec behavior changes here; this corrects a factual premise and records the measurement that motivates it. Full detail in [prd.md](prd.md) § T2a.

### Change 30 verification reproduced

Run before any change was made. Every falsifiable claim is exact.

| Claim | Result |
| :- | :- |
| Focused verifier regressions **8/8, 30 assertions** | Exact |
| Full suite **1,075/1,075, 5,702 assertions, 55 files** | Exact |
| `check:types:scripts`, `check:types:plugin`, `check:generated` (192/36/45), `check:versions` at 2.3.3, `check:suppressions`, `git diff --check` | All pass |
| SHA-256 of the changelog from `## Change 29` to EOF is `1549e2f6…c895d65a` | Exact — the append-only discipline held |
| The ~110s live timings are real, not a harness artifact | **Confirmed independently** — see below |

### The correction

Change 1's timer inventory calls the page-load coordinator's 10-second bound one that "correctly bounds a page", and T2 sizes `variable_delete`'s worst case as `N × 10s`. Measured live, a **cold** all-pages `node_info(maxDepth: 12)` cost ~65s net, while the **same call repeated warm with strictly more work** (per-node `properties: ["parent"]`) cost ~1s net, and each page individually cost ~0s once warm. The 62-descendant page is free; the two non-scope pages cost ~30s each on first touch. That call returned `coverage.complete: true` with no `PAGE_LOAD_TIMEOUT` — yet an enforced 10-second bound could have admitted at most ~20s for two loads.

So the exposure is not `N × 10s`; `N × 10s` is a floor. The likely mechanism is that the bound races a `setTimeout` against `loadAsync()` on the sandbox's single JS thread, and a cold page materialization blocks that thread, so the timer cannot be dispatched until the load has already resolved successfully. The existing timeout regressions use an *awaiting* slow load rather than a *blocking* one, which is why they pass — the falsifiable prediction is recorded in the PRD.

This matters because Q12 accepted the bound on the ground that a hang is the one state D9 cannot recover from. A synchronously blocking host call is the most likely real hang, and it is exactly the shape the bound cannot interrupt. v2.3.5 therefore cannot size outer deadlines by arithmetic over nominal inner bounds.

### Also corrected in Change 30's framing

Its evidence boundary reads "ordinary valid calls can consume minutes", which invites the reading that cost tracks document scale. The measurements show the opposite: cost tracks **first-touch page loading**, and is near-zero for the same work once warm. The distinction changes the fix — heartbeats must span a page load, not merely bracket it.

### Live evidence and reconciliation — channel `rcvg`

Server/plugin `2.3.3`, page-scoped to Page 1, opened at 62 descendants / 22 top-level, 12 collections, 10 variables. Six bracketed timing probes as tabulated in the PRD, plus a Change 29 regression sweep against the same bundle: a single batch appending two annotations to one node succeeded (`0→1`, `1→2`); a node-type-invalid property returned the authored recovery with `beforeCount: 2 → afterCount: 2`; and `node_delete([ancestor, descendant])` returned `partial_success` with the "Do NOT retry this row" recovery. Closing state matched the opening state exactly: **62 descendants / 22 top-level**, 12 collections, 10 variables, every disposable artifact removed.

**Evidence boundary.** The measurement is bracketed wall-clock including a ~7s constant harness overhead, which is subtracted and shown; it discriminates 65s from 1s unambiguously but is not millisecond-accurate. Locating the 30s *inside* `loadAsync` requires instrumenting the plugin, which forces a rebuild and drops the bound peer, so the mechanism is recorded as a hypothesis with its falsifiable prediction rather than as a measured fact.

### Files changed by Change 2

`documentation/v2.3.5/prd.md` (timer-inventory row and new § T2a); and this section. No v2.3.3 section was edited and no product source changed.

## Change 1: Timeout investigation, verifier reliability, and remediation contract

### Author: GPT-5.6 Sol @ 2026-08-02 8:40pm PT

**Status:** PRD complete; product implementation not started. The Phase 14 verifier fixes described below are implemented in the v2.3.3 verification artifact and do not change plugin behavior.

### Why this release exists

The investigation found that the current 10-second page bound, 30-second initial command deadline, 60-second post-progress inactivity deadline, five-minute socket-route deadline, and caller deadlines do not form one coherent protocol. Some handlers report progress at safe page/item boundaries, some report too coarsely, and some report none. When the MCP request expires, plugin execution is not cancelled.

For reads, that can discard valid partial coverage and useful stage evidence. For writes, it is a Golden Rule problem: a mutation can land after the caller has lost the response, making a blind retry unsafe.

### Evidence ledger

| Finding | Classification | Status |
| :- | :- | :- |
| `channel_join` scope-payload generic timeout | Historically live-confirmed | Product remediation specified in PRD D3/D4; not implemented. |
| `variable_delete` `N × 10s` page-load composition under 30s initial silence | Repository-confirmed; Change 29 supplied live intermittent load evidence | Product remediation specified in T2; not implemented. |
| `node_info` silence inside a single root/property/export stage | Repository-confirmed structural risk | Product remediation specified in T1; not implemented. |
| `annotation_set` and `instance_set_overrides` can outlive the caller without progress/receipt | Repository-confirmed mutation risk | Receipt/deduplication remediation specified in T4/D5/D6; not implemented. |
| Coarse progress in `text_set_content` and `node_delete` | Repository-confirmed mutation risk | Product remediation specified in T4; not implemented. |
| Silent/coarse reads in annotation, reaction, export, style, component, and variable surfaces | Repository-confirmed scale risk | Shared reporter/chunking remediation specified in T5; not implemented. |
| Host `Unable to establish connection to Figma after 10 seconds` across variable/style paths | Live host-origin evidence | Preserve/classify under D8; repository cannot remove the host deadline. |
| Phase 14 fixed sleeps, short raw deadline, discarded diagnostics, and pre-dispatch negative timer | Verifier defects | Implemented and regression-tested in v2.3.3 Change 30. |

The initial `utth` normal-path probe completed representative small calls in 1–175ms and reproduced no additional timeout. The repaired full verifier then completed both all-pages `node_info(maxDepth:12)` sweeps in 109,852ms and 106,851ms and the real two-node `text_set_content` batch in 119,063ms. Those are healthy-path measurements, not induced timeout evidence, and do not close the structural findings.

### Decision

Adopt one **page-orchestrated, progress-preserving, outcome-aware command protocol**:

- authoritative command IDs across every layer;
- shared time-based stage progress and chunked/yielding scans;
- plugin progress forwarded as MCP progress notifications;
- centralized command-aware inactivity/maximum-total policies;
- bounded plugin execution receipts and same-ID duplicate suppression;
- a read-only `command_status` tool that queries/replays the original receipt without retrying the mutation;
- `COMMAND_INACTIVITY_TIMEOUT` only for known clean/read-retry states;
- `COMMAND_OUTCOME_UNKNOWN` plus exact reconciliation when a write may have executed;
- cancellation acknowledged rather than assumed.

Global timer increases, heartbeat-only fixes, blind automatic retries, and per-tool timer exceptions are rejected because none can establish mutation outcome.

### Verifier fixes already landed

- Startup readiness now retries only the explicit pre-dispatch not-connected race under a configurable deadline; fixed 700ms sleeps are gone.
- Server and raw-client stderr are retained in bounded diagnostic tails and printed on failure.
- The SDK outer guard is configurable and defaults to ten minutes. It is a larger leak guard, not a true inactivity deadline; D3 must forward plugin progress through MCP before the SDK can reset on activity.
- Raw-peer waits default to a configurable ten seconds and report socket/queue state.
- The refused-peer isolation probe observes after the routed command instead of allowing a timer to expire before dispatch.
- Focused unit/source-invariant tests cover the new support module and verifier wiring.

### Verification

- Focused verifier regressions: **8/8 with 30 assertions**.
- Four red proofs each produced exactly **0 pass / 1 fail / 7 filtered**, then returned to green after restoration.
- Localhost-enabled full repository suite: **1,075/1,075 tests, 5,702 assertions, 55 files**. The restricted precursor's nine failures were all loopback-binding failures.
- `check:types:scripts`, `check:types:plugin`, `check:generated` (192 node / 36 bind / 45 tools), `check:versions`, `check:suppressions`, and `git diff --check` pass.
- Live channel `utth`: 64 calls; server/plugin 2.3.3; peer/refusal, schema, batch, containment, cleanup, and final artifact checks passed. Exact reconciliation: **62→62 descendants, 22→22 top-level nodes, 10→10 variables, 12→12 collections, 12/0/3/0→12/0/3/0 styles**.
- `build:all` and `check:plugin` were not run because no plugin source/bundle changed and preserving the live channel was required.

### Files

- [prd.md](prd.md)
- this changelog
- `scripts/phase14-live-verify.ts`
- `scripts/liveVerifierSupport.ts`
- `src/mcp_server/tests/unit/scripts/phase14LiveVerifier.test.ts`
- `documentation/v2.3.3/release-changelog.md` (new top section only)
