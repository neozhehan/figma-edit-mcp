# Variable Consumer Scanning Enhancement

Enhance `findVariableConsumers` in `variableHandlers.ts` to detect variable usage in **styles**, **variable aliases**, and **prototype reactions** — not just node `boundVariables`.

## Background

The current `findVariableConsumers` function only walks the node tree checking `node.boundVariables`. This means `deleteVariables` and `getVariables` (with `includeConsumers`) miss three categories of variable consumers, potentially allowing deletion of variables that are still referenced.

## User Review Required

> [!IMPORTANT]
> **Prototype reactions scanning** adds significant complexity (recursive expression tree walking). It is marked as **Phase 3** and can be deferred. Styles and aliases are the higher-impact gaps.

> [!WARNING]
> This change affects deletion safety — `deleteVariables` will now block deletion in more cases than before. This is a **safety improvement**, not a breaking change.

---

## Known Limitations

### Remote / Team Library Variables

`figma.variables.getLocalVariablesAsync()` only returns **local** variables. If a local variable is consumed by a variable alias in a *different* file (via team library publishing), that consumer is invisible to the plugin. The consumer scan can only guarantee completeness within the current document. This should be documented in the MCP tool descriptions so the AI does not give false "no consumers found" guarantees.

### Race Conditions

The consumer scan and deletion are separate operations with no locking mechanism. Between scanning and deleting, a user (or another plugin) could add a new consumer. This is acceptable given the plugin sandbox model (single-threaded execution), but worth noting for documentation purposes.

---

## Proposed Changes

### Plugin Handlers

#### [MODIFY] [variableHandlers.ts](src/figma_plugin/handlers/variableHandlers.ts)

**Phase 1A — Style Consumer Scanning**

Add a new function `findStyleConsumers` that:
1. Calls `figma.getLocalPaintStylesAsync()`, `figma.getLocalTextStylesAsync()`, `figma.getLocalEffectStylesAsync()`, and `figma.getLocalGridStylesAsync()` **in parallel via `Promise.all`** to avoid sequential latency on large files
2. Checks each style's `boundVariables` for references to target variable IDs
3. Returns a `Map<string, StyleConsumerEntry[]>` keyed by variable ID

Consumer entries for styles:
```ts
interface StyleConsumerEntry {
  styleId: string;
  styleName: string;
  styleType: 'PAINT' | 'TEXT' | 'EFFECT' | 'GRID';
  fields: string[];
}
```

**Phase 1B — Variable Alias Consumer Scanning**

Add a new function `findAliasConsumers` that:
1. Calls `figma.variables.getLocalVariablesAsync()`
2. For each variable, iterates over `valuesByMode` entries
3. Checks if any value is a `VARIABLE_ALIAS` (i.e., `{ type: 'VARIABLE_ALIAS', id: '...' }`) pointing to a target variable ID
4. Returns a `Map<string, AliasConsumerEntry[]>` keyed by variable ID

Consumer entries for aliases:
```ts
interface AliasConsumerEntry {
  variableId: string;
  variableName: string;
  variableType: string;
  modes: string[];  // mode IDs where the alias is used
}
```

> [!NOTE]
> **Transitive aliases are not detected.** If Variable A aliases Variable B, and Variable B aliases Variable C, deleting Variable C will be blocked by the direct alias from B→C, but there is no transitive walk from A→B→C. This is acceptable because B→C is the direct dependency — if B→C is resolved first, A→B remains valid independently.

**Phase 1C — Component Property Variable Bindings**

Extend the existing `findVariableConsumers` node walk to also check component property variable bindings. This piggybacks on the existing tree walk with minimal added complexity.

Within the `walk` function, after checking `boundVariables`, add:

1. **Component definitions** (`COMPONENT`, `COMPONENT_SET` node types): Check `node.componentPropertyDefinitions`. Each definition can have a `boundVariables` object — iterate its entries and check for target variable IDs, same as the existing `boundVariables` check.
2. **Component instances** (`INSTANCE` node type): Check `node.componentProperties`. Each property value can have a `boundVariables` object containing overridden variable bindings. Iterate and check for target variable IDs.

These matches are added to the existing `consumerMap` using the same `NodeConsumerEntry` shape, with `fields` entries prefixed to distinguish them (e.g., `"componentProperty:propertyName"`).

**Integration into existing flows**

- Update the consumer scan in `getVariables` (the `includeConsumers` block) to also call `findStyleConsumers` and `findAliasConsumers`, merging their results
- Update the consumer scan in `deleteVariables` (the full-document scan block) to also call `findStyleConsumers` and `findAliasConsumers`
- **Response shape**: Rename the existing `consumers` field to `nodeConsumers` for consistency with the new fields. This is a breaking change to the response shape.

