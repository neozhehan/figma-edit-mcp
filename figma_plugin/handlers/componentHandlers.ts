/**
 * Component handlers for Figma plugin
 * Handles component-related operations including styles, instances, and overrides
 */

import { customBase64Encode, bytesToUtf8 } from '../utils/exportUtils.js';

/**
 * Gets all local styles from the document
 * @returns {Promise<Object>} Object containing colors, texts, effects, and grids styles
 */
export async function getStyles() {
    const styles: any = {
        colors: await figma.getLocalPaintStylesAsync(),
        texts: await figma.getLocalTextStylesAsync(),
        effects: await figma.getLocalEffectStylesAsync(),
        grids: await figma.getLocalGridStylesAsync(),
    };

    return {
        colors: styles.colors.map((style: any) => ({
            id: style.id,
            name: style.name,
            key: style.key,
            paint: style.paints[0],
        })),
        texts: styles.texts.map((style: any) => ({
            id: style.id,
            name: style.name,
            key: style.key,
            fontSize: style.fontSize,
            fontName: style.fontName,
        })),
        effects: styles.effects.map((style: any) => ({
            id: style.id,
            name: style.name,
            key: style.key,
        })),
        grids: styles.grids.map((style: any) => ({
            id: style.id,
            name: style.name,
            key: style.key,
        })),
    };
}

/**
 * Gets components from the document with optional filtering.
 * Optimised to avoid heavy loadAllPagesAsync() by iterating page-by-page.
 * @param {Object} params - Parameters object
 * @param {string} params.filter - 'local' or 'remote' (undefined = all)
 * @param {string} params.scope - 'page' or 'document' (default); 'page' requires pageId
 * @param {string} params.pageId - Required when scope is 'page'; the page to scan
 * @param {string} params.commandId - Optional command ID for progress updates
 * @returns {Promise<Object>} Object containing component count and list
 */
export async function getComponents(params: any) {
    const { filter, scope = 'document', pageId, commandId } = params || {};
    // Per spec §get_components rule 2: only the 'document' scope streams.
    // 'page' is a single-pass non-streaming call — no bookends, no yield.
    const isStreaming = scope === 'document';

    // 1. Started event (document scope only)
    if (commandId && isStreaming) {
        await sendProgressUpdate(
            commandId,
            'get_components',
            'started',
            0,
            0,
            0,
            `Starting get_components in ${scope} scope`
        );
    }

    const allComponents: any[] = [];
    
    if (scope === 'page') {
        if (!pageId) {
            throw new Error("pageId is required when scope is 'page'");
        }
        const pageNode = await figma.getNodeByIdAsync(pageId);
        if (!pageNode) {
            throw new Error(`pageId with ID ${pageId} not found`);
        }
        if (pageNode.type !== 'PAGE') {
            throw new Error("pageId does not resolve to a PAGE");
        }
        // dynamic-page documents require explicit loading before findAllWithCriteria
        await pageNode.loadAsync();
        const components = pageNode.findAllWithCriteria({
            types: ["COMPONENT", "COMPONENT_SET"]
        });
        allComponents.push(...components);
    } else {
        // scope === 'document'
        // MANDATORY: Do NOT use loadAllPagesAsync(). Iterate pages instead.
        const pages = figma.root.children;
        for (const [index, page] of pages.entries()) {
            // dynamic-page documents require explicit loading before findAllWithCriteria
            await page.loadAsync();
            const components = page.findAllWithCriteria({
                types: ["COMPONENT", "COMPONENT_SET"]
            });
            allComponents.push(...components);

            if (commandId) {
                await sendProgressUpdate(
                    commandId, 
                    'get_components', 
                    'in_progress', 
                    Math.round(((index + 1) / pages.length) * 100), 
                    pages.length, 
                    index + 1, 
                    `Searching page ${index + 1}/${pages.length}: ${page.name}`
                );
            }
        }
    }

    // 2. Filter logic
    let filtered = allComponents;
    if (filter === 'local') {
        filtered = allComponents.filter((c: any) => !c.remote);
    } else if (filter === 'remote') {
        filtered = allComponents.filter((c: any) => c.remote);
    }

    // 3. Mapping
    const mapped = filtered.map((component: any) => ({
        id: component.id,
        name: component.name,
        key: component.key,
        remote: component.remote,
        type: component.type,
        pageId: getContainingPageId(component)
    }));

    if (commandId && isStreaming) {
        await sendProgressUpdate(
            commandId,
            'get_components',
            'completed',
            100,
            1,
            1,
            `Found ${mapped.length} components/sets`
        );
    }

    return {
        count: mapped.length,
        scope,
        components: mapped
    };
}

import { getContainingPageNode, isAncestorOf, assertNotLocked, assertNotInstanceInterior, assertNotInstanceParent } from '../utils/nodeUtils.js';
import { ERRORS, REFUSALS, formatScopeError } from '../utils/errors.js';
import { batchEnvelope } from '../utils/batchResult.js';
import { resolveAppendableParent } from './nodeCreators.js';

function getContainingPageId(node: BaseNode): string {
    return getContainingPageNode(node)?.id ?? 'unknown';
}

import { sendProgressUpdate } from '../utils/progressUtils.js';




