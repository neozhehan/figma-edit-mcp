# Variable Consumer Scanning - Implementation Task List

This document provides a component-level breakdown of the implementation phases detailed in `variable_consumer_scanning_enhancement.md`.

## Phase 1A: Style Consumer Scanning

- [ ] Implement `findStyleConsumers` in `variableHandlers.ts`
  - [ ] Fetch all local Paint, Text, Effect, and Grid styles **in parallel via `Promise.all`** (`figma.getLocalPaintStylesAsync()`, `figma.getLocalTextStylesAsync()`, `figma.getLocalEffectStylesAsync()`, `figma.getLocalGridStylesAsync()`)
  - [ ] Check each style's `boundVariables` property for references to the target variable IDs
  - [ ] Return a `Map<string, StyleConsumerEntry[]>` using the `{ styleId, styleName, styleType, fields }` shape

## Phase 1B: Variable Alias Consumer Scanning

- [ ] Implement `findAliasConsumers` in `variableHandlers.ts`
  - [ ] Fetch all local variables using `figma.variables.getLocalVariablesAsync()`
  - [ ] Check each variable's `valuesByMode` for values matching `{ type: 'VARIABLE_ALIAS', id: '...' }` that point to the target variable IDs
  - [ ] Return a `Map<string, AliasConsumerEntry[]>` using the `{ variableId, variableName, variableType, modes }` shape

## Phase 1C: Component Property Variable Bindings

- [ ] Extend `findVariableConsumers` node walk in `variableHandlers.ts`
  - [ ] For `COMPONENT` / `COMPONENT_SET` nodes: check `node.componentPropertyDefinitions` for `boundVariables` referencing target variable IDs
  - [ ] For `INSTANCE` nodes: check `node.componentProperties` for `boundVariables` referencing target variable IDs
  - [ ] Add matches to existing `consumerMap` using `NodeConsumerEntry` shape with `fields` prefixed as `"componentProperty:propertyName"`

## Phase 1 Integration

- [ ] Incorporate scanners into `getVariables` in `variableHandlers.ts`
  - [ ] Call `findStyleConsumers` and `findAliasConsumers` alongside existing `findVariableConsumers`
  - [ ] Run all three scan types concurrently via `Promise.all`
  - [ ] Rename existing `consumers` field to `nodeConsumers`
  - [ ] Add new `styleConsumers` and `aliasConsumers` fields alongside `nodeConsumers`
- [ ] Incorporate scanners into `deleteVariables` in `variableHandlers.ts`
  - [ ] Call `findStyleConsumers` and `findAliasConsumers` alongside existing `findVariableConsumers`
  - [ ] Run all three scan types concurrently via `Promise.all`
  - [ ] Structure `variablesInUse` error response with `nodeConsumers`, `styleConsumers`, `aliasConsumers` sub-fields
  - [ ] Update error message formatting to produce human-readable descriptions per consumer type (node, style, alias)
  - [ ] Filter out intra-collection alias consumers when deleting by `collectionId` (exclude alias consumers whose `variableId` is also in the deletion set)
- [ ] Update MCP Server definitions (`src/mcp_server/tools/variables.ts`)
  - [ ] Update `get_variables` tool description to mention style and alias consumers, and document-scope limitation
  - [ ] Update `delete_variables` tool description to mention expanded consumer check scope and document-scope limitation

## Phase 2: Support Resolving Style Consumers (Update Style)

- [ ] Modify `createStyle` handler in `styleHandlers.ts`
  - [ ] Accept an optional `styleId` parameter
  - [ ] If `styleId` is provided, fetch the existing style via `figma.getStyleByIdAsync(styleId)`
  - [ ] Verify the existing style matches the provided `type` (TEXT, PAINT, EFFECT, GRID)
  - [ ] Apply any new `name`, `description`, and `properties` to the retrieved style (mirroring create logic)
  - [ ] Accept an optional `unbindVariables` parameter (array of field names)
  - [ ] Implement `style.setBoundVariable(field, null)` for each field in `unbindVariables`
  - [ ] Ensure `unbindVariables` runs **before** applying `properties`
- [ ] Modify plugin command dispatch in `main.ts`
  - [ ] Rename `case "create_style"` to `case "manage_style"`
  - [ ] Pass through `styleId` and `unbindVariables` to the handler
- [ ] Modify MCP Server definition (`src/mcp_server/tools/styling.ts`)
  - [ ] Rename tool from `create_style` to `manage_style` (tool name and description)
  - [ ] Add `styleId: z.string().optional()` to the tool schema
  - [ ] Add `unbindVariables: z.array(z.string()).optional()` to the tool schema
  - [ ] Update tool description to denote it supports both creating new styles and updating existing styles
- [ ] Update any system prompts or agent instructions that reference `create_style` by name

## Phase 3: Prototype Reaction Scanning & Editing (Deferred)

- [ ] Implement prototype reaction scanning in `variableHandlers.ts`
  - [ ] Guard reaction access with `'reactions' in node` (not all node types support reactions)
  - [ ] Verify the `SET_VARIABLE` action property path against current Figma Plugin API typings (`action.variableId` vs `action.variable.id`)
  - [ ] Iterate through `node.reactions` array for each supported node
  - [ ] Implement recursive `walkAction(action)` to evaluate `SET_VARIABLE` fields (`action.variableId`, `action.variableValue`) and `CONDITIONAL` blocks (`block.condition`, `block.actions[]`)
  - [ ] Implement recursive `walkExpression(expression)` for deeply nested `expression.expressionArguments`
- [ ] Build the `update_reactions` tool (wholesale replacement with Zod validation)
  - [ ] Create a comprehensive Zod schema for the Figma `Reaction` type in `prototyping.ts`, using `z.lazy()` for recursive types (Action → ConditionalBlock → Action → Expression → ExpressionArgument → Expression...)
  - [ ] Add a comment referencing the Figma Plugin API version the schema was built against
  - [ ] Create an `updateReactions` command handler in `src/figma_plugin/handlers/prototypingHandlers.ts` that calls `node.setReactionsAsync(reactions)`
  - [ ] Create an `update_reactions` MCP tool definition in `src/mcp_server/tools/prototyping.ts` that validates the reactions payload against the Zod schema before sending to the plugin
  - [ ] Reject malformed payloads with descriptive Zod validation errors

## Manual Verification

- [ ] Test 1: Style consumer detection — `get_variables` returns `styleConsumers`, `delete_variables` blocks deletion
- [ ] Test 2: Variable alias consumer detection — `get_variables` returns `aliasConsumers`, `delete_variables` blocks deletion
- [ ] Test 3: Clean variable deletion — standalone variable deletes successfully
- [ ] Test 4: Collection deletion with external style/alias consumers — deletion blocked with details
- [ ] Test 5: Collection deletion with intra-collection aliases only — deletion succeeds (intra-collection aliases filtered)
- [ ] Test 6: Updating a style to free a variable — `manage_style` with `unbindVariables` clears binding, then `delete_variables` succeeds
- [ ] Test 7: Verify `consumers` field is renamed to `nodeConsumers` in `get_variables` response
