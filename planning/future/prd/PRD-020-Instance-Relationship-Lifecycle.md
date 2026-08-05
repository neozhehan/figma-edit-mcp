# PRD — Instance Relationship Lifecycle

> [!IMPORTANT]
> **Release type:** standalone minor release
>
> **Version:** unassigned; assign its SemVer only when this release is scheduled
>
> **Status:** draft
>
> **Standalone extraction/revision:** 2026-08-04
>
> **Authoritative source:** [Figma Design Editing Capability Expansion](../initiative/03%20-%20Figma%20Design%20Editing%20Capability%20Expansion/initiative.md), Section 13 and the detach portion of Section 14

This release adds two explicit tools for changing an instance's relationship to
a component:

- `instance_swap_component` changes the main component while retaining the
  instance identity and whatever compatible overrides Figma preserves;
- `instance_detach` permanently replaces a top-level instance with a plain
  frame whose layers can be edited directly.

They remain separate tools because their intent, safety gates, identity
behavior, retry semantics, and results are materially different. They share one
standalone release because they use the same exact instance/destination
discovery, state snapshot, dispatcher and handler context, destructive
documentation, safety matrix, and live component fixtures. Splitting them would
reopen the same instance files and Figma evidence setup for a small additional
scope.

---

## Release identity and compatibility

Public surface change:

| Change | Tool | User decision |
| :- | :- | :- |
| Add | `instance_swap_component` | Keep this instance, change its component relationship |
| Add | `instance_detach` | End this instance's component relationship permanently |

No existing tool is renamed or removed. The public tool count increases by two.
There are no overloaded `action` values, aliases, selection-based branches, or
hidden dispatcher routes. The two tools remain individually discoverable and
carry distinct schemas/results even though they share implementation helpers.

Because this release is scheduled before PRD-019, the predecessor's
`instance_set_property`, `instance_get_overrides`, and
`instance_set_overrides` routes remain callable here without behavioral
changes. They are explicitly legacy and are removed or replaced only by
PRD-019. This release must distinguish the new identity-preserving swap from the
legacy source-template hybrid; it must not teach that hybrid as an equivalent
swap or silently change its contract.

Both are explicitly destructive:

- swap may lose incompatible overrides because Figma preservation is
  heuristic;
- detach permanently removes the component relationship and changes the node
  identity.

When scheduled, assign one minor version in root `package.json`, root
`package-lock.json` release fields, both root `server.json` version fields, and
root `manifest.json`. Verify the derived plugin About/handshake/bundle output
through `check:plugin`. Do not add a version to `figma_plugin/manifest.json`,
change the unrelated `src/mcp_server/package.json` package identity, or hard-code
a release literal in `src/shared/version.ts`.

---

## Schedule and canonical-state reuse

This release is the hard scheduled predecessor of
[`PRD-019-Exact-Instance-State-Property-Writes-and-Override-Reset.md`](PRD-019-Exact-Instance-State-Property-Writes-and-Override-Reset.md).
PRD-019 removes the hybrid `instance_set_overrides` route and names
`instance_swap_component` as one of its required intent-specific migrations;
therefore swap must already exist when that no-backcompat cutover ships.

Catalog numbers do not prescribe SemVer order. This release must not depend on
PRD-019's public `node_info` expansion, or the two PRDs would form a cycle.
Instead, this release introduces/reuses one internal canonical instance-state
snapshot helper for its before/after safety and reporting. PRD-019 later reuses
that helper for its public canonical read and override-manifest comparison.

No PRD-019 tool, retirement, or public schema is pulled into this release.

---

## Source mapping

| Standalone scope | Umbrella source | Disposition |
| :- | :- | :- |
| Component swap purpose, contract, annotations, output | Section 13 | Preserved for identity, parent/index, annotations, destination, and observable override behavior; placement/prototype prose is not promoted beyond the section's acceptance boundary without explicit readback |
| Detach purpose, contract, safety, annotations, output | Section 14, Detach | Preserved |
| Separate-tool decision | D13 | Preserved within one release |
| Destructive classification | D14 and Section 20 annotation table | Preserved |
| Safety/error rows | Section 20 swap/detach rows | Restated here |
| Tests/live evidence | Instance lifecycle tests, live items 12–13, risks | Restated here |

