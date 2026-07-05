# v2.3.2 PRD: Safety Contract Conformance & Atomicity Hardening

This document is the product / implementation spec for the **v2.3.2** release of `figma-edit-mcp`. Where v2.3.1 hardened `node_bind_variable` and added `node_set_fill { clear: true }`, v2.3.2 closes the safety-contract gaps surfaced by code audit: dispatcher/documentation mismatches, a live scope-containment escape in `node_clone`, incomplete prevalidation for `create_component_set`, mutation-before-final-validation in create handlers, stale version metadata (plugin UI, MCP-registry `server.json`, root `manifest.json`), and missing executable safety-contract tests.

The release goal is not to add new design-editing capability. It is to make the project’s stated Figma-editing safety contract match the implementation, make the implementation match the safety matrix, and prevent future drift.

> **Revision 2 (2026-07-04).** This PRD incorporates every disposition from the adversarial review in [critique.md](./critique.md): the parent-cycle prevalidation gap, the `node_clone` G1 scope escape, corrected test paths, the wider version-drift surface, unconditional creation-handler cleanup, the recorded clone-parent-name decision, the plan-phase layering decision, the qualified §4 contract scope, and the smaller errata (relocated error strings, dispatcher error precedence, dead handler branches, priority coherence, silent reparent skip). Where a finding had more than one reasonable fix, the decision blocks below record the options considered with pros and cons.

> **Revision 3 (2026-07-04).** A follow-up pass closed five further gaps (duplicate component IDs in `create_component_set`, `containingPage` derivation, `cloneNode` cleanup/dead branch, an executable path for manual step 11, lockfile enumeration in D1) and recorded the four items that have more than one defensible answer as **explicitly open** — see *Open decisions (rev 3)* in the Decisions section (OQ1–OQ4).

> **Revision 4 (2026-07-04) — live verification.** Verified against a live Figma session (document “MCP Test”, page scope). Every current-behavior claim that could be reached was **confirmed live**: the `node_clone` G1 scope escape (a full page duplicated outside scope, then undeletable by the agent), the `create_svg` orphan on a non-appendable parent, the raw-Figma-error-plus-orphan on instance-interior `node_clone`, and both `create_component_set` partial-rename paths. The evidence also **resolved OQ1 and OQ2 (both: reject)**, resolved peer-review item 4 statically, added a new mutate-phase requirement (guarded `variantGroupProperties` result read — it can throw *after* fully successful mutation), and surfaced a new **P0**: the `channel_join` MCP tool rejects its own successful connect payload due to a strict output schema (§6). Locked-guard behaviors were not live-tested at rev 4 (no locked layer in the test file). OQ3/OQ4 remain open.

> **Revision 5 (2026-07-04) — locked-layer live verification.** With locked layers added to the test scope, the remaining claims were confirmed live: `node_set_effects` mutated a locked node **and** a child of a locked container (while `node_rename` on the same node was correctly denied — the guard exists, it is simply not wired); `node_clone` duplicated a locked node (the clone inherits `locked`, so the agent cannot delete its own artifact); `create_svg` created a node **inside a locked container** (Figma’s API ignores locks entirely — the plugin guard is the only protection). One further gap was found and folded into §1/§2: the instance-interior **parent** guard family misses the case where the parent *is* the instance itself (`findInstanceAncestor` excludes the node), producing a raw Figma error plus an orphan through `create_svg`.

> **Revision 6 (2026-07-04).** **OQ3 resolved: option (c)** — the `createComponentInstance` catch-all wrapper is removed; one targeted wrap remains around `importComponentByKeyAsync` (with key + recovery guidance); `COMPONENT_SET` ids are rejected with a default-variant pointer, which also fixes a **latent `TypeError`** (typings-verified: the type check admits `COMPONENT_SET` but `createInstance()` exists only on `ComponentNode`); all handler-authored messages join the `create_instance:` prefix family. Only **OQ4** remains open.

> **Revision 7 (2026-07-04).** **OQ4 resolved: option (b)** — the safety-contract test token-diffs `SAFETY.md` Part B’s gate shorthand against the contract table in **both directions** (unknown tokens fail; bespoke tokens ignore-listed), enforcing both halves of D9 mechanically. With this, **every decision in the PRD is closed** — D1–D9 and OQ1–OQ4 — and v2.3.2 is fully specified and ready to implement.

---

## Release identity

> [!IMPORTANT]
> **This is v2.3.2.** v2.3.1 is the prior release; `package.json` currently reads `"version": "2.3.1"`. Bump it to `2.3.2` as part of this release — along with the **other stale version surfaces**: `server.json` (both `version` fields currently read `2.0.0`) and the root `manifest.json` (`2.0.0`). See **D1/D2**.
>
> This is a **patch** release. It contains no new MCP tools, no MCP schema changes, and no new Figma-editing powers. It hardens existing editing tools and updates safety documentation so the documented mutation guarantees match the implementation.

## API Change Notice

> [!NOTE]
> v2.3.2 does **not** change MCP tool schemas.
>
> It does change failure behavior for unsafe or invalid operations that previously slipped through prevalidation or failed after partial mutation:
>
> - `node_set_effects` and `create_svg` now enforce the guard stacks **already promised by `SAFETY.md`** (locked / instance-interior gates that the dispatcher was missing).
> - `node_clone` gains a stricter guard stack that **extends** the documented contract — `SAFETY.md` B1 previously promised only a locked-source check. The extension is motivated by guarantees G1/G7 and closes a **live scope-containment escape**: today, cloning the scope root itself passes the source-scope check and places the clone *outside* the editable subtree. Consequence of the fix: **cloning the scope root is no longer possible** (its parent is outside scope by definition). This is intentional; see **D3** and the error-playbook update in §5.
> - `create_component_set` now fully prevalidates components, parent, component type, locks, instance interiors, remote/shared-library status, duplicate variant combinations, page compatibility, and the **parent-cycle case** (parent must not be one of the combined components or a descendant of one) before renaming or combining variants. The current handler’s **silent reparent skip** (a missing parent at placement time is ignored and success is reported with `parentId` unhonored) is replaced by a hard prevalidation error.
> - `create_frame`, `create_text`, `create_svg`, and `create_instance` validate the parent before creating nodes / instances, **and** clean up the created object on any post-construction failure (cleanup is unconditional — see **D6**).

---

## Decisions

> [!NOTE]
> **D1 — Version and release metadata.** Bump `package.json` `2.3.1 → 2.3.2`, and bring the other in-repo version surfaces to the same value: **`server.json`** (both `version` fields — currently `2.0.0`; this is the public MCP-registry manifest, a worse drift surface than the plugin About tab) and the root **`manifest.json`** (currently `2.0.0`). Update the root `package-lock.json` `version` fields to match (e.g. `npm install --package-lock-only` after the bump); the nested `src/mcp_server/package-lock.json` does **not** track the release version and needs no bump.

> [!NOTE]
> **D2 — Version drift is a release blocker; check *all* version surfaces.** The audit found four version surfaces, three of them stale (`ui.html` 2.2.0, `server.json` 2.0.0, `manifest.json` 2.0.0). CI must fail if any of them disagrees with `package.json`.
>
> Three mechanisms were considered for the plugin-UI surface:
>
> | Option | Mechanism | Pros | Cons |
> | :- | :- | :- | :- |
> | (a) | Build-time rewrite of the committed `ui.html` from a placeholder | Version visible in the static file | `ui.html` becomes generated-in-place (source *is* output) — easy to hand-edit and forget to regenerate; needs its own check script |
> | **(b) — DECIDED** | esbuild `define` injects `__PLUGIN_VERSION__` from `package.json` into `code.js` at plugin build (`figma_plugin/build.js`); `main.ts` posts it to the UI on startup; `ui.html` renders it dynamically | Single source of truth; **drift detection comes free** — `code.js` is already committed and rebuild+diff-checked by `check:plugin`, so bumping `package.json` without rebuilding fails existing CI; `ui.html` stays purely static | About-tab version depends on the init message (use a placeholder such as `—` before the handshake); the string lives in the bundle rather than in `ui.html` source |
> | (c) | Manual string + sync-check script that compares surfaces and fails CI on mismatch | Simplest; no build changes | Manual bump in four places every release (CI-enforced, so safe — but tedious) |
>
> **Decision: (b) for `ui.html`**, with (c) acceptable as a fallback if the build change proves awkward. `server.json` and `manifest.json` are not build outputs, so they get the (c) treatment regardless: a new **`check:versions`** script compares `package.json` ↔ `server.json` (both fields) ↔ `manifest.json` and fails CI on mismatch; bumps stay manual.

> [!NOTE]
> **D3 — Dispatcher guard parity (and one contract extension).** Update the dispatcher so every command’s implemented guard stack matches the v2.3.2 safety matrix. At minimum:
>
> - `node_set_effects` uses the same single-node write validation as other property writes: node permission, scope, exact name, locked-node / locked-ancestor guard. *(Pure conformance — `SAFETY.md` already claims this stack.)*
> - `create_svg` uses standard parent write validation: node permission, parent scope, parent exact name, parent locked / locked-ancestor guard, and parent instance-interior guard before calling the SVG handler. *(Pure conformance.)*
> - `node_clone` validates source scope, source exact name, source locked / locked-ancestor guard, source is not inside an instance interior, parent exists, parent can accept children, **parent is in scope**, parent is not locked, and parent is not inside an instance interior. *(Contract **extension** — `SAFETY.md` B1 previously promised only `locked(source)`; update the B1 row accordingly, per D9.)*
> - `create_component_set` performs the full batch prevalidation described in D4 before calling the mutating part of the handler.
>
> **Recorded decision — `node_clone` parent name verification: none.** The destination parent is implicit (it is the source’s own parent) and is never chosen by the agent, so exact-name verification would add no anti-hallucination protection beyond the source-name check already performed — and adding a `parentNodeName` parameter would change the MCP schema, which this patch release forbids. This closes the previously deferred “parent exact-name handling” item.
>
> **Recorded decision — cloning the scope root: denied.** The parent-in-scope check makes cloning the scope root impossible. Alternatives considered:
>
> | Option | Behavior | Pros | Cons |
> | :- | :- | :- | :- |
> | **(A) — DECIDED** | Deny via the same parent-scope rule used everywhere else | Closes the live G1 escape with no special case; the clone result always remains editable (and deletable) by the session | Removes a currently-possible operation; agents duplicating the scoped frame must ask the user to re-scope to the parent first (recovery guidance added to `error-playbook.md`) |
> | (B) | Special-case: append the scope-root clone *inside* the scope root | Preserves a “duplicate my scope” capability in-scope | Surprising semantics (clone of X nested inside X); diverges from Figma’s own clone placement; invents a one-off placement rule for a single edge case |
> | (C) | Keep current behavior; document as a residual risk | Zero behavior change | Leaves a standing G1 violation in the release whose whole purpose is contract conformance; contradicts D8/D9 |

