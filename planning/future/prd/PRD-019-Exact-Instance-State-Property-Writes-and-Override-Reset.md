# PRD — Exact Instance State, Property Writes, and Override Reset

> [!IMPORTANT]
> **Release type:** standalone minor release with an intentional hard cutover
>
> **Version:** unassigned; assign its SemVer only when this release is scheduled
>
> **Status:** draft
>
> **Standalone extraction/revision:** 2026-08-04
>
> **Authoritative source:** [Figma Design Editing Capability Expansion](../initiative/03%20-%20Figma%20Design%20Editing%20Capability%20Expansion/initiative.md), Sections 14 (override removal), 16.2, and the canonical instance-state read requirements

This release replaces the ambiguous instance-property and override-transfer
surface with three explicit operations:

1. inspect one instance's exact main-component identity, exact component-
   property map, and exact direct-override manifest through `node_info`;
2. set one or more exact exposed component properties on exactly one instance
   with one native `setProperties()` call;
3. remove every direct override from exactly one instance only when its current
   canonical manifest matches the caller's fresh expected manifest.

The old dedicated override read and heuristic source-to-target override
transfer are removed. There is deliberately no compatibility alias and no
behavior-preserving one-call replacement for the hybrid transfer operation.

These changes are inseparable. Override reset is unsafe without the canonical
manifest read; exact property writes and component swap are explicit
replacements for intents previously hidden inside `instance_set_overrides`;
and retaining any old route after the new contract ships would preserve the
same ambiguity and silent-skip behavior this release removes.

---

## Release identity and compatibility

| Change | Old surface | Shipped surface |
| :- | :- | :- |
| Expand canonical read | partial/dedicated instance reads | `node_info({ nodeIds: [nodeId], properties: ["mainComponent", "overrides", "componentProperties"], maxDepth: 0 })` |
| Hard-reshape requested property | `properties.mainComponent: string | null` (component ID only) | `properties.mainComponent: MainComponentRead | null` (`id`, optional `key`, exact `name`, `remote`) |
| Hard rename and reshape | `instance_set_property` | `instance_set_component_properties` |
| Remove | `instance_get_overrides` | canonical `node_info` read |
| Remove | `instance_set_overrides` | no hybrid equivalent; use explicit intent-specific tools |
| Remove | `swap_overrides_instances` prompt | ordinary tool-selection guidance and explicit examples |
| Add | — | `instance_remove_overrides` |

Within the instance tool set, this release removes three tools and adds two,
for a net tool-count change of minus one. The prompt count also decreases by
one. Tool-list, prompt-list, command-union, dispatcher, safety-row, guide, test,
and generated-output expectations must use those exact deltas from the
scheduled predecessor.

This is a no-backcompat cutover:

- no registered alias for any retired name;
- no dispatcher case accepting a retired command;
- no legacy display-name branch inside the plural setter;
- no source/targets/null-sentinel branch inside override reset;
- no hidden prompt or handler that reconstructs source-to-target transfer;
- no guide text implying that the old transfer remains available.

The migration table is normative:

| Changed or retired surface | Required migration |
| :- | :- |
| Scalar `node_info` `mainComponent` | Read `nodes[].properties.mainComponent.id` for the former component-ID value; consume `key`, `name`, and `remote` only from the new object. `null` remains `null`. |
| `instance_set_property` | Read `nodes[].properties.componentProperties` from `node_info`, then call `instance_set_component_properties` with one exact instance and a non-empty map keyed by the returned identities. |
| `instance_get_overrides` | Read `node_info` with `mainComponent`, `overrides`, and `componentProperties` at `maxDepth: 0`. |
| `instance_set_overrides` | Choose the intent: `instance_swap_component` for component identity; `instance_set_component_properties` for exposed properties; explicit node/text/style setters for known direct edits; or `node_clone` when an independent copy of the complete source instance is acceptable. No one-call hybrid equivalent exists. |
| `swap_overrides_instances` prompt | Use the ordinary instance/component tool-selection guide and the explicit alternatives above. |

When scheduled, assign one minor version in root `package.json`, root
`package-lock.json` release fields, both root `server.json` version fields, and
root `manifest.json`. Verify the derived plugin About/handshake/bundle output
through `check:plugin`. Do not add a version to `figma_plugin/manifest.json`,
change the unrelated `src/mcp_server/package.json` package identity, or hard-code
a release literal in `src/shared/version.ts`.

---

## Scheduling dependency

