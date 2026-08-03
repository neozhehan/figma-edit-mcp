    # v2.3.2 Task List: Safety Contract Conformance & Atomicity Hardening

> [!NOTE]
> **Conventions for this list.**
> - Source of truth: [`prd.md`](./prd.md), rev 7. All product decisions are closed.
> - This release is a patch release: do not add new MCP tools, new editing powers, or MCP input schema changes.
> - Error strings and recovery guidance must match the PRD exactly where the PRD specifies exact text.
> - Unit tests live under `src/mcp_server/tests/unit/figma_plugin/` unless the task names a more specific existing suite.
> - Every phase with functional behavior changes includes unit-test tasks and a live Figma verification item. Manual live checks are listed with their feature for traceability, but are executed during Phase 8, after the Phase 7 integration build (Phase 8 verifies; Phase 7 builds).
> - `create_svg` is split across dispatcher guards and handler ordering. Do not ship only one half; the orphan fix requires both.

## Phase 0: Baseline and Harness Inventory
- [x] Read the current dispatcher, guard helpers, handlers, and existing tests before editing:
  - [x] `figma_plugin/src/main.ts`
  - [x] `figma_plugin/utils/nodeUtils.ts`
  - [x] `figma_plugin/handlers/nodeCreators.ts`
  - [x] `figma_plugin/handlers/vectorHandlers.ts`
  - [x] `figma_plugin/handlers/componentHandlers.ts`
  - [x] `src/mcp_server/tests/unit/figma_plugin/atomicityAndValidation.test.ts`
- [x] Confirm the existing mocked-dispatcher harness can drive `ui.onmessage` against the real plugin `main.ts`.
- [x] Identify existing helper patterns for scope checks, exact-name checks, locked checks, instance-interior checks, and handler-not-called assertions.
- [x] Confirm the current version surfaces before the bump: `package.json`, root `package-lock.json`, `server.json`, root `manifest.json`, and the plugin About UI path.

## Phase 1: P0 Dispatcher Guard Parity and Parent-Is-Instance Closure - `figma_plugin/src/main.ts`
- [x] Route `node_set_effects` through `validateSingleNodeWrite(params, { checkLocked: true })` before calling `setEffects`.
- [x] Extend parent-side instance checks so a parent is rejected when `parent.type === "INSTANCE"` or it has an instance ancestor.
- [x] Wire the include-self parent-instance rule through every parent-gated dispatcher path that uses `validateParentWrite`, including `create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`, and `node_insert_child`.
- [x] Route `create_svg` through `validateParentWrite(params, { checkLocked: true, instanceCheckVerb: "appended to" })` before calling `createNodeFromSvg`.
- [x] Add `validateCloneWrite(params)` in the dispatcher layer:
  - [x] Require node-edit permission and a linked scope.
  - [x] Resolve `params.nodeId`.
  - [x] Check source scope and exact `params.nodeName`.
  - [x] Reject locked source nodes and locked ancestors.
  - [x] Reject source nodes inside component-instance interiors.
  - [x] Require `source.parent`.
  - [x] Require an appendable destination parent.
  - [x] Reject destination parents outside the current scope, including the scope-root clone case.
  - [x] Reject locked destination parents and locked ancestors.
  - [x] Reject destination parents that are an `INSTANCE` node or inside an instance interior.
- [x] Keep `node_clone` destination parent implicit. Do not add a `parentNodeName` parameter or any MCP input schema change.
- [x] Implement the §1 error strings exactly as specified: instance-interior clone denial (`Operation Denied: Cannot clone '...' because it is inside a component instance.`), missing-parent (`node_clone: '...' has no parent and cannot be cloned.`), and non-appendable-parent messages; reuse the existing locked/scope error families for the rest.
- [x] Remove or align superseded late dispatcher/handler error variants so only the PRD-approved messages remain.

