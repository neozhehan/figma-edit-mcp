# Variable Usage Scanning & Cleanup

Add multi-ID lookups and consumer node scanning to `get_variables`, a new `delete_variables` tool with consumer safety checks, plus clean up stale code in the variable handlers.

## User Review Required

> [!WARNING]
> **Breaking change to `get_variables` single-ID return shape.** Currently, passing a single `variableId` returns a flat object. After this change, it will always return an **array** of variable objects, even for a single ID. Any existing agent prompts or workflows that rely on the flat-object shape will need to update.

## Proposed Changes

### 1. Multi-ID Support for `get_variables`

Change `variableId` from a single optional string to accept **either a single string or an array of strings**. The return shape is always an array regardless of how many IDs are provided.

| Call style | Behavior |
|---|---|
| No `variableId` | List all local collections & variables (unchanged) |
| `variableId` array (1 or more) | Return **array** of variable detail objects |

### 2. Variable Consumer Scanning

New optional `includeConsumers` parameter. Each variable in the returned array gets its own `consumers` array.

> [!IMPORTANT]
> `includeConsumers` is **only considered when one or more `variableId`s are provided**. In list-all mode (no `variableId`), the parameter is silently ignored.

| `includeConsumers` | Behavior (requires `variableId`) |
|---|---|
| *(omitted)* | No `consumers` field on each variable |
| `"current_page"` | Scan `figma.currentPage` only |
| `"document"` | Scan all pages (slow on large files) |

**Return shape** (single or multi-ID — always the same):

```json
[
  {
    "id": "VariableID:1:1",
    "name": "primary-color",
    "type": "COLOR",
    "consumers": [
      { "nodeId": "123:45", "nodeName": "Button", "nodeType": "FRAME", "fields": ["fills"] }
    ]
  },
  {
    "id": "VariableID:1:2",
    "name": "spacing-md",
    "type": "FLOAT",
    "consumers": []
  }
]
```

`consumers` is only present when `includeConsumers` is set.

### 3. Safe Variable Deletion via `delete_variables`

New tool that deletes variables or an entire variable collection. Accepts **either** `variableIds` (array) **or** `collectionId` (string) — mutually exclusive.

Before deleting, the plugin performs a **full-document consumer scan**. If **any** variable is still in use anywhere, the entire operation is rejected (all-or-nothing).

> [!CAUTION]
> This is a destructive operation. The all-or-nothing approach prevents partial deletions that could leave the document in an inconsistent state.

| Mode | Behavior |
|---|---|
| `variableIds` | Delete specific variables. Consumer check on the provided IDs. |
| `collectionId` | Resolve all variables in the collection. If the collection is empty or all its variables are unused, delete the collection (cascades). |

**On success:**
```json
{
  "success": true,
  "deleted": ["VariableID:1:1", "VariableID:1:2"],
  "deletedCollection": "VariableCollectionId:1:0"
}
```
`deletedCollection` is only present when `collectionId` was used.

**On failure** (one or more variables still in use):
```json
{
  "success": false,
  "error": "Cannot delete: 1 of 2 variables are still in use",
  "variablesInUse": {
    "VariableID:1:1": [
      { "nodeId": "123:45", "nodeName": "Button", "nodeType": "FRAME", "fields": ["fills"] }
    ]
  }
}
```

---

### MCP Server Tool Definition

#### [MODIFY] [variables.ts](file:///src/mcp_server/tools/variables.ts)

1. **Update `variableId` schema** to accept an array:

```typescript
variableId: z
    .array(z.string())
    .optional()
    .describe("Optional array of variable IDs to retrieve"),
```

2. **Add `includeConsumers` parameter**:

```typescript
includeConsumers: z
    .enum(["current_page", "document"])
    .optional()
    .describe("Only used when variableId is provided; ignored otherwise. 'current_page' scans the active page (fast). 'document' scans all pages (slow on large files)."),
```

3. **Update tool description**:

```diff
-"Get all local variables/collections or detailed info for a specific variable by ID"
+"Get all local variables/collections or detailed info for specific variable(s) by ID(s). When variableId is provided, optionally scan for consumer nodes via includeConsumers."
```