Historical checklist IDs retained here are 14 and 15. Product decisions D1–D6
and D13–D14 apply. D7 does not apply because both lifecycle tools are additions,
not hard-cut renames.

---

## Goals

- Let a caller swap one exact local instance to one exact local or library
  component without delete/recreate.
- Verify preservation of the instance ID, parent, and layer index, and disclose
  compatible/incompatible override observations conservatively.
- Disclose observable retained, changed, missing, and added property/override
  observation tokens without claiming a semantic preservation guarantee.
- Let a caller permanently detach one eligible top-level instance and receive
  the replacement frame identity and location.
- Prevent detach from widening one target authorization to nested ancestor
  instances or invalidating the connected scope anchor.
- Protect locked descendants from losing component protection.
- Preflight every predictable failure and reconcile state after unexpected
  native failures without silent retries.
- Provide complete tool-selection guidance between swap, detach, property
  writes, override reset, direct edits, and clone.

## Non-goals

- No action router combining swap and detach.
- No new source-to-target override-transfer behavior. The scheduled
  predecessor's legacy `instance_set_overrides` route remains unchanged until
  PRD-019 removes it; this release neither expands nor presents it as an
  equivalent to swap.
- No `instance_attach` inverse or claim that detach is reversible.
- No override-preservation guarantee for swap.
- No swap to a `COMPONENT_SET` rather than an exact component.
- No nested-instance detach and no detach of the connected scope root.
- No current-selection/current-page defaults.
- No `instance_set_component_properties`, canonical public override manifest,
  or `instance_remove_overrides`; those belong to PRD-019.
- No remote component-definition mutation; library import is destination
  discovery and the local instance is the mutation target.

---

## Shared discovery and internal state snapshot

Callers begin with explicit reads:

```ts
node_info({
  nodeIds: [instanceId],
  properties: ["parent", "mainComponent", "componentProperties", "overrides"],
  maxDepth: 0
});
```

For a local destination, read the exact component ID/name with `node_info` or
`component_list`. For a library destination, use the stable component key and
the exact expected imported name supplied by library discovery. No branch uses
the current selection or silently chooses a page/component.

Both tools use one internal snapshot shape:

```ts
type InstanceRelationshipSnapshot = {
  instanceId: string;
  instanceName: string;
  parentId: string;
  index: number;
  mainComponent: {
    id?: string;
    key?: string;
    name: string;
    remote: boolean;
  } | null;
  componentProperties: ComponentProperties;
  overrides: Array<{
    id: string;
    overriddenFields: string[];
  }>;
};
```

The helper preserves exact component-property keys and direct override
membership and canonicalizes override ordering without deduplicating invalid
Figma state. It is internal in this release; PRD-019 is responsible for making
the canonical read a hard public contract.

---

## `instance_swap_component` contract

### Swap purpose and input

Swap keeps the same instance and asks Figma to preserve compatible overrides
using `instance.swapComponent(component)`.

```ts
type InstanceSwapComponentInput = {
  nodeId: string;
  nodeName: string;
  component:
    | {
        source: "LOCAL";
        componentId: string;
        componentName: string;
      }
    | {
        source: "LIBRARY";
        componentKey: string;
        componentName: string;
      };
};
```

The top level and both destination branches are recursively strict. Exactly one
branch is accepted; IDs/keys/names are non-empty. Local-only fields are
forbidden in the library branch and vice versa.

### Preflight and eligibility

Before importing or mutating:

1. resolve and exact-name-verify one in-scope, unlocked `INSTANCE` target;
2. apply the existing node permission, scope, exact-name, and direct-target
   instance-write stack;
3. for `LOCAL`, resolve one local `COMPONENT`, not a `COMPONENT_SET`, and
   exact-name-verify it;
4. for `LIBRARY`, import by stable `componentKey`, require the returned node to
   be an exact `COMPONENT`, and verify its name against `componentName` before
   swap;
