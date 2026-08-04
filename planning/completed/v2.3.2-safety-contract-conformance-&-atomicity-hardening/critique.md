# Adversarial Peer Review: v2.3.2 PRD (Safety Contract Conformance & Atomicity Hardening)

## Overview

The PRD's factual audit is **accurate**: all nine provenance findings were re-verified against the codebase and every one is real (see the verification table below). The release direction — close the gap between `SAFETY.md`'s promises and the dispatcher, make `create_component_set` atomic, and make the safety matrix executable — is the right priority for this project, whose entire value proposition ("Safer than Figma Itself") rests on those claims being true.

However, the review found one **concrete atomicity hole the PRD's own design cannot close as written** (the parent-cycle case in `create_component_set`), one **unlisted live safety violation** that the PRD fixes only incidentally (`node_clone` can escape the editable scope today), a **wrong test-directory path** used throughout, **version drift wider than the PRD reports**, and several internal inconsistencies between the spec text and the test requirements. None invalidate the release; all should be resolved before implementation starts.

---

## Part 1 — Claim-by-claim verification

### Provenance table (all 9 findings CONFIRMED)

| PRD claim | Verified at | Verdict |
| :- | :- | :- |
| `package.json` is `2.3.1` | `package.json:3` | ✅ Confirmed |
| Plugin UI About tab says `2.2.0` | `figma_plugin/ui.html:332` — `<p>Version: 2.2.0</p>` | ✅ Confirmed |
| `node_set_effects` lacks the locked guard | `figma_plugin/src/main.ts:743-747` — permission, scope, name, then `setEffects(params)`. No `assertNotLocked`. Meanwhile `SAFETY.md` B1 row claims `node-perm · scope · name · locked` | ✅ Confirmed — doc/code mismatch is real |
| `node_clone` lacks locked/instance/parent prevalidation | `main.ts:403-407` — permission, source scope, source name only. Handler (`nodeCreators.ts:438`) calls `node.clone()` before the parent-existence check at `:450-454`. `SAFETY.md` B1 claims `locked(source)` — not implemented | ✅ Confirmed |
| `create_svg` lacks parent locked/instance guards; handler creates before parent checks | `main.ts:736-741` — no `validateParentWrite`, no locked/instance checks. `vectorHandlers.ts:8` calls `figma.createNodeFromSvg` before `parentId` is even checked for presence (`:14`). `SAFETY.md` B3 claims `locked + instance-interior` | ✅ Confirmed. On failure the SVG node is orphaned on the current page |
| `create_component_set` can partially rename | Dispatcher (`main.ts:690-734`) checks exists/scope/name/propValues-count and parent exists/scope/name — no type, locked, remote, duplicate-variant, parent-locked, parent-instance, or parent-appendability checks. Handler (`componentHandlers.ts:780-802`) renames (`component.name = variantName`, `:799`) inside the same loop that validates type (`:782`) and duplicates (`:794`) | ✅ Confirmed — component #1 is renamed before component #2 is validated |
| `combineAsVariants` failure leaves renames | `componentHandlers.ts:809` — no try/catch, no restore | ✅ Confirmed |
| `createFrame`/`createText`/`createNodeFromSvg`/`createComponentInstance` mutate before parent checks | `nodeCreators.ts:209` vs `:271-280` (frame); `:355` vs `:386-395` (text); `vectorHandlers.ts:8` vs `:14-24`; `componentHandlers.ts:261` vs `:263-272` (instance — and its `catch` at `:289` re-wraps the error **without removing the instance**) | ✅ Confirmed |
| `createShape` is already parent-first | `nodeCreators.ts:58-68` — parent resolved and checked before any `figma.create*` | ✅ Confirmed — "keep + regression-test" is the right call |
| README safety bullets outpace code | `README.md:36-37` — "a batch with one bad target changes *nothing*" (false today for `create_component_set`) and "locked layers … insides of component instances are off-limits" (false today for `node_set_effects`/`node_clone`/`create_svg`) | ✅ Confirmed |
| `SAFETY.md` says "Applies to: v2.3.1" | `SAFETY.md:1,9` | ✅ Confirmed |

