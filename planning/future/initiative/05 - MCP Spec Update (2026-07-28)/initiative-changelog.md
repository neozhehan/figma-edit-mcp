# Initiative 05 Changelog

This document centralizes the decision and revision history for [Initiative 05 — MCP Specification Update (2026-07-28)](initiative.md). The adversarial review whose findings it answers is [initiative-review.md](initiative-review.md).

## Change 1: PRD-004 becomes a scheduling precondition; Section 9 becomes an adapter (Rev 3)

### Author: Claude Opus 5 @ 2026-08-07 6:02pm PT

**Review finding B1 asked whether two ratified documents can both own the command-timeout subsystem. They cannot, and the answer is order rather than merge: this Initiative does not start until PRD-004 has shipped.** No product source changed. This is a planning decision recorded across the Initiative, the PRD it now depends on, and the backlog that schedules both.

### The question

B1 records that Section 9 rewrites the same subsystem as [Initiative 02](<../02 - Timeout, Liveness, and Mutation-Outcome Integrity/initiative.md>), which the Initiative never mentions, and that the two documents give different answers to a question one of them studied with live evidence. The reviewer offered three dispositions: order the two, pre-empt one explicitly, or leave the collision. The user asked the question the review left implicit — whether the two should instead be combined into one release.

### Correction to the finding's framing

The schedulable counterparty is **PRD-004**, not Initiative 02. [`planning/future/prd/README.md`](../../prd/README.md) records Initiative 02 as the pre-split umbrella and [PRD-004](../../prd/PRD-004-Timeout-Liveness-and-Mutation-Outcome-Integrity.md) as the canonical document; [`BACKLOG.md`](../../../BACKLOG.md) ranks PRD-004 second of twenty. B1's evidence and reasoning are unaffected — Initiative 02 and PRD-004 carry the same D1–D8 — but the document to depend on, cross-link, and rebase against is PRD-004.

### Decision: order, do not combine

Combining was considered and rejected on four grounds.

| Ground | Detail |
| :- | :- |
| The dependency runs one way | PRD-004 needs nothing from this Initiative. Progress notifications and `progressToken` exist in the protocol the repository speaks today, so PRD-004's D3 is implementable on the pinned SDK. Section 9 cannot state a truthful timeout or cancellation contract without PRD-004's receipts. |
| This Initiative is gated on an SDK that does not exist | Its own SDK release gate rejects 1.29.0 and 1.30.0 and blocks rather than works around a non-conforming runtime. Merging would make the only release that stops a timed-out write from being retried blind wait on a third-party publication date. |
| The overlap is a seam, not a shared contract | Three of PRD-004's eight decisions touch this Initiative — D3 ↔ §9.1, D7 ↔ §9.2/9.3, D4 ↔ §9.4 — against fifteen sections here. Compare the genuine merge in the same catalog: v2.3.5's two workstreams were combined because command identity is the same key for progress, routing, deduplication, and receipts. Nothing comparable binds PRD-004 to `server/discover`, result envelopes, or JSON Schema 2020-12. |
| Neither half would be reviewable, revertible, or live-verifiable as one release | PRD-004 is XL and this Initiative is a breaking major across every result envelope and tool signature. They cannot share one live evidence pass: PRD-004's live protocol forbids rebuilding the plugin while a channel is preserved, and this Initiative requires a plugin rebuild for handles and cancellation. |

Section 9 therefore becomes what B1's first disposition describes: a protocol-surface adapter over PRD-004's policy, restating none of it.

### What changed in the Initiative

| Location | Change |
| :- | :- |
| Header | Companion-ledger pointer to this file and to the adversarial review, matching the convention in Initiatives 01 and 02. |
| Release identity | New **Scheduling precondition** subsection. The Initiative does not start until PRD-004 ships; Phase 0 does not begin, including the SDK admission probe. Records the four grounds above and states that reversing the order is its own reviewed decision. |
| Release identity, tool count | The expected Phase 0 baseline is 46 tools rather than 45, because PRD-004 adds `command_status`, which also carries `connectionHandle`. |
| Current-state findings | Intro note that the progress, cancellation, and timeout rows describe a baseline PRD-004 changes on purpose. The Progress and Cancellation rows now name what PRD-004 supplies and reduce this release's consequence to re-pointing it. A new **Timeouts** row records the values being replaced: 30 s initial, 60 s post-progress inactivity, five-minute relay route expiry. |
| §4.3 | `timeoutPolicy: CommandTimeoutPolicy` added to `FigmaRequestContext`. States that the third parameter is reused with a different type, requires every call site to migrate explicitly, and forbids a default so a missed site fails to type-check rather than inheriting a bound. |
| §9 preamble | New note: the section is an adapter over PRD-004, not a second design. Divergence found here is raised against PRD-004 rather than resolved locally. |
| §9.3 | The partial-mutation record for a cancelled write is retained in PRD-004's execution receipt and read back through `command_status`. Sanitized `stderr` is a supplement, never the only copy. |
| §9.4 | Rewritten. The global 60-second idle and 10-minute absolute bounds are removed and replaced by PRD-004's `CommandTimeoutPolicy`, carried through the request context. Preserves PRD-004's `COMMAND_INACTIVITY_TIMEOUT` / `COMMAND_OUTCOME_UNKNOWN` distinction. |
| §9 acceptance criteria | Adds the receipt-retrievability criterion; replaces the idle/absolute criterion with PRD-004's bounds and an explicit statement that no timeout constant is defined in this release. |
| §14 | PRD-004 recorded as the scheduled predecessor, with Initiative 02 marked historical. Initiative 01 and PRD-001 added for the error-registry overlap, with the disposition stated in both orders. |
| §15.6 | Adds a receipt-survives-suppressed-response test and replaces the idle-versus-absolute test with PRD-004's bounds under injected clocks. |
| Phase 0 | First step is now to confirm PRD-004 has shipped and stop if it has not. Second step records PRD-004's shipped policy values, receipt states, cancellation acknowledgement frame, and `command_status` contract. |
| Phase 4 | Cancellation triggers PRD-004's existing cooperative path rather than a second mechanism; no new timeout constants; adds a proof that a cancelled write's receipt is still retrievable. |
| Success measures | Adds the PRD-004 precondition. The cancellation measure now requires partial-mutation evidence to remain retrievable in band. |
| Risks | Two rows amended for the receipt and the policy source. Two rows added: PRD-004 slipping, and PRD-004 shipping different values than it proposed. |
| Provenance | Two rows added: the measured timeout constants in `figma-client.ts`, and PRD-004 as scheduled predecessor. |

