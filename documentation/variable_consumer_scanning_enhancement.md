# Variable Consumer Scanning Enhancement

Enhance `findVariableConsumers` in `variableHandlers.ts` to detect variable usage in **styles**, **variable aliases**, and **prototype reactions** — not just node `boundVariables`.

## Background

The current `findVariableConsumers` function only walks the node tree checking `node.boundVariables`. This means `deleteVariables` and `getVariables` (with `includeConsumers`) miss three categories of variable consumers, potentially allowing deletion of variables that are still referenced.

## User Review Required

> [!IMPORTANT]
> **Prototype reactions scanning** adds significant complexity (recursive expression tree walking). It is marked as **Phase 2** and can be deferred. Styles and aliases are the higher-impact gaps.

> [!WARNING]
> This change affects deletion safety — `deleteVariables` will now block deletion in more cases than before. This is a **safety improvement**, not a breaking change.

---

## Proposed Changes

### Plugin Handlers

#### [MODIFY] [variableHandlers.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/figma_plugin/handlers/variableHandlers.ts)

**Phase 1A — Style Consumer Scanning**

Add a new function `findStyleConsumers` that:
1. Calls `figma.getLocalPaintStylesAsync()`, `figma.getLocalTextStylesAsync()`, `figma.getLocalEffectStylesAsync()`, and `figma.getLocalGridStylesAsync()`
2. Checks each style's `boundVariables` for references to target variable IDs
3. Returns results in the same `Map<string, ConsumerEntry[]>` format, using the style name/ID/type as the consumer identifier

Consumer entries for styles will have a distinct shape:
```ts
{
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
4. Returns results in the same map format

Consumer entries for aliases will have a distinct shape:
```ts
{
  variableId: string;
  variableName: string;
  variableType: string;
  modes: string[];  // mode IDs where the alias is used
}
```

**Integration into existing flows**

- Update the consumer scan in `getVariables` (line 94-116) to also call `findStyleConsumers` and `findAliasConsumers`, merging their results into the consumer map
- Update the consumer scan in `deleteVariables` (line 197-206) to also call `findStyleConsumers` and `findAliasConsumers`
- The response shape will include separate `nodeConsumers`, `styleConsumers`, and `aliasConsumers` arrays per variable (instead of a single flat `consumers` array) for clarity

**Phase 2 — Prototype Reaction Scanning (Deferred)**

Add scanning within the existing `walk` function to also check `(node as any).reactions` for:
- `SET_VARIABLE` actions where `action.variableId` matches a target
- `CONDITIONAL` blocks where expressions contain `VARIABLE_ALIAS` references
- Nested `conditionalBlocks[].actions[]` recursive scanning

This requires a recursive expression walker and is deferred to a follow-up.

---

### MCP Server

#### [MODIFY] [variables.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/variables.ts)

- Update the tool description for `get_variables` to mention that consumers now include styles and variable aliases in addition to nodes
- Update the tool description for `delete_variables` to mention the expanded consumer check scope

No schema changes needed — the plugin handler controls the response shape.

---

### Build

#### Plugin rebuild required

After modifying `variableHandlers.ts`, the plugin must be rebuilt:
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
4. **Expected**: Response includes a `styleConsumers` entry referencing the "Primary Fill" style
5. Attempt `delete_variables` with `variableIds: ["<brand/blue ID>"]`
6. **Expected**: Deletion is rejected, error mentions the style consumer

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