### Current-behavior descriptions in §1–§3

Every "Current behavior" paragraph was checked line-by-line against the code and is accurate, including the subtle claim that the `create_component_set` dispatcher *does* prevalidate existence/scope/name/count (it does, using the good `checkScopeAccessRef` single-resolution pattern) while missing everything else.

---

## Part 2 — Findings

### 1. CRITICAL GAP — D5's "no late parent-placement failure remains" is unachievable as specified, and the prevalidation list is missing the check that matters most

D5 and §2 assert that after prevalidation, *no* parent-placement failure can occur after `combineAsVariants` — and §2's test list demands a test proving it. But the required prevalidation list checks only: parent exists, in scope, name matches, `appendChild` present, not locked, not instance-interior. That does **not** make `plan.parent.appendChild(componentSet)` infallible:

- **The cycle case (concrete, reproducible):** call `create_component_set` with components A and B and `parentId = A` (or a descendant of A). Every listed precheck passes — A exists, is in scope, name-matches, is unlocked, is a `COMPONENT`, and `"appendChild" in A` is `true`. After `combineAsVariants`, A is *inside* the new set; `appendChild`-ing the set into its own descendant throws — **after** the set exists, exactly the failure class D5 claims to have eliminated, with no rollback permitted by D5.
- **Type-legality:** `"appendChild" in parent` proves the property exists, not that Figma will accept *this* child type under *this* parent (e.g. a component set under a `COMPONENT` parent). Figma's structural rules are the final arbiter.
- **TOCTOU:** `SAFETY.md` R1 already concedes the parent can be locked/deleted between validation and mutation.

> [!IMPORTANT]
> **Recommendation:** (a) Add to §2's prevalidation: *parent is not one of the input components and not a descendant of any of them* (the `isAncestorOf` helper in `figma_plugin/utils/nodeUtils.ts:189` already exists for this). (b) Soften the claim and the test to "no *prevalidatable* placement failure remains; residual TOCTOU/Figma-arbitration failures degrade per R1/R5" — an absolute "no late failure" is untestable and contradicts `SAFETY.md`'s own residual-risk model.

### 2. HIGH — The PRD misses the most serious live finding: `node_clone` can write *outside the editable scope* today

Clone the scope root itself: the source-scope check passes (`node.id === scopeRootId`), and the handler appends the clone to `node.parent` — which is **outside** the scope subtree. This is a standing violation of guarantee **G1** ("no node write outside the user-selected scope subtree"), strictly worse than the missing locked guards the PRD leads with, and the resulting clone can then be neither edited nor deleted by the agent.

The PRD's `validateCloneWrite` ("parent is in scope") fixes this — but only incidentally, and the PRD nowhere states:

- that this is a *current G1 escape*, which belongs in the bug statement and the changelog; and
- the resulting **behavior change**: cloning the scope root becomes impossible in v2.3.2 (its parent is by definition out of scope). That is the correct call, but it must be documented in `error-playbook.md` (agents will hit it) and acknowledged as an intentional capability removal rather than discovered in QA.

### 3. HIGH — Wrong test location throughout; the referenced "dispatcher suite" exists but not where the PRD says

The PRD repeatedly cites `tests/unit/figma_plugin/*` (§ scope table, §4, CI commands). **No `tests/` directory exists.** The actual convention is `src/mcp_server/tests/unit/figma_plugin/` (see `atomicityAndValidation.test.ts`, `annotationsAndVariables.test.ts`). This matters practically:

- `bun run test` executes `bun test src/mcp_server/tests` (`package.json:55`) — a file at repo-root `tests/` would run in CI (bare `bun test`) but **silently not run locally** via the package script.
- Good news the PRD doesn't mention: `atomicityAndValidation.test.ts` already contains exactly the infrastructure §1/§2/§4 need — a mocked `figma` global, a real import of `main.ts`, and tests that drive the actual dispatcher through `ui.onmessage`. §4's "minimum viable" pattern is therefore cheaper than the PRD implies. Cite it.

