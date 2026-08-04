# Changelog

> **Note:** `1.5.0` is the first version published to NPM. Versions `1.3.0` and `1.4.0` were development milestones tagged in this repository but never released to the registry. The entries below are retained for traceability of the breaking changes that landed before the first published release.

> **Superseded wording in the v2.3.2 entry:** its "no-orphan creation" bullet promised that a failed creation removes the new object, which reads as an infallible rollback. The real guarantee is an observable success boundary with best-effort cleanup — see `[2.3.3] → Changed`. Every entry below is retained unchanged for traceability, including the v2.0.0 rename and tool-count records; where an older entry and `[2.3.3]` disagree, `[2.3.3]` is authoritative.

## [2.3.3]

This release restores type-checking for the Figma plugin and closes the v2.3.3 safety-contract gaps across design-system writes, explicit placement, batch reporting, annotations, structured errors, peer-bound channels, page-load isolation, and current documentation. It is a **hard contract cutover**: fail-closed safety repairs ship at patch level, and callers must migrate the request and response shapes below.

### Breaking changes and migration examples

- **Design-system writes require current-name and collection verification.** `UPDATE_VARIABLE` now requires `currentVariableName`; `style_manage` updates selected by `styleId` require `currentStyleName`; and `CREATE_VARIABLE` requires both `collectionName` and an explicit `scopes` array. A style/variable update may omit `name` to keep the current name.

  Before:

  ```json
  {"action":"UPDATE_VARIABLE","variableId":"VariableID:1:2","description":"Updated"}
  {"type":"PAINT","styleId":"S:1:2","name":"Assumed name","description":"Updated"}
  {"action":"CREATE_VARIABLE","name":"Brand","collectionId":"VariableCollectionId:1:1","type":"COLOR"}
  ```

  After:

  ```json
  {"action":"UPDATE_VARIABLE","variableId":"VariableID:1:2","currentVariableName":"Brand/Primary","description":"Updated"}
  {"type":"PAINT","styleId":"S:1:2","currentStyleName":"Brand/Primary","description":"Updated"}
  {"action":"CREATE_VARIABLE","name":"Brand","collectionId":"VariableCollectionId:1:1","collectionName":"Brand tokens","type":"COLOR","scopes":["ALL_FILLS"]}
  ```

- **Every caller-placed creator has an explicit verified parent.** `create_shape`, `create_frame`, `create_text`, `create_svg`, and `create_instance` require `parentId` plus `parentNodeName`; `create_component_set` now requires the same pair. The five existing creators already refused an omitted parent name inside the plugin; v2.3.3 advertises and rejects the omission at the schema boundary as well.

  Before:

  ```json
  {"type":"RECTANGLE","x":0,"y":0,"width":100,"height":100,"parentId":"1:1"}
  {"components":[{"nodeId":"1:2","nodeName":"Small","propertyValues":["Small"]}],"properties":["Size"]}
  ```

  After:

  ```json
  {"type":"RECTANGLE","x":0,"y":0,"width":100,"height":100,"parentId":"1:1","parentNodeName":"Cards"}
  {"components":[{"nodeId":"1:2","nodeName":"Small","propertyValues":["Small"]}],"properties":["Size"],"parentId":"1:1","parentNodeName":"Cards"}
  ```

  `parentId` was already required on the five creators in v2.3.2 and only `parentNodeName` changes for them; `create_component_set` is the one tool where both fields become required.

- **`annotation_set` is now a working append contract.** Each row requires `nodeId`, `nodeName`, and non-blank `labelMarkdown`; `categoryId` is optional and verified when present; `properties` is an array of `{type}` entries; unsupported `annotationId` and `status` inputs are removed. The tool is explicitly non-idempotent.

  Before:

  ```json
  {"annotations":[{"nodeId":"1:2","nodeName":"Button","annotationId":"a1","status":"TODO","categoryId":"cat-1","properties":{}}]}
  ```

  After:

  ```json
  {"annotations":[{"nodeId":"1:2","nodeName":"Button","labelMarkdown":"Use the primary token","categoryId":"cat-1","properties":[{"type":"fills"}]}]}
  ```

- **`annotation_list` uses one grouped output in page and node modes.** Node mode no longer returns a flat owner-tagged list.

  Before:

  ```json
  {"nodeId":"1:2","name":"Button","annotations":[{"nodeId":"1:2","annotation":{"labelMarkdown":"Review"}}]}
  ```

  After:

  ```json
  {"annotatedNodes":[{"nodeId":"1:2","name":"Button","annotations":[{"labelMarkdown":"Review"}]}]}
  ```

- **Nested inputs are strict.** Unknown keys at any object depth are rejected instead of silently stripped, except for the two intentional pass-through objects: `style_manage.properties.paints[]` and `style_manage.properties.layoutGrids[]`.

  Before:

  ```json
  {"text":[{"nodeId":"1:2","nodeName":"Label","characters":"Save","charcters":"typo was discarded"}]}
  ```

  After:

  ```json
  {"text":[{"nodeId":"1:2","nodeName":"Label","characters":"Save"}]}
  ```

  The original v2.3.2 request is now rejected with MCP `-32602` at `text[0].charcters` instead of running with altered intent.

