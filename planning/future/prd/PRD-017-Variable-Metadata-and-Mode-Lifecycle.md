# PRD — Variable Metadata and Mode Lifecycle

> [!IMPORTANT]
> **Release type:** standalone minor release
>
> **Version:** unassigned; assign its SemVer only when this release is scheduled
>
> **Status:** draft
>
> **Standalone extraction/revision:** 2026-08-04
>
> **Authoritative source:** [Figma Design Editing Capability Expansion](../initiative/03%20-%20Figma%20Design%20Editing%20Capability%20Expansion/initiative.md), Sections 10–12

This release completes the local variable-maintenance lifecycle without adding
another public tool. It expands `variable_manage` with code-syntax maintenance,
collection rename, and mode add/rename; lets `node_bind_variable` clear an
explicit collection-mode override; and hard-cuts `variable_delete` over to an
explicit `VARIABLES` / `COLLECTION` / `MODE` target.

These capabilities form one release because they share collection and mode
identity, `variable_list` discovery/readback, variable permissions, remote and
extension ownership rules, and the same server/plugin implementation files.
Most importantly, safe mode deletion depends on explicit-mode clearing as its
one-step consumer recovery. Splitting the work would either ship an
unrecoverable refusal or reopen the same schemas, handlers, error taxonomy,
guides, and live fixtures in consecutive releases.

---

## Release identity and compatibility

The public tool names remain:

- `variable_list` — expanded readback for code syntax and complete collection
  identity;
- `variable_manage` — expanded to six strict action branches;
- `node_bind_variable` — expanded so an explicit mode value may be `null`;
- `variable_delete` — hard-cut to a required discriminated `target` object.

There are no new tool names and no compatibility alias. The old
`variable_delete` optional `variableIds` / `variableNames` / `collectionId` /
`collectionName` top-level shape is removed from the MCP schema, dispatcher
expectations, examples, tests, guides, and generated output in this release.
Calls using it must fail at the MCP boundary; they must never be reinterpreted
by the plugin.

Release-local public-tool arithmetic is net 0: no tool name is added, removed,
or renamed; the four named tools change contract in place.

The four registration rewrites preserve the complete emitted annotation
objects from the scheduled baseline:

```ts
{
  variable_list: { readOnlyHint: true, openWorldHint: true },
  variable_manage: { openWorldHint: true },
  node_bind_variable: { idempotentHint: true, openWorldHint: true },
  variable_delete: {
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true
  }
}
```

No omitted or added hint is implied by the schema changes.

When scheduled, this PRD receives one minor version and updates every enforced
version surface from the then-current predecessor, including:

- [`package.json`](../../../package.json) and
  its root [`package-lock.json`](../../../package-lock.json) release fields;
- both version fields in [`server.json`](../../../server.json);
- root [`manifest.json`](../../../manifest.json); and
- the derived plugin About/handshake/bundle output enforced by `check:plugin`.

Do not add a version to `figma_plugin/manifest.json`, change the unrelated
`src/mcp_server/package.json` package identity, or hard-code a release literal
in `src/shared/version.ts`.

The release is independently schedulable. It does not require the future
`NodeFilter.variableBinding` capability, font discovery, component work, or any
other PRD in this folder. Existing structured-error transport, scope/name
verification, document-scan completeness, and variable permission contracts
remain prerequisites supplied by the scheduled predecessor.

---

## Source mapping

| Standalone scope | Umbrella source | Disposition |
| :- | :- | :- |
| Strict `variable_manage` action surface | Section 10, Action surface | Preserved |
| Nullable code syntax | Section 10, Nullable `codeSyntax` | Preserved, including create cleanup |
| Collection rename | Section 10, `RENAME_COLLECTION` | Preserved |
| Add and rename mode | Section 10, `ADD_MODE` / `RENAME_MODE` | Preserved |
| Existing-action tightening | Section 10, Existing action tightening | Preserved |
| Explicit-mode clear | Section 11 | Preserved in the same release as mode deletion |
| Discriminated variable/mode deletion | Section 12 | Preserved as a hard cutover |
| Safety, errors, schemas, tests, risks | Sections 20 and the release-wide gates, limited to Sections 10–12 | Restated here so this PRD is standalone |

