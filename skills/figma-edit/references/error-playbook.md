# Error response playbook

Every structured error you may receive, what it means, and the correct recovery.

**General principle:** structured error codes are deterministic — the plugin made a decision based on a hard rule. Retrying without changing inputs produces the same result. Either change inputs (refresh names/IDs) or stop and inform the user.

## Scope errors

| Code / Message | Meaning | Recovery |
|---|---|---|
| `READ_ONLY_MODE` | The session lacks node-editing permissions — the user connected without a Page/Layer link. | Inform the user. Only read tools work. To enable node mutations, the user must reconnect with a link to the Page or Layer they want edited. |
| `VARIABLE_EDITS_DISABLED` | The session lacks Local Variable edit permissions. | Inform the user. Ask them to reconnect with variable editing enabled. |
| `STYLE_EDITS_DISABLED` | The session lacks Local Style edit permissions. | Inform the user. Ask them to reconnect with style editing enabled. |
| `OUTSIDE_SCOPE` | The target `nodeId` exists but is outside the locked node scope. | Do not retry with the same ID. Pick a node inside the scope, or ask the user to reconnect with a broader scope. |
| `PARENT_OUTSIDE_SCOPE` | The `parentId` for a creation tool is outside the editable scope. | Pick a parent inside the scope, or ask the user to reconnect more broadly. |
| `CLONING_SOURCE_NODE_OUTSIDE_SCOPE` | `node_clone`'s source is outside the editable scope. | Clone creates inside the scope, but the source must be reachable. Pick a source inside the scope, or reconnect more broadly. |
| `Operation Denied: This node is the current Editable Scope root…` | You attempted to delete, flatten, ungroup, or convert-to-component the root node of the editable scope (which would invalidate the session). | Target children inside the scope instead. Reparenting the scope root is allowed — its id is unchanged. |
| `SCOPE_DELETED` | The locked scope node was deleted from the file after connecting. | The session is unrecoverable. Ask the user to reconnect. |
| `SCOPE_INVALID` | The connect-time scope payload was malformed. | Ask the user to reconnect with a fresh link. |

## Name verification errors

| Code / Message | Meaning | Recovery |
|---|---|---|
| `NAME_MISMATCH` | `nodeName` does not match the actual name of `nodeId`. | Your context is stale or the ID is wrong. Call `node_info({ nodeIds: [<id>] })` to refresh, then retry with the actual name. |
| `PARENT_NAME_MISMATCH` | `parentNodeName` does not match the actual name of `parentId`. | Refresh via `node_info` and retry. |

## Remote (library) asset errors

| Message | Meaning | Recovery |
|---|---|---|
| `'<name>' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.` | You tried to edit or delete a style, variable, or main component that is **subscribed from a library** (not local to this file). Plugins cannot modify remote assets. | Don't retry — edit it in its source library file, or create a local copy for file-specific changes. An *instance* of a remote component is still editable via overrides; only the remote *definition* is blocked. |

> **Finding remote-asset IDs.** `variable_list` and `style_list` return **local** assets only — remote/library assets never appear there. Discover them through a **consuming node**: `node_info({ nodeIds, properties: ["boundVariables", "fillStyleId", "strokeStyleId", "effectStyleId", "textStyleId"] })` resolves each to `{ id, name }`. Recognizable IDs: remote **variables** look like `VariableID:<key>/<subid>`; remote **styles** end with `,<num>:<num>` (e.g. `S:abc…,18499:124`) whereas local styles end with a bare trailing comma (`S:abc…,`).

## Instance interior errors

| Code / Message | Meaning | Recovery |
|---|---|---|
| `Operation Denied: Node '…' is inside a component instance ('…') and cannot be <deleted/grouped/…> directly.` | You tried to make a **structural** edit (delete, reparent, group/ungroup, create, clone, or add children) to a node inside a component instance. | Structural edits inside instances are forbidden. Use `instance_set_property` / `instance_set_overrides`, or set fills/text/visibility on overridable descendants — those property/override writes are allowed. |

## Type & Structure validation errors (Figma Plugin Pre-Validation)

