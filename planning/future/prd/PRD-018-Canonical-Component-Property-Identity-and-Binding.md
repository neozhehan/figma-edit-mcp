# PRD — Canonical Component-Property Identity and Binding

> [!IMPORTANT]
> **Release type:** standalone minor release
>
> **Version:** unassigned; assign its SemVer only when this release is scheduled
>
> **Status:** draft
>
> **Standalone extraction/revision:** 2026-08-04
>
> **Authoritative source:** [Figma Design Editing Capability Expansion](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md), Sections 16.1 and 15

This release makes Figma's canonical component-property key the one public
identity used to create, discover, edit, delete, bind, and unbind non-variant
component properties. It then adds `node_bind_component_property`, which binds
one canonical property definition to the exact sublayer field it controls.

Identity lands before binding inside this release. Shipping the binder against
the current display-name lookup would make duplicate names ambiguous, require
an avoidable second discovery round after add/edit, and leave renames returning
stale identities. The two scopes therefore form one smallest complete
user-facing workflow:

```text
add -> receive propertyId -> edit/rename -> receive replacement propertyId
    -> bind -> unbind -> delete by exact propertyId
```

---

## Release identity and compatibility

Public surface changes:

| Change | Tool | Result |
| :- | :- | :- |
| Hard-cut EDIT branch | `component_manage_property` | Existing definitions are selected only by canonical `propertyId`; `ADD` still uses a creation `propertyName` |
| Hard-cut input | `component_delete_property` | Delete selects only canonical `propertyId` |
| Add | `node_bind_component_property` | Bind/unbind one property reference on one exact sublayer field |
| Confirm canonical read | `node_info` | `componentPropertyDefinitions` remains the recovery/discovery path |

Release-local public-tool arithmetic is exact: add one tool name
(`node_bind_component_property`), remove or rename none, and increase the total
registered count by one (net +1). The EDIT/delete input hard cuts change shapes,
not tool names.

There is no compatibility selector that accepts a human-readable display name
for EDIT or delete, no prefix match, and no hidden route that splits a key at
`#`. The complete Figma key—such as `Label#12:34`—is called `propertyId` in
schemas, handlers, outputs, guides, errors, tests, and generated artifacts.

This hard cutover is explicitly allowed for this standalone minor release. The
CHANGELOG must show old and new calls and explain that a prior success result or
`node_info({ properties: ["componentPropertyDefinitions"] })` supplies the
canonical key.

When scheduled, update the then-current version to one assigned minor version
on every enforced surface:

- [`package.json`](../../../package.json) and root lockfile release fields;
- both [`server.json`](../../../server.json) version fields;
- root [`manifest.json`](../../../manifest.json); and
- the derived plugin About/handshake/bundle output checked by `check:plugin`.

Do not add a version to `figma_plugin/manifest.json`, change the unrelated
`src/mcp_server/package.json` package identity, or hard-code a release literal
in `src/shared/version.ts`.

---

## Source mapping

| Standalone scope | Umbrella source | Disposition |
| :- | :- | :- |
| Canonical `propertyId` problem and contract | Section 16.1 | Preserved as Phase 1–3 and a release gate |
| `node_bind_component_property` | Section 15 | Preserved; enabled only after identity tests pass |
| Canonical-ID prerequisite | Section 15, Canonical property-ID prerequisite; D16 | Preserved as an internal hard dependency |
| Safety/error/schema/annotation requirements | Section 20, limited to these tools | Restated here |
| Implementation/test/live chain | Phase 7 and live-smoke item 14, limited to this scope | Restated here |

Historical checklist IDs retained by this extraction are 16 and 18. Product
decisions D1–D6 and D16 apply. D7 does not apply because this release changes
identity shapes but does not rename a public tool.

---

## Goals

- Return Figma's authoritative API key from component-property ADD and EDIT in
  the same call.
- Select EDIT and delete targets by exact canonical key, never by display-name
  prefix.