Historical checklist IDs retained by this extraction are 9, 11, 12, 13, and
25. Product decisions D1–D6, D12, and D22 apply to this scope.

---

## Goals

- Make every variable-management action self-describing in emitted JSON Schema.
- Let callers set, remove, discover, and verify per-platform variable code
  syntax without losing omitted platforms.
- Rename a local collection without changing any identity-based reference.
- Add and rename collection modes through exact collection/mode identities.
- Clear one collection's explicit mode on one exact node without disturbing
  other bindings or overrides.
- Delete a mode only after exact identity checks, last-mode protection, and a
  complete explicit-mode consumer scan.
- Preserve first-call correctness and one-round-trip recovery: predictable
  failures occur before mutation and include the exact next read or corrected
  call.
- Return complete resulting state after every successful write.

## Non-goals

- No new `set_variable_code_syntax`, `rename_variable_collection`,
  `add_variable_mode`, `rename_variable_mode`, or `delete_variable_mode` tool.
- No variable-definition filter under `variable_list` and no new node-search
  surface.
- No implicit default-mode selection for `UPDATE_VARIABLE.value`.
- No remote-variable mutation and no lossy plan-limit workaround.
- No automatic clearing of explicit-mode consumers during mode deletion.
- No rollback framework. Predictable failures are preflighted; unexpected Figma
  failures receive explicit cleanup/readback and partial-state disclosure.
- No compatibility branch for the retired `variable_delete` shape.

---

## Canonical discovery contract

`variable_list` is the required discovery and readback tool. Before a write,
callers obtain exact IDs and current names from it; after a write, the handler
returns the complete resulting state and the next `variable_list` call must
agree.

For this release, collection rows include at least:

```ts
type VariableCollectionRead = {
  id: string;
  name: string;
  key: string;
  remote: boolean;
  isExtension: boolean;
  defaultModeId: string;
  modes: Array<{ modeId: string; name: string }>;
  variableIds: string[];
};
```

Variable rows include their existing identity/type/value/consumer fields plus:

```ts
codeSyntax: {
  WEB?: string;
  ANDROID?: string;
  iOS?: string;
};
```

Absence means no syntax is set for that platform. Readback must not synthesize
empty strings. Exact IDs remain authoritative even when names collide.

---

## `variable_manage` contract

### Shared types

```ts
type VariableResolvedType = "FLOAT" | "COLOR" | "STRING" | "BOOLEAN";

type VariableScope =
  | "ALL_SCOPES"
  | "TEXT_CONTENT"
  | "CORNER_RADIUS"
  | "WIDTH_HEIGHT"
  | "GAP"
  | "ALL_FILLS"
  | "FRAME_FILL"
  | "SHAPE_FILL"
  | "TEXT_FILL"
  | "STROKE_COLOR"
  | "STROKE_FLOAT"
  | "EFFECT_FLOAT"
  | "EFFECT_COLOR"
  | "OPACITY"
  | "FONT_FAMILY"
  | "FONT_STYLE"
  | "FONT_WEIGHT"
  | "FONT_SIZE"
  | "LINE_HEIGHT"
  | "LETTER_SPACING"
  | "PARAGRAPH_SPACING"
  | "PARAGRAPH_INDENT";

type VariableAlias = {
  type: "VARIABLE_ALIAS";
  id: string;
};

type VariableValue =
  | string
  | number
  | boolean
  | { r: number; g: number; b: number; a?: number }
  | VariableAlias;

type VariableCodeSyntaxPatch = {
  WEB?: string | null;
  ANDROID?: string | null;
  iOS?: string | null;
};
```

`VariableCodeSyntaxPatch` is strict and must contain at least one platform.
Unknown platform keys fail at the MCP boundary. A supplied string must remain
non-empty after trimming; `null`, not an empty string, means remove.

### Strict action union

The emitted schema is a recursively strict discriminated union. Fields from
another action are rejected rather than stripped.