- **Effect-style payloads are strict per Figma effect variant.** `style_manage.properties.effects[]` now enumerates `DROP_SHADOW`, `INNER_SHADOW`, `LAYER_BLUR`, `BACKGROUND_BLUR`, `NOISE`, `TEXTURE`, and `GLASS` with variant-specific fields and the exact 19-literal `BlendMode` inventory. Cross-variant or undeclared keys are rejected rather than accepted and discarded; validated progressive-blur and NOISE/TEXTURE/GLASS fields are forwarded without handler-side field loss.

  Before:

  ```json
  {"type":"EFFECT","name":"Blur","properties":{"effects":[{"type":"LAYER_BLUR","radius":12,"showShadowBehindNode":true}]}}
  ```

  After:

  ```json
  {"type":"EFFECT","name":"Blur","properties":{"effects":[{"type":"LAYER_BLUR","radius":12}]}}
  ```

  The old cross-variant request now fails validation; the migration is to drop `showShadowBehindNode`, which only ever applied to `DROP_SHADOW` and was silently discarded here. Separately — and independently of that migration — the handler no longer rebuilds effects from a four-type field list, so validated progressive-blur and NOISE/TEXTURE/GLASS fields reach Figma. Requiredness remains variant-specific: NOISE/TEXTURE/GLASS base fields are required, while the progressive ramp is required as a set only when `blurType` is `PROGRESSIVE`. GLASS `depth` must be at least `1`; a live `depth: 0` write was accepted by the setter but normalized to `1` on read-back. A progressive blur is written as:

  ```json
  {"type":"EFFECT","name":"Blur","properties":{"effects":[{"type":"LAYER_BLUR","radius":12,"blurType":"PROGRESSIVE","startRadius":2,"startOffset":{"x":0,"y":0},"endOffset":{"x":0,"y":100}}]}}
  ```

- **Batch request validation rejects empty and duplicate target sets before execution.** All batch arrays require at least one item. `node_delete`, `text_set_content`, and `instance_set_overrides` reject duplicate targets after normalizing URL/API spellings (`1-2` and `1:2` are the same target); repeated annotation targets remain valid because annotation append is meaningful more than once.

  Before:

  ```json
  {"nodes":[]}
  {"nodes":[{"nodeId":"1-2","nodeName":"Card"},{"nodeId":"1:2","nodeName":"Card"}]}
  ```

  After:

  ```json
  {"nodes":[{"nodeId":"1:2","nodeName":"Card"}]}
  ```

- **The four batch aggregators use one result envelope.** `node_delete`, `text_set_content`, `annotation_set`, and `instance_set_overrides` now return `success`, `status`, `requestedCount`, `succeededCount`, `failedCount`, `skippedCount`, and one ordered row per input. `status` is `success`, `partial_success`, or `failed`, and `success === (status === "success")`. Removed duplicate counts include `nodesDeleted`/`nodesFailed`, `replacementsApplied`/`replacementsFailed`, `annotationsApplied`/`annotationsFailed`, `totalCount`, and the older `totalNodes`/`totalReplacements`/`totalAnnotations` fields. `instance_set_overrides.totalAppliedCount` is **not** removed — it counts applied override *properties* rather than targets, so it duplicates no envelope count — but like the top-level `message` summary and the per-row `nodeInfo`/`instanceName`/`appliedCount` extras, it is an additive field carried outside the declared output schema rather than an advertised one. Read the seven envelope fields and the row vocabulary as the contract; treat everything else as best-effort context.

  Before:

  ```json
  {"success":true,"nodesDeleted":1,"nodesFailed":1,"results":[{"nodeId":"1:2","success":true}]}
  ```

  After:

  ```json
  {"success":false,"status":"partial_success","requestedCount":2,"succeededCount":1,"failedCount":1,"skippedCount":0,"results":[{"nodeId":"1:2","status":"success"},{"nodeId":"1:3","status":"failed","error":"remove failed"}]}
  ```

- **`instance_set_overrides` rows use the shared row vocabulary.** Target rows are keyed by `nodeId`/`status`/`error`; `instanceId` and row-level `message` are removed. `instanceName` may still be present as additive context, and the top-level summary `message` is unchanged.

  Before:

  ```json
  {"instanceId":"1:2","instanceName":"Card","success":false,"message":"swap failed"}
  ```

  After:

  ```json
  {"nodeId":"1:2","instanceName":"Card","status":"failed","error":"swap failed"}
  ```

- **Annotation result rows report counts as explicit observations.** v2.3.2 rows carried only `success`/`nodeId`/`error` and no counts at all. Each row now adds nullable `beforeCount`/`afterCount` with required `beforeCountVerified`/`afterCountVerified` flags, so a number is never fabricated for state that could not be read. An append whose post-state cannot be read returns `partialMutation:true` and `outcomeUnknown:true`; callers must run `annotation_list` before retrying. Never read `null` as zero, and never treat matching counts as verified unless both flags are true.

  Before:

  ```json
  {"success":false,"nodeId":"1:2","error":"setter failed"}
  ```

  After:

  ```json
  {"nodeId":"1:2","status":"failed","beforeCount":0,"beforeCountVerified":true,"afterCount":null,"afterCountVerified":false,"partialMutation":true,"outcomeUnknown":true,"error":"setter failed"}
  ```

- **The socket handshake is role-declared, versioned, and peer-bound.** Plugin joins send `clientType:"plugin"` plus `pluginVersion`; MCP joins send `clientType:"mcp"` plus `serverVersion`. `channel_join` success adds `serverVersion` and `pluginVersion`; it can refuse no plugin (`PLUGIN_PEER_UNAVAILABLE`), a second MCP session (`CHANNEL_IN_USE`), or known version skew (`VERSION_MISMATCH`). A second plugin is refused `PLUGIN_PEER_AMBIGUOUS` in that joining plugin's UI and never reaches `channel_join`. Frames without `clientType` are refused, so upgrading the server requires rebuilding and reinstalling the matching plugin.

  Before:

  ```json
  {"type":"join","channel":"abcd"}
  {"status":"success","channel":"abcd"}
  ```

  After:

  ```json
  {"type":"join","channel":"abcd","clientType":"plugin","pluginVersion":"2.3.3"}
  {"status":"success","channel":"abcd","serverVersion":"2.3.3","pluginVersion":"2.3.3"}
  ```