> [!NOTE]
> **D4 — `create_component_set` must be two-phase, and the plan phase belongs to the dispatcher.** Move every input- and target-dependent validation before any component rename or variant combine. The handler must have a “plan” phase and a “mutate” phase. No component name may be changed until the whole plan is validated.
>
> **Layering decision.** Scope/permission state lives in `main.ts`, and `SAFETY.md`’s ground-truth hierarchy names the dispatcher as “the only layer an agent cannot bypass.” Options considered for where the plan phase runs:
>
> | Option | Shape | Pros | Cons |
> | :- | :- | :- | :- |
> | **(A) — DECIDED** | Dispatcher orchestrates: `main.ts` resolves the scope root, calls `validateCreateComponentSetPlan(params, scopeRoot)` (exported from the handler module), and passes the returned plan to a mutate-only `createComponentSet(plan)` | Gate ordering stays dispatcher-owned, consistent with the documented trust model and with §4’s contract tests (which drive dispatch); single resolution pass; the mutate function is trivially testable | Handler signature changes (internal only — no MCP schema change); the plan type crosses the module boundary |
> | (B) | Handler self-validates by importing `getPluginState()` | All component-set logic in one file | Handlers gain access to permission state — a new coupling pattern that contradicts the “gates live in the dispatcher” model §4 is about to codify; validation and mutation share a function, making handler-not-called-before-validation assertions awkward |
> | (C) | Keep validation split across dispatcher and handler | Smallest diff | Double resolution widens the R1 TOCTOU window; the split is exactly what produced the current interleaving bug; every gate has two possible homes for tests to track |
>
> The plan phase **replaces** the current dispatcher prevalidation loop (it is the *only* resolution pass — resolve each node exactly once, use reference-based checks thereafter, carry resolved references into the mutate phase). Do not keep the old loop and add a second one.

> [!NOTE]
> **D5 — Rollback scope — DECIDED: prevalidation (including the cycle check), not general transactions.** v2.3.2 fixes prevalidation and clarifies that batch atomicity means invalid input aborts before mutation; it is not a general Figma transaction layer. `create_component_set` must restore original component names if a rename or `combineAsVariants` throws before a component set exists.
>
> **Qualified claim.** Prevalidation must remove every *checkable* late-placement failure: parent existence, scope, name, locks, instance interior, `appendChild` presence, **and the cycle case — the parent must not be one of the input components nor a descendant of one** (after `combineAsVariants` the parent would be inside the new set, and appending the set into its own descendant throws *after* the set exists). Note that `"appendChild" in parent` proves the method exists, not that Figma will accept this child type under this parent; together with R1 TOCTOU, a **residual** late-placement failure remains possible. Per `SAFETY.md` R1/R5 it degrades to an ordinary reported error, with the set left at the `combineAsVariants` location. An absolute “no late placement failure” claim is untestable and is **not** made.
>
> Options considered for residual placement failures:
>
> | Option | Behavior on late `appendChild` failure | Pros | Cons |
> | :- | :- | :- | :- |
> | **(A) — DECIDED** | Prevalidate everything checkable (incl. cycle); residual failures throw normally, set stays at the combine location | Honest error surface; consistent with the R1/R5 residual-risk model; no new rollback machinery | The (rare, TOCTOU-class) failure leaves the set unplaced relative to the request — recovery guidance goes in `error-playbook.md` (`node_insert_child` to finish placement) |
> | (B) | Return success-with-warning, set left at combine location | Never throws after the set exists | A “success” that silently didn’t honor `parentId` violates the explicit-placement expectation (G3 spirit) and invites agent confusion; conditional result contract |
> | (C) | Roll back: remove the set, restore names | Closest to true atomicity | `ComponentSetNode.remove()` would **delete the user’s components now inside it**; safe rollback requires moving components out and restoring names/positions — a transaction layer, explicitly out of scope; a rollback bug destroying user work is worse than the failure it handles |

> [!NOTE]
> **D6 — Creation handlers must not mutate before parent validation, and cleanup is unconditional.** `create_frame`, `create_text`, `create_svg`, and `create_instance` must resolve and validate the target parent before creating a Figma node or instance. In addition — regardless of ordering — every creation handler must wrap all post-construction configuration and the append in `try/catch` and **remove the created object on failure**. Configuration (resize, fills, `setCharacters`, layout properties) always runs after construction and can throw, so parent-first ordering alone does not prevent orphans. (This supersedes the earlier conditional phrasing, which contradicted §3’s own test list.) The same wrapper applies to **`cloneNode`**: post-clone positioning and reparenting run inside `try/catch` with `clone.remove()` on failure — its existing post-clone `Cloned node does not support position` throw becomes unreachable once `validateCloneWrite` lands (every surviving source is a scene node with `x`/`y`); remove that branch and let the cleanup wrapper cover any residual case.

> [!NOTE]
> **D7 — Make the safety matrix executable — DECIDED: test-only contract table for v2.3.2.** Add tests so a documented guard cannot silently drift from implementation again. Two implementation patterns were considered:
>
> | Option | Shape | Pros | Cons |
> | :- | :- | :- | :- |
> | (1) | Source-of-truth contract object (`figma_plugin/src/safetyContract.ts`); `SAFETY.md` Part B generated from it | Docs cannot drift by construction | Part B rows carry dense prose annotations and `§` cross-references that don’t reduce to generic gate flags — generation either loses the prose or needs a templating layer disproportionate to a patch release |
> | **(2) — DECIDED** | Test-only contract table (`src/mcp_server/tests/unit/figma_plugin/safetyContract.test.ts`) asserting the generic gate categories per command via the existing mocked-dispatcher harness, plus a consistency test that every `SAFETY.md` Part B write-row tool name appears in the table | Uses infrastructure that **already exists** (see the harness in `atomicityAndValidation.test.ts`: mocked `figma` global, real `main.ts` import, tests drive `ui.onmessage`); catches exactly the drift class that caused this release; right-sized for a patch | `SAFETY.md`’s bespoke prose annotations can still drift (mitigated by the row-name consistency check, the OQ4 bidirectional gate token-diff, and the D9 policy); full generation deferred to a future minor release |
>
> **Contract scope (qualified).** The executable contract covers the **generic gate categories** listed in §4. Bespoke, tool-specific gates (§5 value typing, §8 FILL-needs-auto-layout-parent, §9 transform rules, §13 index bounds, cyclic-reparent §3, mixed-font §10, …) are *not* re-encoded in the contract table; their rows reference the existing suites that already test them.

> [!NOTE]
> **D8 — Documentation claims must be code-backed.** The README may keep strong positioning such as “Safer than Figma Itself,” but every concrete safety bullet underneath it must be true after the v2.3.2 fixes and covered by executable guard/atomicity tests. Fix the implementation or change the specific bullet that is not enforced. **Expected outcome for v2.3.2:** both currently-unenforced bullets (“all-or-nothing batches”, “locked/instance/shared-library off-limits”) become *true* once §1/§2 land — no bullet is expected to need deletion.

> [!NOTE]
> **D9 — No silent weakening (and no silent strengthening either).** If a guard documented in `SAFETY.md` cannot or should not be implemented for a command, either implement it or remove that concrete claim from the matrix. The implementation may not silently rely on Figma runtime errors for a guard the safety manual claims is plugin-enforced. Symmetrically: where v2.3.2 *extends* the contract (the `node_clone` stack), `SAFETY.md` must be updated to claim the new gates explicitly — enforced-but-undocumented guards are drift too.

### Open decisions (rev 3) — owner input required

> [!WARNING]
> The rev-3 review pass found four requirements with more than one defensible answer. They are recorded here rather than silently decided; each lists the options considered with pros and cons. **All four are now RESOLVED** — OQ1/OQ2 by live verification (rev 4), OQ3 as option (c) (rev 6), OQ4 as option (b) (rev 7). The blocks below preserve the decision record and evidence.

> [!NOTE]
> **OQ1 — Variant property-*value* validation (§2).** §2 validates property *names* (non-empty, unique) but not values. An empty value yields a variant named `Size=`; a value containing `=` or `, ` corrupts Figma’s `Prop=Value, Prop2=Value2` variant-name encoding, so `variantGroupProperties` can parse phantom properties — **silently**, not as an error.
>
> | Option | Pros | Cons |
> | :- | :- | :- |
> | (a) Reject empty values and values containing `=` or `,` | Prevents silent variant-encoding corruption with an agent-actionable error; symmetric with the name rules | May reject values Figma tolerates; the permitted character set is unverified (needs a live test) |
> | (b) Reject empty values now; live-test separator characters before restricting them | Closes the unambiguous case immediately; avoids inventing rules Figma doesn’t have | Separator corruption stays possible until the live test lands |
> | (c) Defer entirely to Figma (R5) | No false rejections | The failure mode is *silent* (wrong `variantGroupProperties`), so R5’s “Figma as final arbiter” logic doesn’t apply — Figma never arbitrates |
>
> ***RESOLVED (rev 4): option (a) — reject empty values and values containing `=` or `,`.*** *Live test (2026-07-04, “MCP Test”): values `S=1` / `M,L` made `combineAsVariants` **succeed** and produce a component set in Figma’s “existing errors” state; the tool then threw `in get_variantGroupProperties: Component set has existing errors` **after** mutation, and Figma subsequently auto-mangled the member names (`Property 1=Size=S=1`). Not silent mis-parsing — persistent corruption plus a post-mutation failure. Prevalidation is mandatory.*