5. allow a remote destination because only the local instance mutates;
6. allow an explicitly named nested instance—it is the direct override target;
7. allow the connected scope-root instance because its ID and hierarchy remain
   stable;
8. allow a target whose current main component is unavailable (`null`) as a
   repair-by-swap case; it cannot take the same-component no-op path;
9. capture the complete relationship snapshot.

After the last import/read `await` and immediately before either the no-op
decision or `swapComponent()`, synchronously recheck the retained target object:
exact ID/name/type, connected-scope containment, target/ancestor locks,
instance-interior eligibility, parent/index, and scope-root allowance. Recheck
the resolved destination's exact ID-or-key/name/type as well. Any drift fails
before the native setter. No further `await`, target re-resolution, reporting,
or telemetry may occur between this final guard and `swapComponent()`.

Import/name/type failure must occur before `swapComponent()`. Ordinary
structural writes inside an instance interior remain blocked; this explicit
instance-target operation is the narrow exception.

### No-op, mutation, and readback

If the current main component already matches the resolved destination exact
identity, return a no-op without invoking Figma's heuristic again.

Otherwise call `instance.swapComponent(component)` exactly once. Read the
relationship state back and verify that instance ID, parent ID, and child index
are unchanged. Compare observable component-property/override identities before
and after.

Figma's identity-preserving operation is preferable to delete/recreate and may
also retain placement and prototype connections, but this release does not load
the reaction-editing subsystem merely to promote those contextual benefits into
new output guarantees. Its verified preservation contract is the source's §13
acceptance boundary: instance ID, parent, child index, and observable override
state. A later claim of exact placement or reaction preservation requires
explicit readback fields and regression evidence.

Observation keys use one exact public tokenization:

```ts
type InstanceSwapObservationKey =
  | `PROPERTY/${string}`
  | `OVERRIDE/${string}/${string}`;
```

Each `${string}` segment is `encodeURIComponent` of the exact canonical
component-property key, override node ID, or overridden field. A PROPERTY token
represents one `componentProperties` entry. An OVERRIDE token represents one
flattened `{ id, overriddenField }` membership from the direct manifest. No
display-name reduction or mixed unprefixed key is allowed.

```ts
type InstanceSwapComponentResult = {
  instanceId: string;
  instanceName: string;
  previousComponent: {
    id?: string;
    key?: string;
    name: string;
  } | null;
  component: {
    id: string;
    key?: string;
    name: string;
    remote: boolean;
  };
  noOp: boolean;
  overrideSummary: {
    before: number;
    after: number;
    retainedKeys: InstanceSwapObservationKey[];
    changedKeys: InstanceSwapObservationKey[];
    missingKeys: InstanceSwapObservationKey[];
    addedKeys: InstanceSwapObservationKey[];
  };
  warnings?: string[];
};
```

`before` and `after` count unique observation tokens, not manifest entries or a
mixture of units. A retained PROPERTY token has the same canonical observable
value; a changed PROPERTY token remains addressable with a different value.
OVERRIDE tokens express membership only and therefore classify as retained,
missing, or added, never changed. Missing tokens existed only before; added
tokens exist only after. The four arrays are unique, lexically sorted, and obey
`retained + changed + missing = before` and
`retained + changed + added = after`. An incomplete required snapshot is a
readback/outcome error, not a success with guessed or omitted classifications.
The result still must not claim that every semantic override was preserved;
Figma's behavior is heuristic and the direct manifest has no values.

`previousComponent: null` reports the explicit orphan/missing-main-component
repair case; it is not an omitted read or an invented component identity.

### Swap unexpected failure

If the native call throws, read the target by its unchanged expected instance
ID and compare component identity, parent/index, properties, and observable
override state with the snapshot:

- unchanged: return the native error and `partialMutation: false` in error
  details;
- changed: return before/resulting snapshots and `partialMutation: true`;
- unreadable: return outcome unknown and the exact `node_info` reconciliation
  call.

Do not retry a swap automatically. Static annotations are:

```ts
{
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true
}
```

---

## `instance_detach` contract

### Detach purpose and input

Detach calls `instance.detachInstance()` to replace a component instance with a
plain frame.