| Message | Meaning | Recovery |
|---|---|---|
| `Node <ID> not found` | The target node ID was not found in the current Figma document. | The ID is wrong or stale. Refresh context via `page_info` or `node_info` and choose a valid ID. |
| `Parent node not found` | The parent ID provided for a creation tool does not resolve to a node in the document. | The parent ID is wrong or stale. Refresh context and provide a valid parent. |
| `Operation Denied: Node '…' (or one of its ancestors, '…') is locked.` | You attempted to modify a locked node, or a node with a locked ancestor. | Find an unlocked node or ask the user to unlock it in Figma. |
| `Node is not a text node: <ID> (type: <TYPE>)` | The target node ID for `text_set_content` does not have type `TEXT`. | Ensure the ID you pass corresponds to a text node. Run `node_info` to verify. |
| `Node type <TYPE> does not support annotations` | The target node for `annotation_set` does not support adding/updating annotations. | Do not set annotations on this node. Review which nodes support annotations. |
| `Source node is not an instance: <ID> (type: <TYPE>)` | The `sourceInstanceId` provided to `instance_set_overrides` is not an `INSTANCE` node. | Provide the ID of a valid instance node. |
| `Target is not an instance node: <ID> (type: <TYPE>)` | A target node provided in `targetNodes` for `instance_set_overrides` is not an `INSTANCE` node. | Ensure all targets are instance nodes. |
| `Invalid Grouping: All nodes must share the same parent...` | The nodes passed to `node_group` do not belong to the same parent. | Call `node_insert_child` to reparent them first before grouping. |

> **Advisory on `INSTANCE_SWAP` properties:** The `instance_set_property` tool validates that a provided swap value is a plausible component reference (an ID or key). However, Figma enforces deeper type constraints at execution time (e.g. variant bounds). A syntactically valid component swap may still be rejected by the Figma API if it violates the component definition.

## Page / target scoping errors (list & discovery tools)

| Message | Meaning | Recovery |
|---|---|---|
| `pageId is required when scope is 'page'` | `component_list` (`scope: 'page'`) or `variable_list` (`includeConsumers: 'page'`) was called without a `pageId`. | Supply a `pageId` from `page_info`, or use the `'document'` scope/value instead. |
| `pageId with ID <id> not found` | The supplied `pageId` does not resolve to any node. | Refresh page IDs via `page_info` and pass a valid one. |
| `pageId does not resolve to a PAGE` | The supplied `pageId` resolves to a node that is not a `PAGE`. | Pass the ID of an actual page (from `page_info`), not a frame/layer. |
| `Exactly one of pageId or nodeId is required` | `annotation_list` was called with neither or both of `pageId` / `nodeId`. | Pass exactly one — a `pageId` to scan a whole page, or a `nodeId` to scan a node and its subtree. |

## Variable Binding & Auto-layout Guardrails

| Message | Meaning | Recovery |
|---|---|---|
| `Unknown bind field '<field>'. Valid fields are the Figma bindable node/text fields plus fills/strokes (e.g. paddingLeft, itemSpacing, topLeftRadius, fontSize, strokeTopWeight). (Did you mean '<suggestion>'?)` | **Schema-validation error** (MCP `-32602`, raised before the call reaches Figma): a `bindVariables` key isn't in the generated allowlist — usually a typo or wrong casing. | Use the exact camelCase Figma field name (`paddingLeft`, `itemSpacing`, `topLeftRadius`, `fontSize`, `strokeTopWeight`, `fills`, `strokes`, …); take the `Did you mean` suggestion when one is offered. |
| `node_bind_variable: '<name>' (type <type>) has no '<field>' property to bind.` | The node type does not natively support the field you are trying to bind (e.g., a `GROUP` does not have `fills`). | Target a node that supports the property, such as a `RECTANGLE` or `FRAME`. |
| `node_bind_variable: '<field>' on '<name>' is mixed...` | The node has multiple different values for this field (e.g. mixed corner radii), preventing safe binding. | Unify the values to a single value first before attempting to bind. |
| `node_bind_variable: cannot bind a non-color variable...` | You attempted to bind a `FLOAT`, `STRING`, or `BOOLEAN` variable to a color-only property like `fills` or `strokes`. | Supply the ID of a `COLOR` variable instead. |
| `node_bind_variable: '<name>' has a non-solid <field> (image/gradient)...` | You attempted to bind a color token to a node that only has non-solid (image/gradient/video) fills/strokes, with no solid paint available to bind. | Clear the fills first via `node_set_fill {clear:true}` (which allows the bind to auto-create a solid paint), or manually apply a solid color before binding. |
| `node_bind_variable: cannot bind '<field>' on '<name>' — auto-layout is off...` | You attempted to bind a layout property (e.g. `paddingLeft`) on a node that supports auto-layout, but it is currently turned off (`layoutMode` is `NONE`). | Turn on auto-layout first using `node_set_auto_layout`, then re-apply the bind. |
| `node_bind_variable: cannot bind '<field>' on '<name>' — '<field>' is an auto-layout property...` | You attempted to bind a layout property on a node type that fundamentally does not support auto-layout (e.g., a `RECTANGLE` or `TEXT`). | Apply the binding to an auto-layout `FRAME` instead. |
| `node_set_fill: '<name>' (type <type>) has no 'fills' property to clear.` | You attempted to use `clear: true` on a node type that does not support fills (like a `GROUP`). | Target a node that supports fills. |
| `node_set_fill: '<name>' (type <type>) has no 'fills' property to set a fill on.` | You attempted to set a solid color or image on a node type that does not support fills (like a `GROUP`). | Target a node that supports fills (e.g. a `RECTANGLE`, `FRAME`, or `TEXT`). |