### What changed elsewhere

- **[PRD-004](../../prd/PRD-004-Timeout-Liveness-and-Mutation-Outcome-Integrity.md)** — new **Downstream dependency** subsection under Release identity. It states that this Initiative waits on PRD-004 and names the two properties PRD-004 owes that ordering: D3 and D7 wire shapes kept separable from the protocol envelope in force when it ships, and D4's policy readable as data rather than scattered constants. It adds no scope to PRD-004 and ends by recording that nothing in PRD-004 waits on this Initiative.
- **[`BACKLOG.md`](../../../BACKLOG.md)** — new **What this ranking does not cover** section explaining why a future major gated on an external SDK cannot be ranked against twenty minors, and stating the two things settled regardless of when the SDK lands. Adds a scheduling-constraint row and one sentence to PRD-004's rank-2 entry.
- **[initiative-review.md](initiative-review.md)** — resolution notes appended under B1, B6, and B10. The original findings are preserved verbatim above each note.

### Findings resolved

| Finding | Disposition |
| :- | :- |
| B1 — Section 9 collides with Initiative 02 | **Resolved by disposition 1**, with the counterparty corrected to PRD-004. Dependency order declared in Release identity, Section 14, Phase 0, and Success measures. Initiative 01 added as B1's third recommendation asks. |
| B6 — the proposed command signature collides with the parameter it drops | **Resolved.** §4.3 carries the deadline as `timeoutPolicy` with the substitution stated and no default. The replaced values are recorded in the current-state findings and provenance tables. Because PRD-004 ships first, §9.4 takes its command-aware policy and the pre-progress deadline is no longer silently doubled. |
| B10 — cancellation routes partial-mutation evidence away from the agent | **Resolved.** The evidence stays in band via PRD-004's receipt and `command_status`, with checks in §9's acceptance criteria, Phase 4, and §15.6. |

### Recorded, not fixed

- **The headline recommendation is untouched.** The multi-handle question, and B2, B3, and B5 which descend from it, remain open. That decision is independent of this one: it concerns the relay's peer model and the channel error contract, not the command protocol.
- **B4, B7, B8, and B9 are untouched.** The `scripts/smoke-mcp.mjs` inventory gap, pagination, the undefined P0/P1 semantics, and the §12/D19 contradiction each stand as written.
- **The C-list is untouched**, including C29's math notation in §9.1, which sits inside a section this change otherwise rewrote. It was left because it is a rendering nit with no bearing on the dependency decision, and the C-list is meant to be applied as one pass.
- **Section 9.1's rate-limiting rule still says "always permitting the first and final observed progress update"** (C24). PRD-004's D2 owns progress emission, so this sentence should be re-derived against what PRD-004 ships rather than fixed twice.

### Evidence boundary

Everything above is a documentation change. No product source, test, script, or generated artifact was modified, and no test suite or repository gate was run, because nothing executable changed. The claims about current repository behavior that this change added to the Initiative — the 30-second initial deadline, the 60-second post-progress inactivity bound, and the absence of MCP progress forwarding — were read directly from `src/mcp_server/figma-client.ts`. The five relative links introduced across the three documents were confirmed to resolve to existing files. Nothing here asserts that PRD-004 or this Initiative has been implemented; both remain proposed.

### Files changed by Change 1

`initiative.md` (Rev 3); `initiative-review.md` (resolution notes under B1, B6, B10); `../../prd/PRD-004-Timeout-Liveness-and-Mutation-Outcome-Integrity.md` (new Downstream dependency subsection); `../../../BACKLOG.md`; and this new file. No product source changed.
