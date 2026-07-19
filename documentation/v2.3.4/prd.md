# v2.3.4 PRD: Legacy Error-Code Conversion (UNKNOWN_ERROR Burn-Down)

This document is the product / implementation spec for the **v2.3.4** release of `figma-edit-mcp`. It follows v2.3.3 (Plugin Type-Check Restoration & Safety-Contract Gap Closure) and has one track: convert the plugin's legacy, uncoded failure surface to the structured error contract that v2.3.3 established, so that `UNKNOWN_ERROR` stops being the code for most of what the plugin can throw.

> **Origin.** The v2.3.3 Q16 resolution (2026-07-18, Option A — recorded in the [v2.3.3 PRD](../v2.3.3/prd.md) D9 code-inventory note, Rev 23) deliberately scoped error codes to messages that release added or edited. Everything older surfaces with the ratified legacy fallback `UNKNOWN_ERROR`: the message text travels intact, but no machine classification and no playbook entry exist. Q16's record names this release as the deferred conversion work and makes `UNKNOWN_ERROR` its burn-down metric.

---

## Release identity

> [!IMPORTANT]
> **This is v2.3.4.** It grants no new editing powers, adds no new tools, and changes no gate, permission, or scope behavior. It changes two things about failures only: the *shape* of thrown values (coded objects from the central registry instead of `Error` strings) and, where a message fails the D9 acceptance check, the *text* of the message. The conditions under which errors are thrown do not change — that is this release's equivalent of v2.3.3's "no runtime behavior change" rule for Track 1, and the same stop-and-escalate discipline applies: if a conversion appears to require moving, adding, or removing a throw, stop and escalate rather than silently changing a live-verified control flow.
>
> **It depends on v2.3.3 being merged first.** The central registry of message factories, the structured `{error: {code, message, details?}}` transport, the error playbook, and the `check:types:plugin`/`check:suppressions` gates are all v2.3.3 deliverables this release builds on. Two v2.3.3 phases (8 — containment, 11 — connector repair) rewrite the same handler files this release converts; starting before they land would produce conflicting edits to `componentHandlers.ts` and `connectorHandlers.ts`.
>
> Version surfaces to bump follow the established mechanism (`package.json`, root `package-lock.json`, both `server.json` fields, root `manifest.json`, the plugin About handshake — enforced by `check:versions` and `check:plugin`): `2.3.3 → 2.3.4`. Patch level is consistent with the Q5 policy: this strengthens the failure contract without weakening any guarantee. Message-text changes are called out in the CHANGELOG because agents may currently match on prose — the codes this release adds are precisely the stable identifiers that make prose-matching unnecessary.

---

## The problem

v2.3.3's D9 made structured errors the contract, but scoped coding to messages it added or edited. Measured against the working tree (2026-07-18):

- **332 inline `throw new Error(...)` sites across 15 plugin files.** 51 of them wrap strings from the central `ERRORS` table (directly or via `formatScopeError`); the remaining ~280 compose their message ad hoc at the throw site.
- **The central table itself is uncoded at the throw site.** `figma_plugin/utils/errors.ts` defines 28 keys (13 legacy plus 15 added by v2.3.3); handlers reference 12 of the legacy keys — but as message *strings* inside `new Error(...)`, so the key (the natural code) is discarded at the moment of throwing. This is what tempted the deleted prose-matching: the code existed, but only recoverable by matching text.
- **102 unit-test assertions match thrown message prose** (`toThrow("…")` and variants). Prose is the de-facto test contract, which makes every message improvement a test break and pushes implementers toward freezing bad messages.
- **One server-side legacy envelope convention.** `src/mcp_server/tools/channel.ts` reports join failures in-band as a *successful* tool result carrying `status: "error"` + `errorCode`/`errorMessage` fields — a convention that predates D9's `isError: true` + `structuredContent` boundary. Two error surfaces now exist at the MCP boundary.
- **UI-relay local failures are flattened.** When `figma_plugin/ui.html`'s own dispatch catch fires, it forwards `error.message || "Error executing command"` — a string, with no code, indistinguishable from a plugin-authored failure.

Consequences for agents: every legacy failure arrives as `UNKNOWN_ERROR`, so the playbook cannot key an entry to it, the agent branches on prose, and message improvements are breaking changes. Consequences for contributors: new handler code copies the surrounding idiom (`throw new Error("…")`), so the uncoded surface grows.

Per-file inventory of the 332 (2026-07-18):