## Image & Styling errors

| Message | Meaning | Recovery |
|---|---|---|
| `node_set_fill: could not fetch image from URL '<url>' (network/CORS)` | The URL provided for an image fill could not be fetched by the Figma client (usually due to CORS restrictions, a 404, or the host blocking the request). | Use `bytesBase64` instead, or host the image on a CORS-friendly server (e.g. GitHub raw, imgur). |
| `node_set_fill: 'bytesBase64' is not valid base64` | The `bytesBase64` payload is not a valid base64-encoded string. | Fix your base64 encoding. Do not include data URI headers (e.g. `data:image/png;base64,`). |
| `node_set_fill: Figma rejected the image — '…is too large / is too small / type is unsupported'` | Figma's internal validation rejected the image (the quoted text is Figma's own message). | For `url` or GIF bytes, you must ensure the image is ≤4096px per side. For oversized PNG/JPEG bytes, the server auto-resizes them, so you shouldn't see "too large" unless it's a GIF or URL. "too small" or unsupported type means you need a different image. |
| `node_set_fill: image is too large to auto-resize server-side` | A PNG/JPEG provided via `bytesBase64` was extremely large (>~45 megapixels) and exceeded the server's decode budget, so it could not be auto-resized to fit Figma's limits. | You must pre-resize the source image yourself before sending it over MCP. |
| `Invalid option: expected one of "ALL_SCOPES"\|…` (invalid scope name), or a Figma rejection when assigning a scope incompatible with the variable's type | A `variable_manage` `scopes` entry isn't a valid `VariableScope` (rejected by input validation before reaching Figma), or Figma considers it incompatible with the variable's type (e.g. `ALL_FILLS` on a `FLOAT`). | Use only valid `VariableScope` values, and only ones compatible with the type (e.g. `*_FILL`/`*_COLOR`/`STROKE_COLOR` for COLOR; `WIDTH_HEIGHT`/`GAP`/`CORNER_RADIUS`/`*_FLOAT` for FLOAT). |
| (Silent Fallback) Effect `blendMode` omission | Not an error, but note: if you omit `blendMode` when creating or setting an effect (like a drop shadow), it defaults to `"NORMAL"`. | Provide an explicit `blendMode` (e.g. `"MULTIPLY"`) if you need it. |

## Component Set, Creator, and Clone Errors (v2.3.2)