> [!NOTE]
> **OQ2 — Components already inside an existing `COMPONENT_SET` (§2).** Combining such a component pulls it out of its current set, potentially leaving that set broken or single-variant. The prevalidation list is silent on it.
>
> | Option | Pros | Cons |
> | :- | :- | :- |
> | (a) Reject (`node.parent.type === "COMPONENT_SET"`) | Conservative; prevents silently cannibalizing a set the user may depend on; fits the release’s protect-what-exists spirit | Blocks a legitimate restructuring workflow with no in-tool alternative; whether `combineAsVariants` even accepts set members is unverified |
> | (b) Allow; let Figma arbitrate | No new restriction | If Figma allows it, the damage to the *old* set is silent; if it throws, it throws post-rename (the restore path covers names, but the reject was prevalidatable) |
>
> ***RESOLVED (rev 4): option (a) — reject.*** *Live test: Figma **accepted** a set member into `combineAsVariants`, ripped it out of its old set (leaving that set degenerate at a single variant), mangled the ripped member’s variant identity (`Property 1=ZZVerify-Set, Property 2=A` beside its new sibling’s `State=B` — mismatched property schemas), and the tool errored late anyway on `variantGroupProperties`. Rejection is the only defensible behavior.*

> [!NOTE]
> **OQ3 — `createComponentInstance` error wrapper (§3).** The handler wraps everything in `catch → “Error creating component instance: …”`. §3’s new errors are specified bare (`create_instance: missing parentId parameter.`); run inside the wrapper they double-prefix, and tests must know which format to expect.
>
> | Option | Pros | Cons |
> | :- | :- | :- |
> | (a) Remove the wrapper | Structured errors propagate untouched; consistent with the other creation handlers (none of which wrap) | Genuine Figma import failures (`importComponentByKeyAsync`) lose their identifying context |
> | (b) Keep the wrapper; hoist the `parentId` requirement and `resolveAppendableParent` above it | §3’s errors stay clean and testable; import errors keep their context | Two error-format regimes inside one handler; boundary is a maintenance trap; stutters against Figma’s own `in <api>:` prefixes |
> | **(c) — DECIDED** Remove the generic wrapper; add **targeted** wraps only where they add actionable information | One uniform `create_instance:` error family; no double-prefix; deterministic test strings; recovery guidance exactly where the failure is externally caused | Slightly more code than (a); the set of wrapped calls must be pinned to avoid creep |
>
> ***RESOLVED (rev 6): option (c).*** *Live evidence (rev 4/5) gutted (b)’s main benefit — Figma’s raw errors already self-identify the failing API (`in appendChild: …`) — while exact error strings proved load-bearing for the contract tests and playbook. Note the current wrapper is already inconsistent: the missing-`componentId`/`componentKey` check sits outside the try block, unwrapped. Scope of the targeted handling:*
>
> - **W1 — wrap `importComponentByKeyAsync` only** (the sole externally-caused, recoverable failure): `create_instance: failed to import remote component with key '${componentKey}': ${raw}. Verify the key (component_list), confirm the source library is enabled for this file; a component-set key needs a variant's key.`
> - **W2 — reject `COMPONENT_SET` ids with a pointer** — this also fixes a **latent `TypeError`** (typings-verified: the type check admits `COMPONENT_SET`, but `createInstance()` exists only on `ComponentNode`; `ComponentSetNode` exposes `defaultVariant`): `create_instance: '${node.name}' is a COMPONENT_SET; pass one of its variant COMPONENTs — e.g. its default variant '${set.defaultVariant.name}' (${set.defaultVariant.id}).` Auto-instantiating `defaultVariant` was **rejected**: it guesses a variant the caller never named (R2) and adds capability in a patch release.
> - **W3/W4 — prefix alignment, no wraps:** the local-lookup errors (`not found`, wrong type) and the missing-`componentId`/`componentKey` error move to the `create_instance:` prefix family.
> - **No wrap** for `createInstance()` TOCTOU or configure/append failures — D6’s cleanup rethrows the original error untouched; the “creation failures never leave orphans” fact is documented once in the error-playbook, not appended per message.
>
> *Independent of the option, parent-before-component error precedence is recorded as intended behavior (see §3).*

> [!NOTE]
> **OQ4 — Gate-level drift under the D7 test-table pattern (§4).** The row-name consistency check catches a *missing row*, not a *gate mismatch*: `SAFETY.md` can claim `locked` for a tool while the contract table omits `lockedTarget`, and nothing fails — the very drift class that caused this release can recur between doc and table.
>
> | Option | Pros | Cons |
> | :- | :- | :- |
> | (a) Accept; state the limitation in `SAFETY.md`’s maintenance section | Zero extra work | Weakens the §4 drift-prevention story; claimed-but-untested gates can still drift |
> | (b) Token-diff: parse Part B’s `·`-separated gate shorthand and diff it against the table’s generic-gate flags | Catches gate-level drift cheaply; Part B’s format is already fairly regular | Makes Part B’s prose format load-bearing (a wording edit can break the parser); needs a small shorthand→category alias table |
> | (c) Full generation (D7 pattern 1) | Drift-proof by construction | Already rejected for this release as disproportionate |
>
> ***RESOLVED (rev 7): option (b) — bidirectional token-diff.*** *The safety-contract test parses `SAFETY.md` Part B (tool name per row + the `·`-separated gate shorthand), maps generic tokens to the 13 contract categories through a small alias table, sends bespoke `§`-tagged tokens to an explicit ignore set (they stay covered by their existing suites), and **fails on any unknown token** — that is the drift tripwire. The diff runs in both directions: a gate claimed in Part B but not asserted in the contract table fails (no silent weakening), and a gate asserted in the table but absent from Part B fails too (no silent strengthening — both halves of D9). Failure messages must name the fix (“update SAFETY.md, the contract table, or the alias table”). Guardrail: bespoke tokens belong in the ignore set, so the alias table should stay ≈13 categories plus a handful of synonyms; if it balloons during implementation, escalate rather than silently expanding it.*

> [!NOTE]
> **Decision status.** Product decisions **D1–D9 are closed**, and **all open questions are resolved**: OQ1/OQ2 (rev 4, live-verified, both reject), OQ3 (rev 6, option c — targeted wraps), OQ4 (rev 7, option b — bidirectional token-diff). **No open decisions remain; v2.3.2 is fully specified and implementable.** The peer-review checklist at the end tracks the remaining **implementation verifications** (live-Figma behavior checks such as cross-page `combineAsVariants`); their outcomes may adjust individual prechecks but do not reopen a recorded decision.

---

## Scope & priority

| # | Change | Priority | Primary location |
| :- | :- | :-: | :- |
| §1 | Dispatcher guard parity for `node_set_effects`, `node_clone`, `create_svg` (incl. the `node_clone` scope-escape fix) | **P0** | `figma_plugin/src/main.ts` |
| §2 | Two-phase `create_component_set` prevalidation and no partial rename | **P0** | `figma_plugin/src/main.ts`, `figma_plugin/handlers/componentHandlers.ts` |
| §3 | Validate creation parents before node / instance creation; unconditional cleanup | **P1** | `figma_plugin/handlers/nodeCreators.ts`, `figma_plugin/handlers/vectorHandlers.ts`, `figma_plugin/handlers/componentHandlers.ts` |
| §4 | Executable safety matrix / guard regression tests | **P1** | `src/mcp_server/tests/unit/figma_plugin/*`, `SAFETY.md` |
| §5 | Code-backed README, version sync, and safety-doc cleanup | **P1** | `README.md`, `SAFETY.md`, `figma_plugin/ui.html`, `figma_plugin/build.js`, `server.json`, `manifest.json`, `CHANGELOG.md` |
| §6 | `channel_join` output-schema conformance (found live, rev 4) | **P0** | `src/mcp_server/tools/channel.ts`, `src/mcp_server/tools/_result.ts`, contract-seam tests |

> [!IMPORTANT]
> **Priorities are implementation *sequencing* only** — per the coverage map below, every row needs both its implementation change and its regression test before the release ships; nothing P1 is droppable. In particular, **`create_svg`’s fix spans §1 (dispatcher guards) and §3 (handler creates the node before parent checks) and the two halves must land together**: shipping §1 alone still leaves the orphan-node bug for an in-scope, name-matched parent that cannot accept children.

---

## Guard / atomicity coverage map

This table is the acceptance checklist for the v2.3.2 audit findings. Each row must have both an implementation change and a regression test before the release can ship.

