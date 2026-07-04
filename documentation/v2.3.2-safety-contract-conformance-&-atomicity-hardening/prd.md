# v2.3.2 PRD: Safety Contract Conformance & Atomicity Hardening

This document is the product / implementation spec for the **v2.3.2** release of `figma-edit-mcp`. Where v2.3.1 hardened `node_bind_variable` and added `node_set_fill { clear: true }`, v2.3.2 closes the safety-contract gaps surfaced by code audit: dispatcher/documentation mismatches, incomplete prevalidation for `create_component_set`, mutation-before-final-validation in create handlers, stale plugin version display, and missing executable safety-contract tests.

The release goal is not to add new design-editing capability. It is to make the project’s stated Figma-editing safety contract match the implementation, make the implementation match the safety matrix, and prevent future drift.

---

## Release identity

> [!IMPORTANT]
> **This is v2.3.2.** v2.3.1 is the prior release; `package.json` currently reads `"version": "2.3.1"`. Bump it to `2.3.2` as part of this release.
>
> This is a **patch** release. It contains no new MCP tools and no new Figma-editing powers. It hardens existing editing tools and updates safety documentation so the documented mutation guarantees match the implementation.

## API Change Notice

> [!NOTE]
> v2.3.2 does **not** intentionally change MCP tool schemas.
>
> It does change failure behavior for unsafe or invalid operations that previously slipped through prevalidation or failed after partial mutation:
>
> - `node_set_effects`, `node_clone`, and `create_svg` now enforce the guard stacks already promised by `SAFETY.md`.
> - `create_component_set` now fully prevalidates components, parent, component type, locks, instance interiors, remote/shared-library status, duplicate variant combinations, and page compatibility before renaming or combining variants.
> - `create_frame`, `create_text`, `create_svg`, and `create_instance` validate the parent before creating nodes / instances, or clean up created objects on failure.

---

## Decisions

> [!NOTE]
> **D1 — Version and release metadata.** Bump `package.json` `2.3.1 → 2.3.2`. Update any generated manifests and lockfile metadata required by the repo.

> [!NOTE]
> **D2 — Plugin UI version drift is a release blocker.** The Figma plugin About tab must not hard-code an old version. Replace the hard-coded UI string with a generated constant or build-time injection from `package.json`. Add `check:plugin-version` or fold the check into the existing generated-file check so CI fails if package and UI versions differ.

> [!NOTE]
> **D3 — Dispatcher guard parity.** Update the dispatcher so every command’s implemented guard stack matches the v2.3.2 safety matrix. At minimum:
>
> - `node_set_effects` uses the same single-node write validation as other property writes: node permission, scope, exact name, locked-node / locked-ancestor guard.
> - `node_clone` validates source scope, source exact name, source locked / locked-ancestor guard, source is not inside an instance interior, parent exists, parent can accept children, parent is in scope, parent is not locked, parent is not inside an instance interior, and parent exact-name handling is explicitly decided before cloning.
> - `create_svg` uses standard parent write validation: node permission, parent scope, parent exact name, parent locked / locked-ancestor guard, and parent instance-interior guard before calling the SVG handler.
> - `create_component_set` performs the full batch prevalidation described in D4 before calling the mutating part of the handler.

> [!NOTE]
> **D4 — `create_component_set` must be two-phase.** Move every input- and target-dependent validation before any component rename or variant combine. The handler must have a “plan” phase and a “mutate” phase. No component name may be changed until the whole plan is validated.

> [!NOTE]
> **D5 — Rollback scope — DECIDED: prevalidation, not general transactions.** Use the former Option A. v2.3.2 fixes prevalidation and clarifies that batch atomicity means invalid input aborts before mutation; it is not a general Figma transaction layer. `create_component_set` must restore original component names if `combineAsVariants` throws after temporary renames but before a component set is created. It must not rely on post-combine rollback for parent-placement failures; parent placement must be prevalidated so no late parent-placement failure remains after `combineAsVariants`. A broader transaction / post-component-set cleanup layer is out of scope for this patch.