```ts
type VariableManageInput =
  | {
      action: "CREATE_COLLECTION";
      name: string;
      modeName?: string;
    }
  | {
      action: "CREATE_VARIABLE";
      collectionId: string;
      collectionName: string;
      name: string;
      type: VariableResolvedType;
      scopes: VariableScope[];
      value?: VariableValue;
      codeSyntax?: VariableCodeSyntaxPatch;
    }
  | {
      action: "UPDATE_VARIABLE";
      variableId: string;
      currentVariableName: string;
      name?: string;
      description?: string;
      scopes?: VariableScope[];
      modeId?: string;
      value?: VariableValue;
      codeSyntax?: VariableCodeSyntaxPatch;
    }
  | {
      action: "RENAME_COLLECTION";
      collectionId: string;
      collectionName: string;
      name: string;
    }
  | {
      action: "ADD_MODE";
      collectionId: string;
      collectionName: string;
      name: string;
    }
  | {
      action: "RENAME_MODE";
      collectionId: string;
      collectionName: string;
      modeId: string;
      currentModeName: string;
      name: string;
    };
```

`VariableScope` is pinned to the emitted enum above; a typings bump must review
and deliberately update both the implementation and this contract rather than
silently widening it. All identity and name strings are non-empty. `scopes` is
explicit on create; on update its omission means unchanged.

In addition, the replacement `name` in `RENAME_COLLECTION` and `RENAME_MODE`
must satisfy `name.trim().length > 0` at both the MCP schema and plugin
boundaries. Validation does not silently trim a non-blank supplied value; it
only rejects whitespace-only replacements.

### Complete-call preflight

Before the first setter, the plugin must:

1. resolve every referenced collection, mode, variable, and alias;
2. verify each supplied current exact name;
3. verify local/extension/remote writability for the selected action;
4. validate every branch field, scope, value/type relationship, alias identity,
   mode ownership, rename trim rule, and code-syntax platform/value;
5. require `modeId` whenever `UPDATE_VARIABLE` supplies `value`;
6. compute the complete mutation and readback plan.

Setting name, description, scopes, value, and code syntax in one update is
allowed only after all supplied fields pass this preflight. A known-invalid
later field may not leave an earlier field applied.

### Code-syntax semantics

- Omitted platform: leave unchanged.
- Non-empty string: `setVariableCodeSyntax(platform, value)`.
- `null`: `removeVariableCodeSyntax(platform)`.
- Return the complete resulting code-syntax object, not the submitted patch.

For `CREATE_VARIABLE`, code syntax is applied after creation. If applying it
fails, the handler must remove the new variable. If cleanup succeeds, return
the original failure and `partialMutation: false`. If cleanup fails, return the
created variable ID/name, the cleanup failure, `partialMutation: true`, and the
exact `variable_delete` call needed to reconcile it. Never claim rollback
without verified cleanup.

### Collection rename

Resolve `collectionId`, exact-name-verify `collectionName`, and mutate only
`collection.name`. Local extended collections may be renamed when their local
collection identity is writable; inherited modes and variables remain
unchanged. Remote collections are refused.

If `name === collectionName`, return a no-op without invoking the setter. If
Figma permits a duplicate name, allow it because the ID remains authoritative
and include every collision in `duplicateNameWarning`.

```ts
type RenameCollectionResult = {
  action: "RENAME_COLLECTION";
  collectionId: string;
  oldName: string;
  name: string;
  key: string;
  remote: false;
  isExtension: boolean;
  modes: Array<{ modeId: string; name: string }>;
  variableIds: string[];
  noOp: boolean;
  duplicateNameWarning?: Array<{ collectionId: string; name: string }>;
};
```

The collection ID/key, mode IDs, variable IDs, values, aliases, direct
bindings, and explicit-mode assignments must remain stable.

### Mode add and rename

`ADD_MODE` exact-name-verifies the local collection and rejects remote or
extended collections for which Figma does not allow mode creation. Success
returns collection identity, the new mode ID/name, and the complete resulting
mode list. A Figma plan-limit refusal includes the current mode count and says
that the file's plan must allow another mode; it must not propose deleting data
as an automatic workaround.