[`PRD-020-Instance-Relationship-Lifecycle.md`](PRD-020-Instance-Relationship-Lifecycle.md)
is a hard scheduled predecessor even though its filename has a higher catalog
number. `instance_swap_component` must exist before this release removes
`instance_set_overrides`, because swap is one of the required intent-specific
migrations. Catalog numbers identify documents, not SemVer order.

PRD-020 must not depend on this release's public hard cutover. It may share or
later reuse internal instance-state snapshot/canonicalization helpers, but its
swap/detach tools can capture their required state directly. This ordering
avoids a dependency cycle and avoids any released interval in which migration
guidance names an unavailable swap tool.

[`PRD-018-Canonical-Component-Property-Identity-and-Binding.md`](PRD-018-Canonical-Component-Property-Identity-and-Binding.md)
is a recommended predecessor for consistent canonical-key terminology, not a
hard runtime dependency: instance property keys are discovered from the exact
target instance's own `componentProperties` map.

---

## Source mapping

| Standalone scope | Umbrella source | Disposition |
| :- | :- | :- |
| Canonical instance `node_info` read | Section 14 prerequisite read; Section 16.2 discovery; Phase 2 instance-state read | Preserved and made Phase 1 |
| One-instance exact property map | Section 16.2 | Preserved as the setter hard cutover |
| Override read/transfer retirement | Release identity, D25, Sections 14 and 16.2 | Preserved in the same release |
| Guarded direct override removal | Section 14, Override-removal purpose/contract | Preserved |
| Safety/errors/annotations | Section 20 rows for `node_info`, exact setter, and override removal | Restated here |
| Tests/live evidence | Release-wide tests, live items 10–11, success measures, and risks | Restated here |

Historical checklist IDs retained here are 19, 27, 28, and 29. Product
decisions D1–D7 and D24–D26 apply.

---

## Goals

- Make `node_info` the one canonical instance-state discovery path.
- Preserve exact component-property keys, including canonical `name#id` keys
  and Figma's exact bare VARIANT names.
- Update multiple already-decided properties on one exact instance with one
  native call and complete before/resulting readback.
- Carry `VariableAlias` values intact after preflight.
- Validate every map entry before submitting any property write.
- Guard whole-instance direct-override removal with a fresh, canonical expected
  manifest and complete locked-subtree/containment checks.
- Preserve inherited overrides during direct reset.
- Remove the duplicate read and heuristic transfer surface completely.
- Disclose unexpected native drift without claiming transactions or rollback.

## Non-goals

- No multi-instance batch in either write tool.
- No display-name selection or suffix stripping for component properties.
- No SLOT property write or slot lifecycle work. SLOT entries discovered in the
  complete instance map remain readable but cannot be submitted to
  `instance_set_component_properties` in this release.
- No reinterpretation of `INSTANCE_SWAP` values as library keys when Figma
  expects component node IDs.
- No selective override removal by node, field, or property.
- No restoration data for removed override values.
- No source-template transfer, hidden compatibility route, or null reset
  sentinel.
- No guarantee that one native `setProperties()` call is transactional.
- No component swap or detach implementation; those belong to PRD-020.
- No direct descendant editing inside this release beyond existing explicit
  node/text/style setters.
- No current-selection or implicit-current-page behavior.

---

## Canonical `node_info` instance state

### Request

```ts
node_info({
  nodeIds: [nodeId],
  properties: ["mainComponent", "overrides", "componentProperties"],
  maxDepth: 0
});
```

The ordinary `node_info` exact-root, scope, page-load, property allowlist, and
bounded-read behavior remains in force. No separate instance read tool is
added.

The registration/output reshape preserves `node_info`'s complete read
annotation object exactly:

```ts
{
  readOnlyHint: true,
  openWorldHint: true
}
```

Annotations remain advisory; explicit-root/scope and fail-closed read gates are
the enforcement contract.

### Canonical direct-override manifest

```ts
type InstanceOverrideManifestEntry = {
  id: string;
  overriddenFields: string[];
};

type InstanceOverrideManifest = InstanceOverrideManifestEntry[];
```

For an `INSTANCE`, `overrides` is exactly Figma's direct override manifest.
Inherited overrides are not included. Serialization must:

1. require each entry ID and field to be non-empty;
2. reject duplicate entry IDs and duplicate fields as Figma-state invariant
   errors rather than silently deduplicating them;
3. verify every entry ID resolves to the instance itself or a descendant;
4. sort entries by `id` and each field set lexically for deterministic
   comparison and output.

Ordering is canonicalized; membership is not altered.

### Main component and component properties

`mainComponent` returns enough exact identity to distinguish a property write,
component swap, and override reset:

```ts
type MainComponentRead = {
  id: string;
  key?: string;
  name: string;
  remote: boolean;
};
```

This is an intentional requested-property hard reshape from the scheduled
baseline's scalar component ID. It is not an additive sibling field and not an
internal-only type. Callers that previously compared the scalar now compare
`mainComponent.id`; emitted-schema, migration, and official-boundary tests must
make the change explicit. PRD-020's earlier release may use a richer internal
snapshot while its public `node_info` remains on the predecessor shape; the
public reshape happens only here.

The implementation must inventory every installed read mode that consumes the
shared requested-property serializer. If PRD-005 has landed, the same object-or-
null shape applies to unfiltered/filtered `node_info` TREE entries,
`node_info` MATCHES entries, and `page_info` MATCHES entries whenever
`mainComponent` is requested. No mode may retain a scalar fork or silently omit
the property. If PRD-005 has not landed, only the scheduled predecessor's actual
consumers are gated; this rule does not create a dependency on absent modes.

`componentProperties` preserves the complete map and exact Figma keys. Values
retain their pinned `ComponentProperties[string]` structure and variable alias
identity; the serializer must not reduce a canonical key to its display-name
prefix or convert a native component node ID to a library key.

The public result stays inside the scheduled predecessor's existing
`node_info.nodes[]` envelope. The instance node entry uses the existing `id`,
`name`, `type`, and `properties` placement; this release does not flatten or
rename that shape. If PRD-005 has already landed, this is its ordinary
unfiltered `TREE` branch, but PRD-005 is not a hard predecessor:

```ts
type CanonicalInstanceState = {
  id: string;
  name: string;
  type: "INSTANCE";
  properties: {
    mainComponent: MainComponentRead | null;
    overrides: InstanceOverrideManifest;
    componentProperties: ComponentProperties;
  };
};
```

`CanonicalInstanceState` above is the requested instance entry within the
existing `node_info.nodes` tree, not a replacement top-level output. Existing
tree metadata, missing-node behavior, ordering, and unrelated requested
properties remain byte-for-byte compatible.

The same shared manifest canonicalizer is used by `node_info` serialization and
`instance_remove_overrides` preflight. Read and write comparison cannot evolve
independently.

---

## `instance_set_component_properties` hard-cut contract

### Input

```ts
type InstancePropertyValue =
  | string
  | boolean
  | { type: "VARIABLE_ALIAS"; id: string };

type InstanceSetComponentPropertiesInput = {
  nodeId: string;
  nodeName: string;
  properties: Record<string, InstancePropertyValue>;
};
```

The top level, map values, and alias objects are recursively strict.
`properties` must contain at least one entry. One call contains exactly one
scalar `nodeId` and one `nodeName`. The MCP boundary rejects `target`,
`targets`, `instance`, `instances`, arrays, legacy `propertyName`/`value`, and
every other batch or display-name branch.

The title/description must say: “set one or more exposed component properties
on one exact instance.” It must distinguish this operation from component-
definition management, component swap, direct descendant edits, and override
reset.

### Exact keys and native values

Map keys come unchanged from the target's `componentProperties`:

- canonical `name#id` keys for BOOLEAN, TEXT, and INSTANCE_SWAP properties;
- Figma's exact bare names for VARIANT properties.

The complete discovery map may also contain a pinned `SLOT` entry. That entry
remains visible for fidelity but is read-only here: submitting its exact key is
refused plugin-side before `setProperties()`. Exact identity must not silently
widen this PRD beyond the umbrella's no-slot boundary.

The implementation must never split a key at `#`, choose the first display-name
match, or accept a separately supplied display name.

Literal/alias values remain in the exact representation accepted by
`InstanceNode.setProperties()`. In particular, an INSTANCE_SWAP property value
is a component node ID when required by the native contract, not an imported
library key.

### Complete preflight and mutation

Before the only native setter call:

1. resolve and exact-name-verify one in-scope, unlocked `INSTANCE` through the
   existing instance-write stack;
2. snapshot its complete exact property map;
3. validate every submitted key against that one snapshot and require its
   resolved type to be BOOLEAN, TEXT, INSTANCE_SWAP, or VARIANT; reject SLOT
   and every other unsupported pinned type;
4. validate every literal type and resolve every alias ID;
5. validate alias/property compatibility where the pinned API exposes it;
6. collect every predictable invalid entry and return them together, with the
   current exact property map and complete corrected arguments where
   deterministic;
7. detect whether every requested literal/alias state already matches.