> [!NOTE]
> **D6 — Creation handlers must not mutate before parent validation.** `create_frame`, `create_text`, `create_svg`, and `create_instance` must resolve and validate the target parent before creating a Figma node or instance. If Figma requires construction before some validation can run, add cleanup in `catch` so no orphan remains.

> [!NOTE]
> **D7 — Make the safety matrix executable.** Add tests and/or a generated safety matrix so a documented guard cannot silently drift from implementation again. The safety matrix must cover every write command and assert permission, scope/name, locked, instance-interior, scope-root, remote-asset, batch prevalidation, and handler-prevalidation-before-mutation behavior wherever the matrix documents those gates.

> [!NOTE]
> **D8 — Documentation claims must be code-backed.** The README may keep strong positioning such as “Safer than Figma Itself,” but every concrete safety bullet underneath it must be true after the v2.3.2 fixes and covered by executable guard/atomicity tests. Fix the implementation or change the specific bullet that is not enforced.

> [!NOTE]
> **D9 — No silent weakening.** If a guard documented in `SAFETY.md` cannot or should not be implemented for a command, either implement it or remove that concrete claim from the matrix. The implementation may not silently rely on Figma runtime errors for a guard the safety manual claims is plugin-enforced.

> [!NOTE]
> **All decisions recorded and confirmed.** D1–D9 are decided. No open questions remain for v2.3.2.

---

## Scope & priority

| # | Change | Priority | Primary location |
| :- | :- | :-: | :- |
| §1 | Dispatcher guard parity for `node_set_effects`, `node_clone`, `create_svg` | **P0** | `figma_plugin/src/main.ts` |
| §2 | Two-phase `create_component_set` prevalidation and no partial rename | **P0** | `figma_plugin/src/main.ts`, `figma_plugin/handlers/componentHandlers.ts` |
| §3 | Validate creation parents before node / instance creation | **P1** | `figma_plugin/handlers/nodeCreators.ts`, `figma_plugin/handlers/vectorHandlers.ts`, `figma_plugin/handlers/componentHandlers.ts` |
| §4 | Executable safety matrix / guard regression tests | **P1** | `tests/unit/figma_plugin/*`, `SAFETY.md` or generated matrix source |
| §5 | Code-backed README, version sync, and safety-doc cleanup | **P1** | `README.md`, `SAFETY.md`, `figma_plugin/ui.html`, `CHANGELOG.md` |

---

## Guard / atomicity coverage map

This table is the acceptance checklist for the v2.3.2 audit findings. Each row must have both an implementation change and a regression test before the release can ship.