```ts
type InstanceDetachInput = {
  nodeId: string;
  nodeName: string;
};
```

The object is strict; IDs/names are non-empty. There is no source, destination,
batch, or action field.

### Safety rules

Before the native call:

1. resolve and exact-name-verify an in-scope `INSTANCE`;
2. apply node permission, scope, lock, and remote-definition-independent checks;
3. allow an instance of a remote component because the local instance mutates;
4. reject the connected scope-root instance because detach can replace its ID
   and invalidate the scope anchor;
5. reject any target with an ancestor of type `INSTANCE`, because native detach
   can also detach ancestor instances and one target ID cannot authorize that
   wider mutation;
6. scan and reject every locked descendant whose component protection would be
   lost under the project's locked-layer policy;
7. snapshot target parent/index and relationship state.

The scope-root, nested-instance, and locked-descendant checks are distinct
refusals with distinct recovery. No native call occurs if any predictable gate
fails.

### Native call and result

Call `instance.detachInstance()` once and retain its returned node object as the
authoritative observed replacement identity. Verify that it is a `FRAME`,
remains under the same parent at the same index, and is inside the authorized
scope.

```ts
type InstanceDetachResult = {
  previousInstanceId: string;
  frameId: string;
  frameName: string;
  type: "FRAME";
  parentId: string;
  index: number;
};
```

The old instance ID is not reused. There is no `instance_attach` inverse in the
Figma Plugin API. Recreating an instance from a component and explicitly
migrating desired content is a new operation, not rollback; tool and guide text
must call detachment permanent.

### Detach unexpected failure

If the native call returns a node but its type, scope, parent, or index fails
validation, do not discard that safe identity and do not fall back to a slot
guess. Return `INSTANCE_DETACH_POSITION_MISMATCH` with the returned node's
ID/name/type, its readable resulting parent/index/scope, the complete before
hierarchy, and `partialMutation: true`.

Only when native detach throws before a trustworthy return exists, reconcile
the old ID and snapshotted parent/index without retrying:

- old instance still exists with the same relationship: report unchanged;
- a replacement frame is identifiable at the exact parent/index: return its
  observed identity and `partialMutation: true` in error details;
- state cannot be attributed safely: return outcome unknown with the old ID,
  parent/index snapshot, and exact `node_info` reads needed for reconciliation.

Never guess a replacement by name alone. Static annotations are:

```ts
{
  destructiveHint: true,
  openWorldHint: true
}
```

Do not set `idempotentHint: true`; retrying the old instance ID after success is
not the same operation.

---

## Tool-selection contract

Guides and descriptions must distinguish:

| Intent | Tool |
| :- | :- |
| Keep the instance but change its component | `instance_swap_component` |
| Set one exposed property before PRD-019 | Legacy `instance_set_property`; do not confuse a value edit with component swap |
| Set one or more exact exposed properties after PRD-019 | `instance_set_component_properties` |
| Read overrides before PRD-019 | Legacy `instance_get_overrides`; PRD-019 replaces it with canonical `node_info` state |
| Perform the predecessor's source-template hybrid before PRD-019 | Legacy `instance_set_overrides`, only when that exact legacy intent was explicitly chosen; it is not equivalent to component swap and PRD-019 removes it without replacement |
| Remove all direct overrides after PRD-019 while keeping the component relationship | `instance_remove_overrides` |
| Edit a known descendant field directly | Exact node/text/style setter, when allowed |
| End the component relationship permanently | `instance_detach` |
| Make an independent copy | `node_clone` |

Swap, detach, and override reset may never be collapsed into a nullable/action
branch. Their safety and recovery contracts conflict—for example, nested and
scope-root targets are allowed for swap but refused for detach.

---

## Safety and structured errors

The plugin remains the trust boundary. MCP schema checks are repeated where
needed at the plugin dispatcher/handler. Existing scope, permission, exact-name,
lock, scope-root, and instance-interior controls remain authoritative.

Release-owned error conditions:

| Code | Condition | Required details/recovery |
| :- | :- | :- |
| `INSTANCE_COMPONENT_DESTINATION_INVALID` | Local/library destination is missing or wrong type | branch, supplied identity, accepted `COMPONENT` requirement |
| `INSTANCE_COMPONENT_DESTINATION_NAME_MISMATCH` | Destination resolves under another exact name | supplied/current names and complete corrected call |
| `INSTANCE_COMPONENT_IMPORT_FAILED` | Library key cannot import an eligible component | key, native diagnostic, library discovery/retry guidance |
| `INSTANCE_SWAP_TARGET_DRIFT` | Target, destination, scope/name/lock, or parent/index changed after the last await and before mutation | before/current target and destination identities, failed final guard, and exact rediscovery/retry calls; native setter count is zero |
| `INSTANCE_SWAP_STATE_MISMATCH` | Post-swap identity/parent/index differs from contract | complete before/resulting snapshots and partial-state flag |
| `INSTANCE_SWAP_OUTCOME_UNKNOWN` | Post-error target state cannot be read | snapshot and exact reconciliation call |
| `INSTANCE_DETACH_SCOPE_ROOT` | Target is the connected scope root | target/scope IDs; reconnect to a containing scope or choose another target |
| `INSTANCE_DETACH_NESTED` | Target has an instance ancestor | target and complete blocking ancestor chain |
| `INSTANCE_DETACH_LOCKED_DESCENDANT` | Protected descendant would lose component protection | complete blocking IDs/names and unlock-or-retarget recovery |
| `INSTANCE_DETACH_POSITION_MISMATCH` | Returned replacement has wrong type, scope, parent, or index | authoritative returned node ID/name/type, before/resulting hierarchy/scope, and `partialMutation: true` |
| `INSTANCE_DETACH_OUTCOME_UNKNOWN` | Native failure cannot be reconciled safely | old ID, parent/index snapshot, exact reads |

Wrong target type/name, permission, scope, and target lock use existing central
codes. Existing codes with identical semantics are reused rather than
duplicated. Every error includes machine-usable identities and one complete
recovery where deterministic. Unexpected outcomes never claim rollback.

---

## Implementation ownership and phases

Primary files:

- [`src/mcp_server/tools/instance.ts`](../../../src/mcp_server/tools/instance.ts)
- [`figma_plugin/handlers/componentHandlers.ts`](../../../figma_plugin/handlers/componentHandlers.ts)
- [`figma_plugin/src/main.ts`](../../../figma_plugin/src/main.ts)
- shared command/result/error helpers under
  [`src/mcp_server/`](../../../src/mcp_server/)
- [`SAFETY.md`](../../../SAFETY.md)
- [`skills/figma-edit/references/`](../../../skills/figma-edit/references/)

### Phase 1 — Shared relationship-state foundation

- Define strict destination/input/output types and the internal canonical
  snapshot/canonicalization helper.
- Add central errors, tool-selection text, safety rows, and emitted-schema
  fixtures.
- Prove snapshot preservation of exact component keys and direct override
  membership before enabling native writes.

### Phase 2 — Component swap

- Register the tool, annotations, command union, dispatcher route, and handler.
- Implement local/library destination preflight, import/name verification,
  nested/scope-root eligibility, the post-await synchronous drift guard,
  same-component no-op, one native call, exact observation-token comparison,
  conservative override reporting, and post-error reconciliation.

### Phase 3 — Detach

- Register the distinct tool/annotations/route/handler.
- Implement scope-root, nested-ancestor, locked-descendant, and hierarchy
  preflight.
- Call native detach once, verify replacement identity/position, and reconcile
  unexpected outcomes without name-only inference.

### Phase 4 — Contract synchronization and release

- Update [`README.md`](../../../README.md), [`SAFETY.md`](../../../SAFETY.md),
  [`CHANGELOG.md`](../../../CHANGELOG.md), tool-selection/workflow/constraints/
  error-playbook guides, and all resource mirrors.
- Regenerate `figma_plugin/code.js`; never hand-edit it.
- Update exact tool count (+2), command unions, safety matrices, generated
  fixtures, and version surfaces.
- Run repository gates and required live probes before tag/publication.

---

## Test strategy

### Schema and boundary tests