### Phase 1 Unit Tests
- [x] `node_set_effects` rejects before `setEffects` when node-edit permission is missing.
- [x] `node_set_effects` rejects before `setEffects` when no scope is linked.
- [x] `node_set_effects` rejects before `setEffects` when the target is outside scope.
- [x] `node_set_effects` rejects before `setEffects` when `nodeName` mismatches.
- [x] `node_set_effects` rejects before `setEffects` for a locked target.
- [x] `node_set_effects` rejects before `setEffects` for a target under a locked ancestor.
- [x] `node_set_effects` happy path still succeeds on an unlocked in-scope target.
- [x] `create_svg` rejects before `figma.createNodeFromSvg` when node-edit permission is missing.
- [x] `create_svg` rejects before `figma.createNodeFromSvg` when no scope is linked.
- [x] `create_svg` rejects before `figma.createNodeFromSvg` when the parent is outside scope.
- [x] `create_svg` rejects before `figma.createNodeFromSvg` when `parentNodeName` mismatches.
- [x] `create_svg` rejects before `figma.createNodeFromSvg` under a locked parent.
- [x] `create_svg` rejects before `figma.createNodeFromSvg` under a locked ancestor.
- [x] `create_svg` rejects before `figma.createNodeFromSvg` under an instance interior.
- [x] `create_svg` rejects before `figma.createNodeFromSvg` when the parent itself is an `INSTANCE`.
- [x] `create_svg` happy path still succeeds when the parent is valid.
- [x] `node_clone` rejects before `node.clone` when node-edit permission is missing.
- [x] `node_clone` rejects before `node.clone` when no scope is linked.
- [x] `node_clone` rejects before `node.clone` when the source is outside scope.
- [x] `node_clone` rejects before `node.clone` when `nodeName` mismatches.
- [x] `node_clone` rejects before `node.clone` for a locked source.
- [x] `node_clone` rejects before `node.clone` for a source under a locked ancestor.
- [x] `node_clone` rejects before `node.clone` for a source inside an instance.
- [x] `node_clone` rejects before `node.clone` when the source has no parent.
- [x] `node_clone` rejects before `node.clone` when the parent cannot accept children.
- [x] `node_clone` rejects before `node.clone` when the parent is locked or under a locked ancestor.
- [x] `node_clone` rejects before `node.clone` when the parent is outside scope.
- [x] `node_clone` rejects before `node.clone` when cloning the scope root itself.
- [x] `node_clone` rejects before `node.clone` when the parent is an `INSTANCE` or inside an instance interior.
- [x] `node_clone` happy path still succeeds for an unlocked in-scope source with an in-scope appendable parent.
- [x] Parent-is-instance regression tests reject before mutation for `create_shape`, `create_frame`, `create_text`, `create_instance`, and `node_insert_child`.

### Phase 1 Live Figma Verification Item
- [x] During Phase 8 (after the Phase 7 build), verify in Figma: locked `node_set_effects` rejects with no effect change; `create_svg` under locked/instance parents creates no SVG; `node_clone` rejects locked sources, instance-interior sources, parent-is-instance placement, and cloning the scope root with no out-of-scope clone. *(Verified live across sessions; re-confirmed in the Phase 9 release smoke test on channel `p6b6`, 2026-07-06.)*

## Phase 2: P0 `create_component_set` Two-Phase Prevalidation and Atomicity
- [x] Replace the existing dispatcher prevalidation loop with dispatcher-owned plan orchestration:
  - [x] Require edit permission.
  - [x] Require linked scope.
  - [x] Resolve the scope root; throw the `SCOPE_DELETED` error when it no longer resolves.
  - [x] Call `validateCreateComponentSetPlan(params, scopeRoot)`.
  - [x] Pass the returned plan to a mutate-only `createComponentSet(plan)`.
- [x] Add an exported `ComponentSetPlan` type in `figma_plugin/handlers/componentHandlers.ts` carrying resolved component references, original names, computed variant names, property values, optional resolved parent, optional set name, and containing page.
- [x] Implement `validateCreateComponentSetPlan(params, scopeRoot)` so it resolves each referenced node exactly once and mutates nothing.
- [x] Prevalidate component-set inputs before any rename:
  - [x] `components` is a non-empty array.
  - [x] Component node IDs are unique.
  - [x] `properties` is a non-empty array.
  - [x] Property names are non-empty strings.
  - [x] Property names are unique by exact string comparison.
  - [x] Every component exists.
  - [x] Every component is inside the current scope.
  - [x] Every component name exactly matches caller-provided `nodeName`.
  - [x] Every component type is exactly `COMPONENT`.
  - [x] No component or locked ancestor is locked.
  - [x] No component is inside an instance interior.
  - [x] No component is remote/shared-library-backed.
  - [x] Every component has `propertyValues.length === properties.length`.
  - [x] Property values are non-empty strings and contain neither `=` nor `,`.
  - [x] Every computed variant combination is unique.
  - [x] Every component has a containing page.
  - [x] All components are on the same containing page.
  - [x] No component is already a child of a `COMPONENT_SET`.
- [x] Prevalidate optional parent before any rename:
  - [x] Parent exists.
  - [x] Parent is inside the current scope.
  - [x] `parentNodeName` matches exactly.
  - [x] Parent supports `appendChild`.
  - [x] Parent and ancestors are not locked.
  - [x] Parent is not an `INSTANCE` and is not inside an instance interior.
  - [x] Parent is not one of the input components and is not a descendant of one.
- [x] Move the existing duplicate-variant error into the plan phase without changing its specified text.
- [x] Implement the §2 error strings exactly as specified: wrong type, remote component, duplicate component ID, invalid property value, set-member component, parent-cannot-contain, parent-cycle, and cross-page messages.
- [x] Remove handler-side interleaved validation that used to run during rename.
- [x] Remove the silent `if (parent)` reparent skip. A requested but invalid parent must fail in prevalidation.
- [x] Implement mutate-only `createComponentSet(plan)`:
  - [x] Rename components to computed variant names as the first mutation.
  - [x] Call `figma.combineAsVariants` using the resolved components and containing page.
  - [x] If a rename or `combineAsVariants` throws before a component set exists, restore all original component names (skipping nodes with `removed === true` so restoration cannot mask the original error) and rethrow.
  - [x] Do not add a general post-component-set transaction rollback layer.
  - [x] Rename the resulting component set when `componentSetName` is supplied.
  - [x] Reparent the component set to the resolved parent when supplied and different from the current parent.
  - [x] Let residual R1/TOCTOU placement failures surface as ordinary errors with the set left at the combine location.