| Finding | Required implementation coverage | Required regression coverage |
| :- | :- | :- |
| `node_set_effects` lacks the documented locked guard | Route through `validateSingleNodeWrite(..., { checkLocked: true })` before `setEffects` | Locked target and locked ancestor both reject; `setEffects` spy is not called; unlocked happy path still succeeds |
| `node_clone` lacks structural prevalidation before cloning | Validate source permission, scope, exact name, locked ancestor, and instance-interior; validate source parent exists, is appendable, in scope, unlocked, and not inside an instance before `node.clone()` | Locked source, locked ancestor, source inside instance, missing parent, non-appendable parent, parent outside scope, parent locked, parent locked ancestor, and parent inside instance all reject before `node.clone`; happy path succeeds |
| `create_svg` lacks parent protection and creates the SVG before final parent checks | Use parent write validation for scope/name/locked/instance before handler; inside handler, validate `svg` and appendable parent before `figma.createNodeFromSvg` | Locked parent, locked ancestor, instance-interior parent, missing parent, nonexistent parent, and non-appendable parent all reject before `figma.createNodeFromSvg`; happy path succeeds |
| `create_component_set` can partially rename before later validation fails | Refactor to plan/mutate phases; validate components, parent, property/value cardinality, component type, locks, instance interiors, remote components, duplicate variants, page compatibility, and parent appendability before any rename | Wrong type after a valid component, duplicate variant, locked component/ancestor, instance-interior component, remote component, parent locked, parent non-appendable, parent outside scope/name mismatch, and cross-page inputs all leave original names unchanged and do not call `combineAsVariants` |
| `combineAsVariants` can fail after temporary renames | Restore original component names if `combineAsVariants` throws after temporary renames but before a component set is created; do not build a general transaction layer or post-component-set rollback in v2.3.2 | Simulated `combineAsVariants` throw restores original names; tests assert parent placement was prevalidated so no late parent-placement failure remains after combine |
| `create_frame`, `create_text`, and `create_svg` create nodes before parent checks | Resolve and verify appendable parent before node construction, or clean up created nodes in a catch if construction must occur first | Missing `parentId`, nonexistent parent, and non-appendable parent reject before `figma.createFrame`, `figma.createText`, or `figma.createNodeFromSvg`; valid parent still creates/appends |
| `create_instance` creates an instance before parent checks | Resolve and verify appendable parent before component import/lookup and `component.createInstance`, or clean up the instance in a catch if early creation remains necessary | Missing `parentId`, nonexistent parent, and non-appendable parent reject before `component.createInstance`; valid parent still creates/appends |
| Safety matrix drift allowed docs to outrun code | Add executable safety-contract table or generated contract source | Every `SAFETY.md` Part B write row has a matching test-contract entry; claimed gates have handler-not-called or mutation-not-called assertions |
| Plugin UI version drift | Generate or inject UI version from package metadata and fail CI on mismatch | Version-sync check fails on mismatch and passes when `package.json`, generated constants, and UI display are aligned |

---

## §1. Dispatcher guard parity for documented single-target / creation tools (P0)

**The bug.** `SAFETY.md` promises guard stacks that are not consistently present in the dispatcher. The audit found concrete mismatches on `node_set_effects`, `node_clone`, and `create_svg`.

**Current behavior.**

- `node_set_effects` checks node-edit permission, scope, and exact node name, then calls `setEffects(params)`; the locked-node guard is absent in this dispatch path.
- `node_clone` checks node-edit permission, source scope, and exact source name, then calls `cloneNode(params)`; locked-source, parent, and instance-interior checks are absent before mutation.
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
   - check parent is in scope;
   - call `assertNotLocked(parent)`;
   - call `assertNotInstanceInterior(parent, "appended to")`.

**Error strings.**

Use the existing dispatcher/helper error families where possible:

- Locked source or parent: existing locked-layer `Operation Denied: ... locked ...` message.
- Instance-interior source: `Operation Denied: Cannot clone '${node.name}' because it is inside a component instance.`
- Instance-interior parent: existing `appended to` instance-interior message.
- Missing parent: `node_clone: '${node.name}' has no parent and cannot be cloned.`
- Non-appendable parent: `node_clone: parent '${parent.name}' (type ${parent.type}) cannot accept cloned children.`

**Tests.**

Unit tests in dispatcher suite:

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
- `node_clone` whose parent is inside an instance interior rejects before `node.clone` is called.
- Happy-path regressions: unlocked `node_set_effects`, `create_svg`, and `node_clone` still succeed.

---

## §2. `create_component_set` two-phase prevalidation and no partial rename (P0)

**The bug.** `create_component_set` is documented as a batch operation with zero-mutation abort for invalid inputs, but validation and mutation are currently interleaved. The handler validates type and duplicate variant combinations in the same loop that renames components, so a later invalid component can leave an earlier component renamed.

**Current behavior.**

- Dispatcher prevalidates that each component exists, is in scope, name-matches, and has the right number of property values. It does not fully validate component type, locked state, remote status, parent locked/appendability, parent instance-interior state, or duplicate variant uniqueness before entering the handler.
- Handler loops over components, checks type and property-value count, computes a variant name, checks duplicate combination, then sets `component.name = variantName`. A subsequent failure can occur after earlier names have changed.