`RENAME_MODE` verifies collection ID/name and mode ID/current name before
mutation. It rejects an empty replacement and any duplicate name that would
make mode identification ambiguous. Success returns old/new names and the
complete mode list.

---

## `node_bind_variable` explicit-mode clearing

```ts
type NodeBindVariableInput = {
  nodeId: string;
  nodeName: string;
  bindVariables?: Partial<Record<BindableField, string | null>>;
  explicitVariableModes?: Record<string, string | null>;
};
```

The top-level and both maps are strict. At least one of `bindVariables` or
`explicitVariableModes` must contain an entry.

- `bindVariables[field]: string` retains current bind behavior.
- `bindVariables[field]: null` unbinds that field.
- `explicitVariableModes[collectionId]: string` resolves the collection and
  mode, verifies ownership, then calls
  `setExplicitVariableModeForCollection(collection, modeId)`.
- `explicitVariableModes[collectionId]: null` resolves the collection and calls
  `clearExplicitVariableModeForCollection(collection)`.
- Omitted fields and collections remain unchanged.

Every collection, mode, variable, field, type, name, scope, and permission
check for the complete call occurs before any binding setter. A mode from the
wrong collection prevents every other requested binding from mutating.
Clearing an absent override is a successful no-op and reports the resulting
inherited/default state.

Success returns the target identity plus complete resulting
`boundVariables` and `explicitVariableModes`; it does not echo only the patch.
Tool/schema wording must distinguish variable unbinding from explicit-mode
clearing.

The schema expansion preserves the binder's absolute-write annotations exactly:

```ts
{
  idempotentHint: true,
  openWorldHint: true
}
```

It does not acquire `destructiveHint: true`; destructive classification belongs
to `variable_delete`.

---

## `variable_delete` hard-cut contract

```ts
type VariableDeleteInput = {
  target:
    | {
        kind: "VARIABLES";
        variables: Array<{
          variableId: string;
          variableName: string;
        }>;
      }
    | {
        kind: "COLLECTION";
        collectionId: string;
        collectionName: string;
      }
    | {
        kind: "MODE";
        collectionId: string;
        collectionName: string;
        modeId: string;
        modeName: string;
      };
};
```

All objects are recursively strict. The variable array is non-empty and has no
duplicate IDs. The discriminator makes it impossible for an omitted mode field
to turn a mode request into collection deletion.

Existing variable and collection deletion retain their complete-document
consumer checks, exact-name verification, fail-closed page coverage, and
all-before-any mutation behavior under the new branches.

Before `collection.removeMode(modeId)`, the plugin must:

1. verify variable-edit permission;
2. resolve and exact-name-verify a writable local collection;
3. resolve and exact-name-verify the mode in that collection;
4. reject deletion of the only remaining mode;
5. scan every document page for nodes whose
   `explicitVariableModes[collectionId]` equals `modeId`;
6. fail closed if any page cannot be loaded or read;
7. if consumers exist, refuse with their IDs/names and complete corrected
   `node_bind_variable` clear calls, then instruct the caller to retry;
8. disclose that every variable value stored in the mode will be permanently
   removed.

Stored mode values are intrinsic deleted data, not a recoverable consumer and
not restoration data. The hard schema rewrite preserves the tool's complete
existing annotation object:

```ts
{
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true
}
```

These hints are advisory; the fresh discriminator, exact identities, consumer
scan, and plugin-side destructive gates remain authoritative.

```ts
type VariableDeleteResult = {
  deleted: {
    kind: "VARIABLES" | "COLLECTION" | "MODE";
    ids: string[];
    names: string[];
  };
  collectionId?: string;
  remainingModes?: Array<{ modeId: string; name: string }>;
  previousDefaultModeId?: string;
  defaultModeId?: string;
};
```

When deleting the default mode causes Figma to select a replacement, both old
and resulting default IDs plus the complete remaining mode list are required.