One invalid entry prevents the entire map from reaching Figma. If all entries
already match, return a no-op without invoking the setter.

After preflight, call `instance.setProperties(properties)` exactly once.
Unspecified properties retain their values. Read the complete map back and
return exact before/resulting values for every requested key.

### Output and unexpected failures

```ts
type InstanceSetComponentPropertiesResult = {
  instanceId: string;
  instanceName: string;
  updatedProperties: Record<string, {
    type: "BOOLEAN" | "TEXT" | "INSTANCE_SWAP" | "VARIANT";
    requested: InstancePropertyValue;
    before: ComponentProperties[string];
    resulting: ComponentProperties[string];
  }>;
  componentProperties: ComponentProperties;
  noOp: boolean;
  partialMutation?: boolean;
};
```

One native call reduces predictable partial-application risk but is not a
documented transaction. If it throws, re-read every requested key and compare
with the pre-call snapshot:

- unchanged: return native failure and `partialMutation: false`;
- any drift: return before/requested/resulting values and
  `partialMutation: true`;
- readback unavailable: return outcome unknown with the snapshot and exact
  verification call.

Never silently retry or claim rollback. The tool carries
`idempotentHint: true` and `openWorldHint: true`.

---

## `instance_remove_overrides` contract

### Intent and input

This tool removes every direct override from exactly one named instance. It is
not selective, does not remove inherited overrides, is not an inverse of
`instance_set_component_properties`, and cannot restore discarded values.

```ts
type InstanceRemoveOverridesInput = {
  nodeId: string;
  nodeName: string;
  expectedOverrides: InstanceOverrideManifest;
};
```

The object and entries are strict. `expectedOverrides` is required and may be
empty. Entry IDs and field arrays are non-empty; duplicate entry IDs and
duplicate fields are rejected before canonical sorting. The schema accepts no
source, targets, instances, selective field list, component property, or null
sentinel.

### Eligibility and safety gates

The reset owns an internal invariant snapshot in addition to the direct
override manifest:

```ts
type InstanceOverrideResetInvariantSnapshot = {
  instanceId: string;
  parentId: string;
  index: number;
  relativeTransform: [
    [number, number, number],
    [number, number, number]
  ];
  mainComponent: MainComponentRead | null;
  ancestorInstanceOverrides: Array<{
    instanceId: string;
    overrides: InstanceOverrideManifest;
  }>;
};
```

The relative-transform entries must be finite. Ancestor manifests use the same
canonicalizer as the target and are ordered from nearest to farthest ancestor.
They prove preservation of observable inherited-override **membership**, not
the underlying field values. A value-only change can evade this manifest for an
ancestor just as it can for the target. They are not additional mutation
targets, and the result must not promote this membership check into a full
inherited-value guarantee.

Before comparing or mutating:

1. resolve and exact-name-verify one in-scope `INSTANCE`;
2. reject a locked target or any locked descendant;
3. allow an instance of a remote component because only the local instance
   mutates;
4. allow the explicitly named nested instance—native `removeOverrides()` acts
   only on that target's direct overrides;
5. allow the connected scope-root instance because its ID, hierarchy, and
   component relationship remain stable;
6. canonicalize the current direct manifest with the shared read helper;
7. reject any current override ID that does not resolve to the target or one of
   its descendants;
8. capture the invariant snapshot above before the native call.

### Stale-state precondition

Compare the canonical current manifest with canonical `expectedOverrides`
exactly. Ordering differences alone do not make it stale. Any membership
difference returns `INSTANCE_OVERRIDES_CHANGED`, the current canonical
manifest, and complete corrected `instance_remove_overrides` arguments. No
setter may run on this path.

The precondition detects added/removed overridden nodes and fields. It does not
detect a value-only change to a field that remains overridden. Tool and guide
descriptions must disclose this residual limitation and require a fresh
`node_info` read immediately before destructive reset. The authorized intent
remains “remove these direct override fields regardless of their current
values.”

An empty expected manifest matching an empty current manifest is a successful
no-op and does not call Figma.

### Native call, readback, and output

After every check passes, call `instance.removeOverrides()` exactly once and
read the direct manifest plus every invariant field back. Do not infer success
from absence of an exception. Ordinary success requires the same instance ID,
parent/index, exact relative transform, main-component identity, and canonical
ancestor manifests as before the call.