| Finding | Required implementation coverage | Required regression coverage |
| :- | :- | :- |
| `node_set_effects` lacks the documented locked guard | Route through `validateSingleNodeWrite(..., { checkLocked: true })` before `setEffects` | Locked target and locked ancestor both reject; `setEffects` spy is not called; unlocked happy path still succeeds |
| `node_clone` lacks structural prevalidation, and can place a clone **outside the editable scope** (cloning the scope root — a live **G1 violation**) | Validate source permission, scope, exact name, locked ancestor, and instance-interior; validate destination parent exists, is appendable, **is in scope**, unlocked, and not inside an instance before `node.clone()` | Locked source, locked ancestor, source inside instance, missing parent, non-appendable parent, parent outside scope (**including the scope-root-clone case**), parent locked, parent locked ancestor, and parent inside instance all reject before `node.clone`; happy path succeeds |
| `create_svg` lacks parent protection and creates the SVG before final parent checks | Dispatcher: parent write validation (scope/name/locked/instance) before the handler (§1); handler: validate `svg` and resolve an appendable parent before `figma.createNodeFromSvg` (§3) — **both halves ship together** | Dispatcher tests: locked parent, locked ancestor, instance-interior parent reject before `figma.createNodeFromSvg`. Handler tests (direct calls — see §3 note on dispatcher error precedence): missing, nonexistent, and non-appendable parent reject before `figma.createNodeFromSvg`; happy path succeeds |
| `create_component_set` can partially rename before later validation fails; a missing parent at placement time is **silently ignored** | Refactor to plan/mutate phases; validate components, parent, property/value cardinality, component type, locks, instance interiors, remote components, duplicate variants, duplicate component IDs, page compatibility, parent appendability, **and the parent-cycle case (parent ∉ components ∪ their descendants)** before any rename | Wrong type after a valid component, duplicate variant, duplicate component ID, locked component/ancestor, instance-interior component, remote component, parent locked, parent non-appendable, parent outside scope/name mismatch, **parent = input component (or descendant of one)**, and cross-page inputs all leave original names unchanged and do not call `combineAsVariants` |
| `combineAsVariants` can fail after temporary renames | Restore original component names if a rename or `combineAsVariants` throws before a component set exists; do not build a general transaction layer or post-component-set rollback in v2.3.2 | Simulated `combineAsVariants` throw restores original names; simulated mid-loop rename throw restores names; tests assert every *prevalidatable* placement failure is rejected in the plan phase (residual TOCTOU failures degrade per R1 with the set left at the combine location) |
| `create_frame`, `create_text`, and `create_svg` create nodes before parent checks | Resolve and verify an appendable parent before node construction, **and** wrap post-construction configuration + append in `try/catch` that removes the created node on failure (cleanup is unconditional — D6) | Missing `parentId`, nonexistent parent, and non-appendable parent reject before `figma.createFrame` / `figma.createText` / `figma.createNodeFromSvg` (direct handler calls); simulated post-construction failure removes the created node; valid parent still creates/appends |
| `create_instance` creates an instance before parent checks | Resolve and verify an appendable parent before component import/lookup and `component.createInstance`, with the same unconditional cleanup wrapper | Missing `parentId`, nonexistent parent, and non-appendable parent reject before `component.createInstance` (direct handler calls); simulated post-construction failure removes the instance; valid parent still creates/appends |
| Safety matrix drift allowed docs to outrun code | Add the executable safety-contract test table (D7 pattern 2) | Every `SAFETY.md` Part B write row has a matching contract-table entry (generic gates asserted; bespoke gates referenced to their existing suites); claimed gates have handler-not-called or mutation-not-called assertions; bidirectional token-diff keeps Part B’s gate shorthand and the table’s gate flags in sync (OQ4) |
| Version metadata drift (`ui.html` 2.2.0, `server.json` 2.0.0, `manifest.json` 2.0.0 vs `package.json` 2.3.1) | Inject the plugin version via the build `define` (D2 option b) so `check:plugin` covers it; add `check:versions` comparing `package.json` ↔ `server.json` ↔ `manifest.json` | `check:versions` fails on any mismatch and passes when all surfaces agree; `check:plugin` fails when `package.json` is bumped without a plugin rebuild |
| `channel_join` rejects its own successful page/read-only connect (strict output schema vs spread payload — **live rev 4**) | Loosen the schema or declare the full payload shape (`pageCount`, `pages`, `node`); enforce the `_result.ts` extra-keys convention across all tools | Output-schema validation tests for page-mode, node-mode, and read-only connect payloads; contract-seam sweep validating every tool’s `structuredContent` against its declared output schema |
| `create_component_set` result read can fail after successful mutation (`variantGroupProperties` throw — **live rev 4**) | Wrap result construction; return success + `warning` without the field on getter throw | Simulated getter throw after combine returns success-with-warning, not an error |
| Parent-side instance guard misses parent-**is**-instance, all creation/reparent tools (**live rev 5**) | Extend parent checks to `parent.type === "INSTANCE" \|\| findInstanceAncestor(parent)` in `validateParentWrite`, `validateCloneWrite`, and the §2 plan phase | Per-tool tests: an `INSTANCE` node as `parentId` rejects with a structured error before any create/clone/insert mutation |
| `create_instance` admits `COMPONENT_SET` ids but `createInstance()` exists only on `ComponentNode` — latent `TypeError` (typings-verified, **rev 6**) | Reject `COMPONENT_SET` ids with a default-variant pointer (OQ3/W2); remove the catch-all wrapper; add the W1 import wrap; align prefixes (W3/W4) | Set-id rejection test with pointer text; import-failure wrap test; no-legacy-prefix regression |

---

## §1. Dispatcher guard parity for documented single-target / creation tools (P0)

**The bug.** `SAFETY.md` promises guard stacks that are not consistently present in the dispatcher. The audit found concrete mismatches on `node_set_effects`, `node_clone`, and `create_svg` — and, beyond the documented mismatches, a live **G1 violation** in `node_clone`: cloning the scope root passes the source-scope check (the source *is* in scope), and the handler then appends the clone to the source’s parent, which is **outside** the scope subtree. The session gains a node it can neither edit nor delete, in territory the user never granted.

**Current behavior.**

- `node_set_effects` checks node-edit permission, scope, and exact node name, then calls `setEffects(params)`; the locked-node guard is absent in this dispatch path.
- `node_clone` checks node-edit permission, source scope, and exact source name, then calls `cloneNode(params)`; locked-source, parent, and instance-interior checks are absent before mutation — and cloning the scope root currently succeeds, placing the clone outside the editable scope.
- `create_svg` checks node-edit permission, parent scope, and parent name, then calls `createNodeFromSvg(params)`; parent locked and instance-interior checks are absent before SVG node creation.

**v2.3.2 change.**

1. Replace `node_set_effects` dispatch with:
   ```ts
   case "node_set_effects":
     await validateSingleNodeWrite(params, { checkLocked: true });
     return await setEffects(params);
   ```

2. Replace `create_svg` dispatch with:
   ```ts
   case "create_svg":
     await validateParentWrite(params, {
       checkLocked: true,
       instanceCheckVerb: "appended to",
     });
     return await createNodeFromSvg(params);
   ```

3. Replace `node_clone` ad-hoc validation with a clone-specific validator:
   ```ts
   case "node_clone":
     await validateCloneWrite(params);
     return await cloneNode(params);
   ```

   `validateCloneWrite(params)` must:
   - require node-edit permission and a linked scope;
   - resolve `params.nodeId`;
   - check source scope and `params.nodeName` exact match;
   - call `assertNotLocked(source)`;
   - call `assertNotInstanceInterior(source, "cloned")`;
   - require `source.parent`;
   - require `appendChild` on the parent;
   - check the parent is **in scope** — *note: this denies cloning the scope root itself (its parent is outside scope by definition). Intentional; it closes the G1 escape above. No `parentNodeName` is added — the parent is implicit and never agent-chosen (D3), so no MCP schema change occurs;*
   - call `assertNotLocked(parent)`;
   - call `assertNotInstanceInterior(parent, "appended to")`.

> [!IMPORTANT]
> **Parent-is-instance hole (rev 5 — live-verified).** `findInstanceAncestor` starts at `node.parent`, so every parent-side instance check — the existing `validateParentWrite({ instanceCheckVerb })` used by `create_shape`/`create_frame`/`create_text`/`create_instance`/`node_insert_child`, the §1 `create_svg` fix, and `validateCloneWrite` — passes when the parent **is** the `INSTANCE` node itself. Live: `create_svg` with an instance as `parentId` sailed through the dispatcher, then died on Figma’s raw `in appendChild: Cannot move node…` and orphaned the SVG on the page. v2.3.2 must extend the parent-side check to `parent.type === "INSTANCE" || findInstanceAncestor(parent)` (an include-self variant for parent checks), across **all** parent-gated tools, with a regression test per tool. The §2 parent prevalidation inherits the same rule.

**Error strings.**

Use the existing dispatcher/helper error families where possible:

- Locked source or parent: existing locked-layer `Operation Denied: ... locked ...` message.
- Instance-interior source: `Operation Denied: Cannot clone '${node.name}' because it is inside a component instance.`
- Instance-interior parent: existing `appended to` instance-interior message.
- Parent outside scope (incl. the scope-root clone): existing scope-error family (`PARENT_OUTSIDE_SCOPE`).
- Missing parent: `node_clone: '${node.name}' has no parent and cannot be cloned.`
- Non-appendable parent: `node_clone: parent '${parent.name}' (type ${parent.type}) cannot accept cloned children.`

> [!NOTE]
> **Dead-code cleanup.** Once `validateCloneWrite` lands, the handler’s own late checks become unreachable through the dispatcher — in particular `cloneNode`’s existing `Cloned node ${nodeId} has no parent and cannot be cloned` branch, which differs textually from the new message above. Remove or align superseded handler-side messages so exactly **one** variant of each error ships. The same rule applies in §2 and §3 — and to `cloneNode`’s post-clone `Cloned node does not support position` branch, which D6 removes in favor of the cleanup wrapper.

**Tests.**

Unit tests in the dispatcher suite — `src/mcp_server/tests/unit/figma_plugin/`, using the established harness (mocked `figma` global, real `main.ts` import, tests drive `ui.onmessage`; see `atomicityAndValidation.test.ts`):

- `node_set_effects` without node-edit permission rejects before `setEffects` is called.
- `node_set_effects` without a linked scope rejects before `setEffects` is called.
- `node_set_effects` on an out-of-scope node rejects before `setEffects` is called.
- `node_set_effects` with a mismatched `nodeName` rejects before `setEffects` is called.
- `node_set_effects` on a locked node rejects before `setEffects` is called.
- `node_set_effects` on a child of a locked ancestor rejects before `setEffects` is called.
- `create_svg` without node-edit permission rejects before `figma.createNodeFromSvg` is called.
- `create_svg` without a linked scope rejects before `figma.createNodeFromSvg` is called.
- `create_svg` outside the linked scope rejects before `figma.createNodeFromSvg` is called.
- `create_svg` with a mismatched `parentNodeName` rejects before `figma.createNodeFromSvg` is called.
- `create_svg` under a locked parent rejects before `figma.createNodeFromSvg` is called.
- `create_svg` under a child of a locked ancestor rejects before `figma.createNodeFromSvg` is called.
- `create_svg` under an instance interior rejects before `figma.createNodeFromSvg` is called.
- `node_clone` without node-edit permission rejects before `node.clone` is called.
- `node_clone` without a linked scope rejects before `node.clone` is called.
- `node_clone` outside the linked scope rejects before `node.clone` is called.
- `node_clone` with a mismatched `nodeName` rejects before `node.clone` is called.
- `node_clone` of a locked source rejects before `node.clone` is called.
- `node_clone` of a source with a locked ancestor rejects before `node.clone` is called.
- `node_clone` of a node inside an instance rejects before `node.clone` is called.
- `node_clone` with no parent rejects before `node.clone` is called.
- `node_clone` whose parent cannot accept children rejects before `node.clone` is called.
- `node_clone` whose parent is locked or has a locked ancestor rejects before `node.clone` is called.
- `node_clone` whose parent is outside scope rejects before `node.clone` is called.
- **`node_clone` of the scope root itself rejects (parent outside scope) before `node.clone` is called — the G1 regression test.**
- `node_clone` whose parent is inside an instance interior rejects before `node.clone` is called.
- `create_svg` whose parent **is** an `INSTANCE` node rejects before `figma.createNodeFromSvg` is called (parent-is-instance hole, rev 5).
- `node_clone` whose parent **is** an `INSTANCE` node rejects before `node.clone` is called.
- Parent-is-instance regressions for `create_shape`, `create_frame`, `create_text`, `create_instance`, and `node_insert_child` (existing tools sharing `validateParentWrite`).
- Happy-path regressions: unlocked `node_set_effects`, `create_svg`, and `node_clone` still succeed.