- **The connector-visualization surface is removed.** `create_connection`, its raw wire command and plugin handler, `CONNECTOR_TEMPLATE_REQUIRED`, and the `reaction_to_connector_strategy` prompt no longer exist. The tool created FigJam diagram artifacts rather than native Figma Design prototype interactions, could not create its advertised artifact in a Design file, and could not bridge Design-file node IDs into a separate FigJam file. Native prototype metadata remains available through `reaction_list` and `reaction_update`.

  Before:

  ```text
  reaction_to_connector_strategy -> create_connection(...)
  ```

  After:

  ```text
  reaction_list(...) -> reaction_update(...)
  ```

  v2.3.3 intentionally provides no automatic connector-diagram substitute, and the two reaction tools carry migration caveats that are specified and scheduled — not implemented — in v2.3.4 Track 3. `reaction_list` omits any reaction containing a `CHANGE_TO` action, silently omits missing or read-failed requested roots, reports `nodesCount` as the number of requested IDs rather than the number successfully inspected, and may duplicate descendants when requested roots overlap. `reaction_update` replaces the caller-supplied whole reactions array with no observed-state token or authoritative read-back, so a stale write can erase another edit, and arbitrary setter failures can collapse to `Failed to update reactions: undefined`.

- **Assigned names and `create_text` typography reject inputs Figma could not apply truthfully.** Figma normalizes an empty layer name instead of preserving `""` (live channel `2476`: shape → `Rectangle`, frame → `Frame`, text → its content, SVG root → `Frame`, component set → `Component`), so an explicit empty user-visible assignment is now rejected before mutation at both the MCP and plugin boundaries. This covers every classified public assignment sink — `node_rename`, `node_group`, the five creators and `create_component_set`, `variable_manage` (including `CREATE_COLLECTION.modeName` and `UPDATE_VARIABLE.name`), `style_manage`, and `component_manage_property` (both ADD `propertyName` and EDIT `newPropertyName`). Required names (`node_rename.name`, variable/style create `name`, component-property ADD `propertyName`) must be non-empty; optional creator/group/collection-mode names may be omitted for native defaults; optional variable/style/property update names may be omitted to keep the current value. `create_text.fontSize` is at least 1 and `fontWeight` is one of 100, 200, …, 900. Name *assignment* and name *verification* are separate contracts: this rule does not change the exact-match semantics of lookup fields such as `nodeName` or `parentNodeName`.

  Before:

  ```json
  {"nodeId":"1:2","nodeName":"Card","name":""}
  {"parentId":"1:1","parentNodeName":"Cards","characters":"Label","fontSize":0,"fontWeight":550}
  ```

  After:

  ```json
  {"nodeId":"1:2","nodeName":"Card","name":"Card compact"}
  {"parentId":"1:1","parentNodeName":"Cards","characters":"Label","fontSize":16,"fontWeight":500}
  ```

  Where a name is optional, omit the field instead of sending `""`.

- **`variable_delete` in-use failures use the one structured error envelope.** Consumer evidence moves under `error.details.variablesInUse`, and the refusal is a thrown, coded `VARIABLE_IN_USE` error rather than a successful callback result with a prose string.

  Before:

  ```json
  {"success":false,"error":"Cannot delete: variable(s) are still in use.\n- Variable 'Brand/Primary' is used by:\n  - Node 'Card' (FRAME) on fields: fills","variablesInUse":{"VariableID:1:2":{"nodeConsumers":[{"nodeId":"1:9","nodeName":"Card","nodeType":"FRAME","fields":["fills"]}],"styleConsumers":[],"aliasConsumers":[]}}}
  ```

  After:

  ```json
  {"error":{"code":"VARIABLE_IN_USE","message":"Operation Denied: Cannot delete: variable(s) are still in use.\n- Variable 'Brand/Primary' (VariableID:1:2) is used by:\n  - Node 'Card' (FRAME, 1:9) on fields: fills\n\nNothing was deleted. Read each listed consumer's current state with node_info (nodes), style_list (styles), or variable_list (aliasing variables), clear or rebind that reference, then retry this exact call. details.variablesInUse lists every consumer by variable ID.","details":{"variablesInUse":{"VariableID:1:2":{"nodeConsumers":[{"nodeId":"1:9","nodeName":"Card","nodeType":"FRAME","fields":["fills"]}],"styleConsumers":[],"aliasConsumers":[]}}}}}
  ```

  The `variablesInUse` payload is unchanged in shape; it moves from a top-level key to `error.details`. Every consumer line in the message now carries its ID, because layer, style, and variable names are not unique.

- **Partial page coverage is explicit and response semantics are corrected.** Every `coverage` object now requires `pagesAttempted`; `node_info` adds `pageFailedNodes` for targets dropped with an unreadable containing page; a DOCUMENT root no longer exposes `descendantCount`; and `page_info.missingPageIds` is every requested page ID absent from `pages`, including load/read failures, with `coverage.pageErrors` providing the reason.

  Before:

  ```json
  {"nodes":[{"id":"0:0","type":"DOCUMENT","descendantCount":120}],"coverage":{"complete":true,"pageErrors":[]}}
  {"pages":[],"missingPageIds":[]}
  ```

  After:

  ```json
  {"nodes":[{"id":"0:0","type":"DOCUMENT"}],"pageFailedNodes":[{"nodeId":"1:2","pageId":"0:1"}],"coverage":{"complete":false,"pagesAttempted":1,"pageErrors":[{"pageId":"0:1","error":{"code":"PAGE_LOAD_FAILED","message":"..."}}]}}
  {"pages":[],"missingPageIds":["0:1"],"coverage":{"complete":false,"pagesAttempted":1,"pageErrors":[{"pageId":"0:1","error":{"code":"PAGE_LOAD_FAILED","message":"..."}}]}}
  ```

### Added