```ts
type InstanceRemoveOverridesResult = {
  instanceId: string;
  instanceName: string;
  removedOverrides: InstanceOverrideManifest;
  overrides: InstanceOverrideManifest;
  preserved: {
    parentId: string;
    index: number;
    relativeTransform: [
      [number, number, number],
      [number, number, number]
    ];
    mainComponent: MainComponentRead | null;
    ancestorOverrideMembership: true;
  };
  noOp: boolean;
  partialMutation?: boolean;
};
```

The result's `removedOverrides` is field-level audit metadata only; it contains
no discarded values and is not restoration data. A non-empty resulting direct
manifest is `INSTANCE_OVERRIDE_REMOVAL_MISMATCH` with before/resulting manifests
and partial-mutation disclosure, not false success. Drift in any invariant is
`INSTANCE_OVERRIDE_PRESERVATION_MISMATCH` with the complete before/resulting
invariant snapshots; it cannot be returned as success merely because the direct
manifest became empty.

If the native call throws, re-read the current manifest and invariant snapshot.
Return original and observed state and set `partialMutation: true` when either
differs. Unreadable invariant state is outcome unknown. Do not retry or claim
rollback. The tool sets `destructiveHint: true` and
`openWorldHint: true`; it does not set `idempotentHint: true`. Reusing the old
non-empty expected manifest after success must produce a stale-state refusal.

---

## Retired-surface removal contract

The following must be absent in both directions—not merely undocumented:

- MCP registration and emitted `tools/list`;
- `FigmaCommand` and client command unions;
- plugin dispatcher cases;
- handler exports and internal compatibility routes;
- `swap_overrides_instances` prompt registration/content;
- prompts/examples that recommend source-to-target override transfer;
- [`SAFETY.md`](../../../SAFETY.md) rows and permission matrices;
- guide/resource mirrors;
- unit, fixture, and generated-output expectations;
- generated `figma_plugin/code.js`.

The registered-tool-to-safety-row consistency test must fail if a retired
command remains in either direction. Repository-wide exact-token absence checks
must allow only historical changelog/migration prose that explicitly labels the
name retired.

No implementation may keep the old transfer handler callable through a new
name. Its component swapping, descendant-ID string rewriting, selected-field
replay, multi-target partial success, and silent unsupported/missing-path skips
are intentionally removed.

---

## Safety and structured errors

The plugin remains the trust boundary. MCP validation is duplicated where
needed to preserve safety against non-MCP/internal callers. Existing scope,
permission, exact-name, lock, remote-definition, scope-root, and instance-
interior controls remain authoritative.

Release-owned error conditions:

| Code | Condition | Required details/recovery |
| :- | :- | :- |
| `INSTANCE_PROPERTY_KEY_UNKNOWN` | Submitted key absent from exact target map | supplied key, complete current map/keys, corrected call where deterministic |
| `INSTANCE_PROPERTY_TYPE_UNSUPPORTED` | Submitted exact key resolves to SLOT or another property type outside BOOLEAN/TEXT/INSTANCE_SWAP/VARIANT | key/type, supported writable types, complete current map, and guidance to leave it unchanged or manage it directly in Figma |
| `INSTANCE_PROPERTY_VALUE_INVALID` | Literal type conflicts with selected property | key/type/supplied value class/accepted class |
| `INSTANCE_PROPERTY_ALIAS_INCOMPATIBLE` | Alias missing or incompatible | alias ID, property key/type, accepted variable type, discovery call |
| `INSTANCE_PROPERTY_MULTI_TARGET_FORBIDDEN` | Any batch/multiple-target shape reaches plugin | supplied shape and exact one-target schema |
| `INSTANCE_PROPERTY_NATIVE_DRIFT` | Native setter throws after observed state change | before/requested/resulting per key, `partialMutation: true` |
| `INSTANCE_OVERRIDE_MANIFEST_INVALID` | Empty strings/fields or malformed entry | offending entry and exact accepted shape |
| `INSTANCE_OVERRIDE_MANIFEST_DUPLICATE` | Duplicate entry ID or field | duplicates; no mutation |
| `INSTANCE_OVERRIDE_ID_OUTSIDE_TARGET` | Current manifest ID escapes/fails target containment | instance ID, offending ID, invariant/reconnect guidance |
| `INSTANCE_OVERRIDE_SUBTREE_LOCKED` | Target or descendant is locked | complete blocking IDs/names and unlock-or-retarget recovery |
| `INSTANCE_OVERRIDES_CHANGED` | Expected/current canonical manifests differ | both manifests and complete corrected retry |
| `INSTANCE_OVERRIDE_REMOVAL_MISMATCH` | Post-call manifest remains non-empty | before/resulting manifests and partial-state disclosure |
| `INSTANCE_OVERRIDE_PRESERVATION_MISMATCH` | Node ID, parent/index, relative transform, main-component identity, or ancestor override-manifest membership changed | complete before/resulting invariant snapshots and partial-state disclosure |
| `INSTANCE_OVERRIDE_OUTCOME_UNKNOWN` | Post-error readback unavailable | original manifest and exact `node_info` reconciliation call |