**v2.3.2 change.**

Refactor into explicit plan/mutate phases:

```ts
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

async function validateCreateComponentSetPlan(params, scopeRoot): Promise<ComponentSetPlan> {
  // resolve all nodes, validate everything, mutate nothing
}

async function createComponentSet(params) {
  const plan = await validateCreateComponentSetPlan(params, scopeRoot);
  let componentSet: ComponentSetNode | null = null;

  for (const item of plan.components) {
    item.node.name = item.variantName;
  }

  try {
    componentSet = figma.combineAsVariants(
      plan.components.map(c => c.node),
      plan.containingPage,
    );
  } catch (err) {
    // Restore names only when combineAsVariants fails before creating a component set.
    // Broader transaction cleanup is out of scope for v2.3.2.
    for (const item of plan.components) {
      if (item.node.removed !== true) item.node.name = item.originalName;
    }
    throw err;
  }

  if (plan.componentSetName) componentSet.name = plan.componentSetName;
  if (plan.parent && componentSet.parent?.id !== plan.parent.id) {
    plan.parent.appendChild(componentSet);
  }
  return ...;
}
```

**Required prevalidation.**

Before any mutation:

- `components` is a non-empty array.
- `properties` is a non-empty array.
- Property names are non-empty strings.
- Property names are unique after exact string comparison.
- Every component node exists.
- Every component is inside the current scope.
- Every component name exactly matches the caller-provided `nodeName`.
- Every component type is exactly `COMPONENT`.
- No component or locked ancestor is locked.
- No component is inside an `INSTANCE` interior.
- No component is remote/shared-library-backed if `remote` is present and true.
- Every component has `propertyValues.length === properties.length`.
- Every computed variant combination is unique.
- Every component has a containing page.
- All components are on the same containing page unless live Figma verification proves `combineAsVariants` can safely combine across pages; absent proof, reject.
- If `parentId` is provided: parent exists, parent is in scope, `parentNodeName` matches, parent supports `appendChild`, parent and ancestors are not locked, and parent is not inside an instance interior.

**Error strings.**

Use exact, agent-actionable errors:

- Wrong type: `create_component_set: '${node.name}' (${node.id}) must be a COMPONENT, got ${node.type}.`
- Locked component: existing locked-layer error via `assertNotLocked(component)`.
- Remote component: `create_component_set: '${node.name}' is a remote shared-library component and cannot be combined into a local component set.`
- Duplicate variant: `Operation Denied: Duplicate variant combination '${variantName}' across components '${firstName}' and '${secondName}'. Each component in a set must have a unique property-value combination.`
- Parent cannot accept children: `create_component_set: parent '${parent.name}' (type ${parent.type}) cannot contain a component set.`
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
- If any component has the wrong `propertyValues` count, no component names change and `combineAsVariants` is not called.
- If parent is locked or has a locked ancestor, no component names change and `combineAsVariants` is not called.
- If parent is inside an instance interior, no component names change and `combineAsVariants` is not called.
- If parent is outside scope or has a mismatched `parentNodeName`, no component names change and `combineAsVariants` is not called.
- If parent lacks `appendChild`, no component names change and `combineAsVariants` is not called.
- If a component is locked or has a locked ancestor, no mutation occurs.
- If a component is inside an instance interior, no mutation occurs.
- If a component is remote, no mutation occurs.
- If components are on different pages, no mutation occurs unless this case is explicitly live-tested and allowed.
- Happy path still renames variants, calls `combineAsVariants`, renames the component set, reparents it if requested, and returns the expected `COMPONENT_SET` result.
- If `combineAsVariants` throws after names are assigned but before a component set is created, original names are restored.
- There must be no late parent-placement failure after `combineAsVariants`, because parent placement is prevalidated before any rename/combine mutation. v2.3.2 does not add a general post-component-set rollback layer.

Manual verification:

- Run `create_component_set` with one bad type after one valid component and confirm no partial rename.
- Run with duplicate property combinations and confirm no partial rename.
- Run with a locked parent and confirm no partial rename.
- Run happy path and confirm resulting variant names and set properties.