```ts
// Per-variable response shape in getVariables
{
  id: string;
  name: string;
  // ... existing fields ...
  nodeConsumers: NodeConsumerEntry[];    // RENAMED from `consumers`
  styleConsumers: StyleConsumerEntry[];  // NEW
  aliasConsumers: AliasConsumerEntry[];  // NEW
}
```

```ts
// Error response shape in deleteVariables
{
  success: false;
  error: string;
  variablesInUse: {
    [variableId: string]: {
      nodeConsumers: NodeConsumerEntry[];
      styleConsumers: StyleConsumerEntry[];
      aliasConsumers: AliasConsumerEntry[];
    }
  }
}
```

- **Error message formatting**: The error message construction in `deleteVariables` must be updated to produce human-readable descriptions for all three consumer types. Example format:
  - Node consumers: `"Used by node 'Button' (INSTANCE) on fields: fills"`
  - Style consumers: `"Used by paint style 'Primary Fill' on fields: color"`
  - Alias consumers: `"Aliased by variable 'semantic/primary' in modes: Mode 1"`

**Intra-collection alias filtering for `collectionId` deletion**

When deleting by `collectionId`, all variables in the collection are being deleted together. If Variable A (in the collection) aliases Variable B (also in the collection), that alias should **not** block deletion — both will be removed. The `findAliasConsumers` results must be filtered to exclude alias consumers whose `variableId` is also in the deletion set (`idSet`).

**Performance considerations**

- `findStyleConsumers`: The four `getLocal*StylesAsync()` calls should use `Promise.all` since they are independent.
- `findAliasConsumers`: Fetches all local variables. Combined with the existing full-document node walk, a delete operation now requires: walking all pages + fetching all styles (4 calls) + fetching all variables.
- **All three scan types should run concurrently via `Promise.all`**: Run `findVariableConsumers` (all pages), `findStyleConsumers`, and `findAliasConsumers` in parallel, then merge results. This provides full consumer details for error messages while minimizing wall-clock time on large files.

---

**Phase 2 — Support Resolving Style Consumers (Update Style)**

#### [MODIFY] [styleHandlers.ts](src/figma_plugin/handlers/styleHandlers.ts)

Extend the existing `createStyle` handler to also handle updating existing styles:
1. Accept an optional `styleId` parameter.
2. If `styleId` is provided, call `figma.getStyleByIdAsync(styleId)` to retrieve the style.
3. If the style exists, verify it matches the provided `type` (TEXT, PAINT, EFFECT, GRID).
4. Apply any provided `name`, `description`, and `properties` to the existing style (just as it currently does for newly created styles).
5. If `styleId` is not provided, keep the existing creation logic.

**Critical: Unbinding variables from styles**

Setting new `properties` (e.g., `paints`) on a style does **not** automatically clear its `boundVariables`. Figma style `boundVariables` is read-only — you cannot overwrite it by assigning new property values. To unbind a variable from a style, you must explicitly call:

```ts
style.setBoundVariable(field, null);
```

The updated handler must support an optional `unbindVariables` parameter:

```ts
// Example: unbind the 'color' field from a paint style
{
  styleId: "S:abc123",
  type: "PAINT",
  unbindVariables: ["color"],  // fields to unbind
  properties: {
    paints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }]  // new hardcoded value
  }
}
```

Implementation in the handler:
```ts
if (unbindVariables && Array.isArray(unbindVariables)) {
  for (const field of unbindVariables) {
    style.setBoundVariable(field, null);
  }
}
```

The `unbindVariables` step must run **before** applying `properties`, so the new property values take effect cleanly.

#### [MODIFY] [main.ts](src/figma_plugin/src/main.ts)
Rename the command dispatch case from `"create_style"` to `"manage_style"` and pass through `styleId` and `unbindVariables` to the handler.

---

**Phase 3 — Prototype Reaction Scanning (Deferred)**

Add scanning within the existing `walk` function in `findVariableConsumers` to also check prototype reactions on nodes. This adds significant logic complexity because prototype actions can nest expressions infinitely.

**API considerations**:
- `reactions` is only available on nodes that support interactions (SceneNode types: frames, components, instances, groups, etc.) — guard with `'reactions' in node` rather than casting all nodes
- The Figma Plugin API property path for `SET_VARIABLE` actions should be verified against the current API version. The action shape may use `action.variableId` or `action.variable.id` depending on API version — check the Figma Plugin API typings at build time.