Schema-invalid calls use the standard MCP invalid-arguments envelope with exact
required/forbidden fields. Existing central codes with the same cause/recovery
must be reused rather than duplicated. Every error includes machine-readable
operands and never promises atomicity or restoration it cannot prove.

---

## Implementation ownership and phases

Primary files:

- [`src/mcp_server/tools/instance.ts`](../../../src/mcp_server/tools/instance.ts)
- [`src/mcp_server/tools/node.ts`](../../../src/mcp_server/tools/node.ts)
- [`figma_plugin/handlers/componentHandlers.ts`](../../../figma_plugin/handlers/componentHandlers.ts)
- [`figma_plugin/handlers/nodeReaders.ts`](../../../figma_plugin/handlers/nodeReaders.ts)
- [`figma_plugin/src/main.ts`](../../../figma_plugin/src/main.ts)
- command/client unions and result helpers under
  [`src/mcp_server/`](../../../src/mcp_server/)
- [`SAFETY.md`](../../../SAFETY.md)
- [`skills/figma-edit/references/`](../../../skills/figma-edit/references/)

### Phase 0 — Predecessor and migration audit

- Verify PRD-020's `instance_swap_component` is present in the scheduled
  predecessor and its docs/tool contract are current.
- Inventory every retired tool/prompt token in source, tests, safety rows,
  guides, resources, and generated output.
- Inventory every scheduled result mode that uses the shared
  `mainComponent` requested-property serializer and record its scalar baseline.
- Freeze old/new tool-list, prompt-list, and migration fixtures.

### Phase 1 — Canonical state read

- Implement one shared direct-manifest validator/canonicalizer.
- Serialize exact `mainComponent`, direct `overrides`, and
  `componentProperties` through `node_info`.
- Add containment/invariant behavior, exact key preservation, deterministic
  ordering, and registered-boundary tests.
- Gate later mutation phases on canonical read correctness.

### Phase 2 — Exact property setter

- Define strict one-target/map/alias schemas and outputs.
- Implement all-entry semantic preflight and all-invalid-entry reporting.
- Make one native setter call, no-op detection, exact readback, and post-error
  drift disclosure.
- Add tool annotation, safety row, dispatcher route, and focused tests under
  the new name.

### Phase 3 — Guarded override reset

- Register `instance_remove_overrides` with required expected manifest.
- Implement lock/containment/eligibility gates, exact stale comparison, empty
  no-op, one native call, resulting-manifest verification, and post-error
  reconciliation.
- Prove inherited overrides and ancestor-instance state remain unchanged.

### Phase 4 — Atomic public cutover

- Remove all three retired tools and the retired prompt from every enumerated
  surface.
- Remove old handlers/branches instead of leaving wrappers.
- Publish exact migration guidance, including the explicit “no equivalent”
  statement.
- Update tool/prompt counts and prove absence in registered and generated
  surfaces.

Phases 2–4 may land as reviewable internal commits, but no released or tagged
state may expose both contracts or remove the old transfer before all explicit
alternatives are available.

### Phase 5 — Contract synchronization and release

- Update [`README.md`](../../../README.md), [`SAFETY.md`](../../../SAFETY.md),
  [`CHANGELOG.md`](../../../CHANGELOG.md), tool-selection/workflow/constraints/
  error-playbook guides, and all resource mirrors.
- Regenerate `figma_plugin/code.js`; never hand-edit it.
- Assign the version and run all repository and live gates.

---

## Test strategy

### Schema and registered-boundary tests

- Snapshot exact emitted `node_info`, setter, and reset contracts.
- Assert emitted `node_info` metadata remains exactly
  `{ readOnlyHint: true, openWorldHint: true }` after the property reshape.
- Prove requested `mainComponent` is the strict object-or-null shape, document
  the old scalar-to-`.id` migration, and reject fixtures that still type or
  serialize it as a scalar.
- Exercise every installed result mode consuming the shared serializer,
  including both MATCHES tools when PRD-005 is present.
- Assert one scalar target, non-empty exact property map, strict alias object,
  and rejection of every singular/display-name/multi-target legacy field.