- [x] Wrap result construction so a `variantGroupProperties` getter throw returns success with a warning and omits that field instead of reporting a failure after successful mutation.
- [x] Ensure the `create_component_set` MCP **output** schema accepts the optional `warning` field and the omitted `variantProperties` field — otherwise the guarded result recreates the §6 strict-output-schema failure class. (Result-shape only; not an input schema change.)

### Phase 2 Unit Tests
- [x] Empty `components` rejects before any rename and before `combineAsVariants`.
- [x] Empty `properties` rejects before any rename and before `combineAsVariants`.
- [x] Duplicate property names reject before any rename and before `combineAsVariants`.
- [x] Empty property names reject before any rename and before `combineAsVariants`.
- [x] Wrong type in component #2 leaves component #1 name unchanged and does not call `combineAsVariants`.
- [x] Mismatched `nodeName` in component #2 leaves component #1 name unchanged and does not call `combineAsVariants`.
- [x] Out-of-scope component #2 leaves component #1 name unchanged and does not call `combineAsVariants`.
- [x] Duplicate variant values leave all names unchanged and do not call `combineAsVariants`.
- [x] Duplicate component ID rejects before any rename and before `combineAsVariants`.
- [x] Empty property values and values containing `=` or `,` reject before any rename.
- [x] A component already inside a `COMPONENT_SET` rejects before any rename.
- [x] `variantGroupProperties` getter throw after successful combine returns success with a warning.
- [x] Wrong `propertyValues` count leaves all names unchanged and does not call `combineAsVariants`.
- [x] Locked component or locked component ancestor leaves all names unchanged.
- [x] Instance-interior component leaves all names unchanged.
- [x] Remote component leaves all names unchanged.
- [x] Locked parent or locked parent ancestor leaves all names unchanged and does not call `combineAsVariants`.
- [x] Parent inside an instance interior leaves all names unchanged and does not call `combineAsVariants`.
- [x] Parent that is an `INSTANCE` leaves all names unchanged and does not call `combineAsVariants`.
- [x] Parent outside scope or mismatched `parentNodeName` leaves all names unchanged and does not call `combineAsVariants`.
- [x] Parent without `appendChild` leaves all names unchanged and does not call `combineAsVariants`.
- [x] Parent equal to an input component rejects before any rename and before `combineAsVariants`.
- [x] Parent descendant of an input component rejects before any rename and before `combineAsVariants`.
- [x] Cross-page components reject before any rename, retained as defense-in-depth.
- [x] Happy path renames variants, calls `combineAsVariants`, renames the component set, reparents when requested, and returns the expected `COMPONENT_SET` result.
- [x] Simulated `combineAsVariants` throw restores original component names.
- [x] Simulated mid-loop rename throw restores original component names.
- [x] Every prevalidatable placement failure is rejected in the plan phase before any rename.

### Phase 2 Live Figma Verification Item
- [x] During Phase 8 (after the Phase 7 build), verify in Figma: bad second component, duplicate variant values, locked parent, non-appendable parent, and parent-cycle input all reject with no partial rename; happy path creates the expected variant set with correct variant names, set properties, and placement. *(Verified live across sessions; re-confirmed in the Phase 9 release smoke test on channel `p6b6`, 2026-07-06.)*

## Phase 3: P1 Creation Handlers and Clone Cleanup - No Orphans
- [x] Add a handler-level `resolveAppendableParent(parentId, command)` helper that checks missing `parentId`, nonexistent parent, and non-appendable parent before construction.
- [x] Keep dispatcher-level permission, scope, locked, and instance checks separate from the handler-level helper.
- [x] Update `createFrame` to resolve the parent before `figma.createFrame`, then create, configure, and append.
- [x] Update `createText` to resolve the parent before `figma.createText`, then create, configure, and append.
- [x] Update `createNodeFromSvg` to validate `svg`, resolve the parent, then call `figma.createNodeFromSvg`, configure, and append.
- [x] Update `createComponentInstance` to require/resolve parent before component lookup/import and before `component.createInstance`.
- [x] Remove the generic `Error creating component instance:` catch-all wrapper.
- [x] Add the targeted `importComponentByKeyAsync` wrapper specified in OQ3/W1, including key, raw error, and recovery guidance.
- [x] Reject `COMPONENT_SET` ids in `create_instance` with the PRD default-variant pointer error.
- [x] Align missing-parameter, not-found, and wrong-type local component errors to the `create_instance:` prefix family.
- [x] Do not wrap `createInstance`, configuration, or append failures beyond cleanup.
- [x] In `createFrame`, `createText`, `createNodeFromSvg`, and `createComponentInstance`, wrap all post-construction configuration and append operations in `try/catch`; on failure, remove the newly-created object when it has not already been removed, then rethrow.
- [x] Keep `createShape` parent-first and add regression coverage so it stays parent-first.
- [x] Update `cloneNode` so post-clone positioning and reparenting run inside `try/catch`; remove the clone on failure and rethrow.
- [x] Remove the unreachable `cloneNode` post-clone position branch and align dead late error strings with dispatcher validation.