Unexpected deletion failures are not retried. The handler reads back the target
collection/mode/variables when possible and returns before/requested/resulting
state plus `partialMutation: true` if any deletion occurred. It must not claim
atomicity or rollback beyond the predictable all-before-any preflight.

---

## Safety and error contract

The plugin remains the trust boundary. MCP schema validation improves first-call
correctness but is not authorization. All existing variable permission,
scope-independent asset identity, remote ownership, exact-name, page-load, and
destructive-operation controls remain plugin-side.

Release-owned structured errors must distinguish at least:

| Code | Condition | Required recovery details |
| :- | :- | :- |
| `COLLECTION_NAME_MISMATCH` | ID resolves but current name differs | Reuse the existing central code with expanded ID, supplied/current names, corrected call, and `variable_list` read details |
| `VARIABLE_COLLECTION_REMOTE` | Selected collection is remote/read-only | collection identity and source-library recovery |
| `VARIABLE_COLLECTION_MODE_UNSUPPORTED` | Extended/other collection cannot add a mode | collection identity and supported action |
| `VARIABLE_MODE_NOT_FOUND` | Mode ID is absent from the collection | collection identity and complete valid mode list |
| `VARIABLE_MODE_NAME_MISMATCH` | Mode ID resolves under another current name | supplied/current names and corrected call |
| `VARIABLE_MODE_WRONG_COLLECTION` | Mode does not belong to supplied collection | mode/collection identities and corrected accepted pair |
| `VARIABLE_MODE_PLAN_LIMIT` | Figma plan rejects another mode | collection identity, current count, plan requirement |
| `VARIABLE_MODE_LAST_REMAINING` | Delete targets the only mode | collection/mode identity; add another mode first |
| `VARIABLE_MODE_IN_USE` | Explicit-mode consumers still reference the mode | complete consumers and exact clear calls |
| `DOCUMENT_SCAN_INCOMPLETE` | A required consumer page failed | coverage/failure list; retry after scan succeeds |
| `VARIABLE_CODE_SYNTAX_INVALID` | Empty/unknown/malformed syntax patch escaped the boundary | platform, supplied value, accepted values |
| `VARIABLE_MUTATION_PARTIAL` | Unexpected native failure left observed drift | before/requested/resulting state and reconciliation call |

Schema-shape failures may use the standard MCP invalid-arguments envelope but
must identify the branch-specific required and forbidden fields. Existing
central codes with identical semantics may be reused; do not create two names
for the same cause and recovery.

Every refusal includes machine-usable `details`, identifies observed and
accepted identities, and supplies one complete repair when deterministic. No
error suggests a destructive workaround automatically.

---

## Implementation ownership and phases

Primary implementation files:

- [`src/mcp_server/tools/variable.ts`](../../../src/mcp_server/tools/variable.ts)
- [`src/mcp_server/tools/node.ts`](../../../src/mcp_server/tools/node.ts)
- [`figma_plugin/handlers/variableHandlers.ts`](../../../figma_plugin/handlers/variableHandlers.ts)
- [`figma_plugin/src/main.ts`](../../../figma_plugin/src/main.ts)
- [`SAFETY.md`](../../../SAFETY.md)
- [`skills/figma-edit/references/`](../../../skills/figma-edit/references/)

### Phase 1 — Contract and migration fixtures

- Define the strict unions, code-syntax patch, exact readback types, error
  codes, and old/new `variable_delete` fixtures.
- Snapshot emitted `tools/list`; prove the retired delete shape fails and no
  compatibility route exists.
- Extend `variable_list` serialization before enabling writes.

### Phase 2 — `variable_manage`

- Refactor existing actions into strict branches.
- Add code syntax with create cleanup and update preflight.
- Add collection rename and mode add/rename.
- Tighten `UPDATE_VARIABLE.value` to require `modeId`.
- Add complete result readback and injected-failure reconciliation tests.

### Phase 3 — Explicit-mode clear

- Extend the public and plugin maps to `string | null`.
- Preflight the full bind/mode-clear call before any setter.
- Return complete bindings and explicit modes, including inherited/default
  state after a clear.