- Assert reset requires `expectedOverrides`, permits an empty manifest, requires
  non-empty entry fields, and rejects source/target-array/selective/null forms.
- Assert setter annotations and reset destructive/non-idempotent annotations.
- Assert exact tool delta minus one and prompt delta minus one.
- Prove all retired names/routes are absent from registration, command unions,
  dispatcher, handler exports, prompts, safety rows, guides, and generated
  output.

### Canonical read tests

- Direct versus inherited overrides.
- Exact canonical and bare VARIANT keys.
- Main-component identity for local/remote components.
- Scalar-baseline migration to `mainComponent.id`, including `null` and
  optional library key behavior.
- Cross-mode property parity for every installed node/page TREE or MATCHES
  consumer; no scalar or omitted fork remains.
- Deterministic manifest sorting without deduplication.
- Duplicate Figma-state data and escaping/unresolvable IDs fail as invariants.
- Explicit root/scope behavior and no current selection/page dependency.

### Property setter tests

- Multiple BOOLEAN/TEXT/INSTANCE_SWAP/VARIANT entries on one instance.
- A discovered SLOT entry remains in canonical reads but submission of its key
  returns `INSTANCE_PROPERTY_TYPE_UNSUPPORTED` before the native setter.
- Literal and alias values, exact native representation, already-matching no-op.
- All predictable invalid entries reported together; one invalid entry proves
  zero native calls.
- Omitted properties remain unchanged.
- Exactly one native call and complete per-key/global readback.
- Unexpected native failure with unchanged, drifted, and unavailable readback.
- Plugin-side rejection of every multi-instance shape.

### Override reset tests

- Matching direct manifest removes with one native call and empty readback.
- Inherited overrides remain inherited and are not reported removed.
- Node ID, parent/index, relative transform, main-component identity, and every
  ancestor instance manifest remain unchanged on success; each injected
  membership drift produces `INSTANCE_OVERRIDE_PRESERVATION_MISMATCH`.
- Tests and docs retain the manifest's value-only-change limitation for both
  target and ancestor override membership; they do not claim inherited values
  were compared.
- Remote-component instance, nested explicit target, and scope-root target
  follow their explicit eligibility rules.
- Target and descendant locks, escaping IDs, malformed/duplicate/stale
  manifests, ordering-only differences, empty no-op, and non-empty post-call
  mismatch.
- Stale refusal returns complete corrected arguments and proves zero setter
  calls.
- A nested reset leaves ancestor-instance direct overrides unchanged.
- Documentation fixture preserves the value-only-change limitation.

### Required live Figma probes

In a dedicated Design file and over the official MCP boundary:

1. read exact local/remote main component, direct manifest, and exact property
   map through `node_info`;
2. update multiple exact property types on one instance, including a
   `VariableAlias`, and verify omitted properties;
3. submit one invalid map and prove atomic refusal/no observed mutation;
4. when a SLOT fixture is available, prove it remains readable but its exact
   key is refused before the native setter; record fixture unavailability
   rather than treating it as success;
5. remove a matching direct manifest and prove target ID, parent/index,
   relative transform, main-component identity, and observable ancestor
   override membership survive without claiming value-level comparison;
6. prove empty-manifest no-op and stale-manifest corrected retry;
7. exercise nested and scope-root reset eligibility plus locked-descendant
   refusal;
8. prove the three retired tool calls and retired prompt are absent/rejected.

Record file/channel identity, exact calls/results, before/after native state,
node IDs/names, cleanup, and any partial-state path. Mocks and injected faults
are separate evidence classes and do not establish Figma behavior.

---

## Documentation, generated artifacts, and release gates

Required documentation includes:

- canonical `node_info` discovery examples;
- exact one-instance plural property-map examples;
- exact-key/VARIANT/alias semantics;
- fresh-read and direct-versus-inherited override-reset guidance;
- the manifest's value-only-change limitation;
- explicit no-restore/no-selective-reset wording;
- all retired-tool migrations and the no-equivalent statement for hybrid
  transfer;
- separation from swap, detach, definition management, and direct node edits.

Update guides and `figma-edit://guide/*` mirrors together. Reconcile
registered tools and [`SAFETY.md`](../../../SAFETY.md) rows bidirectionally.
Regenerate `figma_plugin/code.js` and inspect its diff; never hand-edit it.

Required commands, using scripts present in the scheduled checkout:

- `bun run build:all`
- `bun run check:generated`
- `bun run check:plugin`
- `bun run check:versions`
- `bun run check:types:plugin`
- `bun run check:suppressions`
- focused read/schema/handler/safety/retired-route/boundary suites
- full repository test suite

