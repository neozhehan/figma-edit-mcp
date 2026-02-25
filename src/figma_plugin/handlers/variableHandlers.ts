// src/figma_plugin/handlers/variableHandlers.ts

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

export async function getVariables(params: any) {
    const { variableId, includeConsumers } = params || {};

    try {
        // Lookup Mode (if variableId array is provided)
        if (variableId && variableId.length > 0) {
            // Look up each variable in parallel
            const variableDetails: any[] = (await Promise.all(variableId.map(async (id: string) => {
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
                const idSet = new Set(variableId as string[]);
                let consumerMap: Map<string, Array<{ nodeId: string; nodeName: string; nodeType: string; fields: string[] }>>;

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

        // List All Mode (Discovery)
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const variables = await figma.variables.getLocalVariablesAsync();

        // Transform Collections
        const mappedCollections = collections.map((c: any) => ({
            id: c.id,
            name: c.name,
            key: c.key,
            modes: c.modes, // [{ modeId, name }, ...]
            defaultModeId: c.defaultModeId,
            remote: c.remote,
            variableIds: c.variableIds,
        }));

        // Transform Variables
        const mappedVariables = variables.map((v: any) => ({
            id: v.id,
            name: v.name,
            key: v.key,
            type: v.resolvedType,
            collectionId: v.variableCollectionId,
            valuesByMode: v.valuesByMode,
            description: v.description,
        }));

        return {
            collections: mappedCollections,
            variables: mappedVariables,
        };
    } catch (err: any) {
        throw new Error(`Error getting variables: ${err.message}`);
    }
}

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
        idsToCheck.map((id: string) => figma.variables.getVariableByIdAsync(id))
    );
    for (let i = 0; i < idsToCheck.length; i++) {
        if (!variables[i]) throw new Error(`Variable not found: ${idsToCheck[i]}`);
    }

    // Full-document consumer scan (single pass for all IDs)
    const idSet = new Set(idsToCheck);
    const consumerMap = new Map<string, any[]>();
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
            (variable as any).remove();
        }
        return { success: true, deleted: idsToCheck };
    }
}

export async function getNodeVariables(params: any) {
    const { nodeId } = params || {};
    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    // 1. Get Bound Variables (individual properties)
    // @ts-ignore
    const boundVariables = node.boundVariables || {};

    // 2. Get Explicit Variable Modes (theme settings)
    // @ts-ignore
    const explicitVariableModes = node.explicitVariableModes || {};

    // Resolve mode names (optional, but helpful)
    const resolvedModes: any = {};
    if (Object.keys(explicitVariableModes).length > 0) {
        try {
            const collections = await Promise.all(
                Object.keys(explicitVariableModes).map((id: any) => figma.variables.getVariableCollectionByIdAsync(id))
            );

            collections.forEach((collection: any) => {
                if (collection) {
                    const modeId = explicitVariableModes[collection.id];
                    const mode = collection.modes.find((m: any) => m.modeId === modeId);
                    resolvedModes[collection.id] = {
                        collectionName: collection.name,
                        modeId: modeId,
                        modeName: mode ? mode.name : "Unknown Mode"
                    }
                }
            })
        } catch (e: any) {
            // ignore resolution errors
        }
    }

    // 3. Helper to look up variable details for bound variables
    const resolvedBindings: any = {};
    for (const [field, alias] of Object.entries(boundVariables)) {
        // boundVariables can be nested (e.g. for fills/strokes/componentProperties)
        // or simple Alias (id, type)
        // Simple handling for now: if it has an id, try to resolve name
        // @ts-ignore
        if (alias && alias.id) {
            try {
                // @ts-ignore
                const v = await figma.variables.getVariableByIdAsync(alias.id);
                resolvedBindings[field] = {
                    // @ts-ignore
                    variableId: alias.id,
                    variableName: v ? v.name : "Unknown Variable"
                }
            } catch (e: any) {
                resolvedBindings[field] = alias;
            }
        } else {
            // complex bindings (arrays etc) - keep raw
            resolvedBindings[field] = alias;
        }
    }

    return {
        nodeId: node.id,
        name: node.name,
        boundVariables: resolvedBindings, // enriched with names where possible
        rawBoundVariables: boundVariables, // raw data
        explicitVariableModes,
        resolvedExplicitModes: resolvedModes
    };
}

export async function setBoundVariable(params: any) {
    const { nodeId, field, variableId, collectionId, modeId } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    // Case A: Set Explicit Mode (Theming)
    if (collectionId !== undefined) {
        if (modeId === undefined) {
            throw new Error("Missing modeId when setting collection mode");
        }
        try {
            // If modeId is null/empty string, we clear the mode?
            // Plugin API: setExplicitVariableModeForCollection(collectionId, modeId)
            // To clear, we usually don't have a clear method, but passing invalid mode might throw.
            // Let's assume user sends valid modeId.
            // @ts-ignore
            await node.setExplicitVariableModeForCollection(collectionId, modeId);
            return { success: true, message: `Set mode ${modeId} for collection ${collectionId}` };
        } catch (e: any) {
            throw new Error(`Failed to set explicit variable mode: ${e.message}`);
        }
    }

    // Case B: Set Bound Variable (Property)
    if (field) {
        try {
            let variable = null;
            if (variableId) {
                variable = await figma.variables.getVariableByIdAsync(variableId);
                if (!variable) throw new Error(`Variable ${variableId} not found`);
            }

            // Special handling for fills and strokes (paints)
            if (field === 'fills' || field === 'strokes') {
                // @ts-ignore
                const paints = JSON.parse(JSON.stringify(node[field]));
                let modified = false;
                for (let i = 0; i < paints.length; i++) {
                    if (paints[i].type === 'SOLID') {
                        paints[i] = figma.variables.setBoundVariableForPaint(paints[i], 'color', variable);
                        modified = true;
                    }
                }

                if (modified) {
                    // @ts-ignore
                    node[field] = paints;
                    const action = variable ? `Bound ${field} to variable ${variable.name}` : `Unbound variable from ${field}`;
                    return { success: true, message: action };
                }
                return { success: false, message: `No SOLID paints found in ${field} to bind variable` };
            }

            // Standard properties
            // @ts-ignore
            node.setBoundVariable(field, variable);
            const action = variable ? `Bound ${field} to variable ${variable.name}` : `Unbound variable from ${field}`;
            return { success: true, message: action };

        } catch (e: any) {
            throw new Error(`Failed to set bound variable: ${e.message}`);
        }
    }

    throw new Error("Must provide either (field + variableId) or (collectionId + modeId)");
}

/**
 * Handles comprehensive variable management.
 *
 * @param {Object} params - Parameters object
 * @param {'CREATE_COLLECTION' | 'CREATE_VARIABLE' | 'UPDATE_VARIABLE'} params.action - Action type
 *
 * CREATE_COLLECTION params:
 * @param {string} params.name - Name for the new collection (required)
 * @param {string} [params.modeName] - Optional name to assign to the default mode
 *
 * CREATE_VARIABLE params:
 * @param {string} params.collectionId - ID of the collection to add the variable to (required)
 * @param {string} params.name - Name for the new variable (required)
 * @param {'FLOAT' | 'COLOR' | 'STRING' | 'BOOLEAN'} params.type - Variable type (required)
 * @param {*} [params.value] - Optional initial value (set on the default mode)
 *
 * UPDATE_VARIABLE params:
 * @param {string} params.variableId - ID of the variable to update (required)
 * @param {string} [params.currentVariableName] - Current name for verification
 * @param {string} [params.name] - New name for the variable
 * @param {string} [params.description] - New description for the variable
 * @param {*} [params.value] - New value to set (requires modeId)
 * @param {string} [params.modeId] - Mode ID to set the value for (required when value is provided)
 *
 * @returns {Promise<Object>} Result of the operation
 */
export async function handleVariableRequest(params: any) {
    const { action } = params || {};

    if (!action) {
        throw new Error("Missing action parameter");
    }

    switch (action) {
        case 'CREATE_COLLECTION': {
            const { name, modeName } = params;
            if (!name) throw new Error("Missing name for collection");

            const collection = figma.variables.createVariableCollection(name);
            if (modeName) {
                collection.renameMode(collection.modes[0].modeId, modeName);
            }

            return {
                id: collection.id,
                name: collection.name,
                defaultModeId: collection.defaultModeId,
                modes: collection.modes
            };
        }

        case 'CREATE_VARIABLE': {
            const { collectionId, name, type, value } = params;
            if (!collectionId || !name || !type) throw new Error("Missing required parameters for variable creation");

            // Resolve resolvedType string to VariableResolvedType
            // 'FLOAT', 'COLOR', 'STRING', 'BOOLEAN'
            let resolvedType;
            if (type === 'FLOAT') resolvedType = "FLOAT";
            else if (type === 'COLOR') resolvedType = "COLOR";
            else if (type === 'STRING') resolvedType = "STRING";
            else if (type === 'BOOLEAN') resolvedType = "BOOLEAN";
            else throw new Error(`Invalid variable type: ${type}`);

            // Fetch the collection first
            const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
            if (!collection) {
                throw new Error(`Collection not found: ${collectionId}`);
            }

            // Using collection object for createVariable as requested by error message
            // @ts-ignore
            const variable = figma.variables.createVariable(name, collection, resolvedType);

            // Set initial value if provided (for default mode)
            if (value !== undefined) {
                const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
                // @ts-ignore
                const defaultModeId = collection.defaultModeId;

                // Value parsing for color
                let parsedValue = value;
                if (resolvedType === 'COLOR' && typeof value === 'object') {
                    // Expect {r, g, b, a} 0-1
                    parsedValue = {
                        r: value.r || 0,
                        g: value.g || 0,
                        b: value.b || 0,
                    };
                    // Alpha is invalid for setValueForMode? documentation says RGBA or RGB
                    // Actually setValueForMode takes R, G, B, A in 0-1 range. But verify API.
                    parsedValue = {
                        r: value.r || 0,
                        g: value.g || 0,
                        b: value.b || 0,
                        a: value.a !== undefined ? value.a : 1
                    };
                }

                variable.setValueForMode(defaultModeId, parsedValue);
            }

            return {
                id: variable.id,
                name: variable.name,
                key: variable.key,
                type: variable.resolvedType
            };
        }

        case 'UPDATE_VARIABLE': {
            const { variableId, name, value, modeId, description, currentVariableName } = params;
            if (!variableId) throw new Error("Missing variableId for update");

            const variable = await figma.variables.getVariableByIdAsync(variableId);
            if (!variable) throw new Error(`Variable ${variableId} not found`);

            if (currentVariableName && variable.name !== currentVariableName) {
                throw new Error(`Variable name verification failed. Expected "${variable.name}", got "${currentVariableName}"`);
            }

            if (name) {
                variable.name = name;
            }

            if (description !== undefined) {
                variable.description = description;
            }

            if (value !== undefined) {
                if (!modeId) throw new Error("Missing modeId for setting variable value");

                // Handle Aliases
                if (typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
                    variable.setValueForMode(modeId, {
                        type: 'VARIABLE_ALIAS',
                        id: value.id
                    });
                } else {
                    variable.setValueForMode(modeId, value);
                }
            }

            return {
                success: true,
                id: variable.id,
                name: variable.name,
                key: variable.key,
                type: variable.resolvedType,
                description: variable.description,
                updatedValue: value !== undefined
            };
        }

        default:
            throw new Error(`Unknown variable action: ${action}`);
    }
}