- Snapshot emitted contracts, not only local schemas.
- Swap accepts exactly one strict LOCAL or LIBRARY branch; reject mixed,
  missing, extra, empty, and wrong-type fields.
- Detach accepts only one exact scalar target.
- Assert swap destructive/idempotent/open-world annotations.
- Assert detach destructive/open-world and absence of idempotent hint.
- Assert exact public tool delta +2 and matching safety rows/dispatcher routes.
- Registered-boundary tests prove plugin gates cannot be bypassed with payloads
  that evade local schema invocation.

### Swap handler and safety tests

- Local and library destination success.
- Wrong target/destination type/name, failed import, remote destination allowed.
- Same-component setter-free no-op.
- Missing-main-component repair succeeds with `previousComponent: null`, or a
  pinned host refusal is normalized as an API failure without inventing prior
  identity; the live probe decides which behavior the scheduled pin supports.
- Nested explicit target and connected scope-root target allowed.
- Instance ID, parent, and index remain unchanged; tests do not overclaim
  placement or prototype-connection preservation without explicit readback.
- Compatible/incompatible override observations distinguish retained, changed,
  missing, and added prefixed observation tokens conservatively and exactly;
  count/partition equations are asserted.
- Drift target name/scope/lock/parent or destination identity after the last
  await; the final synchronous guard refuses with zero native swap calls.
- Inject native failures with unchanged, drifted, and unavailable readback; no
  automatic retry.

### Detach handler and safety tests

- Top-level local- and remote-component instance success.
- Scope-root and nested-instance refusals are distinct and occur before native
  call.
- Locked target/descendant protection and complete blocker reporting.
- Returned frame has new ID, FRAME type, same parent/index, and remains in scope.
- A returned concrete node with wrong type/scope/parent/index produces
  `INSTANCE_DETACH_POSITION_MISMATCH` using that exact identity; reconciliation
  never replaces it with a name or original-slot guess.
- Inject post-native position/readback failures and assert exact partial/unknown
  outcome disclosure.
- Prove no ancestor instance is silently detached.

### Required live Figma probes

In a dedicated Design file over the official MCP boundary:

1. swap to an exact local component and verify unchanged instance ID,
   parent/index, and observable override summary;
2. import/swap to a library component by key and verify exact name and remote
   result identity;
3. exercise same-component no-op, nested target, and scope-root target;
4. exercise an orphan/missing-main-component fixture when authorable and verify
   nullable prior identity plus the pinned host behavior; record fixture
   unavailability rather than treating it as success;
5. use compatible and incompatible destination fixtures and record observable
   retained, changed, missing, and added observation tokens with exact counts
   without claiming value-level direct-manifest completeness;
6. detach an eligible top-level local- or remote-component instance and verify
   new frame identity at the same parent/index;
7. refuse scope-root, nested-instance, and locked-descendant detachment and
   prove zero mutation.

Record exact requests/results, file/channel identity, before/after IDs and
hierarchy, cleanup, and any Figma-version-specific observation. Mock and
injected-fault evidence remains explicitly separate from live behavior.

---

## Documentation, generated artifacts, and release gates

Documentation must:

- teach explicit instance/destination discovery and exact-name passback;
- explain local ID versus library key branches;
- state that swap preservation is heuristic and can lose overrides;
- state that detach is permanent, changes node identity, and has no attach
  inverse;
- distinguish swap, detach, property write, override reset, direct edit, and
  clone;
- identify the three still-callable predecessor instance routes as legacy,
  distinguish `instance_set_overrides` from a true component swap, and point to
  PRD-019's later hard-cut migration without changing those routes here;
- state nested/scope-root eligibility differences exactly;
- never imply current-selection behavior.

Update guides and all `figma-edit://guide/*` mirrors together. Add both
[`SAFETY.md`](../../../SAFETY.md) rows and prove registered-tool parity in both
directions. Regenerate and inspect `figma_plugin/code.js`.

Required commands, using scripts present in the scheduled checkout:

- `bun run build:all`
- `bun run check:generated`
- `bun run check:plugin`
- `bun run check:versions`
- `bun run check:types:plugin`
- `bun run check:suppressions`
- focused schema/handler/safety/boundary suites
- full repository test suite