/**
 * Creates an instance of a component
 * @param {Object} params - Parameters object
 * @param {string} params.componentKey - Key of the component to instantiate (for remote/library components)
 * @param {string} params.componentId - Node ID of the component (for local components, preferred over componentKey)
 * @param {number} params.x - X position
 * @param {number} params.y - Y position
 * @param {string} params.parentId - Optional parent node ID to place the instance into
 * @returns {Promise<Object>} Created instance info
 */
async function validateComponentPropertyValue(
    node: any,
    propertyName: string,
    propertyType: string,
    value: any
): Promise<any> {
    if (propertyType === "BOOLEAN") {
        if (typeof value === "string") {
            const lower = value.toLowerCase();
            if (lower === "true") return true;
            if (lower === "false") return false;
        }
        if (typeof value === "boolean") return value;
        throw new Error(`Operation Denied: BOOLEAN property '${propertyName}' requires true or false.`);
    }
    if (propertyType === "TEXT") {
        if (typeof value !== "string") throw new Error(`Operation Denied: TEXT property '${propertyName}' requires a string.`);
        return value;
    }
    if (propertyType === "VARIANT") {
        let componentSet = null;
        if (node.type === "INSTANCE") {
            const mainComponent = await node.getMainComponentAsync();
            if (mainComponent && mainComponent.parent && mainComponent.parent.type === "COMPONENT_SET") {
                componentSet = mainComponent.parent;
            }
        } else if (node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET") {
            componentSet = node.parent;
        } else if (node.type === "COMPONENT_SET") {
            componentSet = node;
        }
        if (componentSet) {
            const options = componentSet.variantGroupProperties[propertyName]?.values;
            if (options && !options.includes(String(value))) {
                throw new Error(`Operation Denied: '${value}' is not a valid value for variant property '${propertyName}'. Valid values: ${options.join(', ')}.`);
            }
        }
        return value;
    }
    if (propertyType === "INSTANCE_SWAP") {
        if (typeof value !== "string" || value.trim() === "") {
            throw new Error(`Operation Denied: INSTANCE_SWAP property '${propertyName}' requires a non-empty string.`);
        }
        let target = null;
        try {
            target = await figma.getNodeByIdAsync(value);
        } catch {
            // Unresolvable IDs (e.g. library component keys or malformed IDs) are passed through 
            // as 'plausible refs' so we don't block valid remote component swaps if we can't fetch them.
        }
        if (target && target.type !== "COMPONENT" && target.type !== "COMPONENT_SET") {
            throw new Error(`Operation Denied: INSTANCE_SWAP value must refer to a component, got ${target.type}`);
        }
        return value;
    }
    return value;
}

// Exported to allow tests to override and avoid waiting a real 15s.
// Couples with the 30s client timeoutMs; must be strictly less to prevent wedging the serialized command queue.
export let IMPORT_TIMEOUT_MS = 15000;
export function setImportTimeoutMs(ms: number) {
    IMPORT_TIMEOUT_MS = ms;
}

export async function createComponentInstance(params: any) {
    const { componentId, x = 0, y = 0, parentId, componentKey } = params || {};

    const parentNode = await resolveAppendableParent(parentId, "create_instance");

    if (!componentId && !componentKey) {
        throw new Error("create_instance: missing componentId or componentKey parameter.");
    }

    let component: ComponentNode;
    if (componentId) {
        const node = await figma.getNodeByIdAsync(componentId);
        if (!node) {
            throw new Error(`create_instance: component node not found with ID: ${componentId}.`);
        }
        if (node.type === "COMPONENT_SET") {
            const defaultVariant = (node as any).defaultVariant;
            throw new Error(`create_instance: '${node.name}' is a COMPONENT_SET; pass one of its variant COMPONENTs — e.g. its default variant '${defaultVariant.name}' (${defaultVariant.id}).`);
        }
        if (node.type !== "COMPONENT") {
            throw new Error(`create_instance: '${node.name}' (${componentId}) is not a COMPONENT (got ${node.type}).`);
        }
        component = node as ComponentNode;
    } else {
        // Bound importComponentByKeyAsync with a race against IMPORT_TIMEOUT_MS so an
        // unresolvable key can't wedge the serialized command queue. If the timeout wins,
        // Promise.race keeps a reaction on importPromise, so its later settlement is not an
        // unhandled rejection. clearTimeout cancels the pending timer when the import wins.
        let timeoutId: any;
        try {
            const importPromise = figma.importComponentByKeyAsync(componentKey);
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`import timed out after ${IMPORT_TIMEOUT_MS}ms`));
                }, IMPORT_TIMEOUT_MS);
            });
            component = await Promise.race([importPromise, timeoutPromise]);
        } catch (error: any) {
            const raw = error?.message || String(error);
            throw new Error(`create_instance: failed to import remote component with key '${componentKey}': ${raw}. Read the key from an existing instance's mainComponent (component_list does not list remote library keys); confirm the source library is enabled for this file; a component-set key needs a variant's key.`);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    const instance = component.createInstance();
    try {
        parentNode.appendChild(instance);

        instance.x = x;
        instance.y = y;

        return {
            id: instance.id,
            name: instance.name,
            x: instance.x,
            y: instance.y,
            width: instance.width,
            height: instance.height,
            // @ts-expect-error TS2339: Property 'componentId' does not exist on type 'InstanceNode'.
            componentId: instance.componentId,
        };
    } catch (error) {
        if (instance && typeof instance.remove === "function" && (instance as any).removed !== true) {
            instance.remove();
        }
        throw error;
    }
}

/**
 * Exports a node as an image
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the node to export
 * @param {number} params.scale - Export scale (default: 1)
 * @returns {Promise<Object>} Exported image data
 */