- **Structured failure transport:** coded plugin, socket, and client errors retain `{code, message, details?}` through the MCP boundary. Arbitrary thrown values fall back to canonical `UNKNOWN_ERROR` without erasing readable partial-mutation evidence.
- **`create_instance.componentId`:** successful responses now include the resolved component's ID on both local-ID and remote-key paths. Before: `{"id":"2:1","name":"Card instance"}`. After: `{"id":"2:1","name":"Card instance","componentId":"1:2"}`.
- **Plugin TypeScript gate:** the plugin loads the pinned Figma typings without `dom`, passes strict type-checking, and CI runs `check:types:plugin` plus the TypeScript-parser-backed suppression policy.
- **Name-assignment oracle:** an AST scan of direct `.name` writes plus an explicit inventory of recognized Figma naming APIs is checked against the public assignment classification, so a name sink cannot be added without its empty-name contract. A future Figma naming API must be added to that inventory.
- **Page-load isolation:** multi-page reads preserve successful page data and report bounded per-page load/read failures in `coverage`; destructive variable scans refuse with `DOCUMENT_SCAN_INCOMPLETE` unless every required page was inspected.
- **`node_flatten.parentId`:** the response now reports the container the flattened vector was placed in — the source node's original parent — so containment is confirmable without a follow-up `node_info`, matching the eight creators. Before: `{"id":"1:3","name":"Star","type":"VECTOR"}`. After: `{"id":"1:3","name":"Star","type":"VECTOR","parentId":"1:1"}`.
- **Script type gate:** CI runs `check:types:scripts`, so the repository's verification and maintenance scripts are type-checked instead of shipping unchecked.

### Fixed

- **`annotation_set` can append more than once to the same node.** Figma's `annotations` getter returns each stored annotation with both `label` and `labelMarkdown`, while its setter refuses an annotation carrying both. Appending wrote the existing array straight back, so every append to a node that already had an annotation failed with `Property "annotations" failed validation: Only one of label or labelMarkdown should be given. at index 0` — the rejection naming the *pre-existing* entry, not the new one. Only the first annotation on a node could ever be created, and the documented `annotation_list`-then-retry recovery could not succeed either. Pre-existing entries are now normalized to a single label field before the write, preserving their `properties`, `categoryId`, and any other stored keys.
- **`variable_delete` no longer refuses a healthy document.** Its consumer scan was the only page-loading surface that ran `loadAsync()` on every page concurrently; concurrent loads fail intermittently against the live host, and the fail-closed D14 gate turned that into a hard `DOCUMENT_SCAN_INCOMPLETE` on documents whose pages all read cleanly through the sequential surfaces. Pages are now loaded one at a time, as everywhere else. The refusal also names the failing page IDs in its message and tells the caller to retry the same call first.
- **Percent-encoded scope links resolve.** The plugin UI's link parser tried `new URL()` first, but the Figma sandbox provides no `URL` global, so it always fell through to a regex that never percent-decoded: a link carrying `node-id=1%3A2` reported "Node not found in current document" while the same node written `node-id=1-2` validated. The dead branch is removed and the value is decoded, so both spellings resolve.
- **`node_delete` rows for an already-removed target are actionable.** Naming both an ancestor and its descendant in one batch removes the descendant with its ancestor, and the descendant's row then failed with raw host prose under a description telling the caller to retry — a retry the dispatcher refuses outright. The row now states that the requested deletion already holds and that it must not be retried.
- **`annotation_set.properties[]` rejections carry recovery.** Figma gates each property type by node type and the enum is the full catalogue, so a schema-valid call can be refused (for example `fontSize` on a `RECTANGLE`, and some members are valid on no node type at all). The failing row now explains that validity is node-type-dependent and says to drop the entry and resend only the non-success rows; the field description says the same before the first call. The validity table is deliberately not reproduced client-side — it is not derivable from node-property presence, and guessing it would refuse calls Figma accepts.

### Changed

- Implicit creators, clone, flatten, component creation, and component-set creation now place results at the verified destination by the observable success boundary — a successful command never returns with its created node outside that destination. This supersedes v2.3.2's "no-orphan creation" wording: cleanup after a later failure is best-effort, not an infallible rollback. When removal throws or cannot be confirmed, the initiating error is preserved and carries `details.partialMutation: true`, `whatChanged`, the verified destination, and a tri-state survivor location — `located` (with the exact surviving parent ID), `detached` (an observed null parent), or `unknown` (the parent could not be read; never assume detached). Reconcile that evidence before retrying.
- Design-system updates validate their complete readable plan before the first mutation and disclose unexpected mid-update mutations through the shared `partialMutation` / `whatChanged` / `before` vocabulary.
- Batch progress and notifications are best-effort telemetry and cannot replace or erase the mutation result envelope.
- The registered MCP inventory contains 45 tools and retains `reaction_list`, `reaction_update`, and `swap_overrides_instances`.
- Two advertised descriptions now match observed behavior, with no behavior change: `annotation_list.includeCategories` documents its real default of `true` (categories are returned unless you pass `false`) instead of reading as an opt-in, and `style_manage.properties.effects[]` lists every required field per variant, adding NOISE `color` and GLASS `lightAngle`.
- Effect numeric bounds now match what Figma actually preserves, measured by writing each boundary and reading it back. NOISE `density` is `0–1`; NOISE/TEXTURE `noiseSize` and TEXTURE `radius` are `0–100`; and at most one GLASS effect is accepted per node. Figma silently clamps `noiseSize`/`radius` above `100` — `101` and `100000` both store as `100` — so an unbounded schema reported success for a value the document never held; a second GLASS effect was refused by the host as an `UNKNOWN_ERROR` relaying Figma's own prose.
- GLASS effect writes now require `depth >= 1`. A prior setter-only probe showed that Figma accepted `depth: 0`; a complete write/read probe on channel `4b9u` showed that Figma silently normalizes it to `1`, so the MCP boundary now rejects zero instead of reporting success for a value it cannot preserve.

