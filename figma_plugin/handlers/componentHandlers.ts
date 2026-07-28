/**
 * Component handlers for Figma plugin
 * Handles component-related operations including styles, instances, and overrides
 */

import { customBase64Encode, bytesToUtf8 } from '../utils/exportUtils.js';
import { assertNonEmptyExplicitName } from '../utils/creatorValidation.js';

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

import { getContainingPageNode, isAncestorOf, assertNotLocked, assertNotInstanceInterior, assertNotInstanceParent, describeCreatorSurvivorParent, getCreatorSurvivorEvidence, readDuringRecovery, removeUncommitted, reportRecoveryError, rethrowAfterCreatorCleanup } from '../utils/nodeUtils.js';
import { ERRORS, REFUSALS, describeError, formatScopeError, notifyBestEffort, withPartialDisclosure } from '../utils/errors.js';
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

    // Q33 (Rev 46): resolve the destination AFTER every other await, so no
    // event-loop yield separates the verified parent from the append that
    // contains the new node. Resolving it first left the whole
    // `importComponentByKeyAsync` window (bounded by IMPORT_TIMEOUT_MS, 15s)
    // between the parent read and the placement — the widest such window in the
    // creators — during which the verified parent could be reparented out of
    // scope and the instance would land in an unverified destination.
    const parentNode = await resolveAppendableParent(parentId, "create_instance");

    const instance = component.createInstance();
    try {
        // D11: createInstance uses an implicit parent; contain it before writes.
        parentNode.appendChild(instance);

        instance.x = x;
        instance.y = y;

        const result = {
            id: instance.id,
            name: instance.name,
            x: instance.x,
            y: instance.y,
            width: instance.width,
            height: instance.height,
            componentId: component.id,
            // D11: report where the node actually landed, so the caller can
            // confirm containment from the response instead of re-reading.
            parentId: instance.parent ? instance.parent.id : undefined,
        };
        return result;
    } catch (error: any) {
        rethrowAfterCreatorCleanup(error, instance, "create_instance", parentId);
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
 * SYNCHRONOUS re-assertion of every instance-target safety predicate — identity,
 * `INSTANCE` type, exact requested name, scope-root membership, and
 * lock/locked-ancestor state (R2).
 *
 * Every predicate reads already-resolved node state (`id`, `type`, `name`,
 * `locked`, `parent` ancestry), so this function contains **no `await`**. That is
 * the point: it can run in the same synchronous turn as the mutation it guards,
 * leaving no event-loop yield in which a shared document could drift. Callers
 * that re-resolve by ID first (`getValidTargetInstances`) and callers that guard
 * an already-resolved object immediately before `swapComponent()`
 * (`setInstanceOverrides`) share this one definition, so the two gates can never
 * check different predicate sets.
 *
 * @returns {string|null} an actionable drift message, or null when the target
 *   still satisfies every predicate.
 */
export function checkTargetPredicates(node: any, requestedId: any, expectedName: any, scopeRoot?: any): string | null {
    if (!node) {
        return `Target instance ${requestedId} is no longer available or is not an instance (it may have changed since validation). Re-read the instances with node_info and resend.`;
    }
    // Figma keeps stored node references after collaborative deletion and exposes
    // `removed` specifically so long-lived plugins can fail closed. A truthy
    // object is therefore not proof that the target still exists.
    if (node.removed === true) {
        return `Target instance ${requestedId} was removed since validation. Re-read the instances with node_info and resend.`;
    }
    if (scopeRoot && scopeRoot.removed === true) {
        return `The editable scope root ${scopeRoot.id} was removed since validation. Reconnect with a valid editable scope, then re-read the instances with node_info and resend.`;
    }
    // Identity: the resolver must have returned the node that was requested.
    if (node.id !== requestedId) {
        return `Target instance ${requestedId} resolved to a different node (${node.id}) since validation. Re-read it with node_info and resend.`;
    }
    if (node.type !== "INSTANCE") {
        return `Target instance ${requestedId} is no longer available or is not an instance (it may have changed since validation). Re-read the instances with node_info and resend.`;
    }
    // Exact requested name — only when the caller passed the request item.
    if (expectedName !== undefined && node.name !== expectedName) {
        return `Target instance ${requestedId} was renamed to "${node.name}" (expected "${expectedName}") since validation. Re-read it with node_info and resend.`;
    }
    // Scope-root membership — only when the caller passed the scope root.
    if (scopeRoot && !(node.id === scopeRoot.id || isAncestorOf(scopeRoot, node))) {
        return `Target instance ${requestedId} moved outside the editable scope since validation. Re-read it with node_info and resend.`;
    }
    // Lock / locked-ancestor state. assertNotLocked throws the canonical denial;
    // convert it into a drift message here.
    try {
        assertNotLocked(node);
    } catch (lockErr: any) {
        return `${describeError(lockErr)} (locked since validation — re-read with node_info and resend.)`;
    }
    return null;
}

/**
 * Captures the target's current main-component ID or fails before the swap.
 *
 * The value is mandatory partial-mutation evidence: swallowing a failed read as
 * `null` would make a later failure row claim a before-state that was never
 * observed. Call this immediately before the synchronous final target gate so
 * no other target's awaited read can stale the captured value.
 */
async function captureOriginalMainComponentId(targetInstance: any, requestedId: any): Promise<string> {
    let originalMain: any;
    try {
        originalMain = await targetInstance.getMainComponentAsync();
    } catch (error: any) {
        throw new Error(
            `Failed to capture the original main component for target instance ${requestedId}: ${describeError(error)}. ` +
            "No swap was attempted. Re-read the instance with node_info and resend."
        );
    }

    if (!originalMain || typeof originalMain.id !== "string" || originalMain.id.length === 0) {
        throw new Error(
            `Failed to capture the original main component for target instance ${requestedId}: no main component was returned. ` +
            "No swap was attempted. Re-read the instance with node_info and resend."
        );
    }

    return originalMain.id;
}

/**
 * Re-resolves and re-validates every requested target instance — R2 (closure
 * audit), which reopens C5.
 *
 * The dispatcher validated these targets moments earlier, but a shared document
 * can change between prevalidation and the swap, so every predicate is
 * re-asserted here against the original request and the current scope root. Any
 * drift fails the WHOLE command before any mutation: a silent drop (the pre-C5
 * behavior) would understate `requestedCount` and omit the changed target's row,
 * and re-checking only existence+type (the C5 behavior) left name/lock/scope
 * unprotected (R2).
 *
 * This gate re-resolves by ID and therefore must `await`. It is NOT sufficient on
 * its own: awaited work still follows it before the first mutation. The
 * no-yield guarantee comes from `setInstanceOverrides` re-running
 * `checkTargetPredicates` synchronously immediately before each `swapComponent()`
 * (R2 second recheck).
 *
 * @param {Array<{nodeId:string, nodeName?:string}>|string[]} targetItems - the
 *   original request items; a bare ID string is accepted for narrow callers
 *   that can only re-check existence+type (no name predicate).
 * @param {BaseNode} [scopeRoot] - resolved scope-root node; when provided, each
 *   target must still be the scope root or a descendant of it.
 * @returns {Promise<Object>} Validation result with target instances
 */
export async function getValidTargetInstances(targetItems: any, scopeRoot?: any) {
    if (!Array.isArray(targetItems)) {
        return { success: false, message: "Invalid target node IDs provided" };
    }
    if (targetItems.length === 0) {
        return { success: false, message: "No instances provided" };
    }

    const targetInstances: any[] = [];
    for (const item of targetItems) {
        const nodeId = typeof item === "string" ? item : (item && item.nodeId);
        const expectedName = typeof item === "string" ? undefined : (item && item.nodeName);

        const targetNode = await figma.getNodeByIdAsync(nodeId);
        const drift = checkTargetPredicates(targetNode, nodeId, expectedName, scopeRoot);
        if (drift) {
            return { success: false, message: drift };
        }
        targetInstances.push(targetNode);
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
 * @param {Object} [guard] - R2 TOCTOU guard: `{items, scopeRoot}`, the ORIGINAL
 *   request items (positionally aligned with `targetInstances`) and the resolved
 *   scope root. When supplied, every target's full predicate set is re-asserted
 *   synchronously before the first mutation AND again immediately before each
 *   `swapComponent()`. The production dispatcher always supplies it; direct
 *   unit callers may omit it to exercise the mutation logic alone.
 * @returns {Promise<Object>} Result of the set operation
 */
export async function setInstanceOverrides(targetInstances: any, sourceResult: any, guard?: { items?: any[]; scopeRoot?: any }) {
    // R2 (second recheck): the expectation for target i, used by the batch-wide
    // pre-mutation gates and the per-target gate inside the loop.
    const expectationFor = (idx: number) => {
        const item = guard && guard.items ? guard.items[idx] : undefined;
        if (!item) return null;
        const requestedId = typeof item === "string" ? item : item.nodeId;
        const expectedName = typeof item === "string" ? undefined : item.nodeName;
        return { requestedId, expectedName };
    };
    const assertNoDrift = () => {
        if (!guard) return;
        for (let i = 0; i < targetInstances.length; i++) {
            const exp = expectationFor(i);
            if (!exp) continue;
            const drift = checkTargetPredicates(targetInstances[i], exp.requestedId, exp.expectedName, guard.scopeRoot);
            if (drift) throw new Error(drift);
        }
    };

    // R2 (second recheck) — BATCH-WIDE PRE-MUTATION GATE, deliberately OUTSIDE
    // the P6-5 envelope catch below. Drift detected before any mutation is a
    // Layer 2 refusal (structured command error, no envelope, NO mutation), not
    // an all-failed execution envelope: nothing was ever attempted. Throwing
    // past the catch is what makes that distinction visible to the dispatcher.
    assertNoDrift();
    // P6-1/Q9: batch-wide preflight proves every target's original main
    // component is readable before the first mutation. The authoritative
    // before-value is captured again per target immediately before its final
    // synchronous gate; otherwise a later target's awaited preflight read could
    // stale an earlier target's saved ID.
    for (let targetIdx = 0; targetIdx < targetInstances.length; targetIdx++) {
        const exp = expectationFor(targetIdx);
        await captureOriginalMainComponentId(
            targetInstances[targetIdx],
            exp ? exp.requestedId : targetInstances[targetIdx]?.id
        );
    }
    // Those preflight awaits are themselves yields, so re-assert the whole batch
    // before the first mutation.
    assertNoDrift();
    // Capture target 0's authoritative before-value outside the execution catch.
    // Its await can drift any target after the preflight assertion, so re-check
    // the WHOLE batch once more before entering the mutation loop. There is no
    // await between this assertion and target 0's final gate/swap.
    let firstTargetOriginalMainComponentId: string | null = null;
    if (targetInstances.length > 0) {
        const firstExp = expectationFor(0);
        firstTargetOriginalMainComponentId = await captureOriginalMainComponentId(
            targetInstances[0],
            firstExp ? firstExp.requestedId : targetInstances[0]?.id
        );
        assertNoDrift();
    }

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

        for (let targetIdx = 0; targetIdx < targetInstances.length; targetIdx++) {
            const targetInstance = targetInstances[targetIdx];
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
            let originalMainComponentId: string | null = null;

            try {
                const exp = expectationFor(targetIdx);
                // Q9: capture the authoritative before-value at use time. Target
                // 0 was captured and the whole batch rechecked immediately before
                // entering this loop. Later targets are captured here, after any
                // earlier target's awaited override writes. In both cases the
                // capture is before the final synchronous target gate.
                originalMainComponentId = targetIdx === 0
                    ? firstTargetOriginalMainComponentId
                    : await captureOriginalMainComponentId(
                        targetInstance,
                        exp ? exp.requestedId : targetInstance?.id
                    );
                // R2 (second recheck) — FINAL PER-TARGET GATE. Applying a
                // previous target's overrides awaits (`getNodeByIdAsync`,
                // `loadFontAsync`), and the main-component capture above also
                // awaits, so a target can drift mid-loop. This check is
                // SYNCHRONOUS and there is no `await` between it and
                // `swapComponent()` below. Earlier targets may already have
                // mutated, so this is a failure ROW (stop-on-first ⇒ the rest
                // become `skipped`) rather than a throw: losing the D7 envelope
                // after mutation is the C3 defect.
                const lateDrift = (guard && exp)
                    ? checkTargetPredicates(targetInstance, exp.requestedId, exp.expectedName, guard.scopeRoot)
                    : null;
                if (lateDrift) {
                    throw new Error(lateDrift);
                }
                // Swap component
                try {
                    targetInstance.swapComponent(mainComponent);
                    swapped = true;
                    console.log(`Swapped component for instance "${targetInstance.name}"`);
                } catch (error: any) {
                    hasFailure = true;
                    failureMsg = `Swap component error: ${describeError(error)}`;
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
                                failureMsg = `Field ${field} error: ${describeError(fieldError)}`;
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
                failureMsg = describeError(instanceError);
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

        notifyBestEffort(message);

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
        const message = `Error: ${describeError(error)}`;
        notifyBestEffort(message);
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

    // Converting a frame inside an instance cannot succeed: Figma creates the
    // component first and only then refuses insertion into the instance,
    // leaving a detached/out-of-scope artifact. Refuse before createComponent()
    // so no implicit node exists to recover.
    assertNotInstanceInterior(node, "converted to a component");

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
    if (!("insertChild" in (parentNode as BaseNode))) {
        throw new Error(`create_component: parent '${parentNode.name}' (type ${parentNode.type}) cannot preserve the source frame's child index.`);
    }
    const verifiedParentId = parentNode.id;

    const index = parentNode.children.indexOf(node);
    if (index < 0) {
        throw new Error(`create_component: source frame '${node.name}' is no longer a child of its resolved parent.`);
    }

    const childrenToMove = [...node.children];
    const component = figma.createComponent(); // This creates a new empty component
    try {
        // D11: createComponent uses an implicit parent. Preserve the frame's
        // exact sibling position before any fallible property assignment.
        parentNode.insertChild(index, component);

        // Copy basic properties
        component.name = node.name;
        // Resize first
        component.resize(node.width, node.height);

        // Position
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

        // Move children. The original order was captured before creation so a
        // failed conversion can restore any children already moved.
        for (const child of childrenToMove) {
            component.appendChild(child);
        }

        const result = {
            id: component.id,
            name: component.name,
            type: "COMPONENT",
            // D11: report where the node actually landed, so the caller can
            // confirm containment from the response instead of re-reading.
            parentId: component.parent ? component.parent.id : undefined,
        };

        // Remove original frame
        node.remove();
        return result;
    } catch (error: any) {
        // Reached only on a failed, uncommitted attempt: the success path
        // returns before this recovery block.
        type ChildParentState =
            | { kind: "source" }
            | { kind: "component" }
            | { kind: "relocated"; currentParentId: string | null }
            | { kind: "unknown" };
        const inspectChildParent = (child: any): ChildParentState => {
            try {
                const currentParent = child.parent;
                if (currentParent === node) return { kind: "source" };
                if (currentParent === component) return { kind: "component" };
                return {
                    kind: "relocated",
                    currentParentId: readDuringRecovery(
                        () => typeof currentParent?.id === "string" ? currentParent.id : null,
                        null,
                    ),
                };
            } catch {
                return { kind: "unknown" };
            }
        };
        const childId = (child: any) => readDuringRecovery(
            () => typeof child.id === "string" ? child.id : "unknown",
            "unknown",
        );

        // `removed` is tri-state during recovery. An unreadable host object is
        // NOT proof that the source is still live, so it can never authorize
        // deletion of the new component.
        const sourceFrameRemovalState = readDuringRecovery<"live" | "removed" | "unknown">(
            () => {
                const removed = (node as any).removed;
                if (removed === false) return "live";
                if (removed === true) return "removed";
                return "unknown";
            },
            "unknown",
        );
        const sourceFrameRemoved =
            sourceFrameRemovalState === "removed"
                ? true
                : sourceFrameRemovalState === "live"
                    ? false
                    : null;

        const restorationFailures: Array<{
            childId: string;
            attemptedIndex: number | null;
        }> = [];
        if (sourceFrameRemovalState === "live") {
            // Every child is evaluated independently. One failed restore must
            // not suppress later attempts. Insert before the first later
            // original sibling still on the source (or append if none remains)
            // so order is retained even when an earlier restore failed.
            for (let childIndex = 0; childIndex < childrenToMove.length; childIndex++) {
                const child = childrenToMove[childIndex];
                if (inspectChildParent(child).kind !== "component") continue;
                const currentSourceChildren = readDuringRecovery<any[] | null>(
                    () => Array.isArray(node.children) ? [...node.children] : null,
                    null,
                );
                if (currentSourceChildren === null) {
                    restorationFailures.push({
                        childId: childId(child),
                        attemptedIndex: null,
                    });
                    reportRecoveryError(
                        "create_component: source children were unreadable; skipped a child restore rather than guessing an insertion index",
                    );
                    continue;
                }
                let safeInsertionIndex = currentSourceChildren.length;
                for (
                    let laterIndex = childIndex + 1;
                    laterIndex < childrenToMove.length;
                    laterIndex++
                ) {
                    const siblingIndex = currentSourceChildren.indexOf(
                        childrenToMove[laterIndex],
                    );
                    if (siblingIndex >= 0) {
                        safeInsertionIndex = siblingIndex;
                        break;
                    }
                }
                try {
                    node.insertChild(safeInsertionIndex, child);
                } catch (restoreError) {
                    restorationFailures.push({
                        childId: childId(child),
                        attemptedIndex: safeInsertionIndex,
                    });
                    reportRecoveryError("create_component: failed to restore a moved child after conversion failure", restoreError);
                }
            }
        }

        const restoredChildIds: string[] = [];
        const survivingChildIds: string[] = [];
        const unknownParentChildIds: string[] = [];
        const relocatedChildren: Array<{
            childId: string;
            currentParentId: string | null;
        }> = [];
        for (const child of childrenToMove) {
            const id = childId(child);
            const parentState = inspectChildParent(child);
            if (parentState.kind === "source") {
                restoredChildIds.push(id);
            } else if (parentState.kind === "component") {
                survivingChildIds.push(id);
            } else if (parentState.kind === "relocated") {
                relocatedChildren.push({
                    childId: id,
                    currentParentId: parentState.currentParentId,
                });
            } else {
                unknownParentChildIds.push(id);
            }
        }

        const componentChildCount = readDuringRecovery<number | null>(
            () => Array.isArray(component.children) ? component.children.length : null,
            null,
        );
        const everyOriginalChildConfirmedRestored =
            restoredChildIds.length === childrenToMove.length &&
            survivingChildIds.length === 0 &&
            unknownParentChildIds.length === 0 &&
            relocatedChildren.length === 0;
        const componentConfirmedEmpty = componentChildCount === 0;
        const cleanupIsSafe =
            sourceFrameRemovalState === "live" &&
            everyOriginalChildConfirmedRestored &&
            componentConfirmedEmpty;

        // Remove only after positive proof of all three recovery predicates:
        // source live, every original child back on source, component empty.
        if (cleanupIsSafe) {
            const componentRemoved = removeUncommitted(component, "create_component");
            if (componentRemoved) {
                // Cleanup fully succeeded: nothing durable changed, so this is
                // a clean failure and must NOT carry the partial-mutation flag.
                throw error;
            }

            // The source frame and its children were restored, but the new
            // component itself survives. Preserve the initiating error and
            // disclose exactly where that artifact remains.
            const survivor = getCreatorSurvivorEvidence(component, verifiedParentId);
            const sourceFrameId = readDuringRecovery(() => node.id, "unknown");
            const sourceFrameName = readDuringRecovery(() => node.name, "unknown");
            throw withPartialDisclosure(
                error,
                `component '${survivor.survivingNodeName}' (${survivor.survivingNodeId}) survives because cleanup could not remove it; its current parent is ${describeCreatorSurvivorParent(survivor)}.`,
                {
                    sourceFrameId,
                    sourceFrameName,
                    sourceFrameRemoved,
                    survivingComponentId: survivor.survivingNodeId,
                    survivingComponentParentState: survivor.survivingParentState,
                    survivingComponentParentId: survivor.survivingParentId,
                    verifiedParentId: survivor.verifiedParentId,
                    sourceFrameRemovalState,
                    restoredChildIds,
                    movedChildIds: survivingChildIds,
                    unknownParentChildIds,
                    relocatedChildren,
                    restorationFailures,
                    componentChildCount,
                },
            );
        }

        // Q32 (Rev 46): cleanup could not return the document to its prior
        // state — the new component survives, holding user nodes and/or having
        // outlived the source frame. That is a partial mutation, and D7/Q18's
        // rule is that it is disclosed explicitly, never reported as a clean
        // failure. The before-values are diagnostic evidence (R10): they say
        // what changed so it can be reported and judged, not a restore payload.
        const survivor = getCreatorSurvivorEvidence(component, verifiedParentId);
        const sourceFrameId = readDuringRecovery(() => node.id, "unknown");
        const sourceFrameName = readDuringRecovery(() => node.name, "unknown");
        throw withPartialDisclosure(
            error,
            sourceFrameRemovalState === "removed"
                ? `the source frame '${sourceFrameName}' was already removed and component '${survivor.survivingNodeName}' (${survivor.survivingNodeId}) survives in its place.`
                : sourceFrameRemovalState === "unknown"
                    ? `the source frame '${sourceFrameName}' removal state could not be read, so component '${survivor.survivingNodeName}' (${survivor.survivingNodeId}) was not removed.`
                    : `component '${survivor.survivingNodeName}' (${survivor.survivingNodeId}) was not removed because one or more children could not be restored or confirmed on the source, or component emptiness could not be confirmed.`,
            {
                sourceFrameId,
                sourceFrameName,
                sourceFrameRemoved,
                survivingComponentId: survivor.survivingNodeId,
                survivingComponentParentState: survivor.survivingParentState,
                survivingComponentParentId: survivor.survivingParentId,
                verifiedParentId: survivor.verifiedParentId,
                sourceFrameRemovalState,
                restoredChildIds,
                movedChildIds: survivingChildIds,
                unknownParentChildIds,
                relocatedChildren,
                restorationFailures,
                componentChildCount,
            }
        );
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
    // No `containingPage`: D11 made `combineAsVariants` take the verified parent
    // directly, so the containing page stopped being part of the plan. The
    // same-page CHECK still runs during validation (Figma cannot combine
    // components across pages) — it just no longer produces a plan field.
    parent: any;
    componentSetName?: string;
}

export async function validateCreateComponentSetPlan(params: any, scopeRoot: BaseNode): Promise<ComponentSetPlan> {
    const { components, properties, componentSetName, parentId } = params;

    assertNonEmptyExplicitName(
        componentSetName,
        "componentSetName",
        "create_component_set",
        "Omit componentSetName to use Figma's default component-set name.",
    );

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
        throw new Error("create_component_set: parentId is missing. Read the target with node_info and supply the appendable parent container's ID as parentId and its exact current name as parentNodeName (both passed back verbatim from node_info).");
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
        parent: resolvedParent,
        componentSetName
    };
}

export async function createComponentSet(plan: ComponentSetPlan) {
    assertNonEmptyExplicitName(
        plan.componentSetName,
        "componentSetName",
        "create_component_set",
        "Omit componentSetName to use Figma's default component-set name.",
    );

    let componentSet: ComponentSetNode;
    const successfullyRenamed = new Set<any>();
    const verifiedParentId = readDuringRecovery(
        () => plan.parent && typeof plan.parent.id === "string"
            ? plan.parent.id
            : "unknown",
        "unknown",
    );
    // Capture placement before the first mutation. A failed Figma combine can
    // reparent live components into a newly-created set and then throw; name
    // restoration alone is not proof that the document returned to its prior
    // state.
    const originalPlacementByNode = new Map<any, {
        readable: boolean;
        parentId: string | null;
    }>();
    for (const c of plan.components) {
        const unreadableParent = {};
        const originalParent = readDuringRecovery<any>(
            () => c.node ? c.node.parent ?? null : null,
            unreadableParent,
        );
        if (originalParent === unreadableParent) {
            originalPlacementByNode.set(c.node, {
                readable: false,
                parentId: null,
            });
        } else {
            const unreadableParentId = {};
            const originalParentId = originalParent
                ? readDuringRecovery<any>(
                    () => typeof originalParent.id === "string"
                        ? originalParent.id
                        : null,
                    unreadableParentId,
                )
                : null;
            originalPlacementByNode.set(c.node, {
                readable: originalParentId !== unreadableParentId,
                parentId: originalParentId === unreadableParentId
                    ? null
                    : originalParentId,
            });
        }
    }
    try {
        for (const c of plan.components) {
            c.node.name = c.variantName;
            successfullyRenamed.add(c.node);
        }
        // D11: combineAsVariants accepts the destination directly, so the set
        // never exists at an implicit page-level location.
        componentSet = figma.combineAsVariants(plan.components.map(c => c.node), plan.parent);
    } catch (error: any) {
        // A thrown combine is not proof that no set exists: Figma may already
        // have reparented members into a durable COMPONENT_SET. Inspect current
        // placement before writing any recovery name. Members owned by such a
        // set must retain their computed variant names; only ordinary pre-set
        // failures restore originals.
        type AppliedNameEvidence = {
            componentId: string;
            originalName: string;
            variantName: string;
            observedNameBeforeRestore: string | null;
        };
        type RestoredNameEvidence = AppliedNameEvidence & {
            currentName: string | null;
        };
        type RemovedComponentEvidence = {
            componentId: string;
            originalName: string;
            variantName: string;
        };
        type UnknownRemovalEvidence = RemovedComponentEvidence;
        type ReparentedComponentEvidence = {
            componentId: string;
            originalParentId: string | null;
            currentParentId: string | null;
            currentParentName: string;
            currentParentType: string;
        };
        type UnverifiedPlacementEvidence = {
            componentId: string;
            originalParentId: string | null;
        };
        type SetMemberNameEvidence = {
            componentId: string;
            componentSetId: string;
            originalName: string;
            variantName: string;
            observedNameBeforeConfirmation: string | null;
            currentName: string | null;
        };
        type SurvivingComponentSetEvidence = {
            componentSetId: string;
            componentSetName: string;
            parentId: string | null;
            memberIds: string[];
        };
        const appliedComponents: AppliedNameEvidence[] = [];
        const restoredComponents: RestoredNameEvidence[] = [];
        const unrestoredComponents: RestoredNameEvidence[] = [];
        const removedComponents: RemovedComponentEvidence[] = [];
        const unknownRemovalComponents: UnknownRemovalEvidence[] = [];
        const reparentedComponents: ReparentedComponentEvidence[] = [];
        const unverifiedPlacementComponents: UnverifiedPlacementEvidence[] = [];
        const retainedVariantComponents: SetMemberNameEvidence[] = [];
        const unconfirmedVariantComponents: SetMemberNameEvidence[] = [];
        const survivingSetByNode = new Map<any, SurvivingComponentSetEvidence>();
        for (const c of plan.components) {
            if (c.node) {
                const componentId = readDuringRecovery(() => c.node.id, "unknown");
                const componentRemovalState = readDuringRecovery<"live" | "removed" | "unknown">(
                    () => {
                        const removed = (c.node as any).removed;
                        if (removed === false) return "live";
                        if (removed === true) return "removed";
                        return "unknown";
                    },
                    "unknown",
                );
                const observedNameBeforeRestore = readDuringRecovery(
                    () => typeof c.node.name === "string" ? c.node.name : null,
                    null,
                );
                const wasApplied =
                    successfullyRenamed.has(c.node) ||
                    (observedNameBeforeRestore !== null && observedNameBeforeRestore !== c.originalName);
                const appliedEvidence = {
                    componentId,
                    originalName: c.originalName,
                    variantName: c.variantName,
                    observedNameBeforeRestore,
                };
                if (wasApplied) {
                    appliedComponents.push(appliedEvidence);
                }

                if (componentRemovalState === "removed") {
                    removedComponents.push({
                        componentId,
                        originalName: c.originalName,
                        variantName: c.variantName,
                    });
                    continue;
                }
                if (componentRemovalState === "unknown") {
                    unknownRemovalComponents.push({
                        componentId,
                        originalName: c.originalName,
                        variantName: c.variantName,
                    });
                }

                const originalPlacement = originalPlacementByNode.get(c.node) ?? {
                    readable: false,
                    parentId: null,
                };
                const originalParentId = originalPlacement.parentId;
                const unreadableParent = {};
                const currentParent = readDuringRecovery<any>(
                    () => c.node.parent ?? null,
                    unreadableParent,
                );
                if (currentParent === unreadableParent || !originalPlacement.readable) {
                    unverifiedPlacementComponents.push({
                        componentId,
                        originalParentId,
                    });
                    continue;
                }

                const unreadableParentId = {};
                const currentParentId = currentParent
                    ? readDuringRecovery<any>(
                        () => typeof currentParent.id === "string"
                            ? currentParent.id
                            : null,
                        unreadableParentId,
                    )
                    : null;
                if (currentParentId === unreadableParentId) {
                    unverifiedPlacementComponents.push({
                        componentId,
                        originalParentId,
                    });
                    continue;
                }

                const currentParentName = readDuringRecovery(
                    () => typeof currentParent?.name === "string"
                        ? currentParent.name
                        : "unknown",
                    "unknown",
                );
                const currentParentType = readDuringRecovery(
                    () => currentParent === null
                        ? "DETACHED"
                        : typeof currentParent?.type === "string"
                            ? currentParent.type
                            : "unknown",
                    "unknown",
                );
                const placementChanged = currentParentId !== originalParentId;
                if (placementChanged) {
                    reparentedComponents.push({
                        componentId,
                        originalParentId,
                        currentParentId,
                        currentParentName,
                        currentParentType,
                    });
                }

                // A changed parent with unreadable type might itself be the
                // surviving set. Do not risk corrupting it by restoring the
                // original name; disclose the unverified placement instead.
                if (placementChanged && currentParentType === "unknown") {
                    unverifiedPlacementComponents.push({
                        componentId,
                        originalParentId,
                    });
                    continue;
                }

                if (placementChanged && currentParentType === "COMPONENT_SET") {
                    const componentSetId = currentParentId ?? "unknown";
                    let setEvidence = survivingSetByNode.get(currentParent);
                    if (!setEvidence) {
                        setEvidence = {
                            componentSetId,
                            componentSetName: currentParentName,
                            parentId: readDuringRecovery(
                                () => typeof currentParent?.parent?.id === "string"
                                    ? currentParent.parent.id
                                    : null,
                                null,
                            ),
                            memberIds: [],
                        };
                        survivingSetByNode.set(currentParent, setEvidence);
                    }
                    setEvidence.memberIds.push(componentId);

                    // Retain the valid variant name. If Figma left a different
                    // name, best-effort confirmation writes the computed
                    // variant — never the original pre-set name.
                    if (observedNameBeforeRestore !== c.variantName) {
                        try {
                            c.node.name = c.variantName;
                        } catch (confirmError: any) {
                            reportRecoveryError(
                                `create_component_set: failed to confirm variant name for surviving set member '${componentId}'`,
                                confirmError,
                            );
                        }
                    }
                    const currentName = readDuringRecovery(
                        () => typeof c.node.name === "string" ? c.node.name : null,
                        null,
                    );
                    const setMemberEvidence = {
                        componentId,
                        componentSetId,
                        originalName: c.originalName,
                        variantName: c.variantName,
                        observedNameBeforeConfirmation: observedNameBeforeRestore,
                        currentName,
                    };
                    if (currentName === c.variantName) {
                        retainedVariantComponents.push(setMemberEvidence);
                    } else {
                        unconfirmedVariantComponents.push(setMemberEvidence);
                    }
                    continue;
                }

                let restoreError: any = null;
                try {
                    c.node.name = c.originalName;
                } catch (caught: any) {
                    restoreError = caught;
                    reportRecoveryError(
                        `create_component_set: failed to restore component '${componentId}' to its original name`,
                        caught,
                    );
                }

                const currentName = readDuringRecovery(
                    () => typeof c.node.name === "string" ? c.node.name : null,
                    null,
                );
                if (currentName !== c.originalName) {
                    unrestoredComponents.push({
                        ...appliedEvidence,
                        currentName,
                    });
                } else if (wasApplied) {
                    restoredComponents.push({
                        ...appliedEvidence,
                        currentName,
                    });
                }
                if (restoreError && currentName === c.originalName) {
                    reportRecoveryError(
                        `create_component_set: component '${componentId}' restored despite its setter reporting an error`,
                        restoreError,
                    );
                }
            }
        }
        const survivingComponentSets = Array.from(survivingSetByNode.values());
        if (
            unrestoredComponents.length > 0 ||
            removedComponents.length > 0 ||
            unknownRemovalComponents.length > 0 ||
            reparentedComponents.length > 0 ||
            unverifiedPlacementComponents.length > 0 ||
            survivingComponentSets.length > 0 ||
            unconfirmedVariantComponents.length > 0
        ) {
            throw withPartialDisclosure(
                error,
                `${appliedComponents.length} component variant name(s) were applied before create_component_set failed; ${retainedVariantComponents.length} remain valid members of ${survivingComponentSets.length} surviving set(s), ${unconfirmedVariantComponents.length} surviving-set member name(s) could not be confirmed, ${restoredComponents.length} ordinary member name(s) were restored, ${unrestoredComponents.length} could not be restored, ${removedComponents.length} component(s) were removed, ${unknownRemovalComponents.length} have unreadable removal state, ${reparentedComponents.length} remain under a different parent, and ${unverifiedPlacementComponents.length} have unreadable placement.`,
                {
                    appliedComponents,
                    restoredComponents,
                    unrestoredComponents,
                    removedComponents,
                    unknownRemovalComponents,
                    reparentedComponents,
                    unverifiedPlacementComponents,
                    survivingComponentSets,
                    retainedVariantComponents,
                    unconfirmedVariantComponents,
                },
            );
        }
        throw error;
    }

    // The combine has now durably mutated the document. Snapshot the required
    // response/evidence fields before any later operation, and verify that
    // Figma honored the direct-parent destination. An unreadable or mismatched
    // location is a partial outcome, never a clean projection failure.
    const unreadableSetValue = {};
    const componentSetId = readDuringRecovery<any>(
        () => typeof componentSet.id === "string"
            ? componentSet.id
            : unreadableSetValue,
        unreadableSetValue,
    );
    const initialComponentSetName = readDuringRecovery<any>(
        () => typeof componentSet.name === "string"
            ? componentSet.name
            : unreadableSetValue,
        unreadableSetValue,
    );
    const componentSetParentId = readDuringRecovery<any>(
        () => typeof componentSet.parent?.id === "string"
            ? componentSet.parent.id
            : null,
        unreadableSetValue,
    );
    if (
        componentSetId === unreadableSetValue ||
        initialComponentSetName === unreadableSetValue ||
        componentSetParentId === unreadableSetValue ||
        componentSetParentId !== verifiedParentId
    ) {
        throw withPartialDisclosure(
            new Error(
                componentSetParentId !== unreadableSetValue &&
                componentSetParentId !== verifiedParentId
                    ? `create_component_set: Figma created the set under parent '${componentSetParentId ?? "detached/null"}' instead of verified parent '${verifiedParentId}'.`
                    : "create_component_set: the created set's identity or parent could not be read safely.",
            ),
            "the component set was already created and its members already carry their variant names, but the set's identity/location could not be confirmed for a normal success response.",
            {
                componentSetId:
                    componentSetId === unreadableSetValue
                        ? "unknown"
                        : componentSetId,
                componentSetName:
                    initialComponentSetName === unreadableSetValue
                        ? "unknown"
                        : initialComponentSetName,
                componentSetParentId:
                    componentSetParentId === unreadableSetValue
                        ? null
                        : componentSetParentId,
                verifiedParentId,
                variantNames: plan.components.map((c) => c.variantName),
                originalComponentNames: plan.components.map((c) => c.originalName),
            },
        );
    }

    // Post-combine steps can still fail. Renaming members back would corrupt
    // their valid variant naming, so no post-combine rollback is attempted
    // (D5's no-transaction posture); every later failure must carry the set
    // snapshot above.
    let finalComponentSetName = initialComponentSetName as string;
    if (plan.componentSetName !== undefined) {
        try {
            componentSet.name = plan.componentSetName;
        } catch (error: any) {
            const observedName = readDuringRecovery(
                () => typeof componentSet.name === "string"
                    ? componentSet.name
                    : "unknown",
                "unknown",
            );
            throw withPartialDisclosure(
                error,
                `component set '${observedName}' (${componentSetId}) was already created from the listed components and their names were changed to variant names; only the set's own rename failed.`,
                {
                    componentSetId,
                    componentSetName: observedName,
                    componentSetParentId,
                    verifiedParentId,
                    variantNames: plan.components.map((c) => c.variantName),
                    originalComponentNames: plan.components.map((c) => c.originalName),
                },
            );
        }

        const observedName = readDuringRecovery<any>(
            () => typeof componentSet.name === "string"
                ? componentSet.name
                : unreadableSetValue,
            unreadableSetValue,
        );
        if (
            observedName === unreadableSetValue ||
            observedName !== plan.componentSetName
        ) {
            throw withPartialDisclosure(
                new Error(
                    observedName === unreadableSetValue
                        ? "create_component_set: the set rename completed but its resulting name could not be read safely."
                        : `create_component_set: the requested set name '${plan.componentSetName}' did not persist; observed '${observedName}'.`,
                ),
                "the component set was already created and its members already carry their variant names, but the requested set name could not be confirmed.",
                {
                    componentSetId,
                    componentSetName:
                        observedName === unreadableSetValue
                            ? "unknown"
                            : observedName,
                    componentSetParentId,
                    verifiedParentId,
                    requestedComponentSetName: plan.componentSetName,
                    variantNames: plan.components.map((c) => c.variantName),
                    originalComponentNames: plan.components.map((c) => c.originalName),
                },
            );
        }
        finalComponentSetName = observedName;
    }

    // Optional projection reads cannot erase a fully confirmed mutation.
    let variantGroupProperties: any = undefined;
    let childCount: number | undefined = undefined;
    const warnings: string[] = [];
    try {
        variantGroupProperties = componentSet.variantGroupProperties;
    } catch (err: any) {
        warnings.push(`Failed to read variant properties: ${describeError(err)}`);
    }
    try {
        childCount = componentSet.children.length;
    } catch (err: any) {
        warnings.push(`Failed to read component-set child count: ${describeError(err)}`);
    }

    return {
        id: componentSetId,
        name: finalComponentSetName,
        type: "COMPONENT_SET",
        // D11: report where the set actually landed, so the caller can confirm
        // containment from the response instead of re-reading.
        parentId: componentSetParentId,
        childCount,
        variantProperties: variantGroupProperties,
        warning: warnings.length > 0 ? warnings.join(" ") : undefined,
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

    if (!nodeId || !action || propertyName == null) {
        throw new Error("Missing nodeId, action, or propertyName parameter");
    }

    if (action === "ADD") {
        assertNonEmptyExplicitName(
            propertyName,
            "propertyName",
            "component_manage_property ADD",
            "Supply a non-empty propertyName.",
        );
    }
    assertNonEmptyExplicitName(
        newPropertyName,
        "newPropertyName",
        "component_manage_property EDIT",
        "Omit newPropertyName to leave the component property's name unchanged.",
    );

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