export async function exportNodeAsImage(params: any) {
    const { nodeId, scale = 1 } = params || {};
    const format = params?.format ? String(params.format).toUpperCase() : "PNG";

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }
    if (!["PNG", "JPG", "SVG", "PDF"].includes(format)) {
        throw new Error(`Unsupported export format: ${format}. Use PNG, JPG, SVG, or PDF.`);
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (!("exportAsync" in node)) {
        throw new Error(`Node does not support exporting: ${nodeId}`);
    }

    try {
        // The SCALE constraint only applies to raster formats; SVG and PDF are
        // vector and Figma's export settings for them reject a `constraint`.
        const isRaster = format === "PNG" || format === "JPG";
        const settings: any = isRaster
            ? { format, constraint: { type: "SCALE", value: scale } }
            : { format };

        const bytes = await node.exportAsync(settings);

        let mimeType;
        switch (format) {
            case "PNG":
                mimeType = "image/png";
                break;
            case "JPG":
                mimeType = "image/jpeg";
                break;
            case "SVG":
                mimeType = "image/svg+xml";
                break;
            case "PDF":
                mimeType = "application/pdf";
                break;
            default:
                mimeType = "application/octet-stream";
        }

        // SVG is text — return the raw XML directly. It's far more useful to an
        // LLM (readable, transformable, no base64 inflation) than opaque base64.
        // Raster (PNG/JPG) and PDF remain base64-encoded binary in `imageData`.
        if (format === "SVG") {
            return {
                nodeId,
                format,
                mimeType,
                svg: bytesToUtf8(bytes),
            };
        }

        return {
            nodeId,
            format,
            scale: isRaster ? scale : undefined,
            mimeType,
            imageData: customBase64Encode(bytes),
        };
    } catch (error: any) {
        throw new Error(`Error exporting node as image: ${error.message}`);
    }
}

/**
 * Gets override properties from a component instance
 * @param {InstanceNode} instanceNode - Instance node
 * @returns {Promise<Object>} Override information
 */
export async function getInstanceOverrides(instanceNode: any) {
    console.log("=== getInstanceOverrides called ===");

    if (!instanceNode) {
        throw new Error("Missing instance node parameter");
    }

    // Validate that the provided node is an instance
    if (instanceNode.type !== "INSTANCE") {
        console.error("Provided node is not an instance");
        figma.notify("Provided node is not a component instance");
        return { success: false, message: "Provided node is not a component instance" };
    }

    const sourceInstance = instanceNode;

    try {
        console.log(`Getting instance information:`);
        console.log(sourceInstance);

        // Get component overrides and main component
        const overrides = sourceInstance.overrides || [];
        console.log(`  Raw Overrides:`, overrides);

        // Get main component
        const mainComponent = await sourceInstance.getMainComponentAsync();
        if (!mainComponent) {
            console.error("Failed to get main component");
            figma.notify("Failed to get main component");
            return { success: false, message: "Failed to get main component" };
        }

        // return data to MCP server
        const returnData: any = {
            success: true,
            message: `Got component information from "${sourceInstance.name}" for overrides.length: ${overrides.length}`,
            sourceInstanceId: sourceInstance.id,
            mainComponentId: mainComponent.id,
            overridesCount: overrides.length
        };

        console.log("Data to return to MCP server:", returnData);
        figma.notify(`Got component information from "${sourceInstance.name}"`);

        return returnData;
    } catch (error: any) {
        console.error("Error in getInstanceOverrides:", error);
        figma.notify(`Error: ${error.message}`);
        return {
            success: false,
            message: `Error: ${error.message}`
        };
    }
}

/**
 * Validates and gets target instances
 * @param {string[]} targetNodeIds - Array of instance node IDs
 * @returns {Promise<Object>} Validation result with target instances
 */
export async function getValidTargetInstances(targetNodeIds: any) {
    let targetInstances: any[] = [];

    // Handle array of instances or single instance
    if (Array.isArray(targetNodeIds)) {
        if (targetNodeIds.length === 0) {
            return { success: false, message: "No instances provided" };
        }
        for (const targetNodeId of targetNodeIds) {
            const targetNode = await figma.getNodeByIdAsync(targetNodeId);
            // C5: fail the whole command if any requested target is no longer a
            // resolvable INSTANCE. The dispatcher validated every target moments
            // earlier, so a mismatch here is a genuine TOCTOU change; silently
            // dropping it would understate requestedCount and omit its row.
            if (!targetNode || targetNode.type !== "INSTANCE") {
                return {
                    success: false,
                    message: `Target instance ${targetNodeId} is no longer available or is not an instance (it may have changed since validation). Re-read the instances with node_info and resend.`,
                };
            }
            targetInstances.push(targetNode);
        }
        if (targetInstances.length === 0) {
            return { success: false, message: "No valid instances provided" };
        }
    } else {
        return { success: false, message: "Invalid target node IDs provided" };
    }

    return { success: true, message: "Valid target instances provided", targetInstances };
}

/**
 * Gets source instance data for override application
 * @param {string} sourceInstanceId - Source instance ID
 * @returns {Promise<Object>} Source instance data
 */
