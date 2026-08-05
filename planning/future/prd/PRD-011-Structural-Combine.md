# PRD — Structural Combine

- **Status:** Proposed; implementation is blocked on native-behavior probes
- **Release:** Version-unassigned standalone minor release with an accepted hard cutover
- **PRD date:** 2026-08-04
- **Source:** [Figma Design Editing Capability Expansion, Section 19](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md#19-node_combine-group-and-boolean-structural-operations-p0)
- **Compatibility posture:** Hard-replace `node_group` with `node_combine`; no compatibility alias

> [!IMPORTANT]
> This release owns the complete structural-combine decision: `GROUP`, `UNION`, `SUBTRACT`, `INTERSECT`, and `EXCLUDE`, one explicit ordered node list, one exact parent/index plan, one complete preflight, and one normalized result. Grouping and booleans may not be split into separate releases or temporary schemas.

## 1. Executive summary

Replace implicit-parent `node_group` with explicit `node_combine`. Every call names its operation, at least two unique exact nodes, and the exact destination parent. The plugin validates the complete structural plan before making exactly one corresponding native Figma call.

The release deliberately accepts a hard public cutover: `node_group` disappears from schemas, registration, dispatch, generated output, prompts, guides, tests, and `SAFETY.md`. There is no alias and omission never defaults to grouping.

Because native order, subtract-base, insertion-index, child-identity, placement, and boolean-ungroup behavior cannot be safely inferred from UI conventions or TypeScript signatures, live probes against the scheduled pinned Figma environment are release blockers. Unexpected structural drift is reconciled and reported; no automatic rollback is claimed.

## 2. Release identity and source mapping

| Source requirement | Disposition in this release |
| :- | :- |
| Source checklist item 31 | Complete |
| Product decision D28 | Preserved exactly |
| Section 19 complete contract | Complete |
| `node_group` migration table entry | Owned here |
| Section 20 `node_combine` and conditional `node_ungroup` safety rows | Owned here |
| Schema requirement 21 | Owned here |
| Phase 3 structural bullet | Expanded below |
| Structural schema, handler, safety, live-probe, and retired-route tests | Owned here |

Public-surface arithmetic:

- tools added by name: `node_combine`;
- tools removed by name: `node_group`;
- net tool-count change: 0;
- permanent compatibility aliases: 0.

This repository explicitly accepts the hard cutover in a minor release. The concrete version remains unassigned until scheduling. Release notes must identify the incompatibility prominently.

## 3. Problem

The current `node_group` surface accepts an ordered list and optional name but infers the destination parent from the first input. It cannot create boolean combinations and does not expose parent/index planning. Hidden parent inference is inconsistent with explicit discovery and makes recovery from mixed-parent or placement failures needlessly indirect.

Figma provides native group and boolean APIs with similar structural inputs, but their ordering and insertion semantics are consequential:

- `SUBTRACT` depends on which input is the base;
- consuming existing siblings can change how a supplied index is interpreted;
- a native exception may occur after some structural state changed;
- a broad `ungroup` signature does not prove safe boolean ungrouping in the live host.

## 4. Goals

1. Make operation, ordered nodes, parent, and optional insertion index explicit.
2. Support native `GROUP`, `UNION`, `SUBTRACT`, `INTERSECT`, and `EXCLUDE` through one tool.
3. Validate every input and the complete hierarchy plan before the native call.
4. Preserve the caller's node order exactly.
5. Invoke exactly one matching native combine API.
6. Return normalized result hierarchy, placement, and child order.
7. Give one-round-trip repair operands for every predictable refusal.
8. Disclose exact before/resulting state after unexpected native drift.
9. Verify whether `node_ungroup` safely supports boolean results and include that conditional change in this release only if proven.
10. Remove every `node_group` route and reference in the same release.

## 5. Explicit non-goals

- No `node_group` alias, hidden route, or default `GROUP` behavior.
- No standalone union/subtract/intersect/exclude tools.
- No selection-based input, parent, order, or index inference.
- No cross-parent reparenting hidden inside `node_combine`.
- No one-node combination, even if native grouping permits it.
- No lossy flattening; `node_flatten` remains separate.
- No mutation of `booleanOperation` on an existing boolean node.
- No unverified automatic rollback.
- No general transaction system.
- No transform, layout, page rename, appearance, paint, text, creation, component, instance, or variable work.

## 6. Discovery and migration workflow

When a prior `page_info` or `node_info` `MATCHES` result already carries the exact parent tuple and path, use it directly. Otherwise use this selection-independent sequence:

1. Read every input's parent:

   ```ts
   node_info({
     nodeIds,
     properties: ["parent"],
     maxDepth: 0
   });
   ```

   Require every non-null returned parent ID to be identical.

2. Read that parent:

   ```ts
   node_info({
     nodeIds: [parentId],
     maxDepth: 1
   });
   ```

   The root supplies `parentNodeName`; immediate children supply current sibling order for choosing or omitting `index`.

3. Pass all exact identities back verbatim. Never parse a display-only path or infer from current page/selection.

This is discovery before mutation. A later parent mismatch error includes observed parent operands and complete legal `node_insert_child` prerequisite call objects so the caller need not repeat discovery.

Migration:

```ts
// Retired
node_group({ nodes, name? });

// Required replacement
node_combine({
  operation: "GROUP",
  nodes,
  parentId,
  parentNodeName,
  index,
  name
});
```

## 7. Exact public contract

```ts
type NodeCombineOperation =
  | "GROUP"
  | "UNION"
  | "SUBTRACT"
  | "INTERSECT"
  | "EXCLUDE";

type NodeCombineInput = {
  operation: NodeCombineOperation;
  nodes: Array<{
    nodeId: string;
    nodeName: string;
  }>;
  parentId: string;
  parentNodeName: string;
  index?: number; // native parent insertion index; omit to append
  name?: string;
};
```

### 7.1 Schema rules

- The top-level object and every node item are recursively strict.
- `operation` is required, has exactly five values, and has no default.
- `nodes` contains at least two items.
- Duplicate node IDs fail at the MCP boundary.
- Every node and parent ID is a non-empty string.
- Exact names are required verbatim and may be empty only when the corresponding live Figma name is empty. Do not trim or normalize identity operands.
- `index`, when supplied, is a non-negative integer. Its exact live upper bound and semantics are fixed by Gate R0.
- Optional result `name` follows the existing grouping/rename string policy.
- Supplied node order is explicitly described as structural data.

## 8. Complete structural preflight

Before any native structural API:

1. Resolve every input and the parent.
2. Validate the full plan and collect independently actionable predictable failures in request order, subject to scope-disclosure policy.
3. Exact-name-verify every node and the parent.
4. Apply permission and scope checks to every identity.
5. Require an appendable, in-scope, unlocked parent that is not an `INSTANCE` and is not inside an instance.
6. Require every input to be reparentable, unlocked, outside instance interiors, and not the connected scope root.
7. Reject `DOCUMENT`, `PAGE`, removed/unavailable nodes, and operation-specific unsupported types.
8. Require each input's current parent to equal `parentId`.
9. Reject the parent as an input, duplicate logical identities, ancestor/descendant pairs, and every cycle-producing plan.
10. Snapshot each input's ID, parent, sibling index, absolute transform, and bounds.
11. Snapshot the destination parent's complete child order.
12. Validate `index` using the pinned native interpretation.
13. Preserve the submitted `nodes` array exactly; never sort by ID, name, position, or sibling index.

Any predictable failure aborts before the native combine call.

## 9. Recovery-bearing errors

Structural errors must identify more than “cannot combine nodes.” Required conditions and details:

| Condition | Required `details` and recovery |
| :- | :- |
| Missing/invalid operation | Accepted five-value enum and corrected skeleton; never guess `GROUP` |
| Duplicate input | Every duplicate ID/request index, `correctedNodes` with later duplicates removed, and notice when fewer than two unique nodes remain |
| Unsupported/non-reparentable input | Request index, exact ID/name/type, accepted types for the operation, nearest safe alternative where one exists |
| Parent-as-input or ancestor conflict | Both request indexes/identities, relationship, and explicit restructure-before-retry guidance |
| Wrong/mixed parent | Desired exact parent, every observed parent identity, and ordered complete `node_insert_child({ parentId, parentNodeName, childId, childNodeName, index? })` prerequisite call objects when independently legal. Each call includes every required exact operand; `index` is included when needed to preserve the requested combination order. |
| Parent identity mismatch | Supplied and observed exact parent IDs/names plus corrected call |
| Invalid index | Supplied value, pinned interpretation, current child count/order, valid inclusive range, nearest-boundary corrected call |
| Name/scope/lock/instance/scope-root refusal | Request index, `INPUT` or `PARENT` role, observed identity/state, and central recovery guidance |
| Native invariant drift or partial mutation | Complete before/resulting hierarchy, any new container, `whatChanged`, `partialMutation: true`, and no rollback claim |

If multiple independently knowable request items are invalid, return all failures in request order unless a later check would reveal out-of-scope information.

## 10. Native operation and release-blocking probes

After preflight, call exactly one native API:

| Operation | Native API | Expected result type |
| :- | :- | :- |
| `GROUP` | `figma.group(nodes, parent, index?)` | `GROUP` |
| `UNION` | `figma.union(nodes, parent, index?)` | `BOOLEAN_OPERATION` |
| `SUBTRACT` | `figma.subtract(nodes, parent, index?)` | `BOOLEAN_OPERATION` |
| `INTERSECT` | `figma.intersect(nodes, parent, index?)` | `BOOLEAN_OPERATION` |
| `EXCLUDE` | `figma.exclude(nodes, parent, index?)` | `BOOLEAN_OPERATION` |

### Gate R0 — pinned native behavior

Before finalizing schema descriptions or implementing assertions, live-probe all five operations and record:

- whether resulting child order follows the supplied array;
- which supplied position is the visual base for `SUBTRACT`;
- whether `index` is interpreted against the pre-operation child list;
- how indices spanning consumed children resolve;
- the valid inclusive insertion range;
- whether child IDs remain stable;
- whether absolute placement remains stable;
- actual parent/index placement of the result.

These probes are release blockers. If caller-visible deterministic ordering cannot be guaranteed, stop and revise the contract. Do not normalize or document inferred behavior.

### 10.1 Post-native naming and readback

After the native call returns:

1. set optional `name`;
2. read result type and `booleanOperation` where applicable;
3. read parent/index;
4. read actual child order, IDs, names, and indices;
5. verify absolute placement and pinned invariants.

If naming or readback fails after combination, report the created container and resulting hierarchy as a partial mutation.

### 10.2 Native exception reconciliation

One native call reduces predictable partial-mutation risk but is not a transaction. If it throws:

- inspect every input's parent/index/transform state;
- inspect the destination child list;
- identify any observable new container;
- return `before`, `resulting`, `whatChanged`, and `partialMutation`;
- do not retry or automatically roll back.

## 11. Success output and annotations

```ts
type NodeCombineResult = {
  id: string;
  name: string;
  type: "GROUP" | "BOOLEAN_OPERATION";
  operation: NodeCombineOperation;
  booleanOperation?: "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE";
  parentId: string;
  index: number;
  children: Array<{
    id: string;
    name: string;
    index: number;
  }>;
  childCount: number;
  partialMutation?: boolean;
  warnings?: string[];
};
```

`operation` is always present. `booleanOperation` is required for boolean results and forbidden for `GROUP`.

Static annotations:

```ts
{
  destructiveHint: true,
  openWorldHint: true
}
```

Do not set `idempotentHint: true`. Repeating a successful call addresses nodes whose parent has changed and is a different structural plan. `GROUP` carries the same destructive hint because MCP annotations cannot vary by operation and grouping changes hierarchy and z-order.

## 12. Conditional `node_ungroup` compatibility

The scheduled pinned typings may accept `SceneNode & ChildrenMixin`, but the current handler supports only `GROUP`. Live-probe ungrouping each boolean result for:

- child ID preservation;
- absolute placement preservation;
- resulting sibling order;
- failure/partial-state behavior.

If every required invariant passes:

- expand `node_ungroup` in this same release to accept `GROUP | BOOLEAN_OPERATION`;
- return promoted children in resulting order;
- document it as the nearest structural inverse.

If any required invariant fails:

- retain the current `GROUP`-only contract;
- state explicitly that boolean combinations have no verified MCP inverse;
- do not claim reversibility from the TypeScript signature.

In either outcome, preserve exact-name, scope-root, scope, lock, and instance-interior gates and add result-type-specific tests. Changing an existing `booleanOperation` remains out of scope.

## 13. Safety contract

`SAFETY.md` must remove the `node_group` row and add `node_combine` with:

- authorization for every exact input and the exact parent;
- at least two unique reparentable inputs;
- same-parent enforcement;
- parent appendability;
- scope-root, lock, instance-interior, ancestor, and cycle checks;
- exact supplied-order preservation;
- pinned parent-index validation;
- one native call after full preflight;
- post-error reconciliation.

The conditional `node_ungroup` row is changed only according to Gate R0. The registered-tool/safety-row consistency test must fail if `node_group` remains in either direction.

## 14. Dependencies and exclusions

### Required baseline

- Existing exact-node `node_info` reads of `parent` and parent children.
- Existing node permission, scope, lock, exact-name, scope-root, and instance-interior gates.
- Existing `node_insert_child`, `node_flatten`, and `node_ungroup` alternatives, each with its current contract.
- Pinned Figma APIs exposing the five native operations.

Strict `MATCHES` output is useful but not required because the two-read fallback is complete. No current-page or selection behavior is a dependency.

### Separate releases

Transform, PAGE rename, layout, appearance, paints, text, creation, variables, and component/instance work remain separate. Shared `node.ts`, dispatcher, and `nodeModifiers.ts` paths do not make their product contracts overlap.

## 15. Implementation areas and phases

### Primary files

- `src/mcp_server/tools/node.ts`
- `src/mcp_server/tools/index.ts` or current registration inventory
- `figma_plugin/src/main.ts`
- `figma_plugin/handlers/nodeModifiers.ts`
- `figma_plugin/handlers/nodeReaders.ts` only if parent-read normalization needs a compatible correction
- central error definitions/playbook
- `src/mcp_server/tests/unit/tools/`
- `src/mcp_server/tests/unit/figma_plugin/`
- `SAFETY.md`
- `skills/figma-edit/references/` and resource mirrors
- generated `figma_plugin/code.js`

### Phase 0 — Gate R0 and baseline inventory

- Record current `node_group` registration, schema, dispatcher, handler, safety row, prompts, docs, tests, and generated references.
- Run all native ordering/index/subtract/identity/placement probes.
- Run the boolean-ungroup probe and record the binary contract decision.

### Phase 1 — Public schema and migration

- Add strict `NodeCombineOperation`, node identities, parent identity, and index plan.
- Add recovery-bearing error types and examples.
- Add emitted-schema and annotation red tests.
- Add a complete old-to-new migration example.

### Phase 2 — Complete plan validator

- Resolve and snapshot all nodes and parent.
- Implement complete multi-error structural validation.
- Preserve supplied order and authorize every identity.
- Add zero-native-call assertions for predictable refusal.

### Phase 3 — Native execution and reconciliation

- Route each operation to exactly one native API.
- Add optional post-native naming.
- Normalize hierarchy readback.
- Add invariant-drift and partial-state reconciliation.
- Implement the conditional `node_ungroup` decision from Gate R0.

### Phase 4 — Hard-cutover cleanup

- Remove `node_group` from registration, command/client unions, dispatcher, handler exports, prompts, guides, `SAFETY.md`, tests, and generated output.
- Prove no hidden compatibility route remains.

### Phase 5 — Documentation and release closure

- Synchronize docs/resource mirrors/changelog/version.
- Regenerate plugin output.
- Run repository gates, red proofs, and live matrix.

## 16. Verification requirements

### 16.1 Emitted-schema tests

- Exactly five required operation values; no default.
- At least two unique strict exact-node items.
- Required exact parent.
- Optional non-negative integer index with pinned description.
- Unknown top-level/nested keys fail.
- Supplied-order significance appears in emitted descriptions.
- Destructive/open-world annotations are present; idempotent is absent.
- `node_group` is absent and tool count is unchanged.

### 16.2 Handler tests

- Success for all five operations.
- Exact parent/index placement and actual child order.
- Pinned subtract-base behavior.
- Child ID and absolute-placement preservation.
- Duplicate, unsupported, missing, wrong-name, locked, out-of-scope, scope-root, instance-interior, ancestor-related, mixed/wrong-parent, parent mismatch, and invalid-index refusals.
- Full-plan multi-error ordering.
- Every predictable refusal makes zero native structural calls.
- Exactly one native call on success.
- Normalized result readback.
- Injected native, naming, and readback failures report exact before/resulting state.
- Conditional `node_ungroup` behavior exactly matches Gate R0.

### 16.3 Retired-route and safety tests

- `node_group` is absent from tool registration, client/command unions, dispatch, handler exports, prompts, generated bundle, docs, and safety rows.
- Every input and parent is independently authorized.
- No handler reads selection or infers current page.
- Registered writes and `SAFETY.md` are bidirectionally synchronized.
- `node_flatten`, `node_combine`, and `node_ungroup` remain unambiguous alternatives.

### 16.4 Live Figma matrix

In a dedicated file, verify:

1. selection-independent parent discovery;
2. all five operations;
3. supplied child order and subtract base;
4. omitted and explicit parent index placement;
5. child ID and absolute-placement preservation;
6. exact normalized hierarchy readback;
7. duplicate/mixed-parent/ancestor/lock/scope/instance invalid-plan atomic refusal;
8. observable partial state after injected/host failure where safely inducible;
9. the conditional boolean-ungroup probe;
10. migration of a representative former `node_group` call.

Mocks and typings do not establish native ordering or inverse behavior.

## 17. Documentation, generated output, and version gates

Before release:

- Update `README.md`, `SAFETY.md`, `CHANGELOG.md`, tool-selection, workflows, constraints, and error playbook.
- Update matching `figma-edit://guide/*` resources.
- Publish the exact two-read parent-discovery workflow.
- Publish the hard-cutover migration and state that no alias/default exists.
- Distinguish editable combine from lossy flatten and conditional ungroup.
- Document live-proven child order, subtract base, and index semantics.
- Regenerate `figma_plugin/code.js`; do not hand-edit it.
- Update tool-list/count, emitted-schema, annotation, permission, safety, and retired-route assertions.
- Assign and synchronize the scheduled version in every current enforced surface.
- Run server/plugin type checks, generated-file checks, suppression checks, plugin build verification, version checks, focused suites, and the full unit suite.

## 18. Acceptance gate

- [ ] Gate R0 fixes all native order/index/subtract/identity/placement semantics from live evidence.
- [ ] `node_group` is fully absent and `node_combine` is the only combine tool.
- [ ] All five operations share the exact strict contract and complete preflight.
- [ ] Omission never implies `GROUP`.
- [ ] Every predictable invalid plan produces zero mutation and actionable repair operands.
- [ ] Every legally recoverable wrong/mixed-parent refusal returns ordered, complete `node_insert_child` call objects with all exact required identities and any necessary index.
- [ ] The caller's order reaches exactly one matching native call unchanged.
- [ ] Success returns actual result type, operation, parent/index, and child order.
- [ ] Unexpected drift discloses exact before/resulting structural state.
- [ ] Boolean `node_ungroup` support matches the recorded probe and is not overclaimed.
- [ ] Schema, handler, safety, retired-route, injected-fault, and live tests pass.
- [ ] Docs, resources, generated output, changelog, and version surfaces are synchronized.
- [ ] No adjacent scope entered the release.

## 19. Risks and mitigations

| Risk | Mitigation |
| :- | :- |
| Hard cutover breaks callers | Prominent migration table, repository-wide absence checks, no ambiguous alias |
| Input order or subtract base differs from assumptions | Release-blocking live probes; preserve input array verbatim |
| Parent index shifts while inputs are consumed | Pin exact native interpretation and test boundary cases |
| Native API partially reparents before throwing | Complete preflight, snapshots, one call, post-error hierarchy reconciliation |
| `GROUP` destructive hint seems conservative | Explain static broadest-branch annotation and hierarchy/z-order effect |
| Broad typings imply an unsafe boolean inverse | Gate `node_ungroup` solely on live identity/placement/order evidence |
| Multi-error output leaks scope information | Preserve request order subject to existing scope-disclosure policy |
| Shared modifier files attract unrelated changes | Enforce exclusions and release-local diff review |

## 20. Source fidelity and unresolved evidence

The source contract has one intentional unresolved runtime branch: boolean `node_ungroup` compatibility. That is not permission to guess; Gate R0 must resolve it before release. Native ordering, subtract-base, and insertion-index semantics are likewise evidence gaps explicitly marked release-blocking by the umbrella PRD.

No other product contradiction was found in this slice. If the live probes cannot support deterministic caller-visible ordering, implementation stops and this PRD must be revised rather than weakening behavior silently.
