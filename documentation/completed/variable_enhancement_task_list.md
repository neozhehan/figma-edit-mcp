# Variable Consumer Scanning - Implementation Task List

This document provides a component-level breakdown of the implementation phases detailed in `variable_consumer_scanning_enhancement.md`.

## Phase 1A: Style Consumer Scanning

- [x] Implement `findStyleConsumers` in `variableHandlers.ts`
  - [x] Fetch all local Paint, Text, Effect, and Grid styles **in parallel via `Promise.all`** (`figma.getLocalPaintStylesAsync()`, `figma.getLocalTextStylesAsync()`, `figma.getLocalEffectStylesAsync()`, `figma.getLocalGridStylesAsync()`)
  - [x] Check each style's `boundVariables` property for references to the target variable IDs
  - [x] Return a `Map<string, StyleConsumerEntry[]>` using the `{ styleId, styleName, styleType, fields }` shape

## Phase 1B: Variable Alias Consumer Scanning

- [x] Implement `findAliasConsumers` in `variableHandlers.ts`
  - [x] Fetch all local variables using `figma.variables.getLocalVariablesAsync()`
  - [x] Check each variable's `valuesByMode` for values matching `{ type: 'VARIABLE_ALIAS', id: '...' }` that point to the target variable IDs
  - [x] Return a `Map<string, AliasConsumerEntry[]>` using the `{ variableId, variableName, variableType, modes }` shape

## Phase 1C: Component Property Variable Bindings

- [x] Extend `findVariableConsumers` node walk in `variableHandlers.ts`
  - [x] For `COMPONENT` / `COMPONENT_SET` nodes: check `node.componentPropertyDefinitions` for `boundVariables` referencing target variable IDs
  - [x] For `INSTANCE` nodes: check `node.componentProperties` for `boundVariables` referencing target variable IDs
  - [x] Add matches to existing `consumerMap` using `NodeConsumerEntry` shape with `fields` prefixed as `"componentProperty:propertyName"`

## Phase 1 Integration

- [x] Incorporate scanners into `getVariables` in `variableHandlers.ts`
  - [x] Call `findStyleConsumers` and `findAliasConsumers` alongside existing `findVariableConsumers`
  - [x] Run all three scan types concurrently via `Promise.all`
  - [x] Rename existing `consumers` field to `nodeConsumers`
  - [x] Add new `styleConsumers` and `aliasConsumers` fields alongside `nodeConsumers`
- [x] Incorporate scanners into `deleteVariables` in `variableHandlers.ts`
  - [x] Call `findStyleConsumers` and `findAliasConsumers` alongside existing `findVariableConsumers`
  - [x] Run all three scan types concurrently via `Promise.all`
  - [x] Structure `variablesInUse` error response with `nodeConsumers`, `styleConsumers`, `aliasConsumers` sub-fields
  - [x] Update error message formatting to produce human-readable descriptions per consumer type (node, style, alias)
  - [x] Filter out intra-collection alias consumers when deleting by `collectionId` (exclude alias consumers whose `variableId` is also in the deletion set)
- [x] Update MCP Server definitions (`src/mcp_server/tools/variables.ts`)
  - [x] Update `get_variables` tool description to mention style and alias consumers, and document-scope limitation
  - [x] Update `delete_variables` tool description to mention expanded consumer check scope and document-scope limitation


## Phase 2: Support Resolving Style Consumers (Update Style)

- [x] Modify `createStyle` handler in `styleHandlers.ts`
  - [x] Accept an optional `styleId` parameter
  - [x] If `styleId` is provided, fetch the existing style via `figma.getStyleByIdAsync(styleId)`
  - [x] Verify the existing style matches the provided `type` (TEXT, PAINT, EFFECT, GRID)
  - [x] Apply any new `name`, `description`, and `properties` to the retrieved style (mirroring create logic)
  - [x] Accept an optional `bindVariables` parameter (map of field names to variable IDs or null)
  - [x] Implement bind (`style.setBoundVariable(field, variable)`) and unbind (`style.setBoundVariable(field, null)`) via unified parameter
  - [x] Handle PAINT vs non-PAINT style branching (`setBoundVariableForPaint` vs `setBoundVariable`)
  - [x] Ensure execution order: `properties` → `bindVariables`
- [x] Modify plugin command dispatch in `main.ts`
  - [x] Rename `case "create_style"` to `case "manage_style"`
  - [x] Pass through `styleId` and `bindVariables` to the handler
- [x] Modify MCP Server definition (`src/mcp_server/tools/styling.ts`)
  - [x] Rename tool from `create_style` to `manage_style` (tool name and description)
  - [x] Add `styleId: z.string().optional()` to the tool schema
  - [x] Add `bindVariables: z.record(z.string(), z.string().nullable()).optional()` to the tool schema
  - [x] Update tool description to denote it supports both creating new styles and updating existing styles
- [x] Update any system prompts or agent instructions that reference `create_style` by name

## Phase 3: Prototype Reaction Scanning & Editing

- [x] Implement prototype reaction scanning in `variableHandlers.ts`
  - [x] Guard reaction access with `'reactions' in node` (not all node types support reactions)
  - [x] Verify the `SET_VARIABLE` action property path against current Figma Plugin API typings (`action.variableId` vs `action.variable.id`)
  - [x] Iterate through `node.reactions` array for each supported node
  - [x] Implement recursive `walkAction(action)` to evaluate `SET_VARIABLE` fields (`action.variableId`, `action.variableValue`) and `CONDITIONAL` blocks (`block.condition`, `block.actions[]`)
  - [x] Implement recursive `walkExpression(expression)` for deeply nested `expression.expressionArguments`
- [x] Build the `update_reactions` tool (wholesale replacement with Zod validation)
  - [x] Create a comprehensive Zod schema for the Figma `Reaction` type in `prototyping.ts`, using `z.lazy()` for recursive types (Action → ConditionalBlock → Action → Expression → ExpressionArgument → Expression...)
  - [x] Add a comment referencing the Figma Plugin API version the schema was built against
  - [x] Create an `updateReactions` command handler in `figma_plugin/handlers/prototypingHandlers.ts` that calls `node.setReactionsAsync(reactions)`
  - [x] Create an `update_reactions` MCP tool definition in `src/mcp_server/tools/prototyping.ts` that validates the reactions payload against the Zod schema before sending to the plugin
  - [x] Reject malformed payloads with descriptive Zod validation errors

## Manual Verification

- [x] Test 1: Style consumer detection — `get_variables` returns `styleConsumers`, `delete_variables` blocks deletion
- [x] Test 2: Variable alias consumer detection — `get_variables` returns `aliasConsumers`, `delete_variables` blocks deletion
- [x] Test 3: Clean variable deletion — standalone variable deletes successfully
- [x] Test 4: Collection deletion with external style/alias consumers — deletion blocked with details
- [x] Test 5: Collection deletion with intra-collection aliases only — deletion succeeds (intra-collection aliases filtered)
- [x] Test 6: Updating a style to free a variable — `manage_style` with `bindVariables: { field: null }` clears binding, then `delete_variables` succeeds
- [x] Test 7: Verify `consumers` field is renamed to `nodeConsumers` in `get_variables` response