## [2.3.2]
This release makes the documented safety contract match the implementation and prevents future drift: dispatcher guard parity, `create_component_set` atomicity, no-orphan creation handlers, an executable safety matrix, output-schema conformance, and version synchronization across every surface.

### Added
- **Executable Safety Contract**: `safetyContract.test.ts` encodes a per-tool gate table driven through the real dispatcher, and mechanically diffs `SAFETY.md` Part B's gate shorthand against it **in both directions** — a gate claimed in docs but not asserted in tests fails CI, and vice versa; unknown gate tokens fail with an actionable message.
- **Version Handshake & About UI**: The Figma plugin receives its package version at build time via esbuild `__PLUGIN_VERSION__` injection, posts it to the UI on startup, and renders it dynamically in the "About" tab (placeholder before handshake). Drift is caught by the existing `check:plugin` rebuild-and-diff.
- **check:versions Script**: Verifies `package.json`, `manifest.json`, and both `server.json` version fields stay synchronized; wired into CI with a self-test proving it fails on each mismatched surface.

### Changed
- **`node_clone` scope escape closed (behavior change)**: cloning placed the clone in the source's parent even when that parent was outside the editable scope — cloning the scope root escaped containment entirely (observed live). `node_clone` now validates source lock/instance-interior state and the destination parent's scope, appendability, lock, and instance state before cloning. **Cloning the scope root itself is no longer possible**; re-scope to its parent instead.
- **`create_component_set` is atomic (behavior change)**: validation now runs as a plan phase before any rename — component type/lock/instance/remote/set-membership, unique variant combinations, duplicate ids, property-value separator rules, page consistency, and parent scope/name/lock/instance/appendability **including the parent-cycle case** (parent must not be one of the combined components). A failed combine restores original component names. The previous **silent reparent skip** (invalid `parentId` ignored with success reported) is now a hard prevalidation error.
- **Guard parity for `node_set_effects` and `create_svg`**: both now enforce the locked-layer and (for `create_svg`) instance-interior parent gates that `SAFETY.md` already promised — previously effects could be applied to locked nodes and SVGs created inside locked containers (observed live).
- **Parent-is-instance rule**: every parent-gated tool (`create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`, `create_component_set`, `node_insert_child`, `node_clone`) now rejects a parent that **is** an `INSTANCE` node, not just one inside an instance interior.
- **No-orphan creation (behavior change)**: `create_frame`, `create_text`, `create_svg`, `create_instance`, `create_shape`, `create_component`, and `node_clone` resolve and validate the parent **before** constructing anything, and remove the newly-created object if any later configuration or append step fails. `create_instance` rejects `COMPONENT_SET` ids with a pointer to the set's default variant (also fixing a latent `TypeError`), wraps remote-import failures with the key and recovery guidance, and drops the generic `Error creating component instance:` wrapper.
- **`create_instance` remote-import race & W1 reword**: remote component import (`importComponentByKeyAsync`) is now bounded by a 15 s timeout (`IMPORT_TIMEOUT_MS = 15000`) using `Promise.race` to prevent wedging the command queue on unresolvable keys; late rejections of abandoned imports are swallowed defensively. The W1 error string and playbook are updated to guide reading remote keys from an existing instance's `mainComponent` instead of referencing the page-tree scanner `component_list`.
- **`variable_delete` / consumer-scan crash on variants fixed**: guarded `componentPropertyDefinitions` reads in `findVariableConsumers` to run only on `COMPONENT_SET` or non-variant `COMPONENT` nodes, preventing Figma API runtime crashes on variant component children when scanning documents with variants (e.g. design-system files).
- **Output-schema conformance**: `channel_join` declares its full connect payload (page list, node path) and every tool's output schema now tolerates extra document-dependent keys via a shared `looseOutput` helper — previously the strict schemas made clients reject successful results (`-32602`), including every page-mode/read-only `channel_join` (observed live).
- **Version metadata sync**: `package.json`, root `package-lock.json`, `server.json` (both fields), `manifest.json`, and the plugin About tab all report `2.3.2` (previously 2.3.1 / 2.2.0 / 2.0.0 / 2.0.0 / 2.2.0 respectively).
- **Docs**: `SAFETY.md` updated to the v2.3.2 contract (extended `node_clone` row, closed G1 escape note, parent-is-instance rule, D5 batch-atomicity clarification); README safety bullets are now all code- and test-backed; the error playbook documents the new denials verbatim with recovery steps and the no-orphan guarantee.

## [2.3.1]
This release hardens variable binding and node filling operations, enforcing tighter safety constraints and closing edge cases around auto-layout and unbind behaviors.

### Added
- **`node_set_fill` Clear Mode**: The `node_set_fill` tool now accepts `clear: true` to completely remove fills from a node, allowing an empty-fill state required for binding color variables to nodes that previously had image or gradient fills.

### Changed
- **`node_bind_variable` Allowlist**: The bindable-field allowlist is now generated directly from `@figma/plugin-typings` (`VariableBindableNodeField` ∪ `VariableBindableTextField`, plus the `fills`/`strokes` paint pseudo-fields), replacing a hardcoded partial list that was missing nine valid fields. Unknown fields are rejected at the schema boundary with a "did you mean" hint, and the valid set is published in the tool's JSON schema (`propertyNames.enum`).
- **Auto-layout Prechecks**: `node_bind_variable` now detects and explicitly rejects attempts to bind padding or spacing properties on nodes where auto-layout is disabled or unsupported, returning actionable recovery instructions.
- **Strict Fill/Stroke Binding**: `node_bind_variable` now guards against binding color tokens to non-solid paints (images/gradients) or mixed properties. It strictly requires either zero fills (auto-creating a solid paint) or one/multiple solid fills, removing the previous silent-success no-op behavior.