| Code / Message | Meaning | Recovery |
|---|---|---|
| `Operation Denied: Parent outside editable scope. …` returned by **`node_clone` of the scope root itself** | Cloning the scope root is denied: the clone would land in the source's parent, which is outside the editable scope by definition (this closed a live scope-containment escape). | Ask the user to disconnect the plugin and re-scope to the **parent** of the current scope root, then clone. |
| `Operation Denied: Cannot clone '…' because it is inside a component instance.` | The clone source sits inside a component instance interior; cloning it is a structural edit. | Clone the **main component's** child instead, or use instance overrides. |
| `node_clone: parent '…' (type …) cannot accept cloned children.` | The source's parent (the implicit clone destination) cannot contain children. | Ask the user to re-scope so the source sits under an appendable container, or duplicate content via creation tools into a valid parent. |
| `create_shape/create_frame/create_text/create_svg/create_instance: parent '…' (type …) cannot contain children.` | The requested parent (e.g. a `RECTANGLE` or `BOOLEAN_OPERATION`) cannot hold child layers. No node is created. | Pick a container parent (`FRAME`, `GROUP`, `PAGE`, `SECTION`, `COMPONENT`) and retry. |
| `Operation Denied: Duplicate variant combination '…' across components '…' and '…'. Each component in a set must have a unique property-value combination.` | Two components in `create_component_set` map to the same variant name. Nothing was renamed or combined. | Give every component a unique property-value combination, then retry. |
| `create_component_set: property value '…' for '…' must be non-empty and must not contain '=' or ','.` | Variant property values may not be empty or contain the `=` / `,` separator characters — Figma's variant-name encoding would corrupt the set. | Rename the offending value (e.g. `S-1` instead of `S=1`) and retry. |
| `create_component_set: component '…' (…) is listed more than once in components.` | The same component id appears twice in the `components` array. | De-duplicate the array; each variant must be a distinct component. |
| `create_component_set: '…' is already a variant in component set '…'. Combining it would break that set.` | A listed component is already a member of another component set; combining would cannibalize that set. | Use components that are not already variants, or ask the user whether to restructure the existing set manually first. |
| `create_component_set: parent '…' is one of the components being combined (or is inside one) and cannot receive the component set.` | The requested `parentId` is one of the input components (or a descendant of one) — placing the set there would create a cycle. | Choose a parent **outside** the combined components, or omit `parentId` and place the set afterwards with `node_insert_child`. |
| `create_component_set: parent '…' (type …) cannot contain a component set.` | The requested parent cannot hold a component set. Nothing was renamed or combined. | Choose an appendable container, or omit `parentId`. |
| A raw Figma error (e.g. `in appendChild: …`) **after** `create_component_set` reported the combine succeeded, or a success whose placement ignored `parentId` | A residual TOCTOU placement failure: the set was created but could not be moved to the requested parent; it remains at the combine location with correct variant names (no rollback — see SAFETY.md D5/R1). | Locate the set via `component_list` / `node_info`, then finish placement with `node_insert_child`. |
| `create_instance: failed to import remote component with key '…': … Read the key from an existing instance's mainComponent (component_list does not list remote library keys); confirm the source library is enabled for this file; a component-set key needs a variant's key.` | `importComponentByKeyAsync` failed (or timed out after 15 s) for the given key. | Read the key from an existing instance's `mainComponent` (via `node_info` with property `mainComponent` then querying that component's `key`), confirm the library is enabled for this file, and for component sets pass a **variant's** key. Note: unresolvable keys no longer hang indefinitely, but reject within 15 s with this error. |
| `create_instance: '…' is a COMPONENT_SET; pass one of its variant COMPONENTs — e.g. its default variant '…' (…).` | You passed a component-**set** id to `create_instance`; only variant `COMPONENT`s can be instantiated. The error names the set's default variant and its id as the retry target. | Retry with the default variant id from the message (or another variant's id). |

> [!NOTE]
> **Orphan prevention (v2.3.2):** creation tools (`create_shape`, `create_frame`, `create_text`, `create_svg`, `create_instance`, `create_component`) and `node_clone` validate their parent **before** constructing anything and remove the new object if any later configuration or append step fails — creation failures never leave orphan nodes. `create_component_set` prevalidates everything checkable before renaming and restores original component names if the combine itself fails; the one residual is the TOCTOU placement case above, where the set exists at the combine location and placement is finished with `node_insert_child`.

## Connection errors

| Code | Meaning | Recovery |
|---|---|---|
| `CHANNEL_NOT_FOUND` | The channel the user provided does not exist. | Inform the user; the plugin in Figma may have disconnected or restarted. |
| `CHANNEL_JOIN_FAILED` | The plugin rejected the channel join. | Inform the user and ask them to re-open the plugin in Figma. |
| `PLUGIN_DISCONNECTED` | The plugin disconnected mid-session. | Inform the user; the plugin tab may have closed. They must reopen it before you can continue. |
| `DOCUMENT_LOAD_FAILED` | The Figma document could not be loaded by the plugin. | Inform the user. Often a Figma client-side issue. |
| `UNKNOWN_ERROR` | An unstructured failure inside the plugin. | Report the message to the user; do not silently retry. |