---

## §2. `create_component_set` two-phase prevalidation and no partial rename (P0)

**The bug.** `create_component_set` is documented as a batch operation with zero-mutation abort for invalid inputs, but validation and mutation are currently interleaved. The handler validates type and duplicate variant combinations in the same loop that renames components, so a later invalid component can leave an earlier component renamed. Two further defects in the same path:

- `combineAsVariants` has no failure handling, so a throw strands the temporary renames; and
- the post-combine reparent block **silently skips** placement when the parent lookup fails (`if (parent) { … }` with no else) — the tool reports success while ignoring the caller’s `parentId`.

**Current behavior.**

- Dispatcher prevalidates that each component exists, is in scope, name-matches, and has the right number of property values. It does not fully validate component type, locked state, remote status, parent locked/appendability, parent instance-interior state, duplicate variant uniqueness, or the parent-cycle case before entering the handler.
- Handler loops over components, checks type and property-value count, computes a variant name, checks duplicate combination, then sets `component.name = variantName`. A subsequent failure can occur after earlier names have changed.

**v2.3.2 change.**

Refactor into explicit plan/mutate phases, orchestrated by the **dispatcher** (D4 option A):

```ts
// figma_plugin/src/main.ts — the dispatcher owns gate ordering (SAFETY.md ground truth #1)
case "create_component_set": {
    if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!state.scopeRootId) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
    const scopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
    if (!scopeRoot) throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);

    // Phase 1 — plan: resolves every node exactly once, validates everything, mutates nothing.
    // This REPLACES the existing dispatcher prevalidation loop; do not run both.
    const plan = await validateCreateComponentSetPlan(params, scopeRoot);

    // Phase 2 — mutate: consumes only pre-resolved references from the plan.
    return await createComponentSet(plan);
}
```

```ts
// figma_plugin/handlers/componentHandlers.ts
type ComponentSetPlan = {
  properties: string[];
  parent?: ChildrenMixin & BaseNode;
  componentSetName?: string;
  containingPage: PageNode;
  components: Array<{
    node: ComponentNode;
    originalName: string;
    variantName: string;
    propertyValues: string[];
  }>;
};

export async function validateCreateComponentSetPlan(
  params: any,
  scopeRoot: BaseNode,
): Promise<ComponentSetPlan> {
  // Resolve all nodes ONCE, validate everything (list below), mutate nothing.
  // Scope checks are reference-based (checkScopeAccessRef pattern) against scopeRoot.
}

export async function createComponentSet(plan: ComponentSetPlan) {
  let componentSet: ComponentSetNode;
  try {
    for (const item of plan.components) {
      item.node.name = item.variantName;                 // first mutation
    }
    componentSet = figma.combineAsVariants(
      plan.components.map(c => c.node),
      plan.containingPage,
    );
  } catch (err) {
    // A mid-loop rename threw (TOCTOU) or combineAsVariants failed — no component
    // set exists yet, so restore every original name. Broader transaction cleanup
    // is out of scope for v2.3.2 (D5).
    for (const item of plan.components) {
      if (item.node.removed !== true) item.node.name = item.originalName;
    }
    throw err;
  }

  // Post-combine steps. Placement was prevalidated (existence, scope, name, locks,
  // instance interior, appendChild presence, and the parent-cycle check), so only
  // R1 TOCTOU residuals can fail here; such a failure surfaces as an ordinary error
  // with the set left at the combineAsVariants location (D5 option A).
  if (plan.componentSetName) componentSet.name = plan.componentSetName;
  if (plan.parent && componentSet.parent?.id !== plan.parent.id) {
    plan.parent.appendChild(componentSet);
  }
  return /* { id, name, type, childCount, variantProperties } */;
}
```

The handler’s previous interleaved checks (type, count, duplicate) and the silent `if (parent)` reparent block are **removed** — they move into the plan phase (see the dead-code rule in §1).

**Guarded result read (rev 4 — live-verified).** The result object reads `componentSet.variantGroupProperties`, and Figma throws `Component set has existing errors` from that getter — observed live to convert a **fully successful mutation** into a reported failure. The mutate phase must wrap result construction: on a `variantGroupProperties` throw, return the success result *without* that field plus a `warning` string — never an error after the set exists. The OQ1/OQ2 rejects make the known error states unreachable; the guard covers unknown ones.

**Required prevalidation.**

Before any mutation:

- `components` is a non-empty array.
- Component node IDs are unique within `components`. *(The same component listed twice passes variant-uniqueness whenever its two `propertyValues` rows differ, then makes `combineAsVariants` throw after renames — a prevalidatable failure.)*
- `properties` is a non-empty array.
- Property names are non-empty strings.
- Property names are unique after exact string comparison.
- Every component node exists.
- Every component is inside the current scope.
- Every component name exactly matches the caller-provided `nodeName`.
- Every component type is exactly `COMPONENT`.
- No component or locked ancestor is locked.
- No component is inside an `INSTANCE` interior.
- No component is remote/shared-library-backed (`remote === true`). *(Defense-in-depth: the scope check already excludes remote components, which are never inside the scope subtree — see peer-review item 5.)*
- Every component has `propertyValues.length === properties.length`.
- Every computed variant combination is unique.
- Every component has a containing page.
- All components are on the same containing page, and `plan.containingPage` is that page. **Resolved statically (rev 4):** in-scope components are single-page *by construction* — the scope root is a page or a node within one, and every valid component is a descendant of it — so the cross-page case is unreachable through the scope gate. Keep the check as cheap defense-in-depth; no live test is needed. *(Closes peer-review item 4.)*
- If `parentId` is provided: parent exists, parent is in scope, `parentNodeName` matches, parent supports `appendChild`, parent and ancestors are not locked, and parent is neither an `INSTANCE` node itself nor inside an instance interior (rev 5 parent-is-instance rule).
- **If `parentId` is provided: the parent is not one of the input components and not a descendant of any input component** (`isAncestorOf` in `figma_plugin/utils/nodeUtils.ts` already exists for this). Without this check, every other precheck passes and `appendChild` throws *after* the set exists — the exact failure class D5 eliminates.
- Property values are non-empty strings containing neither `=` nor `,`. *(OQ1 — resolved rev 4: live-verified that such values yield a corrupted “existing errors” component set plus a post-mutation throw.)*
- No component is already a member of a `COMPONENT_SET`. *(OQ2 — resolved rev 4: live-verified that Figma rips the member out of its old set, leaving it degenerate, and mangles the member’s variant identity.)*

**Error strings.**

Use exact, agent-actionable errors:

- Wrong type: `create_component_set: '${node.name}' (${node.id}) must be a COMPONENT, got ${node.type}.`
- Locked component: existing locked-layer error via `assertNotLocked(component)`.
- Remote component: `create_component_set: '${node.name}' is a remote shared-library component and cannot be combined into a local component set.`
- Duplicate variant: `Operation Denied: Duplicate variant combination '${variantName}' across components '${firstName}' and '${secondName}'. Each component in a set must have a unique property-value combination.` — *this exact string already exists in the handler (`componentHandlers.ts`); it is **relocated** to the plan phase, not newly added.*
- Duplicate component ID: `create_component_set: component '${node.name}' (${node.id}) is listed more than once in components.`
- Invalid property value: `create_component_set: property value '${value}' for '${node.name}' must be non-empty and must not contain '=' or ','.`
- Set-member component: `create_component_set: '${node.name}' is already a variant in component set '${set.name}'. Combining it would break that set.`
- Parent cannot accept children: `create_component_set: parent '${parent.name}' (type ${parent.type}) cannot contain a component set.`
- Parent-cycle: `create_component_set: parent '${parent.name}' is one of the components being combined (or is inside one) and cannot receive the component set.`
- Cross-page components: `create_component_set: all components must be on the same page before combining variants.`

**Tests.**

Unit tests:

- Empty `components` rejects before any node rename or `combineAsVariants` call.
- Empty `properties` rejects before any node rename or `combineAsVariants` call.
- Duplicate property names reject before any node rename or `combineAsVariants` call.
- Empty property names reject before any node rename or `combineAsVariants` call.
- If component #2 is wrong type, component #1 keeps its original name and `combineAsVariants` is not called.
- If component #2 has a mismatched `nodeName`, component #1 keeps its original name and `combineAsVariants` is not called.
- If component #2 is outside scope, component #1 keeps its original name and `combineAsVariants` is not called.
- If two components have duplicate variant values, no component names change and `combineAsVariants` is not called.
- If the same component ID appears twice in `components`, the call rejects before any rename and `combineAsVariants` is not called.
- Empty property values, or values containing `=` or `,`, reject before any rename (OQ1).
- A component that is already a `COMPONENT_SET` member rejects before any rename (OQ2).
- If `variantGroupProperties` throws during result construction after a successful combine, the tool returns success with a warning instead of an error (guarded result read).
- If any component has the wrong `propertyValues` count, no component names change and `combineAsVariants` is not called.
- If parent is locked or has a locked ancestor, no component names change and `combineAsVariants` is not called.
- If parent is inside an instance interior, no component names change and `combineAsVariants` is not called.
- If parent is outside scope or has a mismatched `parentNodeName`, no component names change and `combineAsVariants` is not called.
- If parent lacks `appendChild`, no component names change and `combineAsVariants` is not called.
- **If `parentId` is one of the input components, or a descendant of one, the call rejects before any rename and `combineAsVariants` is not called.**
- If a component is locked or has a locked ancestor, no mutation occurs.
- If a component is inside an instance interior, no mutation occurs.
- If a component is remote, no mutation occurs.
- If components are on different pages, no mutation occurs unless this case is explicitly live-tested and allowed.
- Happy path still renames variants, calls `combineAsVariants`, renames the component set, reparents it if requested, and returns the expected `COMPONENT_SET` result.
- If `combineAsVariants` throws after names are assigned but before a component set is created, original names are restored. **Same for a rename that throws mid-loop** (simulated TOCTOU removal).
- Every *prevalidatable* placement failure is rejected in the plan phase before any rename. *(Residual R1 TOCTOU placement failures are not testable as an absolute and are documented, not asserted: the error is reported and the set remains at the `combineAsVariants` location. v2.3.2 does not add a general post-component-set rollback layer.)*