export async function getSourceInstanceData(sourceInstanceId: any) {
    if (!sourceInstanceId) {
        return { success: false, message: "Missing source instance ID" };
    }

    // Get source instance by ID
    const sourceInstance = await figma.getNodeByIdAsync(sourceInstanceId);
    if (!sourceInstance) {
        return {
            success: false,
            message: "Source instance not found. The original instance may have been deleted."
        };
    }

    // Verify it's an instance
    if (sourceInstance.type !== "INSTANCE") {
        return {
            success: false,
            message: "Source node is not a component instance."
        };
    }

    // Get main component
    const mainComponent = await sourceInstance.getMainComponentAsync();
    if (!mainComponent) {
        return {
            success: false,
            message: "Failed to get main component from source instance."
        };
    }

    return {
        success: true,
        sourceInstance,
        mainComponent,
        overrides: sourceInstance.overrides || []
    };
}

/**
 * Sets overrides to target component instances
 * @param {InstanceNode[]} targetInstances - Array of target instances
 * @param {Object} sourceResult - Source instance data
 * @returns {Promise<Object>} Result of the set operation
 */
export async function setInstanceOverrides(targetInstances: any, sourceResult: any) {
    try {
        const { sourceInstance, mainComponent, overrides } = sourceResult;

        console.log(`Processing ${targetInstances.length} instances with ${overrides.length} overrides`);
        console.log(`Source instance: ${sourceInstance.id}, Main component: ${mainComponent.id}`);
        console.log(`Overrides:`, overrides);

        // Process all instances
        const results: any[] = [];
        let totalAppliedCount = 0;
        let successCount = 0;
        let failureCount = 0;
        let skippedCount = 0;
        let hasFailed = false;

        for (const targetInstance of targetInstances) {
            if (hasFailed) {
                skippedCount++;
                // Q25: shared row vocabulary — nodeId identity, error reason.
                results.push({
                    success: false,
                    status: "skipped",
                    nodeId: targetInstance.id,
                    instanceName: targetInstance.name,
                    error: "Skipped due to previous failure in batch"
                });
                continue;
            }

            let appliedCount = 0;
            let hasFailure = false;
            let failureMsg = "";
            let swapped = false;
            const appliedFields: any[] = []; // C4: override fields actually written
            // P6-1: the sandbox is dynamic-page, so the synchronous mainComponent
            // getter throws — read it asynchronously before the swap so the Q24
            // before-value is captured without breaking the batch.
            let originalMainComponentId: string | null = null;

            try {
                const originalMain = await targetInstance.getMainComponentAsync();
                originalMainComponentId = originalMain ? originalMain.id : null;
                // Swap component
                try {
                    targetInstance.swapComponent(mainComponent);
                    swapped = true;
                    console.log(`Swapped component for instance "${targetInstance.name}"`);
                } catch (error: any) {
                    hasFailure = true;
                    failureMsg = `Swap component error: ${error.message}`;
                }

                if (!hasFailure) {
                    // Apply each override. C4: an unresolved override/source node
                    // or a requested field that no branch can apply is a FAILURE,
                    // not a silent skip — otherwise the instance is counted as a
                    // success after dropping requested work. `appliedFields`
                    // records every field actually written so the failure row can
                    // disclose all known changes.
                    for (const override of overrides) {
                        if (!override.id || !override.overriddenFields || override.overriddenFields.length === 0) {
                            continue; // nothing requested for this override entry
                        }

                        // Replace source instance ID with target instance ID in the node path
                        const overrideNodeId = override.id.replace(sourceInstance.id, targetInstance.id);
                        const overrideNode = await figma.getNodeByIdAsync(overrideNodeId);
                        if (!overrideNode) {
                            hasFailure = true;
                            failureMsg = `Override target node not found: ${overrideNodeId}`;
                            break;
                        }

                        // Get source node to copy properties from
                        const sourceNode = await figma.getNodeByIdAsync(override.id);
                        if (!sourceNode) {
                            hasFailure = true;
                            failureMsg = `Override source node not found: ${override.id}`;
                            break;
                        }

                        // Apply each overridden field
                        for (const field of override.overriddenFields) {
                            let fieldApplied = false;
                            let beforeValue: any = undefined;
                            try {
                                if (field === "componentProperties") {
                                    // @ts-expect-error TS2339: Property 'componentProperties' does not exist on type 'BaseNode'. (+1 more)
                                    if (sourceNode.componentProperties && overrideNode.componentProperties) {
                                        const properties: any = {};
                                        // @ts-expect-error TS2339: Property 'componentProperties' does not exist on type 'BaseNode'.
                                        for (const key in sourceNode.componentProperties) {
                                            // @ts-expect-error TS2339: Property 'componentProperties' does not exist on type 'BaseNode'.
                                            properties[key] = sourceNode.componentProperties[key].value;
                                        }
                                        // @ts-expect-error TS2339: Property 'setProperties' does not exist on type 'BaseNode'.
                                        overrideNode.setProperties(properties);
                                        fieldApplied = true; // before-state of properties is not cheaply serializable
                                    }
                                } else if (field === "characters" && overrideNode.type === "TEXT") {
                                    beforeValue = overrideNode.characters;
                                    // @ts-expect-error TS2345: Argument of type 'unique symbol | FontName' is not assignable to parameter of type 'FontName'.
                                    await figma.loadFontAsync(overrideNode.fontName);
                                    // @ts-expect-error TS2339: Property 'characters' does not exist on type 'BaseNode'.
                                    overrideNode.characters = sourceNode.characters;
                                    fieldApplied = true;
                                } else if (field in overrideNode) {
                                    // @ts-expect-error TS7053: expression of type 'any' cannot index type 'BaseNode' (implicit any)
                                    beforeValue = overrideNode[field];
                                    // @ts-expect-error TS7053: expression of type 'any' cannot index type 'BaseNode' (implicit any)
                                    overrideNode[field] = sourceNode[field];
                                    fieldApplied = true;
                                }
                            } catch (fieldError: any) {
                                hasFailure = true;
                                failureMsg = `Field ${field} error: ${fieldError.message}`;
                                break;
                            }

                            if (!fieldApplied) {
                                hasFailure = true;
                                failureMsg = `Requested override field '${field}' could not be applied on ${overrideNodeId}`;
                                break;
                            }
                            appliedFields.push({ nodeId: overrideNodeId, field, before: beforeValue });
                        }

                        if (hasFailure) {
                            break;
                        }
                        appliedCount++;
                    }
                }
            } catch (instanceError: any) {
                hasFailure = true;
                failureMsg = instanceError.message;
            }

            if (hasFailure) {
                hasFailed = true;
                failureCount++;
                // Q25: nodeId + error are the contract keys; instanceName additive.
                const rowResult: any = {
                    success: false,
                    status: "failed",
                    nodeId: targetInstance.id,
                    instanceName: targetInstance.name,
                    error: `Error: ${failureMsg}`
                };
                // C4: disclose ALL known mutations — the main-component swap and
                // every override field already applied before the failure.
                if (swapped || appliedFields.length > 0) {
                    rowResult.partialMutation = true;
                    const changes: string[] = [];
                    if (swapped) changes.push(`main component swapped to ${mainComponent.id}`);
                    if (appliedFields.length > 0) changes.push(`${appliedFields.length} override field(s) applied`);
                    rowResult.whatChanged = `${changes.join(" and ")} before the operation failed`;
                    rowResult.before = {
                        ...(swapped ? { mainComponentId: originalMainComponentId } : {}),
                        ...(appliedFields.length > 0 ? { appliedFields } : {}),
                    };
                }
                results.push(rowResult);
            } else {
                successCount++;
                totalAppliedCount += appliedCount;
                results.push({
                    success: true,
                    status: "success",
                    nodeId: targetInstance.id,
                    instanceName: targetInstance.name,
                    appliedCount
                });
            }
        }

        const envelope = batchEnvelope(targetInstances.length, successCount, failureCount, skippedCount);
        const message = envelope.status === "success"
            ? `Applied ${totalAppliedCount} overrides to ${successCount} instances`
            : (failureCount > 0 ? `Failed to apply overrides: ${results.find(r => r.status === "failed")?.error}` : "No overrides applied to any instance");

        figma.notify(message);

        // Q26: only the shared envelope counts; `totalAppliedCount` is a genuine
        // override-property count (not an item count), kept as one field — the
        // duplicate `totalCount` is dropped.
        return {
            ...envelope,
            totalAppliedCount,
            message,
            results
        };

    } catch (error: any) {
        // P6-5: an unexpected setup failure still returns the full envelope with
        // one row per input, never an envelope-less shape.
        console.error("Error in setInstanceOverrides:", error);
        const message = `Error: ${error.message}`;
        figma.notify(message);
        const targets: any[] = Array.isArray(targetInstances) ? targetInstances : [];
        const rows = targets.map((t: any) => ({
            success: false,
            status: "failed",
            nodeId: t ? t.id : "unknown",
            instanceName: t ? t.name : undefined,
            error: message
        }));
        return {
            ...batchEnvelope(targets.length, 0, targets.length, 0),
            totalAppliedCount: 0,
            message,
            results: rows
        };
    }
}