## [2.3.0]
This release closes key feature gaps and edge cases reported after the v2.0.0 rewrite, improving image handling, variable lifecycle management, and style edge cases.

### Added
- **Image Fill Support (`node_set_fill`)**: Added support for setting node fills to images. Images can be provided via a public `url` (fetched directly by the Figma client) or as raw `bytesBase64`. The server automatically downscales oversized PNG/JPEG images sent via `bytesBase64` to fit within Figma's 4096px limit, making it the preferred method for large local images.
- **Variable Scopes Support (`variable_manage`)**: The `CREATE_VARIABLE` and `UPDATE_VARIABLE` actions now support setting the `scopes` array (e.g. `["ALL_FILLS", "STROKE_COLOR"]`). Creating a variable requires scopes to be explicitly provided; updating a variable without `scopes` leaves the existing scopes unchanged.

### Changed
- **`variable_delete` Concurrency**: Deleting large variable collections is now significantly faster. The document-wide consumer verification scan runs concurrently across pages. The connection heartbeat is now emitted dynamically *during* the scan (throttled to ~1s) instead of per-page, ensuring single large pages do not trigger the 30s inactivity timeout.
- **`style_manage` Blend Mode**: Effect styles (like `DROP_SHADOW`) now correctly normalize `blendMode`. Omitting it defaults to `"NORMAL"`, matching Figma's expectations, while explicitly providing a `blendMode` (e.g., `"MULTIPLY"`) is correctly preserved.

## [2.2.0]
This is a major safety and stability release focused on preventing silent failures, enforcing Figma's strict structural constraints, and closing contract seams between the MCP SDK and the Figma plugin.

### Added
- **Structural Safety Guards:** The plugin now actively rejects mutations that Figma forbids, returning actionable structured errors rather than failing silently or unpredictably:
  - **Locked nodes:** Modifying a locked node, or any node with a locked ancestor, is denied (`Operation Denied: Node '…' (or one of its ancestors, '…') is locked.`).
  - **Instance interiors:** **Structural** edits (delete, reparent, group/ungroup, add children) on nodes inside an instance are denied (`Operation Denied: Node '…' is inside a component instance …`); property/override writes remain allowed.
  - **Remote components:** Mutating a remote library style/variable/main-component *definition* is denied (`Operation Denied: '…' is a remote library asset …`); instances of remote components stay editable via overrides.
  - **Scope root:** Deleting, flattening, ungrouping, or converting-to-component the editable scope's root node is denied (`Operation Denied: This node is the current Editable Scope root…`).
  - **Cyclic reparenting:** `node_insert_child` rejects reparenting a node to itself or its descendant.
- **Auto-layout Guards:** 
  - `node_transform` rejects explicit `x`/`y` moves on auto-layout children (unless `ABSOLUTE` positioned).
  - `node_set_auto_layout` rejects `FILL` sizing if the parent is not an auto-layout frame.