| File | Inline throws |
| :- | :-: |
| `src/main.ts` | 79 |
| `handlers/componentHandlers.ts` | 66 |
| `handlers/variableHandlers.ts` | 43 |
| `handlers/nodeModifiers.ts` | 31 |
| `handlers/stylingHandlers.ts` | 24 |
| `handlers/styleHandlers.ts` | 20 |
| `handlers/connectorHandlers.ts` | 20 |
| `handlers/nodeCreators.ts` | 13 |
| `handlers/layoutHandlers.ts` | 11 |
| `handlers/textHandlers.ts` | 10 |
| `handlers/prototypingHandlers.ts` | 5 |
| `handlers/annotationHandlers.ts` | 5 |
| `utils/nodeUtils.ts` | 3 |
| `utils/exportUtils.ts` | 1 |
| `handlers/vectorHandlers.ts` | 1 |

---

## Decisions

> [!NOTE]
> **D1 — Taxonomy before conversion; one code per distinct cause-and-recovery, not per site.** Before any site converts, design and review the code taxonomy as its own artifact. The unit of a code is a *cause with a recovery*, so 332 sites must collapse into a bounded set — the working estimate is a few dozen codes, organized by class: missing parameter, invalid parameter value, target not found, wrong target type, state precondition not met (e.g. "no paints to bind"), scope/permission refusals (largely coded already via the guard messages), and relayed sandbox failures. Sites that share a cause share a code; `details` carries the specifics (`parameter`, `nodeId`, `expectedType`, `actualType`, …). Failures relayed from the Figma API itself (a `loadFontAsync` rejection, a setter throw) get **`FIGMA_API_ERROR`** with the original message preserved in `details` — so after this release, `UNKNOWN_ERROR` means only "a bug or a truly unclassifiable state", which is the burn-down target, not zero forever. Codes are permanent identifiers once shipped; the taxonomy review exists because renaming later is a breaking change.

> [!NOTE]
> **D2 — Registry-only origination.** Every conversion replaces an inline throw with a call into the v2.3.3 central registry of message factories; handlers pass operands in and never compose refusal text locally. The 51 central-table throws convert first — they are mechanical (the key already names the code) — and the legacy `ERRORS` string table is absorbed into the factory registry, with unreferenced keys deleted rather than carried. After conversion, a handler file contains no `throw new Error(` at all.

> [!NOTE]
> **D3 — Message quality gate.** A converted message must pass the D9 acceptance check: name the cause distinctly, name the read tool that supplies the correct value where one exists, and state the recovery so the correct retry is derivable from the error text and the tool list alone. Messages for conditions with no agent-executable recovery (internal invariants, `FIGMA_API_ERROR`) state that explicitly — "not recoverable by retry; report the error" — which is itself the recovery. Converting a site without bringing its message to standard is not permitted: a code attached to a message that cannot guide recovery is the false affordance Q16 rejected.

> [!NOTE]
> **D4 — Playbook parity, mechanically enforced.** Every code in the registry has an `error-playbook.md` entry and vice versa, checked by a new `check:error-codes` script wired into CI beside `check:suppressions` (same pattern as the `safetyContract.test.ts` bidirectional diff). A code without an entry fails CI; an entry without a code fails CI. Shared-cause codes get one entry each — this is what makes D1's bounded taxonomy affordable where per-site codes would not be.

> [!NOTE]
> **D5 — Tests assert codes, not prose.** The 102 prose assertions migrate in the same phase as the sites they test: identity is asserted via `code` (and `details` where relevant); message *content* is asserted only by the D9 acceptance tests that exist to pin recovery text. This unfreezes message wording from the test suite — after this release, improving a message is not a test break unless the recovery content changes.

> [!NOTE]
> **D6 — No control-flow change; ratcheted enforcement.** Same conditions throw at the same points; only the thrown value changes. Each phase's rebuild diff is reviewed with that rule: any emitted-JS change that is not a throw-site conversion is escalated. A new `check:legacy-throws` script (the `check:suppressions` pattern) counts `throw new Error(` under `figma_plugin/**/*.ts` against a committed baseline that may only decrease — starting at 332 and ratcheting to 0 as phases land — so the uncoded surface cannot regrow between phases or after release.

> [!NOTE]
> **D7 — One error convention at the MCP boundary.** The UI relay's local dispatch failures are wrapped as coded objects (`UI_RELAY_FAILURE`, original message in `details`) so a UI-side failure is distinguishable from a plugin-authored one. `describeError` survives only as the message-extraction step inside the `UNKNOWN_ERROR` fallback. `channel.ts`'s in-band `status: "error"` envelope is the subject of Q1 (below) — the goal is one convention, but the migration is breaking for callers that read the in-band fields, so it is decided explicitly rather than absorbed silently.

---

## Scope & non-goals

**In scope**

