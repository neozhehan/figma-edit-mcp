// figma_plugin/handlers/variableHandlers.ts
import { sendProgressUpdate } from '../utils/progressUtils.js';


export interface StyleConsumerEntry {
    styleId: string;
    styleName: string;
    styleType: 'PAINT' | 'TEXT' | 'EFFECT' | 'GRID';
    fields: string[];
}

export interface AliasConsumerEntry {
    variableId: string;
    variableName: string;
    variableType: string;
    modes: string[];
}

export async function findStyleConsumers(variableIds: Set<string>): Promise<Map<string, StyleConsumerEntry[]>> {
    const consumerMap = new Map<string, StyleConsumerEntry[]>();
    
    const [paintStyles, textStyles, effectStyles, gridStyles] = await Promise.all([
        figma.getLocalPaintStylesAsync(),
        figma.getLocalTextStylesAsync(),
        figma.getLocalEffectStylesAsync(),
        figma.getLocalGridStylesAsync()
    ]);
    
    function processStyles(styles: any[], type: 'PAINT' | 'TEXT' | 'EFFECT' | 'GRID') {
        for (const style of styles) {
            const boundVars = style.boundVariables;
            if (boundVars) {
                const matchesByVarId = new Map<string, string[]>();
                
                for (const [field, binding] of Object.entries(boundVars)) {
                    if (binding && (binding as any).id && variableIds.has((binding as any).id)) {
                        const vid = (binding as any).id;
                        if (!matchesByVarId.has(vid)) matchesByVarId.set(vid, []);
                        matchesByVarId.get(vid)!.push(field);
                    }
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
                        styleId: style.id,
                        styleName: style.name,
                        styleType: type,
                        fields
                    });
                }
            }
        }
    }

    processStyles(paintStyles, 'PAINT');
    processStyles(textStyles, 'TEXT');
    processStyles(effectStyles, 'EFFECT');
    processStyles(gridStyles, 'GRID');

    return consumerMap;
}