### Phase 4 — Discriminated deletion

- Replace the public schema and plugin parsing with `target.kind`.
- Preserve variable/collection consumer safety under the new branches.
- Add mode exact-name/ownership/last-mode checks, complete consumer scanning,
  default-mode readback, and partial-state disclosure.

### Phase 5 — Contract synchronization and release

- Update [`README.md`](../../../README.md), [`SAFETY.md`](../../../SAFETY.md),
  [`CHANGELOG.md`](../../../CHANGELOG.md), prompts/tool descriptions, all four
  guide/resource mirrors, and generated `figma_plugin/code.js`.
- Publish old/new deletion examples and unbind-versus-mode-clear guidance.
- Assign the minor version, run all release gates, and record live evidence.

---

## Test strategy

### Schema and registered-boundary tests

- Snapshot emitted schemas, not only local Zod objects.
- Assert the exact four-tool annotation matrix in the release-identity section
  through emitted `tools/list` metadata.
- Prove all six action branches expose exact required/optional/forbidden fields.
- Reject empty/unknown code-syntax patches and accept independent set/remove.
- Reject whitespace-only collection/mode replacement names through the official
  boundary and repeat the trim check plugin-side.
- Require `modeId` with `UPDATE_VARIABLE.value`.
- Prove `node_bind_variable` distinguishes both nullable map meanings and
  requires at least one entry.
- Assert emitted `node_bind_variable` metadata preserves
  `idempotentHint: true`, `openWorldHint: true`, and no destructive hint.
- Prove only the `target.kind` delete schema is registered; reject every legacy,
  mixed, incomplete, duplicate, and unknown-key form.
- Assert emitted `variable_delete` metadata preserves exactly
  `destructiveHint: true`, `idempotentHint: true`, and `openWorldHint: true`.

### Handler and safety tests

- Code syntax: set one platform, preserve omitted platforms, remove with null,
  reject empty strings, clean up failed creation, and disclose failed cleanup.
- Collection rename: local success, same-name no-op, duplicate warning,
  remote refusal, supported extension behavior, exact-name mismatch, and proof
  that all IDs/values/aliases/bindings remain unchanged.
- Mode add/rename: exact ownership/name, duplicate name, remote/extension
  refusal, whitespace-only rename refusal, plan limit, complete resulting modes,
  and zero mutation on a later invalid field.
- Explicit mode: set, clear, absent-clear no-op, wrong-collection refusal,
  mixed binding preflight, and complete resulting readback.
- Delete: each discriminator branch, wrong names, last mode, explicit consumers,
  incomplete page scan, default replacement, stored-value disclosure, and
  unexpected partial-state readback.
- Registered-boundary tests prove plugin gates—not only MCP schemas—refuse
  invalid identities and permissions before native setters.

### Required live Figma probes

In a dedicated Design file, record requests, exact returned state, document
before/after state, cleanup, and channel identity for:

1. create/update variable code syntax, remove one platform, and verify with
   `variable_list`;
2. rename a local collection and prove collection/mode/variable IDs, aliases,
   bindings, explicit modes, and values remain stable;
3. add and rename a mode, including one safe plan-limit probe when the fixture
   and account make it possible;
4. set and clear an explicit mode, including an absent-clear no-op and a
   wrong-collection atomic refusal;
5. refuse deletion while an explicit-mode consumer exists, clear it with the
   returned call, retry, and verify old/new default mode IDs when applicable;
6. prove the old `variable_delete` shape is rejected at the official MCP
   boundary.

Mocks establish repository behavior only; they do not establish Figma API
behavior. If a plan-limit fixture is unavailable, record it as blocked rather
than simulate live evidence.

---

## Documentation, generated artifacts, and release gates

Documentation must state:

- exact discovery/readback calls;
- all six action branches;
- set/remove/omit code-syntax semantics;
- stable identity behavior under collection rename;
- mode add/rename/delete ownership and destructive boundaries;
- variable unbinding versus explicit-mode clearing;
- old/new `variable_delete` migration with no compatibility alias.