/**
 * Creates a component from an existing frame
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the frame to convert
 * @returns {Promise<Object>} Created component info
 */
export async function createComponent(params: any) {
    const { nodeId } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (node.type !== "FRAME") {
        throw new Error(`Target node must be a FRAME, got ${node.type}`);
    }

    const parentNode = node.parent;
    if (!parentNode) {
        throw new Error("create_component: parent node not found.");
    }
    // The typings make this guard statically unreachable (node.parent is (BaseNode & ChildrenMixin) | null,
    // so every non-null parent has appendChild); it is kept as runtime defense in depth — do not delete
    // as dead code. The inline cast avoids the never-narrowing a direct check would produce. (v2.3.3 PRD Rev 21)
    if (!("appendChild" in (parentNode as BaseNode))) {
        throw new Error(`create_component: parent '${parentNode.name}' (type ${parentNode.type}) cannot contain children.`);
    }

    const component = figma.createComponent(); // This creates a new empty component
    try {
        // Copy basic properties
        component.name = node.name;
        // Resize first
        component.resize(node.width, node.height);

        // Position and Hierarchy
        // We need to keep the component in the same hierarchy
        // Insert component into parent at the index of the node
        const index = parentNode.children.indexOf(node);
        parentNode.insertChild(index, component);
        component.x = node.x;
        component.y = node.y;

        // Styles and properties
        component.fills = node.fills;
        component.strokes = node.strokes;
        component.strokeWeight = node.strokeWeight;
        component.strokeAlign = node.strokeAlign;
        component.strokeCap = node.strokeCap;
        component.strokeJoin = node.strokeJoin;
        component.dashPattern = node.dashPattern;
        component.effects = node.effects;
        component.layoutGrids = node.layoutGrids;
        component.opacity = node.opacity;
        component.blendMode = node.blendMode;
        component.isMask = node.isMask;

        // Corner Radius (handle mixed)
        if (node.cornerRadius !== figma.mixed) {
            component.cornerRadius = node.cornerRadius;
        } else {
            component.topLeftRadius = node.topLeftRadius;
            component.topRightRadius = node.topRightRadius;
            component.bottomLeftRadius = node.bottomLeftRadius;
            component.bottomRightRadius = node.bottomRightRadius;
        }

        // Auto Layout
        // If the frame has auto-layout, apply it to the component
        if (node.layoutMode !== "NONE") {
            component.layoutMode = node.layoutMode;
            component.primaryAxisSizingMode = node.primaryAxisSizingMode;
            component.counterAxisSizingMode = node.counterAxisSizingMode;
            component.primaryAxisAlignItems = node.primaryAxisAlignItems;
            component.counterAxisAlignItems = node.counterAxisAlignItems;
            component.paddingLeft = node.paddingLeft;
            component.paddingRight = node.paddingRight;
            component.paddingTop = node.paddingTop;
            component.paddingBottom = node.paddingBottom;
            component.itemSpacing = node.itemSpacing;
        }

        // Move children
        // Clone the list of children to iterate over, as appendChild modifies the live children list
        const childrenToMove = [...node.children];
        for (const child of childrenToMove) {
            component.appendChild(child);
        }

        // Remove original frame
        node.remove();

        return {
            id: component.id,
            name: component.name,
            type: "COMPONENT"
        };
    } catch (error: any) {
        if (component && typeof component.remove === "function" && (component as any).removed !== true) {
            component.remove();
        }
        throw error;
    }
}