> [!IMPORTANT]
> **Recommendation:** Replace every `tests/unit/figma_plugin/` reference with `src/mcp_server/tests/unit/figma_plugin/`, and drop the "add `bun test <path>` to CI" step — files in the existing tree are picked up by both entry points automatically.

### 4. MEDIUM — Version drift is wider than the PRD reports; D2's check should cover all version surfaces

The PRD flags only `ui.html` (2.2.0). Also stale right now:

- `server.json:9` and `:14` — **2.0.0** (this is the MCP-registry manifest; a *public* surface, arguably worse than the plugin About tab);
- root `manifest.json:5` — **2.0.0**.

D1's "update any generated manifests" gestures at this but the provenance table, D2's CI check, and §5's test list all name only `package.json` ↔ `ui.html`. A version-sync check that ignores two of the four drifting surfaces will recreate this exact bug class next release.

> [!IMPORTANT]
> **Recommendation:** Make the D2 CI check assert `package.json === ui.html === server.json === manifest.json`. Note the mechanism constraint the PRD leaves implicit: `figma_plugin/` ships from the repo via `files` in `package.json`, and `build.js` never touches `ui.html` — so "build-time injection" must write the version into the committed `ui.html` and be verified with a regenerate+`git diff` check, mirroring `scripts/check-generated.ts` / `check:plugin`. Publish-time-only injection would ship a stale file.

### 5. MEDIUM — §3's spec text and §3's tests contradict each other on cleanup

The spec makes cleanup conditional: "*If* any handler must create an object before a later Figma-only validation can run, wrap … in try/catch." The test list makes it unconditional: "Simulated configuration error after node / instance creation **removes the newly-created object**." Since configuration (resize, fills, `setCharacters`, layout props) *always* runs after construction and can throw (e.g. invalid `layoutMode` value), the try/catch-remove wrapper is effectively **mandatory in all four handlers** even after the parent-first reorder. The spec should say so plainly; as written, an implementer can satisfy the spec text and fail the test list. (Related: `createText` currently *swallows* font errors at `nodeCreators.ts:366-368` — the "simulated configuration error" test needs a defined, non-swallowed failure point.)

### 6. MEDIUM — "All decisions recorded … No open questions remain" is contradicted twice by the PRD itself