- Return both old and replacement keys when rename changes the key.
- Add a discoverable, exact, idempotent binding/unbinding path for `visible`,
  `characters`, and `mainComponent`.
- Validate owner, target, property type, and field compatibility before any
  reference assignment.
- Preserve every unrelated `componentPropertyReferences` entry.
- Keep remote definitions and component-instance interiors read-only.
- Give stale callers the current exact keys and one complete recovery call.

## Non-goals

- No display-name compatibility branch for EDIT/delete.
- No attempt to split or parse `name#id` into a public display-name selector.
- No variant-property definition lifecycle beyond the existing Figma contract.
- No `SLOT` property add, edit, delete, binding, or other lifecycle work. A
  discovered SLOT definition remains readable but is unsupported by this
  release's mutation tools.
- No component-property binding inside a component instance.
- No bulk binding, multi-node batch, inferred owner, or current-selection path.
- No selective edit of multiple reference fields in one call.
- No instance component-property value writes; those belong to
  `instance_set_component_properties` in a separate release.
- No remote component-definition mutation.
- No automatic rollback promise after an unexpected native mutation.

---

## Canonical discovery and terminology

For existing properties, callers read:

```ts
node_info({
  nodeIds: [ownerId],
  properties: ["componentPropertyDefinitions"],
  maxDepth: 0
});
```

The result preserves the exact object keys from
`componentPropertyDefinitions`. Those complete keys are `propertyId` values.
Property display names may be repeated and are informational only.

For a sublayer binding, callers also read the exact target ID/name and its
current `componentPropertyReferences`. The owner is discovered from ancestry;
the write never infers authority from selection or current page.

Terminology is normative:

- `propertyName`: a requested display name used only to create a definition;
- `propertyId`: the complete canonical `name#id` key selecting an existing
  definition;
- `previousPropertyId`: the pre-edit key when EDIT may replace it;
- `componentPropertyReferences`: the field-to-property map on the controlled
  sublayer.

---

## `component_manage_property` contract

### Shared types

```ts
type VariableAlias = {
  type: "VARIABLE_ALIAS";
  id: string;
};

type InstanceSwapPreferredValue = {
  type: "COMPONENT" | "COMPONENT_SET";
  key: string;
};

type ComponentPropertyType = "BOOLEAN" | "TEXT" | "INSTANCE_SWAP";
```

All nested objects are strict. Identity, name, key, and alias-ID strings are
non-empty.

### Strict action union

```ts
type ComponentManagePropertyInput =
  | {
      action: "ADD";
      nodeId: string;
      nodeName: string;
      propertyName: string;
      propertyType: ComponentPropertyType;
      defaultValue: string | boolean | VariableAlias;
      preferredValues?: InstanceSwapPreferredValue[];
    }
  | {
      action: "EDIT";
      nodeId: string;
      nodeName: string;
      propertyId: string;
      newPropertyName?: string;
      newDefaultValue?: string | boolean | VariableAlias;
      preferredValues?: InstanceSwapPreferredValue[];
    };
```

`ADD` forbids `propertyId` and EDIT-only fields. `EDIT` forbids
`propertyName`, `propertyType`, and ADD-only fields and requires at least one
actual mutation field. The schema and plugin validate value/property-type and
preferred-value applicability against the pinned Figma typings before the
native call. Unknown fields are never stripped.

### Identity and mutation rules

1. Resolve `nodeId` and exact-name-verify `nodeName`.
2. Require a writable local `COMPONENT` or local `COMPONENT_SET` owner.
3. Resolve every preferred component/set or variable alias and validate its
   type/eligibility before mutation.
4. For EDIT, require exact membership of `propertyId` in the current definition
   map, then require the resolved definition type to be BOOLEAN, TEXT, or
   INSTANCE_SWAP. A SLOT definition is refused before mutation. Do not split on
   `#`, compare a prefix, or choose the first name match.
5. Capture the exact string returned by `addComponentProperty()` or
   `editComponentProperty()`.