export async function findAliasConsumers(variableIds: Set<string>): Promise<Map<string, AliasConsumerEntry[]>> {
    const consumerMap = new Map<string, AliasConsumerEntry[]>();
    const variables = await figma.variables.getLocalVariablesAsync();
    
    for (const variable of variables) {
        const matchesByVarId = new Map<string, string[]>();
        
        for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
            if (value && typeof value === 'object' && (value as any).type === 'VARIABLE_ALIAS') {
                const targetId = (value as any).id;
                if (variableIds.has(targetId)) {
                    if (!matchesByVarId.has(targetId)) matchesByVarId.set(targetId, []);
                    matchesByVarId.get(targetId)!.push(modeId);
                }
            }
        }
        
        for (const [targetId, modes] of matchesByVarId.entries()) {
            if (!consumerMap.has(targetId)) consumerMap.set(targetId, []);
            consumerMap.get(targetId)!.push({
                variableId: variable.id,
                variableName: variable.name,
                variableType: variable.resolvedType,
                modes
            });
        }
    }
    
    return consumerMap;
}

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
    
    let walkCount = 0;

    async function walk(node: BaseNode) {
        if (++walkCount % 500 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
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
        if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
            const defs = (node as any).componentPropertyDefinitions;
            if (defs) {
                const matchesByVarId = new Map<string, string[]>();
                for (const [propName, def] of Object.entries(defs)) {
                    const boundVars = (def as any).boundVariables;
                    if (boundVars) {
                        for (const [field, binding] of Object.entries(boundVars)) {
                            if (binding && (binding as any).id && variableIds.has((binding as any).id)) {
                                const vid = (binding as any).id;
                                if (!matchesByVarId.has(vid)) matchesByVarId.set(vid, []);
                                matchesByVarId.get(vid)!.push(`componentProperty:${propName}`);
                            }
                            if (Array.isArray(binding)) {
                                for (const item of binding) {
                                    if (item && item.id && variableIds.has(item.id)) {
                                        if (!matchesByVarId.has(item.id)) matchesByVarId.set(item.id, []);
                                        matchesByVarId.get(item.id)!.push(`componentProperty:${propName}`);
                                        break;
                                    }
                                }
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
        }
        
        if (node.type === 'INSTANCE') {
            const props = (node as any).componentProperties;
            if (props) {
                const matchesByVarId = new Map<string, string[]>();
                for (const [propName, propVal] of Object.entries(props)) {
                    const boundVars = (propVal as any).boundVariables;
                    if (boundVars) {
                        for (const [field, binding] of Object.entries(boundVars)) {
                            if (binding && (binding as any).id && variableIds.has((binding as any).id)) {
                                const vid = (binding as any).id;
                                if (!matchesByVarId.has(vid)) matchesByVarId.set(vid, []);
                                matchesByVarId.get(vid)!.push(`componentProperty:${propName}`);
                            }
                            if (Array.isArray(binding)) {
                                for (const item of binding) {
                                    if (item && item.id && variableIds.has(item.id)) {
                                        if (!matchesByVarId.has(item.id)) matchesByVarId.set(item.id, []);
                                        matchesByVarId.get(item.id)!.push(`componentProperty:${propName}`);
                                        break;
                                    }
                                }
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
        }

        if ("reactions" in node) {
            const reactions = (node as any).reactions;
            if (Array.isArray(reactions)) {
                const matchesByVarId = new Map<string, string[]>();

                function walkExpression(expr: any) {
                    if (!expr) return;
                    if (expr.type === 'VARIABLE_ALIAS' && expr.id && variableIds.has(expr.id)) {
                        if (!matchesByVarId.has(expr.id)) matchesByVarId.set(expr.id, []);
                        matchesByVarId.get(expr.id)!.push('reactions:expression');
                    }
                    if (expr.type === 'EXPRESSION' && Array.isArray(expr.expressionArguments)) {
                        for (const arg of expr.expressionArguments) {
                            walkExpression(arg);
                        }
                    }
                }

                function walkAction(action: any) {
                    if (!action) return;
                    if (action.type === 'SET_VARIABLE') {
                        if (action.variableId && variableIds.has(action.variableId)) {
                            if (!matchesByVarId.has(action.variableId)) matchesByVarId.set(action.variableId, []);
                            matchesByVarId.get(action.variableId)!.push('reactions:SET_VARIABLE');
                        }
                        if (action.variableValue) {
                            if (action.variableValue.type === 'VARIABLE_ALIAS' && action.variableValue.id && variableIds.has(action.variableValue.id)) {
                                if (!matchesByVarId.has(action.variableValue.id)) matchesByVarId.set(action.variableValue.id, []);
                                matchesByVarId.get(action.variableValue.id)!.push('reactions:SET_VARIABLE:value');
                            } else if (action.variableValue.type === 'EXPRESSION') {
                                walkExpression(action.variableValue);
                            }
                        }
                    } else if (action.type === 'CONDITIONAL' && Array.isArray(action.conditionalBlocks)) {
                        for (const block of action.conditionalBlocks) {
                            if (block.condition) {
                                if (block.condition.type === 'VARIABLE_ALIAS' && block.condition.id && variableIds.has(block.condition.id)) {
                                    if (!matchesByVarId.has(block.condition.id)) matchesByVarId.set(block.condition.id, []);
                                    matchesByVarId.get(block.condition.id)!.push('reactions:CONDITIONAL:condition');
                                } else if (block.condition.type === 'EXPRESSION') {
                                    walkExpression(block.condition);
                                }
                            }
                            if (Array.isArray(block.actions)) {
                                for (const a of block.actions) {
                                    walkAction(a);
                                }
                            }
                        }
                    }
                }

                for (const reaction of reactions) {
                    if (reaction.action) {
                        walkAction(reaction.action);
                    }
                    if (Array.isArray(reaction.actions)) {
                        for (const a of reaction.actions) {
                            walkAction(a);
                        }
                    }
                }

                for (const [vid, fields] of matchesByVarId.entries()) {
                    if (!consumerMap.has(vid)) consumerMap.set(vid, []);
                    consumerMap.get(vid)!.push({
                        nodeId: node.id,
                        nodeName: node.name,
                        nodeType: node.type,
                        fields: [...new Set(fields)],
                    });
                }
            }
        }

        if (node.type === 'PAGE') {
            await node.loadAsync();
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
    const { variableId, includeConsumers, pageId, commandId } = params || {};

    try {
        // 1. Lookup Mode
        if (variableId && variableId.length > 0) {
            const variables: any[] = [];
            const idSet = new Set(variableId as string[]);
            // Per spec §get_variables rule 2: only includeConsumers: 'document'
            // streams. Lookup mode (no includeConsumers) and current_page mode
            // are O(1) in page count — no bookends, no yield.
            const isStreaming = includeConsumers === 'document';

            if (commandId && isStreaming) {
                await sendProgressUpdate(
                    commandId,
                    'get_variables',
                    'started',
                    0,
                    variableId.length,
                    0,
                    `Fetching details for ${variableId.length} variables`
                );
            }

            for (const [index, id] of (variableId as string[]).entries()) {
                const variable = await figma.variables.getVariableByIdAsync(id);
                if (!variable) continue;
                
                const collection = await figma.variables.getVariableCollectionByIdAsync(
                    variable.variableCollectionId
                );
                
                variables.push({
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
                });
            }

            // Consumer scanning
            if (includeConsumers) {
                const stylePromise = findStyleConsumers(idSet);
                const aliasPromise = findAliasConsumers(idSet);
                
                let nodeConsumerMap = new Map<string, any[]>();
                
                if (includeConsumers === 'page') {
                    if (!pageId) {
                        throw new Error("pageId is required when includeConsumers is 'page'");
                    }
                    const pageNode = await figma.getNodeByIdAsync(pageId);
                    if (!pageNode) {
                        throw new Error(`pageId with ID ${pageId} not found`);
                    }
                    if (pageNode.type !== 'PAGE') {
                        throw new Error("pageId does not resolve to a PAGE");
                    }
                    nodeConsumerMap = await findVariableConsumers(pageNode, idSet);
                } else {
                    // includeConsumers === 'document'
                    const pages = figma.root.children;
                    for (const [index, page] of pages.entries()) {
                        const pageConsumers = await findVariableConsumers(page, idSet);
                        for (const [vid, entries] of pageConsumers) {
                            const existing = nodeConsumerMap.get(vid) || [];
                            nodeConsumerMap.set(vid, existing.concat(entries));
                        }
                        
                        if (commandId) {
                            await sendProgressUpdate(
                                commandId, 
                                'get_variables', 
                                'in_progress', 
                                Math.round(((index + 1) / pages.length) * 100), 
                                pages.length, 
                                index + 1, 
                                `Scanning page ${index + 1}/${pages.length} for consumers: ${page.name}`
                            );
                        }
                    }
                }

                const styleConsumerMap = await stylePromise;
                const aliasConsumerMap = await aliasPromise;

                for (const v of variables) {
                    v.nodeConsumers = nodeConsumerMap.get(v.id) || [];
                    v.styleConsumers = styleConsumerMap.get(v.id) || [];
                    v.aliasConsumers = aliasConsumerMap.get(v.id) || [];
                }
            }

            if (commandId && isStreaming) {
                await sendProgressUpdate(
                    commandId,
                    'get_variables',
                    'completed',
                    100,
                    1,
                    1,
                    `Completed fetching variable information`
                );
            }
            return variables;
        }

        // 2. List All Mode (Discovery)
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const variables = await figma.variables.getLocalVariablesAsync();

        return {
            collections: collections.map((c: any) => ({
                id: c.id,
                name: c.name,
                key: c.key,
                modes: c.modes,
                defaultModeId: c.defaultModeId,
                remote: c.remote,
                variableIds: c.variableIds,
            })),
            variables: variables.map((v: any) => ({
                id: v.id,
                name: v.name,
                key: v.key,
                type: v.resolvedType,
                collectionId: v.variableCollectionId,
                valuesByMode: v.valuesByMode,
                description: v.description,
            })),
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
    
    // Concurrent scanning
    const stylePromise = findStyleConsumers(idSet);
    const aliasPromise = findAliasConsumers(idSet);
    const styleConsumerMap = await stylePromise;
    const _aliasConsumerMap = await aliasPromise;
    
    const _nodeMaps: any[] = [];
    for (const page of figma.root.children) {
        _nodeMaps.push(await findVariableConsumers(page, idSet));
    }

    const nodeConsumerMap = new Map<string, any[]>();
    for (const pageResults of _nodeMaps) {
        for (const [vid, entries] of pageResults) {
            const existing = nodeConsumerMap.get(vid) || [];
            nodeConsumerMap.set(vid, existing.concat(entries));
        }
    }
    
    // Filter out intra-collection alias consumers when deleting by collectionId
    let aliasConsumerMap = _aliasConsumerMap;
    if (collectionId) {
        aliasConsumerMap = new Map();
        for (const [targetVid, consumers] of _aliasConsumerMap) {
            // Filter out alias consumers whose variableId is inside the set of IDs we are deleting
            const filteredConsumers = consumers.filter(c => !idSet.has(c.variableId));
            if (filteredConsumers.length > 0) {
                aliasConsumerMap.set(targetVid, filteredConsumers);
            }
        }
    }
    
    let hasConsumers = false;
    for (const vid of idsToCheck) {
        if ((nodeConsumerMap.get(vid) || []).length > 0 ||
            (styleConsumerMap.get(vid) || []).length > 0 ||
            (aliasConsumerMap.get(vid) || []).length > 0) {
            hasConsumers = true;
            break;
        }
    }

    if (hasConsumers) {
        const variablesInUse: Record<string, any> = {};
        for (const vid of idsToCheck) {
            const nodeConsumers = nodeConsumerMap.get(vid) || [];
            const styleConsumers = styleConsumerMap.get(vid) || [];
            const aliasConsumers = aliasConsumerMap.get(vid) || [];
            
            if (nodeConsumers.length > 0 || styleConsumers.length > 0 || aliasConsumers.length > 0) {
                variablesInUse[vid] = {
                    nodeConsumers,
                    styleConsumers,
                    aliasConsumers
                };
            }
        }
        
        let errorMsg = collectionId
            ? `Cannot delete collection: variable(s) in collection are still in use.\n`
            : `Cannot delete: variable(s) are still in use.\n`;
            
        // Build readable descriptions
        for (const [vid, consumers] of Object.entries(variablesInUse)) {
            const varName = variables.find(v => v && v.id === vid)?.name || vid;
            errorMsg += `- Variable '${varName}' is used by:\n`;
            
            for (const n of consumers.nodeConsumers) {
                errorMsg += `  - Node '${n.nodeName}' (${n.nodeType}) on fields: ${n.fields.join(", ")}\n`;
            }
            for (const s of consumers.styleConsumers) {
                const styleTypeName = s.styleType === 'PAINT' ? 'Paint' : s.styleType === 'TEXT' ? 'Text' : s.styleType === 'EFFECT' ? 'Effect' : s.styleType === 'GRID' ? 'Grid' : 'Style';
                errorMsg += `  - ${styleTypeName} style '${s.styleName}' on fields: ${s.fields.join(", ")}\n`;
            }
            for (const a of consumers.aliasConsumers) {
                errorMsg += `  - Aliased by variable '${a.variableName}' in modes: ${a.modes.join(", ")}\n`;
            }
        }

        return {
            success: false,
            error: errorMsg.trim(),
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
