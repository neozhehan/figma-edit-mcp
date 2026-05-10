/**
 * Component handlers for Figma plugin
 * Handles component-related operations including styles, instances, and overrides
 */

import { customBase64Encode } from '../utils/exportUtils.js';

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
 * @param {string} params.scope - 'current_page' (default) or 'document'
 * @param {string} params.commandId - Optional command ID for progress updates
 * @returns {Promise<Object>} Object containing component count and list
 */
export async function getComponents(params: any) {
    const { filter, scope = 'current_page', commandId } = params || {};
    
    // 1. Started event
    if (commandId) {
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
    
    if (scope === 'current_page') {
        const components = figma.currentPage.findAllWithCriteria({ 
            types: ["COMPONENT", "COMPONENT_SET"] 
        });
        allComponents.push(...components);
    } else {
        // scope === 'document'
        // MANDATORY: Do NOT use loadAllPagesAsync(). Iterate pages instead.
        const pages = figma.root.children;
        for (const [index, page] of pages.entries()) {
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

    if (commandId) {
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

/**
 * Helper to find the containing page ID for a node.
 */
function getContainingPageId(node: BaseNode): string {
    let current: BaseNode | null = node;
    while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
        current = current.parent;
    }
    return (current && current.type === 'PAGE') ? current.id : 'unknown';
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
export async function createComponentInstance(params: any) {
    const { componentKey, componentId, x = 0, y = 0, parentId } = params || {};

    if (!componentKey && !componentId) {
        throw new Error("Missing componentKey or componentId parameter");
    }

    try {
        let component: ComponentNode;

        if (componentId) {
            // Local component: look up directly by node ID
            const node = await figma.getNodeByIdAsync(componentId);
            if (!node) {
                throw new Error(`Component not found with ID: ${componentId}`);
            }
            if (node.type !== "COMPONENT") {
                throw new Error(`Node ${componentId} is not a COMPONENT (got ${node.type})`);
            }
            component = node as ComponentNode;
        } else {
            // Remote/library component: import by key
            component = await figma.importComponentByKeyAsync(componentKey);
        }

        const instance = component.createInstance();

        if (parentId) {
            const parent = await figma.getNodeByIdAsync(parentId);
            if (!parent) {
                throw new Error(`Parent node not found with ID: ${parentId}`);
            }
            // @ts-ignore
            parent.appendChild(instance);
        }

        instance.x = x;
        instance.y = y;

        return {
            id: instance.id,
            name: instance.name,
            x: instance.x,
            y: instance.y,
            width: instance.width,
            height: instance.height,
            // @ts-ignore
            componentId: instance.componentId,
        };
    } catch (error: any) {
        throw new Error(`Error creating component instance: ${error?.message || String(error)}`);
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

    const format = "PNG";

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (!("exportAsync" in node)) {
        throw new Error(`Node does not support exporting: ${nodeId}`);
    }

    try {
        const settings: any = {
            format: format,
            constraint: { type: "SCALE", value: scale },
        };

        const bytes = await node.exportAsync(settings);

        let mimeType;
        switch (format) {
            case "PNG":
                mimeType = "image/png";
                break;
            // @ts-ignore
            case "JPG":
                mimeType = "image/jpeg";
                break;
            // @ts-ignore
            case "SVG":
                mimeType = "image/svg+xml";
                break;
            // @ts-ignore
            case "PDF":
                mimeType = "application/pdf";
                break;
            default:
                mimeType = "application/octet-stream";
        }

        // Proper way to convert Uint8Array to base64
        const base64 = customBase64Encode(bytes);

        return {
            nodeId,
            format,
            scale,
            mimeType,
            imageData: base64,
        };
    } catch (error: any) {
        throw new Error(`Error exporting node as image: ${error.message}`);
    }
}

/**
 * Gets override properties from a component instance
 * @param {InstanceNode|null} instanceNode - Optional instance node
 * @returns {Promise<Object>} Override information
 */
export async function getInstanceOverrides(instanceNode = null) {
    console.log("=== getInstanceOverrides called ===");

    let sourceInstance = null;

    // Check if an instance node was passed directly
    if (instanceNode) {
        console.log("Using provided instance node");

        // Validate that the provided node is an instance
        // @ts-ignore
        if (instanceNode.type !== "INSTANCE") {
            console.error("Provided node is not an instance");
            figma.notify("Provided node is not a component instance");
            return { success: false, message: "Provided node is not a component instance" };
        }

        sourceInstance = instanceNode;
    } else {
        // No node provided, use selection
        console.log("No node provided, using current selection");

        // Get the current selection
        const selection = figma.currentPage.selection;

        // Check if there's anything selected
        if (selection.length === 0) {
            console.log("No nodes selected");
            figma.notify("Please select at least one instance");
            return { success: false, message: "No nodes selected" };
        }

        // Filter for instances in the selection
        const instances = selection.filter((node: any) => node.type === "INSTANCE");

        if (instances.length === 0) {
            console.log("No instances found in selection");
            figma.notify("Please select at least one component instance");
            return { success: false, message: "No instances found in selection" };
        }

        // Take the first instance from the selection
        sourceInstance = instances[0];
    }

    try {
        console.log(`Getting instance information:`);
        console.log(sourceInstance);

        // Get component overrides and main component
        // @ts-ignore
        const overrides = sourceInstance.overrides || [];
        console.log(`  Raw Overrides:`, overrides);

        // Get main component
        // @ts-ignore
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
            if (targetNode && targetNode.type === "INSTANCE") {
                targetInstances.push(targetNode);
            }
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

        for (const targetInstance of targetInstances) {
            try {
                // Swap component
                try {
                    targetInstance.swapComponent(mainComponent);
                    console.log(`Swapped component for instance "${targetInstance.name}"`);
                } catch (error: any) {
                    console.error(`Error swapping component for instance "${targetInstance.name}":`, error);
                    results.push({
                        success: false,
                        instanceId: targetInstance.id,
                        instanceName: targetInstance.name,
                        message: `Error: ${error.message}`
                    });
                }

                // Prepare overrides by replacing node IDs
                let appliedCount = 0;

                // Apply each override
                for (const override of overrides) {
                    // Skip if no ID or overriddenFields
                    if (!override.id || !override.overriddenFields || override.overriddenFields.length === 0) {
                        continue;
                    }

                    // Replace source instance ID with target instance ID in the node path
                    const overrideNodeId = override.id.replace(sourceInstance.id, targetInstance.id);
                    const overrideNode = await figma.getNodeByIdAsync(overrideNodeId);

                    if (!overrideNode) {
                        console.log(`Override node not found: ${overrideNodeId}`);
                        continue;
                    }

                    // Get source node to copy properties from
                    const sourceNode = await figma.getNodeByIdAsync(override.id);
                    if (!sourceNode) {
                        console.log(`Source node not found: ${override.id}`);
                        continue;
                    }

                    // Apply each overridden field
                    let fieldApplied = false;
                    for (const field of override.overriddenFields) {
                        try {
                            if (field === "componentProperties") {
                                // Apply component properties
                                // @ts-ignore
                                if (sourceNode.componentProperties && overrideNode.componentProperties) {
                                    const properties: any = {};
                                    // @ts-ignore
                                    for (const key in sourceNode.componentProperties) {
                                        // @ts-ignore
                                        properties[key] = sourceNode.componentProperties[key].value;
                                    }
                                    // @ts-ignore
                                    overrideNode.setProperties(properties);
                                    fieldApplied = true;
                                }
                            } else if (field === "characters" && overrideNode.type === "TEXT") {
                                // For text nodes, need to load fonts first
                                // @ts-ignore
                                await figma.loadFontAsync(overrideNode.fontName);
                                // @ts-ignore
                                overrideNode.characters = sourceNode.characters;
                                fieldApplied = true;
                            } else if (field in overrideNode) {
                                // Direct property assignment
                                // @ts-ignore
                                overrideNode[field] = sourceNode[field];
                                fieldApplied = true;
                            }
                        } catch (fieldError: any) {
                            console.error(`Error applying field ${field}:`, fieldError);
                        }
                    }

                    if (fieldApplied) {
                        appliedCount++;
                    }
                }

                if (appliedCount > 0) {
                    totalAppliedCount += appliedCount;
                    results.push({
                        success: true,
                        instanceId: targetInstance.id,
                        instanceName: targetInstance.name,
                        appliedCount
                    });
                    console.log(`Applied ${appliedCount} overrides to "${targetInstance.name}"`);
                } else {
                    results.push({
                        success: false,
                        instanceId: targetInstance.id,
                        instanceName: targetInstance.name,
                        message: "No overrides were applied"
                    });
                }
            } catch (instanceError: any) {
                console.error(`Error processing instance "${targetInstance.name}":`, instanceError);
                results.push({
                    success: false,
                    instanceId: targetInstance.id,
                    instanceName: targetInstance.name,
                    message: `Error: ${instanceError.message}`
                });
            }
        }

        // Return results
        if (totalAppliedCount > 0) {
            const instanceCount = results.filter((r: any) => r.success).length;
            const message = `Applied ${totalAppliedCount} overrides to ${instanceCount} instances`;
            figma.notify(message);
            return {
                success: true,
                message,
                totalCount: totalAppliedCount,
                results
            };
        } else {
            const message = "No overrides applied to any instance";
            figma.notify(message);
            return { success: false, message, results };
        }

    } catch (error: any) {
        console.error("Error in setInstanceOverrides:", error);
        const message = `Error: ${error.message}`;
        figma.notify(message);
        return { success: false, message };
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

    try {
        const component = figma.createComponent(); // This creates a new empty component

        // Copy basic properties
        component.name = node.name;
        // Resize first
        component.resize(node.width, node.height);

        // Position and Hierarchy
        // We need to keep the component in the same hierarchy
        // Insert component into parent at the index of the node
        if (node.parent) {
            const index = node.parent.children.indexOf(node);
            node.parent.insertChild(index, component);
            component.x = node.x;
            component.y = node.y;
        }

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
        throw new Error(`Error creating component: ${error.message}`);
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
export async function createComponentSet(params: any) {
    const { components, properties, componentSetName, parentId } = params;

    // Validate inputs (basic validation done in main.js, but good to be safe)
    if (!components || components.length === 0) {
        throw new Error("Components array is empty");
    }
    if (!properties || properties.length === 0) {
        throw new Error("Properties array is empty");
    }

    const figmaComponents: any[] = [];

    // Process each component: Rename and Collect
    for (const compData of components) {
        const component = await figma.getNodeByIdAsync(compData.nodeId);
        if (!component || component.type !== 'COMPONENT') {
            throw new Error(`Node ${compData.nodeId} is not a valid component`);
        }

        // Construct variant name: "Prop1=Val1, Prop2=Val2"
        if (compData.propertyValues.length !== properties.length) {
            throw new Error(`Property values count mismatch for component ${component.name}`);
        }

        const nameParts = properties.map((prop: any, index: any) => `${prop}=${compData.propertyValues[index]}`);
        component.name = nameParts.join(", ");

        figmaComponents.push(component);
    }

    // Create ComponentSet
    const componentSet = figma.combineAsVariants(figmaComponents, figma.currentPage);

    // Rename ComponentSet
    if (componentSetName) {
        componentSet.name = componentSetName;
    }

    // Reparent if needed (combineAsVariants places it typically where the components were)
    if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent) {
            // @ts-ignore
            parent.appendChild(componentSet);
        }
    }

    return {
        id: componentSet.id,
        name: componentSet.name,
        type: "COMPONENT_SET",
        childCount: componentSet.children.length,
        variantProperties: componentSet.variantGroupProperties
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
    
    // Find qualified name
    let qualifiedName: string | null = null;
    const validNames: string[] = [];
    
    for (const key in properties) {
        // The key format is usually "PropertyName#nodeId" or similar, 
        // We split by '#' to get the human readable name
        const parts = key.split('#');
        const readableName = parts[0];
        validNames.push(readableName);
        
        if (readableName === propertyName) {
            qualifiedName = key;
            break;
        }
    }

    if (!qualifiedName) {
        throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(', ')}`);
    }

    try {
        instance.setProperties({ [qualifiedName]: value });
        return {
            id: instance.id,
            name: instance.name,
            type: instance.type,
            updatedProperty: propertyName,
            value: value
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

    const targetNode = node as ComponentNode | ComponentSetNode;
    const properties = targetNode.componentPropertyDefinitions;
    
    // Find qualified name for EDIT and DELETE
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
            
            const options: any = {};
            if (preferredValues) options.preferredValues = preferredValues;
            
            targetNode.addComponentProperty(propertyName, propertyType, defaultValue, options);
            
            return {
                id: targetNode.id,
                name: targetNode.name,
                action: "ADD",
                propertyName,
                propertyType,
                defaultValue
            };
            
        } else if (action === "EDIT") {
            if (!qualifiedName) {
                throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(', ')}`);
            }
            
            const options: any = {};
            if (newPropertyName !== undefined) options.name = newPropertyName;
            if (newDefaultValue !== undefined) options.defaultValue = newDefaultValue;
            if (preferredValues !== undefined) options.preferredValues = preferredValues;
            
            targetNode.editComponentProperty(qualifiedName, options);
            
            return {
                id: targetNode.id,
                name: targetNode.name,
                action: "EDIT",
                propertyName: newPropertyName || propertyName,
                updated: true
            };
            
        } else if (action === "DELETE") {
            if (!qualifiedName) {
                throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(', ')}`);
            }
            
            targetNode.deleteComponentProperty(qualifiedName);
            
            return {
                id: targetNode.id,
                name: targetNode.name,
                action: "DELETE",
                propertyName
            };
            
        } else {
            throw new Error(`Invalid action: ${action}`);
        }
    } catch (error: any) {
        throw new Error(`Error managing component property: ${error.message}`);
    }
}