---

## §3. Creation handlers validate parents before node / instance creation (P1)

**The bug.** Some creation handlers create Figma objects before verifying the final parent exists and can accept children. If a late parent check fails, the handler can leave a newly-created object in the document.

**Current behavior.**

- `createFrame` calls `figma.createFrame()`, configures the frame, and only later checks `parentId`, resolves the parent, and checks `appendChild`.
- `createText` calls `figma.createText()`, configures text/fills, and only later checks `parentId`, resolves the parent, and checks `appendChild`.
- `createNodeFromSvg` calls `figma.createNodeFromSvg(params.svg)` before checking whether `parentId` is present, the parent exists, or the parent supports children.
- `createComponentInstance` resolves/imports a component and calls `component.createInstance()` before checking whether `parentId` is present, the parent exists, or the parent supports children.
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
- `createComponentInstance`: require `parentId`, resolve parent, then resolve/import the component, then call `component.createInstance()`, configure, append.
- `createShape`: keep parent-first behavior and add regression tests to prevent future drift.

If any handler must create an object before a later Figma-only validation can run, wrap the mutation block in `try/catch` and remove the created object on failure so the operation does not leave an orphan.

**Tests.**

- Missing `parentId` for frame/text/svg/component-instance throws before the create method is called.
- Nonexistent parent throws before the create method is called.
- Non-appendable parent throws before the create method is called.
- Valid parent still creates and appends the node / instance.
- For SVG, invalid/missing SVG string still errors before parent lookup if no node would be created; valid SVG with bad parent errors before `figma.createNodeFromSvg`.
- Simulated configuration error after node / instance creation removes the newly-created object before returning the error.
- `create_shape` regression tests prove parent validation still occurs before `figma.createRectangle`, `figma.createEllipse`, `figma.createPolygon`, or `figma.createStar`.

---

## §4. Executable safety matrix and drift prevention (P1)

**The gap.** `SAFETY.md` is central to the project’s trust story, but it can drift from dispatcher behavior. v2.3.2 should prevent another release where the matrix claims a locked/instance/batch guard that the code path does not enforce.

**v2.3.2 change.**

Add a machine-checkable safety contract. Two acceptable implementation patterns:

1. **Preferred: source-of-truth contract object.** Create `figma_plugin/src/safetyContract.ts` containing a structured table of command → expected gates. Tests assert dispatcher behavior from the table. `SAFETY.md` Part B is generated from this table.
2. **Minimum viable: test-only contract table.** Create `tests/unit/figma_plugin/safetyContract.test.ts` with a command → expected gates table and tests that exercise the dispatcher using mocks/spies.

For v2.3.2, the minimum acceptable gate categories are:

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

**Tests.**

The safety contract test must prove at least:

- Every tool listed in `SAFETY.md` Part B has a corresponding test-contract entry.
- Every write tool rejects when node-edit permission is missing, unless it is a variable/style global asset command gated by its own permission axis.
- Every scope-bound write rejects when there is no linked scope.
- Every exact-name write rejects on name mismatch and calls no handler mutation.
- Every claimed locked guard rejects locked target/parent and locked ancestors, then calls no handler mutation.
- Every claimed instance-interior guard rejects instance interior target/parent and calls no handler mutation.
- Every claimed scope-root-preservation guard rejects edits/deletes/reparents of the scope root.
- Every claimed remote-asset guard rejects remote variables/styles/components before mutation.
- Every claimed batch prevalidation rejects an invalid later item without mutating an earlier valid item.
- Handler-level prevalidation tests cover `create_frame`, `create_text`, `create_svg`, `create_shape`, and `create_instance` for parent validation before creation or cleanup on failure.
- The contract includes explicit rows for `node_set_effects`, `node_clone`, `create_svg`, `create_component_set`, `create_frame`, `create_text`, and `create_instance`, because these are the v2.3.2 regression targets.
- The contract includes negative tests for handler-not-called / Figma-create-method-not-called for each guard that claims pre-mutation enforcement.
- `SAFETY.md` v2.3.2 generated section or snapshot is up to date in CI.