Record exact pass/assertion counts. Red-proof new regression guards for exact
destination name, the immediate post-await target/destination recheck, no-op
setter suppression, observation-token partitioning, nested/scope-root
eligibility, locked descendants, hierarchy preservation, and annotations;
restore and rerun green. Report environment/socket failures separately from
product results.

---

## Acceptance criteria

- [ ] Exactly two new tools are registered, with distinct strict contracts and
  correct static annotations.
- [ ] Swap accepts one exact local/library component destination and performs no
  native call on wrong identity or already-matching state.
- [ ] A missing current main component has a schema-valid path and result:
  repair-by-swap reports `previousComponent: null`, while a pinned native
  refusal remains a structured failure rather than fabricated identity.
- [ ] Successful swap preserves instance ID, parent, and index and reports only
  observable retained, changed, missing, and added prefixed observation tokens
  under one exact count unit without a preservation guarantee.
- [ ] The final post-await target/destination guard runs immediately before
  swap, and injected drift proves zero native setter calls.
- [ ] Remote, nested, and scope-root swap eligibility matches this PRD.
- [ ] Detach succeeds only for one eligible top-level in-scope instance, returns
  a new frame identity, and preserves parent/index.
- [ ] Scope-root, nested-instance, and locked-descendant detach are refused
  before mutation with distinct actionable details.
- [ ] Detach documentation states permanence and no inverse.
- [ ] Unexpected failures receive verified unchanged/partial/unknown state and
  are never silently retried.
- [ ] Shared internal state capture is reusable by PRD-019 without making this
  release depend on PRD-019's public cutover.
- [ ] Interim guides identify `instance_set_property`,
  `instance_get_overrides`, and `instance_set_overrides` as unchanged legacy
  routes, distinguish the hybrid transfer from swap, and reserve their hard
  cutover for PRD-019.
- [ ] Tool count, command/safety matrices, docs, generated output, and versions
  are synchronized.
- [ ] Focused/full repository gates and required live probes are recorded.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Swap silently loses incompatible overrides | Medium | Destructive hint, exact before/after snapshot, conservative diff/warnings, no preservation guarantee |
| Library key imports a differently named component | Medium | Import by key, then exact-name/type verification before swap |
| Nested detach widens mutation to ancestors | High | Hard plugin-side ancestor-instance refusal and live negative proof |
| Detach invalidates scope anchor | High | Exact connected scope-root refusal before native call |
| Locked descendants lose protection | High without subtree scan | Complete locked-descendant preflight and blocker details |
| Retry repeats an uncertain destructive operation | High | No automatic retry; post-error reconciliation; detach has no idempotent hint |
| Replacement frame is misidentified after failure | Medium | Parent/index/ID reconciliation; never guess by name alone |
| Swap result overstates Figma behavior | Medium | Exact prefixed observation-token unit, partition equations, and explicit heuristic/value-limit wording |
| Catalog ordering creates a dependency cycle | High if treated as SemVer order | Schedule PRD-020 before PRD-019; internal helper flows forward to 019 |

---

## Dependencies and exclusions

Required baseline capabilities:

- existing exact `node_info` discovery and instance write safety stack;
- local component discovery and library-key import;
- structured-error transport and central registry;
- scope/name/lock/scope-root/instance-interior enforcement;
- generated-file and registered-tool/safety-row consistency gates.

This release has no hard dependency on another future PRD. It is itself a hard
predecessor of
[`PRD-019-Exact-Instance-State-Property-Writes-and-Override-Reset.md`](PRD-019-Exact-Instance-State-Property-Writes-and-Override-Reset.md).

Explicitly excluded:

- exact multi-property writes and their rename cutover;
- public canonical direct-override reads and override reset;
- removal of legacy override tools/prompts;
- component-definition identity/binding;
- any new or changed source-to-target override transfer; the predecessor's
  legacy route remains callable but unchanged until PRD-019;
- any page/selection convenience;
- general timeout/receipt protocol changes.

All release-owned safety, errors, docs, generated output, versioning, tests, and
live evidence are included here rather than deferred.