4. **Pass both params** through to `sendCommandToFigma`.

#### [NEW] `delete_variables` tool in [variables.ts](file:///src/mcp_server/tools/variables.ts)

```typescript
server.tool(
    "delete_variables",
    "Delete specific variables by ID or an entire variable collection. Provide either variableIds OR collectionId (not both). Performs a full-document consumer check first — if any variable is still in use, the entire operation is rejected.",
    {
        variableIds: z
            .array(z.string())
            .optional()
            .describe("Array of variable IDs to delete. Mutually exclusive with collectionId."),
        collectionId: z
            .string()
            .optional()
            .describe("ID of a variable collection to delete (all its variables must be unused). Mutually exclusive with variableIds."),
    },
    async ({ variableIds, collectionId }) => {
        const result = await sendCommandToFigma("delete_variables", { variableIds, collectionId });
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
);
```

---

### Plugin Handler

#### [MODIFY] [variableHandlers.ts](file:///figma_plugin/handlers/variableHandlers.ts)

**Changes to `getVariables`:**

1. **Look up each variable** in parallel.
2. **If `includeConsumers` is set**, do a **single tree walk** with a `Set` of all IDs, then distribute the matches back to each variable object.
3. **Always return an array** of variable detail objects.

```typescript
const { variableId, includeConsumers } = params || {};

if (variableId && variableId.length > 0) {
    // Look up each variable in parallel
    const variableDetails = (await Promise.all(variableId.map(async (id) => {
        const variable = await figma.variables.getVariableByIdAsync(id);
        if (!variable) return null;
        const collection = await figma.variables.getVariableCollectionByIdAsync(
            variable.variableCollectionId
        );
        return {
            id: variable.id,
            name: variable.name,
            key: variable.key,
            type: variable.resolvedType,
            description: variable.description,
            collectionId: variable.variableCollectionId,
            collectionName: collection ? collection.name : "Unknown",
            remote: variable.remote,
            scopes: variable.scopes,
            valuesByMode: variable.valuesByMode,
        };
    }))).filter(Boolean);

    // Consumer scanning — single walk, results grouped by variable ID
    if (includeConsumers) {
        const idSet = new Set(variableId);
        let consumerMap: Map<string, Array<{...}>>;

        if (includeConsumers === "current_page") {
            consumerMap = await findVariableConsumers(figma.currentPage, idSet);
        } else {
            consumerMap = new Map();
            for (const page of figma.root.children) {
                const pageResults = await findVariableConsumers(page, idSet);
                for (const [vid, entries] of pageResults) {
                    const existing = consumerMap.get(vid) || [];
                    consumerMap.set(vid, existing.concat(entries));
                }
            }
        }

        // Attach consumers to each variable
        for (const v of variableDetails) {
            v.consumers = consumerMap.get(v.id) || [];
        }
    }

    return variableDetails;
}

// List-all mode (unchanged)
// ...
```

**New `deleteVariables` handler** — all-or-nothing deletion with consumer pre-check:

```typescript
export async function deleteVariables(params: any) {
    const { variableIds, collectionId } = params || {};

    // Mutual exclusivity check
    if (variableIds && collectionId) {
        throw new Error("Provide either variableIds or collectionId, not both");
    }
    if (!variableIds && !collectionId) {
        throw new Error("Must provide either variableIds or collectionId");
    }

    let idsToCheck: string[];
    let collection: any = null;

    if (collectionId) {
        // Collection mode: resolve all variable IDs from the collection
        collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
        if (!collection) throw new Error(`Collection not found: ${collectionId}`);
        idsToCheck = collection.variableIds || [];

        // Empty collection — safe to delete immediately
        if (idsToCheck.length === 0) {
            collection.remove();
            return { success: true, deleted: [], deletedCollection: collectionId };
        }
    } else {
        // Variable IDs mode
        if (!Array.isArray(variableIds) || variableIds.length === 0) {
            throw new Error("variableIds must be a non-empty array");
        }
        idsToCheck = variableIds;
    }

    // Verify all variables exist
    const variables = await Promise.all(
        idsToCheck.map((id) => figma.variables.getVariableByIdAsync(id))
    );
    for (let i = 0; i < idsToCheck.length; i++) {
        if (!variables[i]) throw new Error(`Variable not found: ${idsToCheck[i]}`);
    }

    // Full-document consumer scan (single pass for all IDs)
    const idSet = new Set(idsToCheck);
    const consumerMap = new Map();
    for (const page of figma.root.children) {
        const pageResults = await findVariableConsumers(page, idSet);
        for (const [vid, entries] of pageResults) {
            const existing = consumerMap.get(vid) || [];
            consumerMap.set(vid, existing.concat(entries));
        }
    }

    // If any variable has consumers, reject the entire operation
    if (consumerMap.size > 0) {
        const variablesInUse: Record<string, any[]> = {};
        for (const [vid, entries] of consumerMap) {
            variablesInUse[vid] = entries;
        }
        const error = collectionId
            ? `Cannot delete collection: ${consumerMap.size} of ${idsToCheck.length} variable(s) in collection are still in use`
            : `Cannot delete: ${consumerMap.size} of ${idsToCheck.length} variable(s) are still in use`;
        return {
            success: false,
            error,
            variablesInUse,
        };
    }

    // Safe to delete
    if (collectionId) {
        // Deleting collection cascades to its variables
        collection.remove();
        return { success: true, deleted: idsToCheck, deletedCollection: collectionId };
    } else {
        for (const variable of variables) {
            variable.remove();
        }
        return { success: true, deleted: idsToCheck };
    }
}
```

#### [MODIFY] [main.ts](file:///figma_plugin/src/main.ts)

1. **Import** `deleteVariables` from `variableHandlers.js`.
2. **Add dispatch case** for `delete_variables`:

```typescript
case "delete_variables":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    return await deleteVariables(params);
```

No scope check needed — variables are document-global (same pattern as `manage_variables`).

**Updated `findVariableConsumers`** — returns a `Map<string, ConsumerEntry[]>` for easy distribution:

```typescript
/**
 * Single-pass tree walk that finds all nodes whose boundVariables
 * reference any variable in the provided set.
 * Returns results grouped by variable ID.
 */
async function findVariableConsumers(
    rootNode: BaseNode,
    variableIds: Set<string>
): Promise<Map<string, Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    fields: string[];
}>>> {
    const consumerMap = new Map<string, Array<{
        nodeId: string; nodeName: string; nodeType: string; fields: string[];
    }>>();

    async function walk(node: BaseNode) {
        const boundVars = (node as any).boundVariables;
        if (boundVars) {
            // Collect matches grouped by variableId
            const matchesByVarId = new Map<string, string[]>();

            for (const [field, binding] of Object.entries(boundVars)) {
                // Simple alias: { id, type }
                if (binding && (binding as any).id && variableIds.has((binding as any).id)) {
                    const vid = (binding as any).id;
                    if (!matchesByVarId.has(vid)) matchesByVarId.set(vid, []);
                    matchesByVarId.get(vid)!.push(field);
                }
                // Array of aliases (e.g. fills, strokes)
                if (Array.isArray(binding)) {
                    for (const item of binding) {
                        if (item && item.id && variableIds.has(item.id)) {
                            if (!matchesByVarId.has(item.id)) matchesByVarId.set(item.id, []);
                            matchesByVarId.get(item.id)!.push(field);
                            break;
                        }
                    }
                }
            }

            for (const [vid, fields] of matchesByVarId.entries()) {
                if (!consumerMap.has(vid)) consumerMap.set(vid, []);
                consumerMap.get(vid)!.push({
                    nodeId: node.id,
                    nodeName: node.name,
                    nodeType: node.type,
                    fields,
                });
            }
        }
        if ("children" in node) {
            for (const child of (node as any).children) {
                await walk(child);
            }
        }
    }

    await walk(rootNode);
    return consumerMap;
}
```

---

### Existing Tests

#### [MODIFY] [variables.test.ts](file:///src/mcp_server/tests/unit/tools/variables.test.ts)