CI impact:

- Add `bun test tests/unit/figma_plugin/safetyContract.test.ts` or include it in the existing `bun test` path.
- If using generation, add `bun run check:safety-contract` to CI.

---

## §5. Code-backed README, version sync, and safety documentation cleanup (P1)

**The gap.** Some concrete README / `SAFETY.md` safety bullets currently outpace the dispatcher and handler behavior: locked-layer, instance-interior, shared-library, and all-or-nothing batch claims are not uniformly enforced by the audited code paths. The plugin UI also displays an old version string despite `package.json` being newer. v2.3.2 should make the claims test-backed and aligned with the plugin guards.

**v2.3.2 change.**

Documentation updates:

- `SAFETY.md`
  - Change “Applies to: v2.3.1” to v2.3.2.
  - Update Part B matrix after the code fixes.
  - Clarify batch atomicity per **D5**: invalid inputs abort before mutation; no general Figma transaction layer is promised.
  - Ensure every matrix row has a matching safety-contract test entry.

- `README.md`
  - Keep product positioning if desired, including “Safer than Figma Itself.”
  - Update the supporting bullets so each concrete claim is true after v2.3.2 and covered by tests: scoped edits, exact-node verification, locked/instance/shared-library protections, and no partial batch mutation for batch tools.
  - Remove any bullet that is not implemented and tested.

- `figma_plugin/ui.html`
  - Replace hard-coded version display with generated version constant.

- `CHANGELOG.md`
  - Add v2.3.2 entry covering guard parity, `create_component_set` atomicity, create-parent prevalidation, safety-contract tests, docs/claims cleanup, and plugin UI version sync.

**Tests / checks.**

- Add CI check that package version and plugin UI displayed version match.
- If docs are generated, add `check:docs` or include in `check:generated`.
- Markdown link check remains in CI.

---

## Documentation impact

Update the operational guidance used by both humans and agents:

- **`SAFETY.md`** — v2.3.2 safety contract, executable matrix, and batch semantics.
- **`README.md`** — safety bullets aligned with implemented guards and tests; version/tool table if needed.
- **`skills/figma-edit/references/error-playbook.md`** — add recovery guidance for locked/instance rejections on `create_svg`, `node_clone`, and `node_set_effects`; duplicate variant rejection; parent-not-appendable creation errors.
- **`skills/figma-edit/references/workflows.md` / `tool-selection.md`** — update component-set workflow: validate component names/types and unique variant combinations before creating a component set.
- **MCP resources / generated manifest** — regenerate if any tool descriptions or guide resources change.

---

## Testing & rollout

**Build:**

- Run `bun run build:all`.
- Run plugin build and `check:plugin`.
- Run generated-file checks, including safety contract/docs if added.
- Confirm dist binaries still resolve under the existing package smoke tests.

**Unit tests:**

- Dispatcher guard tests for `node_set_effects`, `node_clone`, `create_svg` covering permission, scope, exact name, locked target/parent/ancestor, instance-interior target/parent, and no handler call on rejection.
- Component-set prevalidation and partial-rename tests covering wrong type, mismatched names, out-of-scope components, locked components/parents, instance interiors, remote components, duplicate variant combinations, bad parent, cross-page behavior, `combineAsVariants` throw, and happy path.
- Create-handler no-orphan tests for `create_frame`, `create_text`, `create_svg`, and `create_instance`, plus parent-first regression tests for `create_shape`.
- Safety contract matrix tests covering all documented write commands.
- Version-sync test for plugin UI.

**Manual verification in Figma:**