- **Component Validations:**
  - `component_manage_property` and `instance_set_property` strictly validate `BOOLEAN`, `TEXT`, and `VARIANT` values (including checking against the `ComponentSetNode`'s allowed variants).
  - `create_component_set` rejects duplicate variant combinations with a detailed error message.
- **Granular Permissions:** Connection permissions are now decoupled. Node mutation (`READ_ONLY_MODE`), variable mutation (`VARIABLE_EDITS_DISABLED`), and style mutation (`STYLE_EDITS_DISABLED`) are checked independently.
- **Contract-Seam Testing:** Added a systemic unit test harness (`contractSeam.test.ts`) that asserts every MCP tool schema perfectly matches its corresponding plugin handler, catching undocumented drift.

### Changed
- **Tool inputs are now strict — unknown/misspelled parameter keys are rejected, not silently dropped.** Previously Zod stripped unrecognized keys, so an agent that sent a wrong key (e.g. `node_info({ properties })` when the param was `fields`) had it silently discarded and the tool ran as if the argument were omitted — succeeding while ignoring intent. Every tool now registers a strict input schema; a wrong key fails with `Unrecognized key(s): …`. (PRD §18.)
- **`node_info`: input parameter renamed `fields` → `properties`** (breaking) so the input name matches the response key and internal payload, removing the mismatch that induced the above hallucination. Pass `node_info({ nodeIds, properties: [...] })`. (PRD §18.)
- **`text_set_content` Schema:** Standardized on the `characters` property name. Dropped the phantom top-level `nodeId` requirement which the schema never supplied.
- **`text_set_style` Schema:** Aligned the schema with the handler. It now correctly parses `fontName: { family, style }`, `textAlignHorizontal`, `textAlignVertical`, `paragraphIndent`, and uses the standard `lineHeight` union (`AUTO` or value/unit).
- **Text Font Loading:** `text_set_style` now properly implements conditional font loading, dynamically resolving and deduping mixed fonts (`figma.mixed`) using `getStyledTextSegments` before applying modifications.
- **Batch Resiliency:** Batch tools (`text_set_content`, `annotation_set`, `instance_set_overrides`) now strictly stop on the first mutation failure and return a standardized report, rather than proceeding and crashing. (`node_delete` retains its chunked resilience).

### Fixed
- **`node_bind_variable` was non-functional through the MCP path (production-breaking).** The tool's schema sends `bindVariables` / `explicitVariableModes` **maps**, but the plugin handler (`setBoundVariable`) read a flat `{ field, variableId, collectionId, modeId }` shape it never received — so every real call threw `Must provide either (field + variableId) or (collectionId + modeId)`. The handler now consumes the maps directly: `bindVariables` binds/unbinds node properties (fills/strokes via paint binding, `null` to unbind), and `explicitVariableModes` resolves each collection id to its node before calling `setExplicitVariableModeForCollection` (the Plugin API rejects a raw collection id under dynamic-page mode). Regression tests now drive the real MCP map shapes so the drift cannot recur. (PRD §17; found during live verification.)
- **Opacity `NaN` Bug:** Fixed a bug where creating shapes or frames without explicitly providing an opacity value could result in `opacity: NaN` instead of `1`.

## [2.0.0]
### Breaking changes
This release completely overhauls the Model Context Protocol tool API to use a clean, standardized two-level namespace (`group_action`, 46 tools across 11 taxonomy groups). Tool routing, parameters, schemas, and return formats have been restructured to optimize for agentic consumption.

#### Consolidations and Splits:
- **`create_shape`**: Consolidated `create_rectangle`, `create_ellipse`, and `create_polygon_star` into a single tool. Star point counts now use native Figma StarNode pointCount semantics (no division/even-parity throw). Rectangle shapes now properly support solid fills and stroke colors.
- **`node_transform`**: Consolidated `move_node` and `resize_node` into a single tool. Supports partial updates for any subset of `x`, `y`, `width`, and `height`.
- **`node_info`**: Consolidated `get_node_variables` into `node_info` fields (`boundVariables`, `explicitVariableModes`). Library object references and style IDs resolve to structured `{id, name}` objects. Node-reference fields (e.g. `parent`, `mainComponent`, `instances`, `exposedInstances`, `stuckNodes`, `attachedConnectors`) are serialized to string IDs or arrays of IDs to prevent host-object serialization issues (caught via live verification).
- **`component_delete_property`**: Split out the destructive deletion action from `manage_component_property` (now `component_manage_property`) into a separate tool for tighter security boundaries.
- **`style_delete`**: Added a net-new tool to complete the style lifecycle, allowing safe style detach.

#### Complete Old to New Tool Mapping Table:
| Old Name | New Name | Group |
|---|---|---|
| `get_pages_info` | `page_info` | page |
| `get_nodes_info` | `node_info` | node |
| `get_node_variables` | *Folded into `node_info`* | node |
| `move_node` | `node_transform` | node |
| `resize_node` | `node_transform` | node |
| `set_node_name` | `node_rename` | node |
| `delete_multiple_nodes` | `node_delete` | node |
| `clone_node` | `node_clone` | node |
| `set_selections` | `node_select` | node |
| `group_nodes` | `node_group` | node |
| `ungroup_nodes` | `node_ungroup` | node |
| `flatten_node` | `node_flatten` | node |
| `insert_child` | `node_insert_child` | node |
| `set_auto_layout` | `node_set_auto_layout` | node |
| `set_fill_color` | `node_set_fill` | node |
| `set_stroke` | `node_set_stroke` | node |
| `set_corner_radius` | `node_set_corner_radius` | node |
| `set_effects` | `node_set_effects` | node |
| `apply_style` | `node_apply_style` | node |
| `set_bound_variable` | `node_bind_variable` | node |
| `export_node_as_image` | `node_export_visual` | node |
| `create_rectangle` | `create_shape` | create |
| `create_ellipse` | `create_shape` | create |
| `create_polygon_star` | `create_shape` | create |
| `create_frame` | `create_frame` | create |
| `create_text` | `create_text` | create |
| `create_node_from_svg` | `create_svg` | create |
| `create_component` | `create_component` | create |
| `create_component_instance` | `create_instance` | create |
| `create_component_set` | `create_component_set` | create |
| `create_connections` | `create_connection` | create |
| `get_styles` | `style_list` | style |
| `manage_style` | `style_manage` | style |
| *(None - Net New)* | `style_delete` | style |
| `set_multiple_text_contents` | `text_set_content` | text |
| `set_text_style` | `text_set_style` | text |
| `get_components` | `component_list` | component |
| `manage_component_property` (ADD/EDIT) | `component_manage_property` | component |
| `manage_component_property` (DELETE) | `component_delete_property` | component |
| `set_component_instance_property` | `instance_set_property` | instance |
| `get_instance_overrides` | `instance_get_overrides` | instance |
| `set_instance_overrides` | `instance_set_overrides` | instance |
| `get_variables` | `variable_list` | variable |
| `manage_variables` | `variable_manage` | variable |
| `delete_variables` | `variable_delete` | variable |
| `get_annotations` | `annotation_list` | annotation |
| `set_multiple_annotations` | `annotation_set` | annotation |
| `get_reactions` | `reaction_list` | reaction |
| `update_reactions` | `reaction_update` | reaction |
| `join_channel` | `channel_join` | channel |

#### Additional Improvements:
- **Rich Schema & Annotations**: Every tool now exposes explicit Zod input/output schemas with descriptions on all properties, and carries annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) for better client integration and Smithery publish score.
- **Dynamic Server Metadata**: Server reads name and version from `package.json` dynamically to avoid version drift.
- **Local Resources**: Exposed 4 offline operational guide resources under `figma-edit://guide/*` with an eager initialization instructions breadcrumb.
- **Runtime-agnostic socket client**: The Figma WebSocket client now uses the runtime's native `WebSocket` (bun, Node ≥22) and falls back to the `ws` package only on older Node. Fixes an endless connect/disconnect reconnect loop when the server was launched under **bun** (the `ws` client rejected its own `101` upgrade — "Unexpected server response: 101").
- **Clean shutdown / no orphaned processes**: The server now exits when its stdio host disconnects (stdin EOF) or on `SIGINT`/`SIGTERM`, and the reconnect timer is `unref()`d. Previously, MCP server instances lingered after the host quit and spun the reconnect loop forever, accumulating across host restarts.