Manual verification:

- Run `create_component_set` with one bad type after one valid component and confirm no partial rename.
- Run with duplicate property combinations and confirm no partial rename.
- Run with a locked parent and confirm no partial rename.
- **Run with `parentId` pointing at one of the input components and confirm the cycle rejection with no renames.**
- Run happy path and confirm resulting variant names and set properties.

---

## §3. Creation handlers validate parents before node / instance creation, with unconditional cleanup (P1)

**The bug.** Some creation handlers create Figma objects before verifying the final parent exists and can accept children. If a late parent check fails, the handler can leave a newly-created object in the document. Independently of ordering, *any* post-construction configuration step can throw and orphan the object.

**Current behavior.**

- `createFrame` calls `figma.createFrame()`, configures the frame, and only later checks `parentId`, resolves the parent, and checks `appendChild`.
- `createText` calls `figma.createText()`, configures text/fills, and only later checks `parentId`, resolves the parent, and checks `appendChild`.
- `createNodeFromSvg` calls `figma.createNodeFromSvg(params.svg)` before checking whether `parentId` is present, the parent exists, or the parent supports children.
- `createComponentInstance` resolves/imports a component and calls `component.createInstance()` before checking whether `parentId` is present, the parent exists, or the parent supports children — and its `catch` block re-wraps the error **without removing the created instance**.
- `createShape` already resolves and checks the parent before constructing the shape; keep this behavior and add regression coverage.

**v2.3.2 change.**

Add a shared handler-level helper, separate from dispatcher permission/scope validation:

```ts
async function resolveAppendableParent(parentId: string, command: string): Promise<ChildrenMixin & BaseNode> {
  if (!parentId) throw new Error(`${command}: missing parentId parameter.`);
  const parent = await figma.getNodeByIdAsync(parentId);
  if (!parent) throw new Error(`${command}: parent node not found with ID: ${parentId}.`);
  if (!("appendChild" in parent)) {
    throw new Error(`${command}: parent '${parent.name}' (type ${parent.type}) cannot contain children.`);
  }
  return parent as ChildrenMixin & BaseNode;
}
```

Then use it before object construction:

- `createFrame`: resolve parent first, then `figma.createFrame()`, configure, append.
- `createText`: resolve parent first, then `figma.createText()`, configure, append.
- `createNodeFromSvg`: validate `svg`, resolve parent, then `figma.createNodeFromSvg()`, configure, append.
- `createComponentInstance`: require `parentId`, resolve parent, then resolve/import the component, then call `component.createInstance()`, configure, append. **(OQ3 — resolved rev 6, option c):** the catch-all `Error creating component instance: …` wrapper is **removed**; the only targeted wrap is around `importComponentByKeyAsync` (W1); `COMPONENT_SET` ids are **rejected with a default-variant pointer** (W2 — also fixing the latent `TypeError`: the current type check admits `COMPONENT_SET` but `createInstance()` exists only on `ComponentNode`); all handler-authored messages move to the `create_instance:` prefix family (W3/W4). Parent-before-component error precedence is the intended behavior when both `parentId` and `componentId`/`componentKey` are missing.
- `createShape`: keep parent-first behavior and add regression tests to prevent future drift.

**Unconditional cleanup (D6).** In every creation handler, wrap all post-construction configuration and the append in `try/catch`; on failure, `node.remove()` (guarded by `removed !== true`) before rethrowing. Parent-first ordering removes the *parent-related* orphan cases, but configuration (resize, fills, `setCharacters`, layout properties) always runs after construction and can throw — cleanup is therefore required regardless, not only “if construction must occur first.”

> [!NOTE]
> **`createText` failure surface.** The existing font-load `try/catch` in `createText` deliberately swallows font errors and falls back (unchanged in this release — altering it would be new behavior out of scope). The simulated-configuration-failure test must therefore hook a **non-swallowed** step (e.g. `setCharacters` or the fills assignment), not the font load.

**Tests.**

> [!NOTE]
> **Test layer.** The missing/nonexistent-parent cases below are **direct handler-call tests** (import the handler and invoke it, as the existing suite already does for batch handlers). Through the dispatcher, a nonexistent or missing parent already fails earlier as `PARENT_OUTSIDE_SCOPE` — `checkScopeAccess` resolves the parent first — so the handler’s `not found` branch is defense-in-depth, reachable only via direct calls or TOCTOU. Do not write end-to-end tests expecting the `${command}: parent node not found` message.

- Missing `parentId` for frame/text/svg/component-instance throws before the create method is called (direct handler call).
- Nonexistent parent throws before the create method is called (direct handler call).
- Non-appendable parent throws before the create method is called (direct handler call).
- Valid parent still creates and appends the node / instance.
- For SVG, invalid/missing SVG string still errors before parent lookup; valid SVG with a bad parent errors before `figma.createNodeFromSvg`.
- Simulated configuration error after node / instance creation removes the newly-created object before returning the error (all four handlers).
- Simulated post-clone positioning/reparent failure removes the clone (`cloneNode` cleanup wrapper — D6).
- `create_shape` regression tests prove parent validation still occurs before `figma.createRectangle`, `figma.createEllipse`, `figma.createPolygon`, or `figma.createStar`.
- `create_instance` with a `COMPONENT_SET` id rejects before any `createInstance` call, and the error names the set’s `defaultVariant` (name + id) as the retry target (OQ3/W2).
- Simulated `importComponentByKeyAsync` failure surfaces the W1 wrap: key, raw Figma message, and recovery guidance in one `create_instance:`-prefixed error.
- No handler-authored `create_instance` error carries the removed `Error creating component instance:` prefix (regression against reintroduction).

---

## §4. Executable safety matrix and drift prevention (P1)

**The gap.** `SAFETY.md` is central to the project’s trust story, but it can drift from dispatcher behavior. v2.3.2 should prevent another release where the matrix claims a locked/instance/batch guard that the code path does not enforce.

**v2.3.2 change.**

Per **D7**, implement the **test-only contract table** (the source-of-truth-with-generation pattern is deferred; see D7 for the trade-off record):

Create `src/mcp_server/tests/unit/figma_plugin/safetyContract.test.ts` with a command → expected-gates table, exercising the dispatcher through the **existing harness** (mocked `figma` global + `ui.onmessage` dispatch — the pattern established in `atomicityAndValidation.test.ts`; no new mocking infrastructure is required).

For v2.3.2, the gate categories the contract encodes are:

- `nodePerm`
- `scope`
- `name`
- `parentScope`
- `parentName`
- `lockedTarget`
- `lockedParent`
- `instanceInteriorTarget`
- `instanceInteriorParent`
- `scopeRootPreservation`
- `remoteAsset`
- `batchPrevalidation`
- `handlerPrevalidationBeforeMutation`

**Scope qualification (D7).** These generic categories are the contract’s coverage. Bespoke, tool-specific gates documented in `SAFETY.md` Part B (§5 value typing, §8 FILL-parent, §9 transform rules, §13 index bounds, cyclic reparent, mixed-font handling, …) are **not** re-encoded; each contract row carries a reference to the existing suite that tests them. “Full coverage” for v2.3.2 means: every Part B write row exists in the contract table with its generic gates asserted — **and the two stay in sync mechanically (OQ4, resolved rev 7)**: the contract test parses each Part B row’s `·`-separated gate shorthand, maps generic tokens to the 13 categories via a small alias table (bespoke `§`-tagged tokens go to an explicit ignore set; unknown tokens fail the test), and diffs **both directions** — a Part B gate missing from the table fails (no silent weakening), and a table gate missing from Part B fails (no silent strengthening; D9).

**Tests.**

The safety contract test must prove at least:

- Every tool listed in `SAFETY.md` Part B has a corresponding contract-table entry (row-name consistency check).
- Every write tool rejects when node-edit permission is missing, unless it is a variable/style global asset command gated by its own permission axis.
- Every scope-bound write rejects when there is no linked scope.
- Every exact-name write rejects on name mismatch and calls no handler mutation.
- Every claimed locked guard rejects locked target/parent and locked ancestors, then calls no handler mutation.
- Every claimed instance-interior guard rejects instance interior target/parent and calls no handler mutation.
- Every claimed scope-root-preservation guard rejects edits/deletes/reparents of the scope root.
- Every claimed remote-asset guard rejects remote variables/styles/components before mutation.
- Every claimed batch prevalidation rejects an invalid later item without mutating an earlier valid item.
- Handler-level prevalidation tests cover `create_frame`, `create_text`, `create_svg`, `create_shape`, and `create_instance` for parent validation before creation and cleanup on failure.
- The contract includes explicit rows for `node_set_effects`, `node_clone`, `create_svg`, `create_component_set`, `create_frame`, `create_text`, and `create_instance`, because these are the v2.3.2 regression targets.
- The contract includes negative tests for handler-not-called / Figma-create-method-not-called for each guard that claims pre-mutation enforcement.
- Token-diff (OQ4): every generic gate token in a `SAFETY.md` Part B write row maps to an asserted contract gate for that tool, and vice versa; unknown tokens fail with an actionable message; bespoke tokens are ignore-listed with a pointer to their covering suite.

CI impact:

- **None required for test execution.** Files under `src/mcp_server/tests/` are picked up automatically by both CI’s bare `bun test` and the package script `bun run test` (`bun test src/mcp_server/tests`). Do **not** place tests in a repo-root `tests/` directory — they would run in CI but silently not run via `bun run test`.
- Add `check:versions` to CI (see D2/§5).

---

## §5. Code-backed README, version sync, and safety documentation cleanup (P1)

**The gap.** Some concrete README / `SAFETY.md` safety bullets currently outpace the dispatcher and handler behavior: locked-layer, instance-interior, shared-library, and all-or-nothing batch claims are not uniformly enforced by the audited code paths. Version metadata has drifted on three surfaces (`ui.html` 2.2.0, `server.json` 2.0.0, `manifest.json` 2.0.0) against `package.json` 2.3.1. v2.3.2 should make the claims test-backed and the versions mechanically synced.

**v2.3.2 change.**

Documentation updates:

- `SAFETY.md`
  - Change “Applies to: v2.3.1” to v2.3.2.
  - Update Part B matrix after the code fixes — including the **`node_clone` row**, which changes from `locked(source)` to the full extended stack (source locked/instance + parent scope/locked/instance/appendable) and should be annotated as a v2.3.2 **contract extension** (D9).
  - Note under G1 that the `node_clone` scope escape (clone of the scope root landing outside scope) is closed as of v2.3.2.
  - Clarify batch atomicity per **D5**: invalid inputs abort before mutation; residual R1 TOCTOU placement failures degrade to reported errors; no general Figma transaction layer is promised.
  - Ensure every matrix row has a matching safety-contract test entry (generic gates; bespoke gates referenced).

- `README.md`
  - Keep product positioning if desired, including “Safer than Figma Itself.”
  - Update the supporting bullets so each concrete claim is true after v2.3.2 and covered by tests: scoped edits, exact-node verification, locked/instance/shared-library protections, and no partial batch mutation for batch tools. **Expected outcome: after §1/§2 land, both currently-unenforced bullets become true — no bullet should need removal** (D8). Remove any bullet that still is not implemented and tested.

- `figma_plugin/ui.html` + `figma_plugin/build.js`
  - Per **D2 option (b)**: remove the hard-coded `Version: 2.2.0` string; inject `__PLUGIN_VERSION__` from `package.json` via esbuild `define` in `build.js`; `main.ts` posts the version to the UI on startup; `ui.html` renders it dynamically with a `—` placeholder pre-handshake. Drift is then caught by the existing `check:plugin` rebuild+diff.

- `server.json` / `manifest.json`
  - Bump both to `2.3.2` (`server.json` has **two** `version` fields).

- `CHANGELOG.md`
  - Add a v2.3.2 entry covering: guard parity (`node_set_effects`, `create_svg`), the **`node_clone` scope-escape fix and the resulting scope-root-clone denial** (behavior change), `create_component_set` atomicity incl. the parent-cycle precheck and the **removal of the silent reparent skip** (behavior change: silent skip → hard prevalidation error), create-parent prevalidation with unconditional cleanup, safety-contract tests, docs/claims cleanup, and version metadata sync across all four surfaces.

**Tests / checks.**

- Add `check:versions` (CI): `package.json` ↔ `server.json` (both fields) ↔ `manifest.json` must match.
- Plugin version drift is covered by the existing `check:plugin` (rebuild + `git diff`) once the `define` injection lands.
- Markdown link check remains in CI.

---

## §6. `channel_join` output-schema conformance (P0 — found live in rev 4)

**The bug.** `channel_join` declares a strict `z.object` output schema but spreads the plugin’s entire connect payload into the result (`...payload` in `src/mcp_server/tools/channel.ts`). In page-scope and read-only modes the payload contains `pageCount` and `pages` (node mode: `node`) — none declared — so the SDK rejects the tool’s own **successful** result with `MCP error -32602: Structured content does not match the tool's output schema`, and the client never gets a usable join. Observed live (2026-07-04): joining a page-scoped session failed twice through the MCP tool; a direct-relay client (the AS6 schema-bypassing path) confirmed the identical payload succeeds plugin-side. This blocks **all** MCP-side usage for page/read-only sessions, and it contradicts `_result.ts`’s own documented convention (“schemas allow extra keys (`.loose()`)”) — which **no** tool file actually implements today.

**v2.3.2 change.**

- Make `channel_join`’s `outputSchema` tolerate extra keys (zod `.loose()`/passthrough), or stop spreading the payload and declare its full shape (incl. `pageCount`, `pages`, `node`). Either satisfies the fix; the loose schema matches the documented convention.
- Audit every other tool’s `outputSchema` against its handler’s real return shapes — the same drift can bite any tool whose handler returns document-dependent fields — and enforce the `_result.ts` convention repo-wide.
- Extend the contract-seam tests to validate each tool’s `structuredContent` against its own declared output schema for representative live-shaped payloads (page-mode connect payload included), so this drift class fails CI.

**Tests.**

- `channel_join` result with a page-mode payload (`pageCount` + `pages`) passes output-schema validation.
- Node-mode (`node` field) and read-only payloads pass.
- Contract-seam sweep: every registered tool’s representative results validate against its declared output schema.

---

## Documentation impact

Update the operational guidance used by both humans and agents:

- **`SAFETY.md`** — v2.3.2 safety contract, executable matrix, batch semantics, `node_clone` contract extension.
- **`README.md`** — safety bullets aligned with implemented guards and tests; version/tool table if needed.
- **`skills/figma-edit/references/error-playbook.md`** — add recovery guidance for: locked/instance rejections on `create_svg`, `node_clone`, and `node_set_effects`; the **scope-root clone denial** (recovery: ask the user to re-scope to the parent, then clone); the **parent-cycle rejection** on `create_component_set` (recovery: choose a parent outside the combined components, or omit `parentId` and place the set afterwards with `node_insert_child`); duplicate variant rejection; parent-not-appendable creation errors; the residual late-placement case (set left at the combine location — finish placement with `node_insert_child`); the `create_instance` remote-import failure (verify key / enable library) and `COMPONENT_SET`-id pointer error (rev 6); plus a single global note that v2.3.2 creation failures never leave orphans (D6).
- **`skills/figma-edit/references/workflows.md` / `tool-selection.md`** — update component-set workflow: validate component names/types and unique variant combinations before creating a component set; never pass one of the combined components as the parent.
- **MCP resources / generated manifest** — regenerate if any tool descriptions or guide resources change.

---

## Testing & rollout

**Build:**

- Run `bun run build:all`.
- Run plugin build and `check:plugin` (now also covers the injected plugin version).
- Run `check:versions` and the generated-file checks.
- Confirm dist binaries still resolve under the existing package smoke tests.

**Unit tests** (all under `src/mcp_server/tests/unit/figma_plugin/`):

- Dispatcher guard tests for `node_set_effects`, `node_clone`, `create_svg` covering permission, scope, exact name, locked target/parent/ancestor, instance-interior target/parent, the scope-root clone case, and no handler call on rejection.
- Component-set prevalidation and partial-rename tests covering wrong type, mismatched names, out-of-scope components, locked components/parents, instance interiors, remote components, duplicate variant combinations, bad parent, **parent-cycle**, cross-page behavior, `combineAsVariants` throw, mid-loop rename throw, and happy path.
- Create-handler no-orphan tests for `create_frame`, `create_text`, `create_svg`, and `create_instance` (parent precedence via direct handler calls; cleanup on simulated configuration failure), plus parent-first regression tests for `create_shape`.
- Safety contract matrix tests covering all documented write commands (generic gates).

**Manual verification in Figma:**

1. Link scope to an editable frame.
2. Try `node_set_effects` on a locked node; confirm structured locked error and no effect change.
3. Try `create_svg` under a locked parent and under an instance interior; confirm no SVG node is created.
4. Try `node_clone` on a locked node and on a node inside an instance; confirm no clone is created.
5. **Try `node_clone` on the scope root itself; confirm the structured denial and that no clone appears outside the scope.**
6. Try `create_component_set` with a bad second component; confirm the first component keeps its original name.
7. Try `create_component_set` with duplicate variant values; confirm no component names change.
8. Try `create_component_set` with a locked parent and a non-appendable parent; confirm no component names change.
9. **Try `create_component_set` with `parentId` set to one of the input components; confirm the cycle rejection and no renames.**
10. Try `create_text` / `create_frame` / `create_svg` / `create_instance` with bad parent IDs and non-appendable parents; confirm no orphan nodes or instances appear on the page.
11. Trigger a create-handler configuration failure after object creation; confirm the created object is removed. *(The MCP Zod layer blocks the malformed params that cause such failures, so drive the plugin socket directly — AS6 explicitly contemplates schema-bypassing clients — e.g. a raw `create_frame` with `layoutMode: "DIAGONAL"`, which passes the dispatcher and throws at configuration. If a raw-socket harness is impractical, rely on the unit cleanup tests and skip this manual step.)*
12. Confirm the plugin About tab shows `2.3.2` (via the version handshake).

**Version:**

- Bump `package.json`, `server.json` (both fields), and `manifest.json` to `2.3.2`.
- Update `CHANGELOG.md`.
- Tag release only after CI (including `check:versions`) and manual verification pass.

---

## Peer review checklist

The adversarial review of 2026-07-04 ([critique.md](./critique.md)) resolved several items; the rest remain as **implementation verifications** (they adjust prechecks, not product decisions):

| # | Claim to verify | Status after 2026-07-04 review | Required disposition |
| :- | :- | :- | :- |
| 1 | `node_set_effects` can be changed to `validateSingleNodeWrite(...checkLocked)` without blocking legitimate unlocked effects | **Confirmed live (rev 5)** — `node_set_effects` mutated a locked node and a child of a locked container; `node_rename` on the same locked node was correctly denied (the guard works where wired); identical pattern to 10+ sibling property writes | Implement |
| 2 | `node_clone` inside an instance is a structural edit and should be blocked | **Confirmed live (rev 4)** — cloning an instance-interior child produced a raw Figma `appendChild` error *after* `node.clone()` and left an orphan on the page; the structured guard is required (D9: no relying on raw Figma errors) | Implement |
| 3 | `create_svg` under locked/instance parent is currently possible enough to require dispatcher guard | **Confirmed live (rev 4 + rev 5)** — non-appendable parent errored and orphaned the SVG (rev 4); `create_svg` then **created a node inside a locked container** (rev 5) — Figma’s API ignores locks entirely, so only the plugin guard can enforce them | Implement (§1 + §3 together) |
| 4 | `combineAsVariants` requires same-page components | **Resolved statically (rev 4)** — cross-page inputs are unreachable: every in-scope component is a descendant of the single-page scope root. Same-page check kept as defense-in-depth | Closed |
| 5 | Remote main components can appear in `create_component_set` inputs | **Resolved — keep as defense-in-depth.** The scope check already excludes remote components (they are never inside the scope subtree); the explicit remote gate is future-proofing, no live test needed | Keep test as future-proof |
| 6 | Parent prevalidation before `figma.createText()` does not break font loading / text setup | **Mitigated** — cleanup is now unconditional (D6), so any regression cannot orphan; verify the happy path live | Implement + live-verify |
| 7 | Parent prevalidation before `createComponentInstance()` does not break local or remote component-instance creation | **Mitigated** — same as #6 | Implement + live-verify |
| 8 | README concrete safety bullets are backed by implementation and tests | **Verified** — the two flagged bullets are unenforced today and become true after §1/§2; no bullet removal expected | Implement, then confirm bullets |

---

