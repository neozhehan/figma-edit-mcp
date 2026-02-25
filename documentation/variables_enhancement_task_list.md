# Variables Enhancement — Task List

Sequential implementation checklist derived from [variable_usage_and_cleanup.md](variable_usage_and_cleanup.md).

---

## Cleanup

- [x] Fix stale file-path comment at line 1 of `variableHandlers.ts` (`.js` → `.ts`)
- [x] Remove unused `filterFigmaNode` import from `variableHandlers.ts`

---

## Shared Helper

- [x] Add `findVariableConsumers(rootNode, variableIds: Set<string>)` to `variableHandlers.ts`
  - Single-pass tree walk, returns `Map<string, ConsumerEntry[]>`
  - Handles both simple alias bindings and array bindings (fills, strokes)

---

## `get_variables` — Multi-ID & Consumer Scanning

### MCP Server (`variables.ts`)

- [x] Change `variableId` param from `z.string().optional()` to `z.array(z.string()).optional()`
- [x] Add `includeConsumers` param: `z.enum(["current_page", "document"]).optional()`
- [x] Update tool description to mention multi-ID and consumer scanning
- [x] Pass both `variableId` and `includeConsumers` through to `sendCommandToFigma`

### Plugin Handler (`variableHandlers.ts`)

- [x] Update `getVariables` to handle array of variable IDs
  - Look up each variable in parallel via `Promise.all`
  - Always return an array of variable detail objects
- [x] Add consumer scanning logic (gated by `variableId && includeConsumers`)
  - `"current_page"` → walk `figma.currentPage`
  - `"document"` → walk all pages via `figma.root.children`
  - Attach consumers to each variable object from the returned `Map`

### Unit Tests (`variables.test.ts`)

- [x] Add test: `get_variables` passes array `variableId` and `includeConsumers` to `sendCommandToFigma`

---

## `delete_variables` — New Tool

### MCP Server (`variables.ts`)

- [x] Register `delete_variables` tool with schema:
  - `variableIds: z.array(z.string()).optional()` — mutually exclusive with `collectionId`
  - `collectionId: z.string().optional()` — mutually exclusive with `variableIds`
- [x] Forward params to `sendCommandToFigma("delete_variables", { variableIds, collectionId })`

### Plugin Handler (`variableHandlers.ts`)

- [x] Add `deleteVariables` handler
  - Mutual exclusivity check (`variableIds` XOR `collectionId`)
  - **`variableIds` mode**: verify variables exist, consumer scan, delete if unused
  - **`collectionId` mode**: resolve collection, get its variable IDs, consumer scan, delete collection (cascades) if all unused; empty collection deletes immediately
  - Return `{ success, deleted, deletedCollection?, variablesInUse? }`

### Plugin Dispatch (`main.ts`)

- [x] Import `deleteVariables` from `variableHandlers.js`
- [x] Add `case "delete_variables"` with read-only guard

### Unit Tests (`variables.test.ts`)

- [x] Add test: `delete_variables` calls `sendCommandToFigma` with `variableIds`

---

## Build & Automated Tests

- [x] Run `npm run build` — verify no compilation errors
- [x] Run `cd src/mcp_server && bun test tests/unit/tools/variables.test.ts` — all tests pass

---

## Manual Verification in Figma

> Requires building the plugin and loading it in Figma with test variables and bindings.

### `get_variables` tests

- [x] **1.** List-all mode (no `variableId`) → unchanged response shape
- [x] **2.** List-all + `includeConsumers: "current_page"` → no `consumers` field (ignored)
- [x] **3.** Single `variableId`, no `includeConsumers` → array of one object, no `consumers`
- [x] **4.** Single `variableId` + `includeConsumers: "current_page"` → `consumers` array present
- [x] **5.** Multiple `variableId`s + `includeConsumers: "current_page"` → each object has its own `consumers`
- [x] **6.** `includeConsumers: "document"` → cross-page consumers appear
- [x] **7.** `includeConsumers: "current_page"` → other-page consumers excluded

### `delete_variables` tests

- [x] **8.** Delete unused variables by ID → `success: true`, variables removed
- [x] **9.** Delete in-use variable by ID → `success: false`, `variablesInUse` populated
- [x] **10.** All-or-nothing: 2 variables, 1 in use → neither deleted
- [x] **11.** Cross-page: variable bound only on another page → still rejected
- [x] **12.** Read-only mode → read-only error thrown (verified by code inspection — same pattern as `manage_variables`)
- [x] **13.** Delete empty collection via `collectionId` → `success: true`, `deletedCollection` present
- [x] **14.** Delete collection with unused variables → `success: true`
- [x] **15.** Delete collection with in-use variables → `success: false`, `variablesInUse` populated
- [x] **16.** Mutual exclusivity: both `variableIds` and `collectionId` → error thrown