*Additional Logic Required*:
1. **Reaction Array Checking**: For each node that supports reactions, iterate through its `reactions` array.
2. **Action Scanning**: Iterate through each `action` inside a reaction (this could be `action` or `actions[]` depending on the Figma API version).
3. **Recursive Action Walker**: Create a recursive `walkAction(action)` function to handle the two action types that consume variables:
    * **`SET_VARIABLE`**: Check if `action.variableId` matches any of the target IDs.
        * Also check `action.variableValue`. If it's a `VARIABLE_ALIAS` object (e.g., `type: 'VARIABLE_ALIAS'`), extract the ID and check if it matches target IDs.
        * If `action.variableValue` is an `EXPRESSION`, pass it to the Expression Walker (below).
    * **`CONDITIONAL`**: This action has an array of `conditionalBlocks`. Iterate through them.
        * `block.condition`: Check this condition, passing it to the Expression Walker if it is an `EXPRESSION`, or a Variable Data object if it's a `VARIABLE_ALIAS`.
        * `block.actions[]`: Recursively pass each action to `walkAction()`.
4. **Recursive Expression Walker**: Create a `walkExpression(expression)` function.
    * Expressions are trees. A simple expression has a left operand, an operator, and a right operand.
    * Iterate through `expression.expressionArguments`.
    * If an argument is a `VARIABLE_ALIAS`, check its ID.
    * If an argument is a nested `EXPRESSION`, recursively call `walkExpression()` on it.

*Test Surface Area*:
The test matrix for Phase 3 significantly expands the verification surface area. It requires manual Figma test file setups covering:
1. **Direct Mutators**: A node whose "On click" triggers a "Set variable" action where the target variable is modified directly (`action.variableId`).
2. **Alias Setters**: A node whose "On click" triggers a "Set variable" action, assigning the target variable by referencing it as an alias (in `action.variableValue`).
3. **Simple Truthy Conditions**: A conditional interaction: "If `targetVariable == true`..." (tested via `block.condition` alias matching).
4. **Nested Condition Actions**: A conditional interaction that modifies a *different* variable, but that action falls under the truthy block.
5. **Math Expressions**: A numeric variable used in a formula interaction: "Set `score` to `score + targetVariable`" (tests deep expression traversal).

*AI Fixing Capabilities (update_reactions)*:
If the AI detects that a prototype is consuming a to-be-deleted variable, it needs a tool to fix it. We need to build an `update_reactions` feature that can modify `node.reactions`.
1. **Plugin Handler (`src/figma_plugin/handlers/prototypingHandlers.ts`)**: Create an `updateReactions` handler that accepts a `nodeId` and a reactions payload.
2. **MCP Server Tool (`src/mcp_server/tools/prototyping.ts`)**: Expose an `update_reactions` tool.

**Decision: Wholesale replacement with Zod validation (Option C).**

The `update_reactions` tool will accept a full `reactions` array (`{ nodeId: string, reactions: Reaction[] }`) validated against a Zod schema modeling the Figma `Reaction` type before sending to the plugin.

- *Workflow*: LLM calls `get_reactions` → receives full array → modifies/removes the offending action → passes the full array back to `update_reactions`. The MCP tool validates the input against the Zod schema; malformed payloads are rejected with a descriptive error before reaching `setReactionsAsync`.
- *Zod schema*: Must model the recursive Reaction type (Reaction → Action → ConditionalBlock → Action → Expression → ExpressionArgument → Expression...) using `z.lazy()` for recursive types. The schema validates *structure* (required fields, types, enum values) but not *semantic* correctness (e.g., it cannot verify that a `destinationId` points to a real node).
- *Maintenance*: The Zod schema must be kept in sync with the Figma Plugin API as it evolves. Consider co-locating it with the existing Zod schemas in [prototyping.ts](src/mcp_server/tools/prototyping.ts) and adding a comment referencing the Figma Plugin API version it was built against.

This phase requires a recursive expression walker **and** the new mutation tools, and is deferred to a follow-up.

---

### MCP Server

#### [MODIFY] [styling.ts](src/mcp_server/tools/styling.ts)

- **Rename `create_style` to `manage_style`**. Update the tool name in all three locations:
  1. MCP tool registration in [styling.ts](src/mcp_server/tools/styling.ts) — tool name and description
  2. Plugin command dispatch in [main.ts](src/figma_plugin/src/main.ts) — `case "create_style"` → `case "manage_style"`
  3. Any system prompts or agent instructions that reference `create_style` by name