1. The code taxonomy artifact (D1), reviewed before conversion begins.
2. Registry extension and conversion of all 332 inline throw sites (51 central-table sites first), absorbing the legacy `ERRORS` table into the factory registry.
3. `FIGMA_API_ERROR` wrapping for relayed sandbox failures; `UI_RELAY_FAILURE` for UI-local dispatch failures.
4. Migration of the 102 prose-based test assertions to code-based assertions (D5).
5. Playbook entries for every code; `check:error-codes` parity gate; `check:legacy-throws` ratchet gate (D4/D6).
6. Resolution and implementation of Q1 (the `channel.ts` envelope).
7. Agent-guide updates (`error-playbook.md` primarily; `constraints.md`/`workflows.md` only where they quote message text), mirrored to the `figma-edit://guide/*` resources.
8. Version bump `2.3.3 → 2.3.4` on every enforced surface; CHANGELOG entry listing every message whose text changed, with before/after examples.

**Explicit non-goals**

- **No change to when errors are thrown.** No new validations, no reordering of checks, no added or removed throws. Validate-before-mutate scope is v2.3.3 Q17's territory; anything it leaves open stays open here.
- No retry, rollback, or transaction logic; no change to batch envelopes (v2.3.3 D7 owns those).
- No new tools, permissions, or scope-model changes; no success-shape changes.
- No server-wide (MCP-side) error redesign beyond Q1's decided outcome and the boundary wrapper v2.3.3 shipped.
- The `check:types:server` follow-up (v2.3.3 review decision 5) remains separately tracked; it is not this release.

---

## Open questions

**Q1 (v2.3.4) — Does `channel.ts` converge on the D9 boundary surface?** Today `channel_join` reports failure in-band: a successful tool result with `status: "error"` + `errorCode`/`errorMessage`. Everything else after v2.3.3 fails with `isError: true` + `structuredContent.error`. *(Updated per v2.3.3 Q20, resolved 2026-07-18 Option A: the pass-through repair landed in v2.3.3 — structured codes arrive in `errorCode` verbatim, assigned at origin, with no prose classification — so this question now reduces to the envelope shape alone.)*

- **Option A — converge.** `channel_join` failures become D9 errors like every other tool; the in-band fields are removed. One convention for agents to learn; breaking for any caller reading the in-band fields, with a CHANGELOG before/after.
- **Option B — keep the dual surface, documented.** `channel_join` keeps its envelope (join is arguably a status report, not a refusal); the guides document the exception explicitly.
- **Recommendation: Option A.** The shared criterion (first-call correctness, one-round-trip recovery) favors one learnable convention over a documented exception, and the breaking cost is small: the guides already teach reading `channel_join`'s result as a whole, and the hard-cutover precedent (v2.3.3 Q8) applies — an exception preserved for compatibility is an exception agents must be taught forever.

---

## Implementation plan (phased)

**Phase 1 — Taxonomy, registry, gates (D1/D2/D4/D6).** Produce the taxonomy artifact (code list, naming rules, class → `details` shapes) and review it. Extend the registry; add `check:error-codes` (bidirectional code ↔ playbook parity) and `check:legacy-throws` (ratchet, baseline 332) to CI beside the existing gates. Prove both red/green.

**Phase 2 — Central-table conversion.** Convert the 51 sites that wrap `ERRORS`-table strings; absorb the table into the registry; delete unreferenced keys. Mechanical, lowest-risk, and it retires the pattern the deleted prose-matching existed to serve. Ratchet drops to ~281.

**Phases 3–8 — Per-domain conversion, one commit per domain, in this order:** `src/main.ts` dispatcher guards (79 — the safety-critical scope/permission surface); `componentHandlers.ts` (66) and `connectorHandlers.ts` (20) *after rebasing on v2.3.3 Phases 8/11*; `variableHandlers.ts` (43) and `styleHandlers.ts` (20); `nodeModifiers.ts` (31) and `stylingHandlers.ts` (24); `nodeCreators.ts`/`layoutHandlers.ts`/`textHandlers.ts` (34); the tail (`prototypingHandlers.ts`, `annotationHandlers.ts`, `vectorHandlers.ts`, `utils/`, 15). Each phase: convert sites, bring messages to D3 standard, add playbook entries, migrate that domain's prose assertions (D5), rebuild, review the diff under the D6 rule, and land with the ratchet decreased.

**Phase 9 — Boundary unification.** Implement the Q1 resolution; wrap UI-relay local failures as `UI_RELAY_FAILURE`; confirm `describeError` survives only inside the fallback path.