Update existing single-ID test and add multi-ID test:

```typescript
it("get_variables should pass array variableId and includeConsumers to sendCommandToFigma", async () => {
    registerVariablesTools(mockServer as any);
    (sendCommandToFigma as any).mockResolvedValue([]);

    const params: any = {
        variableId: ["var-1", "var-2"],
        includeConsumers: "current_page",
    };
    await registeredTools["get_variables"](params);

    expect(sendCommandToFigma).toHaveBeenCalledWith("get_variables", params);
});

it("delete_variables should call sendCommandToFigma with variableIds", async () => {
    registerVariablesTools(mockServer as any);
    (sendCommandToFigma as any).mockResolvedValue({ success: true, deleted: ["var-1"] });

    const params: any = { variableIds: ["var-1"] };
    const result = await registeredTools["delete_variables"](params);

    expect(sendCommandToFigma).toHaveBeenCalledWith("delete_variables", params);
    expect(result.content[0].text).toContain('"success": true');
});
```

---

## Cleanup Items

1. ~~**Stale JSDoc**~~ — Already fixed (`SET_VALUE` → `UPDATE_VARIABLE`).

2. **Stale file-path comment** at line 1 of `variableHandlers.ts`:
   ```diff
   -// figma_plugin/handlers/variableHandlers.js
   +// figma_plugin/handlers/variableHandlers.ts
   ```

3. **Remove unused import** in `variableHandlers.ts`:
   ```diff
   -import { filterFigmaNode } from "../utils/nodeUtils.js";
   ```

---

## Verification Plan

### Automated Tests

```bash
cd src/mcp_server && bun test tests/unit/tools/variables.test.ts
```

### Build Verification

```bash
npm run build
```

### Manual Verification

> [!IMPORTANT]
> Consumer scanning and multi-ID lookup run inside the Figma plugin and cannot be unit-tested outside of Figma.

1. Build the plugin and load it in Figma.
2. Create a variable collection with 2+ variables, bind them to multiple nodes.
3. **List-all mode**: Call `get_variables` with no `variableId` → verify unchanged response shape.
4. **List-all + includeConsumers**: Call with no `variableId` + `includeConsumers: "current_page"` → verify no `consumers` fields (ignored).
5. **Single ID, no consumers**: Call with one `variableId` → verify **array** of one object, no `consumers` field.
6. **Single ID + consumers**: Call with one `variableId` + `includeConsumers: "current_page"` → verify `consumers` array on the variable object.
7. **Multi-ID + consumers**: Call with array of `variableId`s + `includeConsumers: "current_page"` → verify each variable object has its own `consumers`.
8. **Document scope**: Add bindings on a different page, call with `includeConsumers: "document"` → verify cross-page consumers appear.
9. **Page scope filter**: Call with `includeConsumers: "current_page"` → verify other-page consumers are excluded.

**`delete_variables` tests:**

10. **Delete unused variables**: Create variables with no bindings. Call `delete_variables` with their IDs → verify `success: true` and variables are gone.
11. **Delete in-use variable**: Bind a variable to a node. Call `delete_variables` with its ID → verify `success: false` with `variablesInUse` listing the consumer.
12. **All-or-nothing**: Request deletion of 2 variables where only 1 is in use → verify **neither** is deleted.
13. **Cross-page check**: Bind a variable only on a different page. Call `delete_variables` → verify it's still rejected.
14. **Read-only mode**: Connect in read-only mode. Call `delete_variables` → verify read-only error.
15. **Delete empty collection**: Create an empty collection. Call `delete_variables` with `collectionId` → verify `success: true` and `deletedCollection` is present.
16. **Delete collection with unused variables**: Create a collection with variables that have no bindings. Call `delete_variables` with `collectionId` → verify `success: true`.
17. **Delete collection with in-use variables**: Bind a variable from the collection. Call `delete_variables` with `collectionId` → verify `success: false` with `variablesInUse`.
18. **Mutual exclusivity**: Pass both `variableIds` and `collectionId` → verify error is thrown.