- Add an optional `styleId` property to the input schema (`z.string().optional()`).
- Add an optional `unbindVariables` property to the input schema (`z.array(z.string()).optional()`) — list of bound variable fields to clear.
- The tool will pass `styleId` and `unbindVariables` directly to the plugin handler if provided.

#### [MODIFY] [variables.ts](src/mcp_server/tools/variables.ts)

- Update the tool description for `get_variables` to:
  - Mention that consumers now include styles and variable aliases in addition to nodes
  - Note that consumer scanning is limited to the current document (remote/library consumers are not visible)
- Update the tool description for `delete_variables` to:
  - Mention the expanded consumer check scope (nodes, styles, and variable aliases)
  - Note the document-scope limitation

No schema changes needed — the plugin handler controls the response shape.

---

### Build

#### Plugin rebuild required

After modifying `variableHandlers.ts` and `styleHandlers.ts`, the plugin must be rebuilt:
```bash
cd src/figma_plugin && npm run build
```

---

## Verification Plan

### Automated Tests

#### Existing tests

Located at `src/mcp_server/tests/unit/tools/variables.test.ts`. These are MCP-layer pass-through tests (they mock `sendCommandToFigma`) and don't test the plugin handler logic directly. They will continue to pass without modification.

Run with:
```bash
cd src/mcp_server && bun test tests/unit/tools/variables.test.ts
```

#### New tests needed

The real consumer-scanning logic lives in the Figma plugin (`variableHandlers.ts`) which runs inside the Figma sandbox — it cannot be unit-tested outside Figma with standard tooling. **No new automated tests are proposed for the plugin handler code.**

### Manual Verification

> [!NOTE]
> These tests require a Figma file with variables, styles, and aliases set up. The plugin must be loaded via Figma's "Import plugin from manifest" feature.

#### Test 1: Style Consumer Detection

1. In Figma, create a color variable `brand/blue` with value `#0066FF`
2. Create a **Paint Style** (e.g., "Primary Fill") and bind its color to `brand/blue`
3. Use the plugin's `get_variables` tool with `variableId: ["<brand/blue ID>"]` and `includeConsumers: "document"`
4. **Expected**: Response includes a `styleConsumers` entry referencing the "Primary Fill" style with `fields: ["color"]`
5. Attempt `delete_variables` with `variableIds: ["<brand/blue ID>"]`
6. **Expected**: Deletion is rejected, error mentions the style consumer by name

#### Test 2: Variable Alias Consumer Detection

1. Create a color variable `brand/blue` with value `#0066FF`
2. Create a second variable `semantic/primary` and set its value to alias `brand/blue`
3. Use `get_variables` with `variableId: ["<brand/blue ID>"]` and `includeConsumers: "document"`
4. **Expected**: Response includes an `aliasConsumers` entry referencing `semantic/primary`
5. Attempt `delete_variables` with `variableIds: ["<brand/blue ID>"]`
6. **Expected**: Deletion is rejected, error mentions the alias consumer

#### Test 3: Clean Variable Deletion (no consumers)

1. Create a standalone variable not used in any node, style, or alias
2. Attempt `delete_variables` with its ID
3. **Expected**: Deletion succeeds

#### Test 4: Collection Deletion with Style/Alias Consumers

1. Create a collection with variables used in styles or aliases
2. Attempt `delete_variables` with `collectionId`
3. **Expected**: Deletion is rejected with details about which variables are consumed

#### Test 5: Collection Deletion with Intra-Collection Aliases Only

1. Create a collection with two variables: `base/color` and `alias/color` where `alias/color` aliases `base/color`
2. Neither variable is used in any node or style
3. Attempt `delete_variables` with `collectionId`
4. **Expected**: Deletion **succeeds** — intra-collection alias references are filtered out since both will be deleted together

#### Test 6: Updating a Style to Free a Variable

1. From Test 1, use the `manage_style` tool, passing:
   - `styleId` of "Primary Fill"
   - `type: "PAINT"`
   - `unbindVariables: ["color"]`
   - `properties: { paints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] }`
2. **Expected**: The style updates successfully — variable binding is cleared, hardcoded color is applied
3. Attempt `delete_variables` with `variableIds: ["<brand/blue ID>"]`
4. **Expected**: Deletion now succeeds as the style consumer has been removed

#### Test 7: `consumers` Renamed to `nodeConsumers`

1. Create a variable bound to a node's fill
2. Use `get_variables` with `includeConsumers: "document"`
3. **Expected**: Response includes `nodeConsumers` array (not `consumers`) containing the node consumer entry