6. Read the authoritative resulting definition by that returned key.

If EDIT renames a property and Figma changes its canonical key, the result
contains both identities:

```ts
type ComponentPropertyAddResult = {
  action: "ADD";
  propertyId: string;
  propertyName: string;
  definition: ComponentPropertyDefinition;
};

type ComponentPropertyEditResult = {
  action: "EDIT";
  previousPropertyId: string;
  propertyId: string;
  propertyName: string;
  definition: ComponentPropertyDefinition;
};
```

The API-returned key is authoritative even when it differs from a key inferred
from the requested display name. An ADD/EDIT result can feed directly into
`node_bind_component_property` without another discovery call.

### Unexpected failure and readback

Every predictable identity, ownership, type, preferred-value, alias, and
field-combination failure is preflighted before the native call. If the native
call throws, the handler re-reads the owner's definition map:

- unchanged map: return the native failure with `partialMutation: false`;
- changed map: return before/requested/resulting maps,
  `partialMutation: true`, and current canonical keys;
- unavailable readback: report outcome unknown; do not claim rollback or
  silently retry.

If the native call returns a key but result serialization fails, include that
key and the best available definition snapshot in structured error details.

The registration rewrite preserves `component_manage_property`'s complete
existing annotation object exactly:

```ts
{ openWorldHint: true }
```

It does not add an idempotent hint because the strict union still includes ADD.

---

## `component_delete_property` contract

```ts
type ComponentDeletePropertyInput = {
  nodeId: string;
  nodeName: string;
  propertyId: string;
};
```

The object is strict. Resolve and exact-name-verify a writable local owner, then
require exact `propertyId` membership and require the resolved definition type
to be BOOLEAN, TEXT, or INSTANCE_SWAP. SLOT is readable but cannot be deleted
through this release. Capture the full definition snapshot before deletion. A
stale key returns every current canonical key plus the exact `node_info`
recovery call.

Successful output is:

```ts
type ComponentDeletePropertyResult = {
  nodeId: string;
  nodeName: string;
  propertyId: string;
  definition: ComponentPropertyDefinition;
  deleted: true;
};
```

The snapshot is audit evidence, not a guaranteed restoration artifact. The
registration rewrite preserves the delete tool's complete existing annotation
object exactly:

```ts
{
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true
}
```

On an unexpected native error, read the current definition map and disclose
whether the key remains; never retry a delete automatically.

---

## `node_bind_component_property` contract

### Input

```ts
type NodeBindComponentPropertyInput = {
  nodeId: string;
  nodeName: string;
  field: "visible" | "characters" | "mainComponent";
  propertyId: string | null;
};
```

The object is strict. A non-null `propertyId` is the complete canonical key;
`null` unbinds only the selected field.

### Eligibility and field mapping

The plugin must:

1. resolve and exact-name-verify the sublayer target;
2. find its owning local `COMPONENT`, or the local `COMPONENT_SET` owning its
   component variant;
3. reject a target inside a component instance;
4. allow a nested `INSTANCE` node inside a main component as the direct target
   of `mainComponent` binding, while continuing to block writes to its interior;
5. reject a remote owner through the existing remote-asset guard;
6. for non-null IDs, resolve the exact definition from the owner and enforce:

| Component property type | Required field | Required target capability |
| :- | :- | :- |
| `BOOLEAN` | `visible` | Scene node exposing writable visibility |
| `TEXT` | `characters` | `TEXT` or API-compatible text sublayer |
| `INSTANCE_SWAP` | `mainComponent` | Exact `INSTANCE` target |

No other type/field pairing is accepted.

### Mutation and readback

Snapshot the complete current `componentPropertyReferences` map. For a bind,
replace only `field` with the canonical key. For an unbind, remove only
`field`. Preserve every unrelated entry exactly.

Unbinding an absent reference is a successful no-op and does not invoke the
setter. All validation completes before assignment.