## Provenance — issue verification

Every issue below was confirmed by static audit before this PRD was written; rows marked *(rev 2)* were added by the 2026-07-04 adversarial review:

| Issue | Verified at | Finding |
| :- | :- | :- |
| Package version | `package.json` | Current version is `2.3.1`; v2.3.2 should bump from there. |
| Safety matrix claims | `SAFETY.md` | Guarantees include all-or-nothing batches and respect for locked/shared-library/instance-interior protections; Part B lists specific guard stacks. |
| `node_set_effects` locked guard mismatch | `figma_plugin/src/main.ts` | Dispatch checks permission, scope, and name, then calls `setEffects`; no locked guard is present. |
| `create_svg` parent guard mismatch | `figma_plugin/src/main.ts`, `figma_plugin/handlers/vectorHandlers.ts` | Dispatch checks parent scope/name only; handler creates SVG before final parent existence/appendability checks. |
| `node_clone` locked/instance/parent mismatch | `figma_plugin/src/main.ts`, `figma_plugin/handlers/nodeCreators.ts` | Dispatch checks source scope/name only; handler clones before checking parent append path. |
| `node_clone` scope escape *(rev 2)* | `figma_plugin/src/main.ts`, `figma_plugin/handlers/nodeCreators.ts` | Cloning the scope root passes the source-scope check and appends the clone **outside** the scope subtree — a live G1 violation; the clone is then uneditable and undeletable by the session. |
| `create_component_set` partial mutation | `figma_plugin/src/main.ts`, `figma_plugin/handlers/componentHandlers.ts` | Dispatcher misses type/locked/duplicate validations; handler renames components inside the validation loop. |
| `create_component_set` silent reparent skip *(rev 2)* | `figma_plugin/handlers/componentHandlers.ts` | Post-combine reparent is silently skipped when the parent lookup fails; success is reported with `parentId` ignored. |
| `create_component_set` parent-cycle hole *(rev 2)* | `figma_plugin/handlers/componentHandlers.ts` | `parentId` naming one of the combined components (or a descendant) passes every planned precheck and makes `appendChild` throw **after** the set exists. |
| Creation handlers mutate before parent validation | `figma_plugin/handlers/nodeCreators.ts`, `figma_plugin/handlers/vectorHandlers.ts`, `figma_plugin/handlers/componentHandlers.ts` | `createFrame`, `createText`, `createNodeFromSvg`, and `createComponentInstance` create/configure objects before resolving/checking parent; `createComponentInstance`’s catch does not remove the created instance. |
| Plugin UI version drift | `figma_plugin/ui.html`, `package.json` | UI About tab says `2.2.0` while package version is `2.3.1`. |
| Registry/bundle manifest version drift *(rev 2)* | `server.json`, `manifest.json` | `server.json` (both `version` fields) and root `manifest.json` read `2.0.0` — public surfaces, staler than the plugin UI. |
| Test-suite location *(rev 2)* | `src/mcp_server/tests/unit/figma_plugin/` | The dispatcher test harness (mocked `figma`, `ui.onmessage` dispatch) already exists here (`atomicityAndValidation.test.ts`); there is no repo-root `tests/` directory, and `bun run test` only scans `src/mcp_server/tests`. |
| README safety-bullet drift | `README.md`, `SAFETY.md` | README safety bullets claim locked/shared-library/instance-interior protection and all-or-nothing batches; the audited code paths do not yet enforce every bullet consistently. |
| `node_clone` scope escape — **demonstrated live** *(rev 4)* | Live session “MCP Test”, page scope `0:1` | `node_clone` of the scope-root page succeeded and created a full duplicate page **outside scope**; `node_delete` of the duplicate was then denied (`OUTSIDE_SCOPE`) — the agent cannot undo its own escape. |
| `create_svg` orphan — demonstrated live *(rev 4)* | Live session | Non-appendable in-scope parent → handler error + orphaned `FRAME` left on the page. |
| Instance-interior `node_clone` — demonstrated live *(rev 4)* | Live session | Raw Figma error `in appendChild: Cannot move node…` after `node.clone()`; orphaned copy left on the page; no structured denial. |
| `create_component_set` partial rename — demonstrated live *(rev 4)* | Live session | Wrong-type second component and duplicate-variant second component each left component #1 renamed (`State=A` / `State=X`) while the tool errored. |
| Late `variantGroupProperties` throw *(rev 4)* | Live session | Separator values and set-member reuse each produced a set whose result read threw `Component set has existing errors` **after** successful mutation. |
| `channel_join` output-schema failure *(rev 4)* | Live MCP client + `src/mcp_server/tools/channel.ts` | Strict `z.object` output schema + `...payload` spread → `-32602` on every successful page/read-only connect; join unusable through MCP. |
| `node_set_effects` locked mutation — demonstrated live *(rev 5)* | Live session | Applied a drop shadow to a locked node and to a child of a locked container; `node_rename` on the same locked node was denied — the guard exists but is not wired to effects. |
| `node_clone` locked mutation — demonstrated live *(rev 5)* | Live session | Cloned a locked node; the clone inherits `locked: true`, so the agent’s own `node_delete` is then denied — an undeletable artifact. |
| `create_svg` locked-parent mutation — demonstrated live *(rev 5)* | Live session | Created a node **inside** a locked container (Figma’s API ignores locks); the created child is then undeletable by the agent (locked ancestor). |
| Parent-is-instance guard hole *(rev 5)* | `figma_plugin/utils/nodeUtils.ts` (`findInstanceAncestor` excludes self) + live session | `create_svg` with an `INSTANCE` as parent passed every dispatcher check, then hit Figma’s raw `appendChild` error and orphaned the node — the hole affects every parent-gated tool. |
| `create_instance` `COMPONENT_SET` `TypeError` *(rev 6)* | `figma_plugin/handlers/componentHandlers.ts`, `@figma/plugin-typings` | The handler’s type check admits `COMPONENT_SET`, but `createInstance()` exists only on `ComponentNode` (`ComponentSetNode` exposes `defaultVariant` instead) — any set id throws `component.createInstance is not a function`, today rewrapped into the generic prefix. |

---

## Revision history

- **Rev 1** — original PRD (static audit findings).
- **Rev 2, 2026-07-04** — incorporates all 14 findings from [critique.md](./critique.md): added the parent-cycle precheck and qualified the D5 placement claim (options recorded); named the `node_clone` G1 scope escape and recorded the scope-root-clone denial decision (options recorded); corrected all test paths to `src/mcp_server/tests/unit/figma_plugin/` and referenced the existing harness; widened version sync to `server.json`/`manifest.json` and decided the injection mechanism (options recorded); made creation-handler cleanup unconditional; recorded the clone-parent-name decision and reworded the decision-status banner; fixed the §2 pseudocode (`scopeRoot` scoping, rename loop inside the restore path) and decided dispatcher-side plan orchestration (options recorded); qualified §4’s contract scope and decided the test-table pattern (options recorded); corrected the API Change Notice’s conformance-vs-extension framing for `node_clone`; marked the duplicate-variant string as relocated and mandated dead-branch cleanup; rephrased parent-precedence tests as direct handler tests with the dispatcher error-precedence note; declared priorities sequencing-only and coupled the two halves of the `create_svg` fix; documented the silent reparent skip as a fixed defect.
- **Rev 3, 2026-07-04** — follow-up pass: added component-ID uniqueness to §2 (prevalidation bullet, error string, unit test, coverage-map cells); specified `containingPage` derivation; extended D6 and the §1 dead-code rule to `cloneNode` (cleanup wrapper, removal of the unreachable position branch); made manual step 11 executable via a raw-socket trigger (AS6) or explicitly skippable; enumerated lockfile scope in D1; recorded **OQ1–OQ4** (variant-value validation, set-member components, `create_instance` error wrapper, gate-level contract drift) as open decisions with options, pros/cons, and recommendations.
- **Rev 4, 2026-07-04** — live verification against document “MCP Test” (page scope, via a direct relay client after the `channel_join` MCP tool failed): confirmed the G1 scope escape end-to-end (page duplicated outside scope, deletion denied), the `create_svg` orphan, the instance-interior `node_clone` raw-error-plus-orphan, and both partial-rename paths; **resolved OQ1 and OQ2 (reject, evidence-backed)**; closed peer-review item 4 statically (in-scope components are single-page by construction); added the guarded `variantGroupProperties` result read to §2; added **§6** for the newly found `channel_join` strict-output-schema P0. All test artifacts were deleted; one manual cleanup remains (the duplicated page created by the G1 demonstration).
- **Rev 5, 2026-07-04** — locked-layer live verification: confirmed `node_set_effects` mutates locked nodes and children of locked containers (control `node_rename` correctly denied on the same node), `node_clone` duplicates locked nodes (clone inherits `locked` — undeletable by the agent), and `create_svg` creates inside locked containers (Figma’s API ignores locks). Found and folded in the **parent-is-instance guard hole**: `findInstanceAncestor` excludes the node itself, so every parent-side instance check passes when the parent *is* an `INSTANCE` (live: raw Figma error + orphan through `create_svg`); §1/§2 now require `parent.type === "INSTANCE" || findInstanceAncestor(parent)` across all parent-gated tools. Effects were restored after each test; two locked test artifacts remain for manual cleanup (they are protected from the agent by the very guards under test).
- **Rev 6, 2026-07-04** — resolved **OQ3 as option (c)**: catch-all wrapper removed; targeted W1 wrap on `importComponentByKeyAsync` with key + recovery guidance; `COMPONENT_SET` ids rejected with a default-variant pointer, also fixing the latent `createInstance`-on-set `TypeError` (typings-verified); local-lookup and missing-parameter messages aligned to the `create_instance:` prefix family; auto-instantiating `defaultVariant` explicitly rejected (guessed intent per R2, new capability in a patch). Added §3 tests, a coverage-map row, a provenance entry, and error-playbook items. Only OQ4 remains open.
- **Rev 7, 2026-07-04** — resolved **OQ4 as option (b)**: the safety-contract test parses `SAFETY.md` Part B’s `·`-separated gate shorthand, maps generic tokens to the 13 categories via a small alias table (bespoke `§`-tagged tokens ignore-listed, unknown tokens fail), and diffs bidirectionally against the contract table — mechanically enforcing both halves of D9 (no silent weakening, no silent strengthening). All decisions in the PRD are now closed; v2.3.2 is fully specified.