**Phase 10 — Contract sync, version, verification.** Playbook complete and parity-gated; guides mirrored to the server resources; CHANGELOG with before/after for every changed message and the Q1 outcome; version bump on all surfaces; `bun run build:all`, `check:plugin`, `check:versions`, `check:types:plugin`, `check:suppressions`, `check:error-codes`, `check:legacy-throws` (at 0), and the full suite green. Live smoke probes: a handful of representative refusals (one per taxonomy class) driven over MCP against a live document, asserting the code arrives in `structuredContent` at the boundary.

---

## Testing & rollout

- **Ratchet:** `check:legacy-throws` reaches 0 and is in CI; `figma_plugin/**/*.ts` contains no `throw new Error(`.
- **Parity:** `check:error-codes` passes in both directions.
- **No control-flow drift:** per-phase rebuild diffs show throw-site conversions only (D6); anything else is escalated, not merged.
- **Code-based tests:** the migrated assertions identify errors by `code`; D9 acceptance tests pin recovery content per message; a grep-level check confirms no remaining `toThrow("…")` prose assertions against plugin errors.
- **Fallback semantics:** a deliberately uncoded throw injected in a test still surfaces as `UNKNOWN_ERROR` with its message intact — the fallback contract survives the conversion.
- **Live:** the Phase 10 smoke probes pass; `UNKNOWN_ERROR` does not appear in any probe.
- **Rollout:** merge after v2.3.3; tag only after CI (including both new gates) passes.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| :- | :- | :- |
| Taxonomy proves wrong after shipping (codes are permanent) | Med | D1 review-before-conversion; one-code-per-cause keeps the set small enough to design deliberately; `details` absorbs specifics so codes rarely need splitting |
| A conversion silently changes control flow on a live-verified path | Low–Med | D6 rule + per-phase rebuild-diff review; stop-and-escalate; conversions are value-shape edits by construction |
| 15-file, 332-site diff is unreviewable | Med | Per-domain phases with one commit each; the ratchet makes progress and regressions both visible |
| Message rewrites break agents matching on prose | Med | Codes are the new stable contract; CHANGELOG lists every changed message with before/after; playbook entries give the recovery the prose used to carry |
| Test migration (102 assertions) introduces coverage gaps | Low–Med | Migrated per-domain alongside the sites they test; the injected-uncoded-throw test pins the fallback; D9 acceptance tests keep message content covered where it matters |
| Conflicts with late v2.3.3 phases in the same files | Med | Hard dependency: start only after v2.3.3 merges; `componentHandlers`/`connectorHandlers` convert after rebasing on Phases 8/11 |
| Playbook bloats past usefulness | Low | One entry per code, not per site (D4); the taxonomy caps the count at a few dozen |

---

## Provenance

| Item | Verified at | Finding |
| :- | :- | :- |
| Inline throw count | `grep -c "throw new Error(" figma_plugin/**/*.ts` (2026-07-18) | 332 sites across 15 files; per-file table above |
| Central-table overlap | grep for `throw new Error(ERRORS`/`formatScopeError` (2026-07-18) | 51 of the 332 wrap central-table strings; the key (natural code) is discarded at the throw |
| `ERRORS` table shape | `figma_plugin/utils/errors.ts` (2026-07-18) | 28 keys defined (13 legacy + 15 from v2.3.3); 12 legacy keys referenced by handlers |
| Prose-based test assertions | grep for `toThrow(` under `src/mcp_server/tests` (2026-07-18) | 102 assertions match thrown message text |
| Server-side legacy envelope | `src/mcp_server/tools/channel.ts` (2026-07-18) | Join failures reported in-band as successful results with `status: "error"` + `errorCode` — predates the D9 boundary |
| UI-relay flattening | `figma_plugin/ui.html` dispatch catch (2026-07-18) | UI-local failures forwarded as `error.message \|\| "Error executing command"` — uncoded, indistinguishable from plugin-authored failures |
| Deferral decision | v2.3.3 open-questions Q16 (resolved 2026-07-18, Option A); PRD Rev 23 | Legacy surface stays on the ratified `UNKNOWN_ERROR` fallback; conversion deferred to this release with `UNKNOWN_ERROR` as the burn-down metric |

---

## Revision history

- **Rev 1, 2026-07-18** — initial PRD, created on the v2.3.3 Q16 resolution (Option A). Records the measured legacy surface (332 inline sites, 51 central-table-backed, 102 prose assertions, the `channel.ts` envelope, the UI-relay flattening), decisions D1–D7 (cause-level taxonomy, registry-only origination, D9 message quality, playbook parity gate, code-based tests, no-control-flow-change with a ratchet gate, boundary unification), one open question (Q1 — `channel.ts` convergence, recommendation Option A), and the ten-phase plan gated on v2.3.3 merging first.