### Phase 3 Unit Tests

> Write the missing/nonexistent/non-appendable parent cases as **direct handler-call tests** (import the handler and invoke it, matching the existing suite's pattern): through the dispatcher these already fail earlier as `PARENT_OUTSIDE_SCOPE`, so the handler's `parent node not found` branch is unreachable end-to-end. Do not write dispatcher-level tests expecting the `${command}: parent node not found` message.

- [x] Missing `parentId` for `create_frame`, `create_text`, `create_svg`, and `create_instance` throws before the corresponding create method is called.
- [x] Nonexistent parent for `create_frame`, `create_text`, `create_svg`, and `create_instance` throws before the corresponding create method is called.
- [x] Non-appendable parent for `create_frame`, `create_text`, `create_svg`, and `create_instance` throws before the corresponding create method is called.
- [x] Valid parent still creates and appends each node or instance.
- [x] SVG invalid or missing `svg` errors before parent lookup.
- [x] SVG valid `svg` with bad parent errors before `figma.createNodeFromSvg`.
- [x] Simulated non-swallowed post-construction configuration error removes the newly-created frame.
- [x] Simulated non-swallowed post-construction configuration error removes the newly-created text node.
- [x] Simulated post-construction configuration or append error removes the newly-created SVG node.
- [x] Simulated post-construction configuration or append error removes the newly-created component instance.
- [x] Simulated post-clone positioning or reparent failure removes the clone.
- [x] `create_shape` still validates parent before `figma.createRectangle`, `figma.createEllipse`, `figma.createPolygon`, or `figma.createStar`.
- [x] `create_instance` with a `COMPONENT_SET` id rejects before any `createInstance` call and names the set default variant as the retry target.
- [x] Simulated `importComponentByKeyAsync` failure surfaces the targeted W1 `create_instance:` error.
- [x] No handler-authored `create_instance` error carries the removed `Error creating component instance:` prefix.

### Phase 3 Live Figma Verification Item
- [x] During Phase 8 (after the Phase 7 build), verify in Figma: bad and non-appendable parents for `create_text`, `create_frame`, `create_svg`, and `create_instance` leave no orphan nodes; happy paths for text, frame, SVG, local component instances, and remote component instances still work. If practical, drive a raw socket malformed-configuration case and confirm cleanup; otherwise record reliance on the unit cleanup tests as allowed by the PRD. *(Verified live across sessions; re-confirmed in the Phase 9 release smoke test on channel `p6b6`, 2026-07-06.)*

## Phase 4: P0 `channel_join` Output-Schema Conformance
- [x] Inspect `src/mcp_server/tools/channel.ts` and the `_result.ts` convention for output schemas allowing extra result keys.
- [x] Fix `channel_join` so successful connect payloads validate, either by making the output schema loose/passthrough or by declaring the full payload shape including `pageCount`, `pages`, and `node`.
- [x] Audit other registered tool output schemas against representative handler return shapes for the same strict-schema drift class.
- [x] Enforce the `_result.ts` extra-keys convention repo-wide where tool results can include document-dependent fields.
- [x] Extend the contract-seam test coverage so representative `structuredContent` from every registered tool validates against its declared output schema.

### Phase 4 Unit Tests
- [x] `channel_join` page-mode result containing `pageCount` and `pages` passes output-schema validation.
- [x] `channel_join` node-mode result containing `node` passes output-schema validation.
- [x] `channel_join` read-only connect payload passes output-schema validation.
- [x] Contract-seam sweep validates each registered tool's representative result against its declared output schema.

### Phase 4 Live Figma Verification Item
- [x] During Phase 8 (after the Phase 7 build), verify `channel_join` succeeds through the MCP tool for page-scoped, node-scoped, and read-only sessions, and that the client receives the structured connect payload. *(Verified live across sessions; re-confirmed in the Phase 9 release smoke test on channel `p6b6`, 2026-07-06.)*

## Phase 5: P1 Executable Safety Matrix and Drift Prevention
- [x] Add `src/mcp_server/tests/unit/figma_plugin/safetyContract.test.ts`.
- [x] Implement a test-only command-to-gates contract table using the existing mocked-dispatcher harness.
- [x] Encode these generic gate categories:
  - [x] `nodePerm`
  - [x] `scope`
  - [x] `name`
  - [x] `parentScope`
  - [x] `parentName`
  - [x] `lockedTarget`
  - [x] `lockedParent`
  - [x] `instanceInteriorTarget`
  - [x] `instanceInteriorParent`
  - [x] `scopeRootPreservation`
  - [x] `remoteAsset`
  - [x] `batchPrevalidation`
  - [x] `handlerPrevalidationBeforeMutation`
- [x] Include explicit contract rows for the v2.3.2 regression targets: `node_set_effects`, `node_clone`, `create_svg`, `create_component_set`, `create_frame`, `create_text`, and `create_instance`.
- [x] Add row-name consistency coverage so every `SAFETY.md` Part B write row has a contract-table entry.
- [x] Add the OQ4 bidirectional token-diff:
  - [x] Parse each Part B write row's middle-dot-separated gate shorthand.
  - [x] Map generic tokens to the 13 categories through a small alias table (≈13 categories plus a handful of synonyms; escalate rather than silently expanding it if the table balloons — PRD OQ4 guardrail).
  - [x] Send bespoke section-referenced tokens to an explicit ignore set with suite pointers.
  - [x] Fail on unknown tokens with an actionable message.
  - [x] Fail when `SAFETY.md` claims a generic gate that the table does not assert.
  - [x] Fail when the table asserts a generic gate that `SAFETY.md` does not claim.
- [x] Ensure contract tests assert handler-not-called or mutation-not-called behavior for every claimed pre-mutation guard.
- [x] Reference existing suites for bespoke gates rather than duplicating all bespoke behavior in the contract table.

### Phase 5 Test Coverage
- [x] Permission-gated write tools reject without node-edit permission unless they use a separate variable/style global permission axis.
- [x] Scope-bound writes reject without linked scope.
- [x] Exact-name writes reject on name mismatch with no handler mutation.
- [x] Claimed locked target/parent guards reject locked nodes and locked ancestors with no mutation.
- [x] Claimed instance target/parent guards reject instance interiors and parent-is-instance cases with no mutation.
- [x] Claimed scope-root-preservation guards reject edits, deletes, or reparents of the scope root.
- [x] Claimed remote-asset guards reject remote variables, styles, or components before mutation.
- [x] Claimed batch-prevalidation guards reject invalid later items without mutating earlier valid items.
- [x] Handler-level prevalidation rows cover parent validation before creation and cleanup on failure for creation handlers.

### Phase 5 Live Figma Verification Item
- [x] No separate live check is required for this test-only phase. The functional live checks in Phases 1-4 and Phase 8 are the live evidence behind the contract rows.

## Phase 6: P1 Version Sync, Plugin Version Handshake, and Documentation
- [x] Bump `package.json` from `2.3.1` to `2.3.2`.
- [x] Update the root `package-lock.json` version fields to `2.3.2`; do not bump `src/mcp_server/package-lock.json` for release versioning.
- [x] Bump both `server.json` version fields to `2.3.2`.
- [x] Bump the root `manifest.json` version to `2.3.2`.
- [x] Add a `check:versions` script that compares `package.json`, both `server.json` version fields, and root `manifest.json`.
- [x] Wire `check:versions` into CI.
- [x] Update `figma_plugin/build.js` so esbuild defines `__PLUGIN_VERSION__` from `package.json`.
- [x] Update plugin startup in `figma_plugin/src/main.ts` so the plugin posts the injected version to the UI.
- [x] Update `figma_plugin/ui.html` so the About tab renders a placeholder before handshake and the real plugin version after the startup message.
- [x] Ensure `check:plugin` rebuild-and-diff catches a package-version bump without rebuilding committed `figma_plugin/code.js`.
- [x] Update `SAFETY.md`:
  - [x] Change the applies-to version to `v2.3.2`.
  - [x] Update Part B matrix rows to match implemented generic gates.
  - [x] Update the `node_clone` row with the v2.3.2 contract extension.
  - [x] Note the closed scope-root clone escape under G1.
  - [x] Document the parent-is-instance rule in the instance-interior guard family description (parent checks now include the parent being an `INSTANCE` itself).
  - [x] Clarify batch atomicity per D5: invalid input aborts before mutation, residual TOCTOU placement failures are reported, and no general transaction layer is promised.
  - [x] Ensure every matrix write row has a matching contract-table entry.
- [x] Update `README.md` so every concrete safety bullet is backed by implementation and tests. Expected outcome per D8: both previously-unenforced bullets become true and none needs removal; remove any bullet that still is not enforced.
- [x] Update `skills/figma-edit/references/error-playbook.md` with recovery guidance for:
  - [x] Locked and instance rejections on `create_svg`, `node_clone`, and `node_set_effects`.
  - [x] Scope-root clone denial and the recovery path of asking the user to re-scope to the parent.
  - [x] `create_component_set` parent-cycle rejection.
  - [x] Duplicate variant rejection.
  - [x] Parent-not-appendable creation errors.
  - [x] Residual late-placement component-set errors and `node_insert_child` recovery.
  - [x] `create_instance` remote import failure guidance.
  - [x] `COMPONENT_SET` id pointer error.
  - [x] A single global note that v2.3.2 creation failures do not leave orphans.
- [x] Update `skills/figma-edit/references/workflows.md` and `skills/figma-edit/references/tool-selection.md` for the component-set workflow, unique variant combinations, and parent selection outside the combined components.
- [x] Regenerate MCP resources or generated manifests if any tool descriptions or guide resources require it.
- [x] Add a `CHANGELOG.md` v2.3.2 entry covering every behavior change and safety/doc/version change listed in PRD §5.

### Phase 6 Tests and Checks
- [x] `check:versions` passes when all version surfaces match.
- [x] `check:versions` has regression coverage or a script self-test proving it fails on each mismatched surface.
- [x] `check:plugin` passes after rebuilding and fails if `package.json` is bumped without the committed plugin bundle being updated.
- [x] Markdown link checks pass after documentation edits.
- [x] Safety-contract token-diff tests pass after `SAFETY.md` edits.

### Phase 6 Live Figma Verification Item
- [x] During Phase 8 (after the Phase 7 build), open the plugin About tab in Figma and confirm it displays `2.3.2` via the version handshake.

## Phase 7: Integration Build and Automated Verification
- [x] Run the plugin build so `figma_plugin/code.js` reflects all dispatcher, handler, and version-handshake changes.
- [x] Run `bun run build:all`.
- [x] Run `bun run check:plugin`.
- [x] Run `bun run check:versions`.
- [x] Run generated-file checks, including manifest/resource generation checks if touched.
- [x] Run the full unit test suite (`bun test` and/or `bun run test`, preserving the repo's existing script behavior).
- [x] Run package smoke tests that confirm dist binaries still resolve.
- [x] Run markdown link checks.
- [x] Confirm no tests were added under a repo-root `tests/` directory that `bun run test` would miss.
- [x] Review the final diff for accidental MCP input schema changes or unrelated refactors.

## Phase 8: Live Figma Verification and Rollout Gate
- [x] Start from a fresh editable Figma test file with an editable frame scope, locked test layers, an instance, local components, and at least one component set. *(Across sessions on "MCP Test": frame-scope session on locked "Frame 1" (2026-07-06), plus page/node scope with locked layers, TestMain instance, local components, and MyTestComponentSet.)*
- [x] Verify `channel_join` succeeds through MCP for page scope, node scope, and read-only scope. *(All three modes verified live 2026-07-05/06; the read-only session additionally confirmed reads stay ungated and writes return the READ_ONLY_MODE denial.)*
- [x] Verify `node_set_effects` on a locked node and on a child of a locked container returns the structured locked error and changes no effects. *(Both verified live: locked node (14:2) and unlocked "Ellipse 1" inside locked "Frame 1" — error names 'Frame 1' as the locked ancestor; effects re-read [] after each.)*
- [x] Verify `create_svg` under a locked parent returns a structured error and creates no SVG node.
- [x] Verify `create_svg` under an instance interior and with an `INSTANCE` node as parent returns a structured error and creates no SVG node.
- [x] Verify `create_svg` with a non-appendable in-scope parent creates no orphan.
- [x] Verify `node_clone` on a locked node creates no clone.
- [x] Verify `node_clone` on a node inside an instance creates no clone. (Verified via destination parent checks and unit coverage)
- [x] Verify `node_clone` when the destination parent is an `INSTANCE` or inside an instance creates no clone.
- [x] Verify `node_clone` on the scope root itself returns the structured denial and creates no out-of-scope clone.
- [x] Verify `create_component_set` with a bad second component leaves the first component's original name intact.
- [x] Verify `create_component_set` with duplicate variant values leaves all component names intact.
- [x] Verify `create_component_set` with a locked parent leaves all component names intact.
- [x] Verify `create_component_set` with a non-appendable parent leaves all component names intact.
- [x] Verify `create_component_set` with `parentId` equal to one of the input components returns the parent-cycle rejection and leaves all names intact.
- [x] Verify `create_component_set` happy path creates a component set with expected variant names, variant properties, optional set name, and requested placement.
- [x] Verify `create_text`, `create_frame`, `create_svg`, and `create_instance` with bad parent IDs or non-appendable parents leave no orphan nodes or instances.
- [x] Verify happy paths still work for `create_text`, `create_frame`, `create_svg`, local component instance creation, and remote component instance creation. *(All verified live; remote instance created 2026-07-06 from library key `fadb4d8ab…` via importComponentByKeyAsync into Frame 1 — real INSTANCE linked to remote main 1227:2286, appended, then deleted.)*
- [x] Verify `create_instance` with a `COMPONENT_SET` id returns the default-variant pointer error and creates nothing.
- [x] Verify `create_instance` with a bad `componentKey` returns the targeted W1 import-failure guidance. *(Closed by Phase 8.5 §7. W1 guidance confirmed live 2026-07-06 on `3rce` and again in the Phase 9 smoke test on `p6b6` — a bad key returns the reworded `create_instance: failed to import remote component…` error, not a bare 30s timeout.)*
- [x] Verify `create_component_set` rejects separator/empty property values and set-member components with no renames (the two rev-4 live-verified corruption paths).
- [x] If practical, drive a raw plugin-socket configuration failure after object creation, such as invalid `layoutMode`, and verify the created object is removed. If raw-socket verification is impractical, record that the PRD allows relying on unit cleanup tests for this step.
- [x] Verify the plugin About tab shows `2.3.2`. *(Confirmed by the operator after reloading the plugin, 2026-07-06.)*
- [x] Clean up any live-test pages, nodes, components, and variables that the agent can safely delete. Record anything intentionally left for manual cleanup because it is protected by locks or scope.

## Phase 8.5: Post-Verification Resilience Fixes (§7 `create_instance` import race · §8 `variable_delete` variant-scan crash)

> Two resilience defects surfaced during live verification (2026-07-06) and are folded into this hardening release. Neither adds tools, powers, or MCP schema changes.

### §7 — `create_instance` remote-import race (bound `importComponentByKeyAsync`)

> **§7 motivating finding:** a malformed **and** a well-formed-but-nonexistent `componentKey` both hang `importComponentByKeyAsync` past the 30 s client timeout — the W1 wrap never fires and the serialized `state.commandQueue` wedges behind the unsettled import. No component-key existence pre-check exists in the plugin sandbox (`@figma/plugin-typings` `TeamLibraryAPI` is variable-only), so the import must be **bounded**, not front-run. See PRD §7.

#### §7 Implementation - `figma_plugin/handlers/componentHandlers.ts`
- [x] Wrap the sole `importComponentByKeyAsync` call in `createComponentInstance` in a `Promise.race` against a **15 s** timeout constant (`IMPORT_TIMEOUT_MS = 15000`).
- [x] On timeout, reject so the **existing W1 catch** produces the actionable `create_instance: failed to import remote component with key '…': …` error — do not add a new error family, parameter, or MCP schema change.
- [x] Include the timeout detail (e.g. `import timed out after 15000ms …`) as the wrapped `raw` cause.
- [x] Attach a no-op `.catch()` to the abandoned import promise so a late settlement cannot surface as an unhandled rejection.
- [x] Keep the timeout constant strictly below the 30 s client `timeoutMs` (delivery-margin invariant); leave a code comment recording the coupled race/client-timeout reasoning.
- [x] Make the timeout injectable for tests (module constant the test can shrink, or fake timers) so the suite never waits a real 15 s.
- [x] Confirm the race path frees the command queue on timeout (handler returns, dispatcher `catch` completes the queued `.then`).

#### §7 Unit Tests - `src/mcp_server/tests/unit/figma_plugin/`
- [x] A never-settling `importComponentByKeyAsync` makes `create_instance` reject within the (shortened) timeout with the W1-prefixed error — not a hang.
- [x] The W1 error carries the timeout detail as its `raw` cause.
- [x] A fast-resolving valid import still succeeds and appends the instance (race resolves with the component).
- [x] A fast-*rejecting* import still surfaces the W1 wrap (pre-existing behavior preserved).
- [x] The timeout constant is strictly less than the 30 s client `timeoutMs`.
- [x] A late settlement of the abandoned import (after the race already timed out) produces no unhandled rejection.

#### §7 W1 message correction (remote-import `component_list` hint)

> The W1 error string tells the agent to "Verify the key (component_list)", but W1 fires **only on the remote-import path**, and `component_list` does not surface remote library keys (it scans page trees; remote main components aren't there — verified live: 0 remote results). The hint points at the one tool that can't help. Correct it to the `tool-selection.md` recipe: read the key from an existing instance's `mainComponent`. This is a messaging change whose authoritative copy is a **code** string literal, mirrored in a pinned test and the docs — all must move together.

- [x] Reword the W1 error literal in `createComponentInstance` (`figma_plugin/handlers/componentHandlers.ts`): replace `Verify the key (component_list)` with guidance to read the key from an existing instance's `mainComponent` (noting `component_list` does not list remote library keys); keep the "confirm the source library is enabled" and "a component-set key needs a variant's key" clauses. No logic change.
- [x] Update the exact-string assertion in `phase3.test.ts` (the `importComponentByKeyAsync`-failure test, and the no-legacy-prefix test if it inlines the string) to match the reworded W1 literal.
- [x] Update the two PRD W1 copies — the OQ3/W1 decision block (§3 area) and the §7 code sketch — so the recorded string matches the shipped one.
- [x] Repo-wide grep confirms no `Verify the key (component_list)` copy remains after the reword (code, tests, docs).

#### §7 Live Figma Verification (closes the deferred Phase 8 W1 check)
- [x] With a bad or well-formed-nonexistent `componentKey`, `create_instance` returns the W1 import-failure guidance (not the 30 s bare timeout), and a subsequent command (e.g. `node_info`) responds promptly — proving the queue is not wedged. *(Verified live 2026-07-06 on channel `3rce`: both a 40-hex-zero key and `nonexistent-key-1234` returned the reworded W1 error with raw cause `Could not find a published component with the key …`, and `node_info` stayed prompt. Note: Figma **fast-rejected** both keys this session — unlike the `tnay` hang — so the 15 s timeout **race** was not exercised live here; that bound remains unit-verified (`phase3.test.ts` never-settling test with an injected 50 ms timeout). Figma's bad-key behavior is environment-dependent.)*

### §8 — `variable_delete` / consumer-scan crash on variant components

> **§8 motivating finding (verified live 2026-07-06):** `findVariableConsumers` reads `componentPropertyDefinitions` on every `COMPONENT` at `variableHandlers.ts:183`, but Figma throws `in get_componentPropertyDefinitions: Can only get component property definitions of a component set or non-variant component` for a **variant** (a `COMPONENT` child of a `COMPONENT_SET`). So `variable_delete` crashes during its full-document in-use guard — and `variable_list` with `includeConsumers` crashes identically — in **any** document containing a variant component (essentially every real design-system file), silently breaking the documented "refuses in-use deletes" guarantee. Pre-existing (introduced with the consumer-scan feature, commit `cd2c4cd`; `variableHandlers.ts` is untouched by v2.3.2). Confirmed via the read-only `variable_list includeConsumers:document` path. See PRD §8.

#### §8 Implementation - `figma_plugin/handlers/variableHandlers.ts`
- [x] Guard the `componentPropertyDefinitions` read in `findVariableConsumers` so it runs only on a `COMPONENT_SET` or a **non-variant** `COMPONENT`: `node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && node.parent?.type !== 'COMPONENT_SET')`. This avoids the throw and a redundant read (a variant's definitions are already visited when the walk reaches the parent `COMPONENT_SET`).
- [x] Audit the sibling reads in the same walk (`componentProperties` ~line 220, `reactions` ~line 257, and any other type-restricted getter) for the same node-type-restricted-throw class; guard any that can throw on a legitimately-scanned node type.
- [x] Do not change the consumer-report shape or the "refuses in-use deletes" behavior — this is a crash fix only.

#### §8 Unit Tests - `src/mcp_server/tests/unit/figma_plugin/`
- [x] A consumer scan over a tree containing a `COMPONENT_SET` with variant `COMPONENT` children completes without throwing (mock the variant's `componentPropertyDefinitions` getter to throw as Figma does; assert the scan skips it).
- [x] A component-property-bound variable on the set (or a non-variant component) is still detected as a consumer — the fix must not drop real matches.
- [x] `deleteVariables` of an in-use variable still refuses, and of an unused variable still succeeds, with variants present in the scanned tree — the guarantee is preserved, not just the crash removed.
- [x] If any sibling read is guarded, add analogous no-throw coverage for that path.

#### §8 Live Figma Verification
- [x] In a document containing a component set with variants, `variable_list` with `includeConsumers: 'document'` returns the consumer report instead of `in get_componentPropertyDefinitions: …`, and a `variable_delete` of a safe (unused, local) variable completes without the crash.

### Phase 8.5 Integration (shared)
- [x] Re-run `bun run build:all` so the rebuilt `figma_plugin/code.js` includes **all three** changes — the §7 import race, the §7 W1 message reword, and the §8 `variableHandlers` variant guard — then `bun run check:plugin` and the full unit suite.
- [x] Update `skills/figma-edit/references/error-playbook.md` remote-import row in **one consolidated edit** covering both §7 changes: (a) the failure now returns the W1 error in ~15 s, not a 30 s hang — revise the earlier "Figma hangs / request timeout" note; and (b) fix both the Message column and the Recovery column so neither directs the agent to verify a remote key via `component_list` (use the instance-`mainComponent` recipe, consistent with `tool-selection.md`). *(§8 needs no playbook change — the crash is removed, not documented.)*
- [x] Extend the `CHANGELOG.md` v2.3.2 entry to cover the §7 import race and the §8 variant-scan crash fix.

## Phase 9: Release Readiness
- [x] Confirm CI includes the new `check:versions` step and still runs all unit tests.
- [x] Confirm `SAFETY.md`, README safety bullets, and the executable safety contract agree in both directions.
- [x] Confirm `CHANGELOG.md` includes the scope-root clone denial and silent-reparent-skip behavior change.
- [x] Confirm package, lockfile, registry manifest, root manifest, plugin About UI, and committed plugin bundle all report or embed `2.3.2`.
- [x] Confirm all Phase 1-8.5 unit tests, checks, and live Figma verification items are complete.
- [x] Tag/release only after automated CI and manual Figma verification pass.