/**
 * Creates a component set (variants) from existing components
 * @param {Object} params - Parameters object
 * @param {Array} params.components - Array of component objects with propertyValues
 * @param {Array} params.properties - Array of property names
 * @param {string} params.componentSetName - Name for the component set
 * @param {string} params.parentId - Parent node ID to place the set in
 * @returns {Promise<Object>} Created component set info
 */
export interface ComponentSetPlan {
    components: {
        node: any;
        originalName: string;
        variantName: string;
        propertyValues: string[];
    }[];
    properties: string[];
    containingPage: any;
    parent?: any;
    componentSetName?: string;
}

export async function validateCreateComponentSetPlan(params: any, scopeRoot: BaseNode): Promise<ComponentSetPlan> {
    const { components, properties, componentSetName, parentId } = params;

    if (!components || !Array.isArray(components) || components.length === 0) {
        throw new Error("components must be a non-empty array");
    }
    if (!properties || !Array.isArray(properties) || properties.length === 0) {
        throw new Error("properties must be a non-empty array");
    }

    const propNamesSeen = new Set<string>();
    for (const prop of properties) {
        if (typeof prop !== "string" || prop.trim() === "") {
            throw new Error("Property names must be non-empty strings");
        }
        if (propNamesSeen.has(prop)) {
            throw new Error(`Duplicate property name found: '${prop}'`);
        }
        propNamesSeen.add(prop);
    }

    const resolvedComponents: ComponentNode[] = [];
    const seenIds = new Set<string>();
    let firstContainingPage: any = null;

    for (const comp of components) {
        if (!comp || !comp.nodeId) {
            throw new Error("Missing component nodeId");
        }
        
        const node = await figma.getNodeByIdAsync(comp.nodeId);
        if (!node) {
            throw new Error(`Node ${comp.nodeId} not found`);
        }

        if (seenIds.has(node.id)) {
            throw new Error(`create_component_set: component '${node.name}' (${node.id}) is listed more than once in components.`);
        }
        seenIds.add(node.id);

        const inScope = node.id === scopeRoot.id || isAncestorOf(scopeRoot, node);
        if (!inScope) {
            throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE, scopeRoot.id));
        }

        if (node.name !== comp.nodeName) {
            throw new Error(ERRORS.NAME_MISMATCH);
        }

        if (node.type !== "COMPONENT") {
            throw new Error(`create_component_set: '${node.name}' (${node.id}) must be a COMPONENT, got ${node.type}.`);
        }

        assertNotLocked(node);
        assertNotInstanceInterior(node, "combined");

        if ('remote' in node && (node as any).remote === true) {
            throw new Error(`create_component_set: '${node.name}' is a remote shared-library component and cannot be combined into a local component set.`);
        }

        if (!comp.propertyValues || comp.propertyValues.length !== properties.length) {
            throw new Error(`Property values count mismatch for component ${node.name}`);
        }

        for (const val of comp.propertyValues) {
            if (typeof val !== "string" || val.trim() === "" || val.includes("=") || val.includes(",")) {
                throw new Error(`create_component_set: property value '${val}' for '${node.name}' must be non-empty and must not contain '=' or ','.`);
            }
        }

        if (node.parent && node.parent.type === "COMPONENT_SET") {
            throw new Error(`create_component_set: '${node.name}' is already a variant in component set '${node.parent.name}'. Combining it would break that set.`);
        }

        const page = getContainingPageNode(node);
        if (!page) {
            throw new Error(`create_component_set: component '${node.name}' (${node.id}) is not on a page (detached).`);
        }
        if (!firstContainingPage) {
            firstContainingPage = page;
        } else if (page.id !== firstContainingPage.id) {
            throw new Error("create_component_set: all components must be on the same page before combining variants.");
        }

        resolvedComponents.push(node as ComponentNode);
    }

    const seenVariants = new Map<string, string>();
    const computedVariantNames: string[] = [];
    for (let i = 0; i < resolvedComponents.length; i++) {
        const node = resolvedComponents[i];
        const compData = components[i];
        const nameParts = properties.map((prop, idx) => `${prop}=${compData.propertyValues[idx]}`);
        const variantName = nameParts.join(", ");
        if (seenVariants.has(variantName)) {
            throw new Error(`Operation Denied: Duplicate variant combination '${variantName}' across components '${seenVariants.get(variantName)}' and '${node.name}'. Each component in a set must have a unique property-value combination.`);
        }
        seenVariants.set(variantName, node.name);
        computedVariantNames.push(variantName);
    }

    // Q22: distinct causes. A missing parentId is its own message (steering the
    // caller to the ID, not the name); a missing parentNodeName is the coded
    // MISSING refusal; a name that does not match is the coded MISMATCH refusal.
    if (parentId == null) {
        throw new Error("create_component_set: parentId is missing. Supply the parent container's ID (and its exact current name as parentNodeName).");
    }
    // C9: nullish omission, so a present empty parentNodeName is compared exactly
    // rather than misclassified as missing.
    if (params.parentNodeName == null) {
        throw REFUSALS.PARENT_NAME_MISSING();
    }

    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent) {
        throw new Error(`Node ${parentId} not found`);
    }

    const parentInScope = parent.id === scopeRoot.id || isAncestorOf(scopeRoot, parent);
    if (!parentInScope) {
        throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE, scopeRoot.id));
    }

    if (parent.name !== params.parentNodeName) {
        throw REFUSALS.PARENT_NAME_MISMATCH(parent.name, params.parentNodeName);
    }

    if (!("appendChild" in parent)) {
        throw new Error(`create_component_set: parent '${parent.name}' (type ${parent.type}) cannot contain a component set.`);
    }

    assertNotLocked(parent);
    assertNotInstanceParent(parent, "appended to");

    for (const node of resolvedComponents) {
        if (parent.id === node.id || isAncestorOf(node, parent)) {
            throw new Error(`create_component_set: parent '${parent.name}' is one of the components being combined (or is inside one) and cannot receive the component set.`);
        }
    }

    const resolvedParent = parent;

    return {
        components: resolvedComponents.map((node, idx) => ({
            node,
            originalName: node.name,
            variantName: computedVariantNames[idx],
            propertyValues: components[idx].propertyValues
        })),
        properties,
        containingPage: firstContainingPage,
        parent: resolvedParent,
        componentSetName
    };
}