```ts
type NodeBindComponentPropertyResult = {
  nodeId: string;
  nodeName: string;
  owner: {
    id: string;
    name: string;
    type: "COMPONENT" | "COMPONENT_SET";
  };
  field: "visible" | "characters" | "mainComponent";
  propertyId: string | null;
  componentPropertyReferences: Record<string, string> | null;
  noOp: boolean;
};
```

The tool's complete static annotation object is exactly:

```ts
{ idempotentHint: true }
```

Every other hint, including `readOnlyHint`, `openWorldHint`, and
`destructiveHint`, is absent; this follows the umbrella's absolute-binder
contract and avoids classifying reversible reference assignment as destructive.
If assignment throws unexpectedly, read back the complete
reference map and return before/requested/resulting state with
`partialMutation` when observable. Do not silently retry.

---

## Safety and error contract

The plugin is the enforcement boundary. The MCP schema must reject malformed
calls, but the plugin independently enforces scope, exact target/owner names,
locks, instance-interior rules, local ownership, remote assets, and per-field
capabilities immediately before mutation.

Release-owned conditions must have stable structured codes. Existing central
codes with identical semantics are reused rather than duplicated.

| Code | Condition | Required recovery details |
| :- | :- | :- |
| `COMPONENT_PROPERTY_OWNER_MISSING` | Target is not owned by an eligible component/set | target ancestry and accepted owner types |
| `COMPONENT_PROPERTY_OWNER_REMOTE` | Owner definition is remote/read-only | owner identity and local-alternative guidance |
| `COMPONENT_PROPERTY_ID_STALE` | Exact key no longer exists | supplied key, complete current keys, exact `node_info` call, corrected call when deterministic |
| `COMPONENT_PROPERTY_TYPE_UNSUPPORTED` | The selected existing definition is `SLOT` or another pinned type outside BOOLEAN/TEXT/INSTANCE_SWAP | property ID/type, supported types and operations, exact discovery call, and guidance to leave the definition unchanged or manage it directly in Figma |
| `COMPONENT_PROPERTY_VALUE_INVALID` | Definition type and requested default/alias/preferred value conflict | property type, supplied value class, accepted class |
| `COMPONENT_PROPERTY_FIELD_TYPE_MISMATCH` | Property type cannot control selected field/target | property type, supplied field, required field and target type |
| `COMPONENT_PROPERTY_TARGET_IN_INSTANCE` | Binding target is inside a component instance | target/ancestor IDs and direct-owner recovery |
| `COMPONENT_PROPERTY_REFERENCE_DRIFT` | Unexpected assignment/readback differs | before/requested/resulting reference maps |
| `COMPONENT_PROPERTY_MUTATION_PARTIAL` | Definition native call changed state before failure | before/requested/resulting definitions and current canonical keys |

Wrong node/owner names, locks, scope, permissions, and remote assets continue to
use the central project's existing codes. Every refusal supplies
machine-usable details and a one-step recovery where deterministic. Schema
errors enumerate required/forbidden branch fields.

---

## Implementation ownership and phases

Primary files:

- [`src/mcp_server/tools/component.ts`](../../../src/mcp_server/tools/component.ts)
- [`src/mcp_server/tools/node.ts`](../../../src/mcp_server/tools/node.ts)
- [`figma_plugin/handlers/componentHandlers.ts`](../../../figma_plugin/handlers/componentHandlers.ts)
- [`figma_plugin/src/main.ts`](../../../figma_plugin/src/main.ts)
- [`SAFETY.md`](../../../SAFETY.md)
- [`skills/figma-edit/references/`](../../../skills/figma-edit/references/)

### Phase 1 — Canonical identity contract

- Define strict ADD/EDIT/delete schemas and canonical terminology.
- Extend result schemas before handlers.
- Add old display-name versus new canonical-key migration fixtures.
- Add stale-key errors and canonical definition serialization.
- Add plugin-side supported-type gates so exact identity never widens the
  release into SLOT lifecycle work.

### Phase 2 — Canonical ADD/EDIT/delete implementation