Update canonical guides and their `figma-edit://guide/*` resource mirrors in the
same change. Regenerate `figma_plugin/code.js`; never hand-edit it. Reconcile
the registered-tool/safety-row matrix in both directions.

Required release commands include, using the scripts present in the scheduled
checkout:

- `bun run build:all`
- `bun run check:generated`
- `bun run check:plugin`
- `bun run check:versions`
- `bun run check:types:plugin`
- `bun run check:suppressions`
- focused schema/handler/boundary suites
- the full repository test suite

Record exact pass/assertion counts from the release checkout. Red-proof new
regression guards by breaking the protected production/contract line, recording
the named red failure/count, restoring it, and rerunning green. Report any
environment/socket failure separately from product results.

---

## Acceptance criteria

- [ ] `variable_manage` publishes exactly six strict action branches.
- [ ] All four changed registrations preserve their complete exact annotation
  objects at the emitted boundary.
- [ ] Code syntax is discoverable, settable, independently removable, and
  completely read back; failed create cleanup is verified or disclosed.
- [ ] Collection rename preserves every identity and reference named in this
  PRD and reports duplicate-name warnings without weakening ID authority.
- [ ] Mode add/rename verifies exact current identities and gives one-step
  recovery for ownership, name, remote, and plan-limit failures.
- [ ] Collection and mode rename reject whitespace-only replacements at both
  validation layers without silently trimming accepted names.
- [ ] Explicit-mode clear is distinct from variable unbinding, is idempotent for
  an absent override, and preflights the whole call.
- [ ] `node_bind_variable` retains its exact absolute-write annotations in
  emitted tool metadata while `variable_delete` remains destructive.
- [ ] Mode deletion cannot be confused with collection deletion, rejects the
  last mode, fails closed on incomplete scans, and returns complete consumer
  recovery.
- [ ] Existing variable and collection deletion behavior survives under the
  discriminator.
- [ ] `variable_delete` retains its complete three-hint annotation object after
  the registered-schema hard cut.
- [ ] The retired delete shape is absent from schemas, handlers, examples,
  guides, tests, and generated output.
- [ ] Safety/docs/generated/version matrices are synchronized.
- [ ] Focused and full repository gates pass with recorded counts.
- [ ] Required live probes pass or have explicit fixture-specific blockers.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :-: | :- |
| Legacy delete callers break | High | One hard cutover, explicit old/new examples, boundary absence tests, no ambiguous parser |
| Mode deletion silently removes values or overrides | High without guards | Exact discriminator/names, last-mode check, complete explicit-consumer scan, permanent-value disclosure |
| A failed create leaves an unintended variable | Medium | Apply syntax after create, verified cleanup, return orphan identity and reconciliation on cleanup failure |
| Collection rename breaks references | Low if Figma preserves identity | Mutate only `name`; assert every ID, alias, binding, mode, and value before/after |
| Plan differences reject add-mode calls | Medium | Live probe, structured count/plan error, no destructive fallback |
| One bad field partially applies a consolidated update | Medium | Complete-call preflight and unexpected-drift readback |
| Incomplete page loading is mistaken for no consumers | High | Fail closed with `DOCUMENT_SCAN_INCOMPLETE` and coverage details |
| `null` meanings are confused | Medium | Separate schema descriptions/examples and registered-schema tests for unbind versus mode clear |

---

## Dependencies and exclusions

Required predecessor capabilities:

- existing structured-error transport and central registry;
- exact-name verification and variable permissions;
- fail-closed document consumer scanning;
- current `variable_list`, `variable_manage`, `node_bind_variable`, and
  `variable_delete` baselines.

No future capability PRD is a hard predecessor. This release must not absorb:

- `NodeFilter.variableBinding` or broader dependency-graph work;
- paint-stack variable binding;
- component-property binding;
- general timeout/receipt protocol changes;
- any current-page/selection convenience behavior.

Cross-cutting safety, errors, documentation, generated output, versioning, and
release evidence listed here are part of this release—not a later cleanup
track.