## [1.5.3]
### CLI & Socket Bugfixes
- Rewrote WebSocket server in `src/socket.ts` to run on native Node.js HTTP and `ws` instead of `Bun.serve`, removing the dependency on Bun runtime for standard users.
- Updated `npx` socket server instructions in `README.md` to use `-y` and `--package figma-edit-mcp` so secondary binaries can be resolved directly from the registry without 404 errors.

## [1.5.2]
### Registry Integration
- Added required `mcpName` field to `package.json` to enable successful verification when publishing to the official Model Context Protocol registry.

## [1.5.1]
### CLI & Socket Enhancements
- Added support for the `--host` CLI flag and `FIGMA_EDIT_MCP_SOCKET_HOST` environment variable to configure the WebSocket bridge's bound hostname (enables WSL and remote connections).
- Updated WebSocket bridge logs to output the bound hostname and port dynamically.

### Documentation & Quick Start
- Overhauled `README.md` to prioritize NPM-first/registry-based consumption via `npx` / `npm install`.
- Moved local contributor setup instructions and clone-specific workflows to `CONTRIBUTING.md`.
- Updated the Windows + WSL guide to leverage the new `--host` binding option.

## [1.5.0]
### Release
- First release published to NPM as [`figma-edit-mcp`](https://www.npmjs.com/package/figma-edit-mcp).

### Repository
- Detached the repository from its upstream fork network so the project can be indexed by search engines and listed as a standalone project.
- README rewrites and `fork` reference sweep.
- GitHub topics tightened and engagement features (Issues, Discussions) enabled.
- Submitted to MCP directories (Smithery, MCP.so, Glama, GitHub MCP Registry).

### Packaging & Build
- `package.json` metadata expanded (`description`, `keywords`, `repository`, `homepage`, `bugs`, `author`, `license`, `engines`).
- Removed `main` and `module` fields to optimize for binary distribution.
- Added `prepublishOnly` script.
- Expanded `files` array to ensure all necessary runtime and documentation files are distributed.
- Exposed a second binary, `figma-edit-mcp-socket`, for the standalone WebSocket server implementation.
- Added `--version`, `--help`, and `--port` CLI flags to both binaries.
- Updated `tsup.config.ts` to target `node20`, emit ESM-only bundles, set `dts: false`, and automatically inject shebang banners (`#!/usr/bin/env node`).

### Architecture & Developer Experience
- Moved the Figma plugin source code layout from `src/figma_plugin` to the `figma_plugin` directory.
- Agent documentation updated: `DRAGME.md` retired; new `AGENTS.md` and `CLAUDE.md` files added.
- Added `CONTRIBUTING.md`.
- Enhanced `bun integrate` with `--local` and `--port` flags.
- Added a contributor-only banner warning on `scripts/setup.sh`.

### CI/CD & Supply Chain
- GitHub Actions rewritten: `ci.yml` and `publish.yml` pipelines established.
- Pinned Bun to `v1.3.0` across environments for maximum stability.
- Configured NPM 2FA requirement for secure publishing operations.

### Cleanup
- Swept development artifacts including `test_output.txt` and stale `v1.4.0` drafts.
- Removed obsolete `Dockerfile` and `bun-types` dependencies.
- Trimmed unused/obsolete `pub:release` scripts.
- Cleaned up the `LICENSE` file by removing redundant prefixes.

## [1.4.0]
### Breaking changes
- Connect payload `node` block: removed `containingPageId`, `containingPageName`, `parentNodeId`, `parentNodeName` (introduced in v1.3.0). Replaced by a structured `path` array of `[type, id, name]` 3-tuples representing the full ancestor chain from the containing page to the immediate parent.
- `get_nodes_info` parameter `properties` renamed to `fields`.
- `get_nodes_info` response shape changed from a flat list to a recursive `children` tree mirroring the Figma document structure. Non-requested properties are omitted entirely rather than returned as `null`.
- `scan_nodes_by_types` removed. Migration: `get_nodes_info({ nodeIds, filter: { type: [...] } })`.
- `scan_text_nodes` removed. Migration: `get_nodes_info({ nodeIds, filter: { type: "TEXT" }, fields: ["characters"] })`.

### New
- `get_nodes_info` supports deep recursive traversal with a `filter` parameter (prunes the traversal tree, retaining only matching nodes and their ancestors) and a `maxDepth` parameter (caps recursion depth).
- `descendantCount` added to both page-scope and node-scope payloads, and to top-level/boundary nodes in `get_nodes_info`.
- `progress_update` streaming events for all potentially slow traversal operations (`get_nodes_info` at depth, large `get_pages_info` requests) to prevent client timeouts.

For the full specification, see [get_nodes_info_update_spec.md](./planning/completed/v1.4.0%20-%20get_nodes_info_update/get_nodes_info_update_spec.md).

## [1.3.0]
### Breaking changes
- \`get_document_info\` removed (no deprecation period; clients receive tool-not-found if they call it).
- \`get_page_info\` renamed to \`get_pages_info\` with new parameter shape (\`pageIds?: string[]\` replacing \`pageId?: string\`) and new response shape.
- \`join_channel\` response shape changed from prose to JSON with \`status\` / \`channel\` / \`editableScopeType\` envelope.
- Removed fields from connect/page payloads: \`childCount\`, \`currentPageId\`, \`currentPageName\`, \`isCurrent\`, root \`type: "DOCUMENT"\`.

### New
- \`editableScopeType\` discriminator.
- \`get_pages_info\` streaming with progress events.
- Structured connect-flow error codes (\`CHANNEL_NOT_FOUND\` / \`CHANNEL_JOIN_FAILED\` / \`PLUGIN_DISCONNECTED\` / \`SCOPE_DELETED\` / \`SCOPE_INVALID\` / \`DOCUMENT_LOAD_FAILED\` / \`UNKNOWN_ERROR\`).

For the full specification, see [read_tools_update.md](./planning/completed/v1.3.0%20-%20read_tools_update/read_tools_update.md).