- Capture native ADD/EDIT return keys.
- Require exact keys for EDIT/delete and return replacement keys after rename.
- Add complete definition snapshots and unexpected-failure readback.
- Remove every prefix/display-name route from handlers and tests.

Identity schema, handler, output, recovery, and registered-boundary tests must be
green before Phase 3 starts.

### Phase 3 — Component-property binding

- Add strict public schema, dispatcher route, handler, annotations, and safety
  row for `node_bind_component_property`.
- Implement owner discovery, instance-interior/remote gates, exact definition
  resolution, type-to-field validation, unrelated-reference preservation,
  no-op behavior, and complete readback.
- Add post-error drift disclosure.

### Phase 4 — Contract synchronization and release

- Update [`README.md`](../../../README.md), [`SAFETY.md`](../../../SAFETY.md),
  [`CHANGELOG.md`](../../../CHANGELOG.md), tool-selection/workflow/constraints/
  error-playbook guides and their resource mirrors.
- Regenerate `figma_plugin/code.js`; never hand-edit it.
- Update tool count/list, dispatcher/command unions, safety matrices, version
  surfaces, and generated-output fixtures.
- Run repository gates and the live add/edit/bind/unbind/delete chain.

---

## Test strategy

### Schema and boundary tests

- Snapshot emitted `tools/list` contracts.
- Assert the exact release-local tool delta is +1 with only
  `node_bind_component_property` added.
- Assert recursively strict action-specific ADD and EDIT branches.
- Reject `propertyName` as an EDIT/delete selector and reject `propertyId` on
  ADD.
- Require at least one EDIT mutation field.
- Assert strict alias/preferred-value objects and type/value compatibility.
- Assert the binder has one exact target, one exact field, one
  `propertyId | null`, no batch branch, and exactly
  `{ idempotentHint: true }` with open-world/destructive hints absent.
- Assert emitted metadata preserves exactly
  `component_manage_property: { openWorldHint: true }` and
  `component_delete_property: { destructiveHint: true, idempotentHint: true,
  openWorldHint: true }`.
- Prove the retired display-name selector is absent from registration,
  dispatcher-compatible payloads, guides, prompts, tests, and generated output.

### Handler and safety tests

- ADD returns the exact API-returned key.
- EDIT by exact key changes only the selected definition; duplicate display
  names cannot redirect it.
- Rename returns `previousPropertyId` and the authoritative replacement.
- Delete snapshots and removes only the exact key.
- EDIT, delete, and bind refuse an exact SLOT definition before every native
  setter while leaving the readable definition map intact.
- Stale keys return every current key and a complete recovery call.
- Local component and local component-set/variant ownership succeed.
- Remote owner, missing owner, component-instance interior, wrong target type,
  wrong property type/field, wrong name, lock, and scope fail before assignment.
- Bind/unbind preserve unrelated references; absent unbind is a setter-free
  no-op.
- Inject native/readback failures and assert exact partial-state disclosure.

### Required live Figma probes

In one dedicated Design file:

1. add BOOLEAN, TEXT, and INSTANCE_SWAP definitions and record native keys;
2. create duplicate display-name definitions and prove exact-key EDIT/delete;
3. rename a property and prove the replacement key is returned;
4. feed the returned key directly into the matching `visible`, `characters`,
   or `mainComponent` binding;
5. discover a SLOT definition when the pinned host can author one and prove
   EDIT, delete, and bind refuse it without mutation; fixture unavailability is
   recorded rather than treated as success;
6. verify unrelated references survive bind/unbind and absent unbind is a no-op;
7. refuse remote-owner and component-instance-interior targets;
8. delete by the replacement key and verify the definition is gone;
9. submit the retired display-name shape through the official MCP boundary and
   verify rejection.

Record request/response, IDs/names, before/after definition/reference maps,
channel/file identity, and cleanup. Repository mocks do not establish live
Figma behavior.

---

## Documentation, generated artifacts, and release gates