1. Link scope to an editable frame.
2. Try `node_set_effects` on a locked node; confirm structured locked error and no effect change.
3. Try `create_svg` under a locked parent and under an instance interior; confirm no SVG node is created.
4. Try `node_clone` on a locked node and on a node inside an instance; confirm no clone is created.
5. Try `create_component_set` with a bad second component; confirm the first component keeps its original name.
6. Try `create_component_set` with duplicate variant values; confirm no component names change.
7. Try `create_component_set` with a locked parent and a non-appendable parent; confirm no component names change.
8. Try `create_text` / `create_frame` / `create_svg` / `create_instance` with bad parent IDs and non-appendable parents; confirm no orphan nodes or instances appear on the page.
9. Try a create-handler configuration failure after object creation if a cleanup path exists; confirm the created object is removed.
10. Confirm plugin About tab shows `2.3.2`.

**Version:**

- Bump `package.json` to `2.3.2`.
- Update `CHANGELOG.md`.
- Tag release only after CI and manual verification pass.

---

## Peer review checklist

Before implementation starts, run this PRD through adversarial review against the code and Figma behavior:

| # | Claim to verify | Required disposition |
| :- | :- | :- |
| 1 | `node_set_effects` can be changed to `validateSingleNodeWrite(...checkLocked)` without blocking legitimate unlocked effects | Implement or revise |
| 2 | `node_clone` inside an instance is a structural edit and should be blocked | Implement unless owner explicitly allows clone-as-read-like behavior |
| 3 | `create_svg` under locked/instance parent is currently possible enough to require dispatcher guard | Implement |
| 4 | `combineAsVariants` requires same-page components | Live-test; if false, remove same-page precheck from §2 |
| 5 | Remote main components can appear in `create_component_set` inputs | If yes, enforce remote guard; if no, keep test as future-proof |
| 6 | Parent prevalidation before `figma.createText()` does not break font loading / text setup | Implement or add cleanup fallback |
| 7 | Parent prevalidation before `createComponentInstance()` does not break local or remote component-instance creation | Implement or add cleanup fallback |
| 8 | README concrete safety bullets are backed by implementation and tests | Implement or revise the specific unenforced bullet |

---

## Provenance — issue verification

Every issue below was confirmed by static audit before this PRD was written:

| Issue | Verified at | Finding |
| :- | :- | :- |
| Package version | `package.json` | Current version is `2.3.1`; v2.3.2 should bump from there. |
| Safety matrix claims | `SAFETY.md` | Guarantees include all-or-nothing batches and respect for locked/shared-library/instance-interior protections; Part B lists specific guard stacks. |
| `node_set_effects` locked guard mismatch | `figma_plugin/src/main.ts` | Dispatch checks permission, scope, and name, then calls `setEffects`; no locked guard is present. |
| `create_svg` parent guard mismatch | `figma_plugin/src/main.ts`, `figma_plugin/handlers/vectorHandlers.ts` | Dispatch checks parent scope/name only; handler creates SVG before final parent existence/appendability checks. |
| `node_clone` locked/instance/parent mismatch | `figma_plugin/src/main.ts`, `figma_plugin/handlers/nodeCreators.ts` | Dispatch checks source scope/name only; handler clones before checking parent append path. |
| `create_component_set` partial mutation | `figma_plugin/src/main.ts`, `figma_plugin/handlers/componentHandlers.ts` | Dispatcher misses type/locked/duplicate validations; handler renames components inside the validation loop. |
| Creation handlers mutate before parent validation | `figma_plugin/handlers/nodeCreators.ts`, `figma_plugin/handlers/vectorHandlers.ts`, `figma_plugin/handlers/componentHandlers.ts` | `createFrame`, `createText`, `createNodeFromSvg`, and `createComponentInstance` create/configure objects before resolving/checking parent. |
| Plugin UI version drift | `figma_plugin/ui.html`, `package.json` | UI About tab says `2.2.0` while package version is `2.3.1`. |
| README safety-bullet drift | `README.md`, `SAFETY.md` | README safety bullets claim locked/shared-library/instance-interior protection and all-or-nothing batches; the audited code paths do not yet enforce every bullet consistently. |