export async function createComponentSet(plan: ComponentSetPlan) {
    let componentSet: ComponentSetNode;
    try {
        for (const c of plan.components) {
            c.node.name = c.variantName;
        }
        componentSet = figma.combineAsVariants(plan.components.map(c => c.node), plan.containingPage);
    } catch (error: any) {
        // A rename or combineAsVariants threw before a component set exists —
        // restore every original name (skipping removed nodes so restoration
        // cannot mask the original error) and rethrow. Once the set exists,
        // renaming members back would corrupt its variant naming, so no
        // post-combine rollback is attempted (D5).
        for (const c of plan.components) {
            if (c.node && (c.node as any).removed !== true) {
                c.node.name = c.originalName;
            }
        }
        throw error;
    }

    // Post-combine steps: placement was fully prevalidated, so only R1 TOCTOU
    // residuals can fail here; they surface as ordinary errors with the set
    // left at the combineAsVariants location.
    if (plan.componentSetName) {
        componentSet.name = plan.componentSetName;
    }

    if (plan.parent && plan.parent.id !== componentSet.parent?.id) {
        plan.parent.appendChild(componentSet);
    }

    // variantGroupProperties can throw after fully successful mutation; never
    // convert that into a failure — return success with a warning instead.
    let variantGroupProperties: any = undefined;
    let warning: string | undefined = undefined;
    try {
        variantGroupProperties = componentSet.variantGroupProperties;
    } catch (err: any) {
        warning = `Failed to read variant properties: ${err.message || String(err)}`;
    }

    return {
        id: componentSet.id,
        name: componentSet.name,
        type: "COMPONENT_SET",
        childCount: componentSet.children.length,
        variantProperties: variantGroupProperties,
        warning
    };
}

/**
 * Sets a component instance property
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the instance node
 * @param {string} params.propertyName - Human-readable name of the property
 * @param {string|boolean} params.value - The new value for the property
 * @returns {Promise<Object>} Updated node info
 */