Record exact counts. Red-proof new regression guards against the protected
production/contract lines, including legacy-route absence, one-target
authorization, all-entry preflight, stale-manifest zero-mutation, locked-
descendant refusal, and post-call manifest readback. Restore and rerun green.

---

## Acceptance criteria

- [ ] `node_info` is the canonical exact instance-state read and exposes direct,
  not inherited, override manifests.
- [ ] `node_info` retains its exact read-only/open-world annotation object in
  emitted tool metadata.
- [ ] Requested `mainComponent` uses the documented object-or-null hard reshape;
  old scalar consumers migrate to `.id` and all schemas/guides/tests agree.
- [ ] Every installed result mode using the shared property serializer emits
  the same `mainComponent` shape; optional PRD-005 modes are gated when present
  without becoming a hard dependency.
- [ ] Exact component-property keys and native values round-trip without display-
  name reduction or library-key reinterpretation.
- [ ] `instance_set_component_properties` authorizes one instance, preflights
  every map entry, makes at most one native call, preserves omissions, and
  returns exact before/resulting state.
- [ ] SLOT state remains readable but cannot enter the property setter; a SLOT
  key fails plugin-side with `INSTANCE_PROPERTY_TYPE_UNSUPPORTED`, zero
  mutation, and actionable recovery.
- [ ] A predictable invalid map causes zero property mutation and returns all
  invalid entries with actionable recovery.
- [ ] Override reset requires a matching canonical expected manifest, respects
  all lock/containment/eligibility gates, removes only direct overrides, and
  verifies direct-manifest plus relationship/placement and observable ancestor-
  membership readback without overclaiming inherited values.
- [ ] Empty reset is a no-op; stale reset returns a complete corrected call;
  unexpected results disclose drift/outcome uncertainty.
- [ ] Removed override values are never represented as restorable data.
- [ ] `instance_set_property`, `instance_get_overrides`,
  `instance_set_overrides`, and `swap_overrides_instances` are absent from all
  active public/internal/generated surfaces.
- [ ] Migration guidance names every explicit replacement and plainly states
  that no hybrid one-call equivalent exists.
- [ ] PRD-020's swap tool is present before this cutover is released.
- [ ] Tool/prompt counts, safety rows, docs, generated artifacts, and versions
  are synchronized.
- [ ] Focused/full repository gates and required live probes are recorded.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Retired tools break prompts/clients | High | Atomic cutover, exact migration table, repo-wide route absence, predecessor swap availability |
| Bad map entry partially applies | Medium without preflight | Validate all entries against one snapshot before one native call |
| Native `setProperties()` drifts before throwing | Medium | Exact post-error per-key readback; no transaction/rollback claim |
| Stale reset discards newly added overrides | High | Required canonical expected manifest and zero-mutation stale refusal |
| Value changes without manifest membership change | Medium | Fresh-read requirement and explicit residual limitation |
| Removed values are mistaken for restore data | High | Field-only audit wording, destructive hint, no inverse claim |
| Reset reaches inherited/ancestor state | High without exact scope | Direct manifest only, one explicit target, nested/ancestor tests |
| Locked descendants lose protected state | High | Full subtree lock preflight before native reset |
| Figma returns invalid manifest IDs/duplicates | Low but safety-critical | Fail invariant; never deduplicate or mutate through untrusted state |
| Migration names swap before it exists | High if misordered | Hard PRD-020 predecessor despite catalog numbering |

---

## Dependencies and exclusions

Hard predecessor:

- [`PRD-020-Instance-Relationship-Lifecycle.md`](PRD-020-Instance-Relationship-Lifecycle.md),
  specifically its shipped `instance_swap_component` migration path.

Required baseline capabilities:

- existing exact-root `node_info` and instance-write safety stack;
- structured-error transport and central registry;
- node scope/name/lock/remote/instance-interior enforcement;
- generated-file and registered-tool/safety-row consistency gates.

Recommended predecessor:

- [`PRD-018-Canonical-Component-Property-Identity-and-Binding.md`](PRD-018-Canonical-Component-Property-Identity-and-Binding.md)
  for shared canonical identity terminology.

Excluded from this release:

- implementation of component swap or detach;
- component-definition add/edit/delete/binding;
- arbitrary source-to-target override transfer;
- selective override reset;
- multi-instance property/reset batches;
- general timeout/receipt protocol changes;
- current selection/page behavior.

All release-owned safety, error, docs, generated-output, version, test, and live
evidence duties are included here and cannot be deferred after the cutover.