- D3's `node_clone` bullet says parent exact-name handling must be "**explicitly decided** before cloning" — that is a deferral, not a decision, and §1's `validateCloneWrite` spec then silently omits any parent-name check. The de facto decision (no `parentNodeName` — the parent is implicit, being the source's own parent, so name verification adds nothing) is defensible; **write it down**.
- The peer-review checklist contains live-test-or-revise items (#4 cross-page `combineAsVariants`, #5 remote components, #6/#7 creation-reorder side effects). Those are open questions by definition. Fine to have — but then the "no open questions" banner is false. Reword to "no open *product* decisions; N implementation verifications remain."

### 7. MEDIUM — §2's pseudocode has a scoping bug and leaves the architectural layering ambiguous

`createComponentSet` calls `validateCreateComponentSetPlan(params, scopeRoot)` — `scopeRoot` is undefined in that function body, and handlers currently have **no access to dispatcher state** (scope/permissions live in `main.ts`; the module split is deliberate — `SAFETY.md`'s ground-truth hierarchy names the *dispatcher* as "the only layer an agent cannot bypass"). The PRD must decide: plan-phase validation lives in the dispatcher (consistent with the documented trust model and with how every other batch tool works), or the handler imports `getPluginState()`/receives the scope root as an argument (a new pattern that weakens the "gates live in the dispatcher" story §4 is about to codify). Recommend the former.

Two smaller pseudocode gaps:

- The rename loop (`item.node.name = item.variantName`) sits **outside** the try/catch — if a rename itself throws (TOCTOU: a component removed between plan and mutate), earlier renames stick. Wrapping the rename loop in the same restore path costs three lines.
- The restore condition `item.node.removed !== true` is correct; keep it.

### 8. LOW-MEDIUM — §4's scope is internally ambiguous and potentially much larger than a patch release

§4 requires "Every `SAFETY.md` Part B write row has a matching test-contract entry" — Part B has ~30 write rows, many with bespoke gates far outside the 13 generic categories the PRD defines (`FILL needs auto-layout parent §8`, index bounds §13, cyclic reparent §3, INSTANCE_SWAP value validation §5, mixed-font handling §10 …). Either the contract covers only the 13 generic gate categories (then "every row has an entry" needs qualifying: *generic gates asserted; bespoke gates referenced to their existing tests*), or the scope balloons well beyond a patch. Also note the "preferred" pattern — generating Part B from a contract object — would have to reproduce Part B's dense prose annotations and § cross-references; a full generation is a poor fit. The snapshot/consistency-check variant ("minimum viable" + a test that every Part B row name appears in the contract table) is the right cost/benefit for v2.3.2. The PRD's own test list mixes requirements from both patterns ("generated section or snapshot up to date in CI") without marking which apply — mark them conditional.

### 9. LOW — API Change Notice overstates what `SAFETY.md` "already promised" for `node_clone`

`SAFETY.md` B1 promises only `locked(source)` for `node_clone`. The PRD adds instance-interior *and* five parent-side guards. Those additions are correct (they follow from G1/G7 in spirit — see Finding 2), but they are **contract extensions**, not conformance; the notice's "now enforce the guard stacks already promised by `SAFETY.md`" is only true for `node_set_effects` and `create_svg`. Since D8/D9 make claim-accuracy a release principle, the PRD should hold itself to it.

### 10. LOW — The duplicate-variant error string is presented as new but already exists verbatim

`componentHandlers.ts:795` already throws the exact string §2 specifies (`Operation Denied: Duplicate variant combination …`). The v2.3.2 change is *when* it fires (plan phase, before any rename), not the message. Worth one clarifying word so a reviewer doesn't think the string is a new surface. Same class of note: §1's "missing parent" message (`node_clone: '${node.name}' has no parent…`) differs from the handler's existing `Cloned node ${nodeId} has no parent…` — once the dispatcher validator lands, the handler's version becomes dead code; delete or align it rather than shipping two variants.

### 11. LOW — Dispatcher error precedence makes some §1/§3 tests untestable as phrased

`validateParentWrite`'s scope check resolves the parent; a **nonexistent** parent therefore fails as `PARENT_OUTSIDE_SCOPE` (and a missing `parentId` likewise), never as a "not found" error — the handler's `resolveAppendableParent` "not found" branch is unreachable through the dispatcher for `create_frame`/`create_text`/`create_instance`. The §3 tests for missing/nonexistent parents must call the handlers **directly** (the existing test files already do this for batch handlers — follow that pattern), and the PRD should not imply those cases produce the new `${command}: parent node not found` message end-to-end.

### 12. LOW — Performance note: prevalidation multiplies `getNodeByIdAsync` calls; the plan object should resolve each node exactly once

`validateSingleNodeWrite` already resolves the same node 3–4× (inside `checkScopeAccess`, `verifyNodeName`, then again for the guard checks); `validateCloneWrite` as specced adds ~5 more async lookups per call. For `create_component_set` the dispatcher loop already demonstrates the right pattern — resolve once, then use `checkScopeAccessRef`/reference checks. The §2 plan phase should carry resolved node references in `ComponentSetPlan` (it does) **and be the only resolution pass** — i.e. don't keep the existing dispatcher loop *and* add a second resolution loop in the plan builder. Not a user-visible perf risk at realistic sizes, but it doubles the TOCTOU window for free.

### 13. LOW — Priority labels don't govern anything, and one fix is split across priorities

The coverage map states every row "must have both an implementation change and a regression test **before the release can ship**" — which makes the P0/P1 distinction decorative. More practically: `create_svg`'s complete fix is split between §1 (P0, dispatcher guards) and §3 (P1, handler creates-before-parent-check). Shipping §1 alone still leaves the orphan-node bug (a non-appendable in-scope parent passes the dispatcher and orphans the SVG). If priorities are meant to permit staged landing, restate them per-behavior, not per-file-layer.

### 14. NOTE — Silent-failure bug in the current reparent path, fixed but unmentioned

Today `createComponentSet` **silently skips** reparenting when the parent lookup fails post-combine (`componentHandlers.ts:818-823` — `if (parent) { … }` with no else): the tool reports success while ignoring the caller's `parentId`. The plan-phase design fixes this; add it to the bug statement and CHANGELOG so the behavior change (silent-skip → hard error at prevalidation) is on record.

---

## Part 3 — Are the requirements necessary? (D1–D9 value assessment)

| Decision | Verdict | Notes |
| :- | :- | :- |
| **D1** version bump | Necessary, trivial | Extend to `server.json` + root `manifest.json` (Finding 4) |
| **D2** UI version sync + CI | Valuable | Right instinct; scope to *all* version surfaces or the check is theater |
| **D3** guard parity | **Core of the release** | All three mismatches verified real; `validateSingleNodeWrite`/`validateParentWrite` reuse is the correct, low-risk mechanism (identical to 10+ sibling commands). `validateCloneWrite` is justified — but see Findings 2, 6, 9 |
| **D4** two-phase `create_component_set` | **Core of the release** | Partial-rename bug verified. Plan/mutate split is the right shape |
| **D5** prevalidation-not-transactions | Sound judgment, one overclaim | Refusing to build a transaction layer in a patch is correct engineering restraint. Fix the "no late placement failure" absolute + add the cycle precheck (Finding 1) |
| **D6** parent-first creation | Worth doing; medium severity | Real orphan leaks, but note the dispatcher's existing scope/name checks already mean the parent *exists* at dispatch time — the live orphan scenarios are non-appendable in-scope parents and TOCTOU. Make cleanup unconditional (Finding 5) |
| **D7** executable safety matrix | **Highest long-term value** in the PRD | This is the drift-prevention mechanism the project's trust story needs. Choose the test-table variant for v2.3.2 (Finding 8) |
| **D8** code-backed README | Necessary | Both flagged bullets verified false today; after §1/§2 land, both become true — no bullet needs deleting, which the PRD could state as the expected outcome |
| **D9** no silent weakening | Necessary principle | Costless to adopt; it is the inverse of D8 and closes the loop |

No requirement is padding; the release is coherent and correctly refuses to add feature surface. The one scope risk is §4's "every Part B row" reading (Finding 8).

---

## Part 4 — Summary of required dispositions before implementation

1. **Add the parent-cycle precheck** to §2 (parent ∉ components ∪ descendants) and downgrade "no late parent-placement failure" to "no prevalidatable placement failure" in D5, §2 tests, and the coverage map. *(Finding 1)*
2. **Name the `node_clone` scope-escape** as a current G1 violation in §1's bug statement; document the intentional loss of scope-root cloning in `error-playbook.md`. *(Finding 2)*
3. **Fix all test paths** to `src/mcp_server/tests/unit/figma_plugin/` and reference the existing mocked-dispatcher harness in `atomicityAndValidation.test.ts`. *(Finding 3)*
4. **Extend the version-sync check** to `server.json` and root `manifest.json`; specify commit-time injection for `ui.html`. *(Finding 4)*
5. **Make creation-handler cleanup unconditional** in §3's spec text to match §3's tests. *(Finding 5)*
6. **Record the clone-parent-name decision** (no verification, parent is implicit) and reword the "no open questions" banner. *(Finding 6)*
7. **Decide the layering** for plan-phase validation (recommend: dispatcher-side, consistent with SAFETY.md's trust hierarchy) and fix the `scopeRoot` reference in the §2 pseudocode; move the rename loop inside the restore try/catch. *(Finding 7)*
8. **Qualify §4's coverage claim** to the 13 generic gate categories with references out to existing bespoke-gate tests; commit to the test-table (MVP) pattern for this release. *(Finding 8)*
9. Correct the API Change Notice's "already promised by SAFETY.md" for `node_clone`; clarify the duplicate-variant string is relocated, not new; delete superseded handler error branches. *(Findings 9, 10)*
10. Rephrase the missing/nonexistent-parent tests as direct-handler tests; note the dispatcher's `PARENT_OUTSIDE_SCOPE` precedence. *(Finding 11)*

---

*Review performed against commit `c2d8481` ("New PRDs"), 2026-07-04. All file/line references verified at that revision.*