Documentation must consistently distinguish `propertyName` from `propertyId`,
show the complete add/edit/bind/unbind/delete workflow, list exact field/type
mapping, explain remote/instance-interior refusals, and publish old/new hard-
cutover examples.

Update canonical guides and all `figma-edit://guide/*` resource mirrors in the
same release. Add/replace the relevant [`SAFETY.md`](../../../SAFETY.md) rows and
prove bidirectional registered-tool parity. Regenerate the plugin artifact.

Required commands, using scripts present in the scheduled checkout:

- `bun run build:all`
- `bun run check:generated`
- `bun run check:plugin`
- `bun run check:versions`
- `bun run check:types:plugin`
- `bun run check:suppressions`
- focused schema, handler, safety, and registered-boundary suites
- full repository suite

Record exact counts. Red-proof each new regression guard by breaking the
protected production/contract line, recording the named red result, restoring
it, and rerunning green. Keep repository/mock and live-host evidence separate.

---

## Acceptance criteria

- [ ] ADD returns Figma's exact canonical key in the same call.
- [ ] EDIT/delete accept only exact `propertyId`; display-name and prefix lookup
  are absent everywhere.
- [ ] Rename returns both previous and authoritative resulting keys.
- [ ] Stale keys return complete current identities and one-step recovery.
- [ ] `node_bind_component_property` consumes ADD/EDIT output directly.
- [ ] Binding enforces exact owner/target/type/field rules before assignment.
- [ ] Binding/unbinding preserves every unrelated reference and accurately
  reports no-op/readback state.
- [ ] Remote owners and component-instance interiors are refused plugin-side.
- [ ] Existing SLOT definitions remain readable but EDIT/delete/bind reject
  them plugin-side with `COMPONENT_PROPERTY_TYPE_UNSUPPORTED` and zero mutation.
- [ ] Unexpected native failures disclose observed drift without claiming
  rollback.
- [ ] The rewritten manage/delete registrations preserve their complete exact
  annotation objects, and the new binder publishes exactly its one-hint object.
- [ ] Guides, safety rows, command unions, generated output, tool counts, and
  version surfaces match the release.
- [ ] The official tool inventory increases by exactly one and names only
  `node_bind_component_property` as the addition.
- [ ] Focused/full repository gates and required live probes are recorded green,
  or fixture blockers are explicit.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Existing display-name callers break | High | Explicit hard-cut migration, schema/route absence tests, current-key recovery |
| Duplicate names select the wrong property | Certain under old behavior | Exact map membership only; never split `#` or prefix-match |
| Rename reports a stale identity | High without native capture | Return API key plus previous/resulting identities and definition readback |
| Binding overwrites unrelated references | Medium | Snapshot/merge one field/read back complete map |
| Remote or instance-owned definition mutates | High without plugin gates | Local owner ancestry and instance-interior checks immediately before assignment |
| Property type is bound to the wrong field | Medium | Fixed type/field/target matrix in schema descriptions and plugin preflight |
| Native call changes state before failure | Medium | Re-read authoritative maps and disclose partial/unknown outcome; no retry |
| Combined tool schema is ambiguous | Medium | Strict ADD/EDIT discriminator and emitted-schema tests |

---

## Dependencies and exclusions

Required predecessor capabilities are the existing component definition read,
component/set write safety stack, exact-name verification, remote-asset guard,
structured errors, and generated/safety consistency gates.

This release has no hard dependency on another future PRD. It should normally
precede the exact instance-property cutover so both releases share canonical
identity terminology, but `instance.componentProperties` has its own exact
discovery map and does not make this release technically inseparable from it.

Explicitly excluded:

- `instance_set_component_properties` and retired override-tool migration;
- component swap, detach, or override removal;
- general node filtering/search;
- variant-property value writes on instances;
- any remote definition write or selection-based shortcut.

All release-owned safety, errors, docs, generated output, versioning, tests, and
live evidence are included here rather than deferred.
