# v2.3.5 Release Changelog

This document records v2.3.5 timeout/liveness decisions and implementation status. The implementation contract and task phases live in [prd.md](prd.md).

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