export async function setComponentInstanceProperty(params: any) {
    const { nodeId, propertyName, value } = params || {};

    if (!nodeId || !propertyName || value === undefined) {
        throw new Error("Missing nodeId, propertyName, or value parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (node.type !== "INSTANCE") {
        throw new Error(`Target node must be an INSTANCE, got ${node.type}`);
    }

    const instance = node as InstanceNode;
    const properties = instance.componentProperties;
    
    let qualifiedName: string | null = null;
    let propType: string | null = null;
    const validNames: string[] = [];
    
    for (const key in properties) {
        // The key format is usually "PropertyName#nodeId" or similar, 
        // We split by '#' to get the human readable name
        const parts = key.split('#');
        const readableName = parts[0];
        validNames.push(readableName);
        
        if (readableName === propertyName) {
            qualifiedName = key;
            propType = properties[key].type;
            break;
        }
    }

    if (!qualifiedName || !propType) {
        throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(', ')}`);
    }

    try {
        const validatedValue = await validateComponentPropertyValue(instance, propertyName, propType, value);
        instance.setProperties({ [qualifiedName]: validatedValue });
        return {
            id: instance.id,
            name: instance.name,
            type: instance.type,
            updatedProperty: propertyName,
            value: validatedValue
        };
    } catch (error: any) {
        throw new Error(`Error setting component instance property: ${error.message}`);
    }
}

/**
 * Manages properties on a main component or component set
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the component node
 * @param {string} params.action - ADD, EDIT, or DELETE
 * @param {string} params.propertyName - Human-readable name of the property
 * @param {string} params.newPropertyName - New human-readable name of the property (EDIT)
 * @param {string} params.propertyType - Type of property (ADD)
 * @param {string|boolean} params.defaultValue - Default value (ADD)
 * @param {string|boolean} params.newDefaultValue - New default value (EDIT)
 * @param {Array<{type: "COMPONENT"|"COMPONENT_SET", key: string}>} params.preferredValues - Preferred values for INSTANCE_SWAP (ADD/EDIT)
 * @returns {Promise<Object>} Updated node info
 */
export async function manageComponentProperty(params: any) {
    const { 
        nodeId, 
        action, 
        propertyName, 
        newPropertyName, 
        propertyType, 
        defaultValue, 
        newDefaultValue, 
        preferredValues 
    } = params || {};

    if (!nodeId || !action || !propertyName) {
        throw new Error("Missing nodeId, action, or propertyName parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
        throw new Error(`Target node must be a COMPONENT or COMPONENT_SET, got ${node.type}`);
    }
    
    if (node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET") {
        throw new Error(`Operation Denied: '${node.name}' is a variant inside a component set; manage properties on the set ('${node.parent.name}'), not the individual variant.`);
    }

    const targetNode = node as ComponentNode | ComponentSetNode;
    const properties = targetNode.componentPropertyDefinitions;
    
    // Find qualified name for EDIT and DELETE
    let qualifiedName: string | null = null;
    let existingPropType: string | null = null;
    const validNames: string[] = [];
    
    for (const key in properties) {
        const parts = key.split('#');
        const readableName = parts[0];
        validNames.push(readableName);
        
        if (readableName === propertyName) {
            qualifiedName = key;
            existingPropType = properties[key].type;
        }
    }

    try {
        if (action === "ADD") {
            if (validNames.includes(propertyName)) {
                throw new Error(`Property "${propertyName}" already exists. Available properties: ${validNames.join(', ')}`);
            }
            if (!propertyType || defaultValue === undefined) {
                throw new Error("propertyType and defaultValue are required for ADD action");
            }
            if (propertyType === "VARIANT") {
                throw new Error("VARIANT properties cannot be added manually. Use create_component_set instead.");
            }
            
            const validatedDefault = await validateComponentPropertyValue(targetNode, propertyName, propertyType, defaultValue);
            
            const options: any = {};
            if (preferredValues) options.preferredValues = preferredValues;
            
            targetNode.addComponentProperty(propertyName, propertyType, validatedDefault, options);
            
            return {
                id: targetNode.id,
                name: targetNode.name,
                action: "ADD",
                propertyName,
                propertyType,
                defaultValue: validatedDefault
            };
            
        } else if (action === "EDIT") {
            if (!qualifiedName || !existingPropType) {
                throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(', ')}`);
            }
            
            const options: any = {};
            if (newPropertyName !== undefined) options.name = newPropertyName;
            if (newDefaultValue !== undefined) {
                options.defaultValue = await validateComponentPropertyValue(targetNode, propertyName, existingPropType, newDefaultValue);
            }
            if (preferredValues !== undefined) options.preferredValues = preferredValues;
            
            targetNode.editComponentProperty(qualifiedName, options);
            
            return {
                id: targetNode.id,
                name: targetNode.name,
                action: "EDIT",
                propertyName: newPropertyName || propertyName,
                updated: true
            };
            
        } else {
            throw new Error(`Invalid action: ${action}. Use delete_property tool for deletion.`);
        }
    } catch (error: any) {
        throw new Error(`Error managing component property: ${error.message}`);
    }
}

/**
 * Removes a component-property definition from a main component or variant set
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the component node
 * @param {string} params.propertyName - Human-readable name of the property
 * @returns {Promise<Object>} Status info
 */
export async function deleteComponentProperty(params: any) {
    const { nodeId, propertyName } = params || {};

    if (!nodeId || !propertyName) {
        throw new Error("Missing nodeId or propertyName parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
        throw new Error(`Target node must be a COMPONENT or COMPONENT_SET, got ${node.type}`);
    }

    const targetNode = node as ComponentNode | ComponentSetNode;
    const properties = targetNode.componentPropertyDefinitions;
    
    let qualifiedName: string | null = null;
    const validNames: string[] = [];
    
    for (const key in properties) {
        const parts = key.split('#');
        const readableName = parts[0];
        validNames.push(readableName);
        
        if (readableName === propertyName) {
            qualifiedName = key;
        }
    }

    if (!qualifiedName) {
        throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(', ')}`);
    }

    try {
        targetNode.deleteComponentProperty(qualifiedName);
        return {
            id: targetNode.id,
            name: targetNode.name,
            propertyName
        };
    } catch (error: any) {
        throw new Error(`Error deleting component property: ${error.message}`);
    }
}

