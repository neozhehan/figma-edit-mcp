/**
 * Figma Plugin Main Entry Point
 * This file bundles all handlers and utilities for the Figma plugin
 */

// Import utilities
import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';

// Import handlers
import { getDocumentInfo, getSelection, getNodesInfo, readMyDesign, getPageInfo } from '../handlers/nodeReaders.js';
import { createRectangle, createFrame, createText, cloneNode, createEllipse, createPolygonStar } from '../handlers/nodeCreators.js';
import { moveNode, resizeNode, deleteMultipleNodes, setSelections, setNodeName, groupNodes, ungroupNodes, flattenNode, insertChild } from '../handlers/nodeModifiers.js';
import { setFillColor, setStrokeColor, setCornerRadius, setEffects } from '../handlers/stylingHandlers.js';

import { setAutoLayout } from '../handlers/layoutHandlers.js';
import {
    getStyles,
    getComponents,
    createComponentInstance,
    exportNodeAsImage,
    getInstanceOverrides,
    getValidTargetInstances,
    getSourceInstanceData,
    setInstanceOverrides,
    createComponent,
    createComponentSet
} from '../handlers/componentHandlers.js';

import { getReactions, createConnections } from '../handlers/connectorHandlers.js';
import { scanTextNodes, setMultipleTextContents, setTextStyle } from '../handlers/textHandlers.js';
import { getAnnotations, scanNodesByTypes, setMultipleAnnotations } from '../handlers/annotationHandlers.js';
import { getVariables, getNodeVariables, setBoundVariable, handleVariableRequest } from '../handlers/variableHandlers.js';
import { createStyle, applyStyle } from '../handlers/styleHandlers.js';
import { createNodeFromSvg } from '../handlers/vectorHandlers.js';


// Constants
const ERRORS = {
    // Editable Scope Errors
    READ_ONLY_MODE: "Operation Denied: Figma Plugin in Read-Only Mode. Verify if user intends for changes to be made. If so, advise user to disconnect plugin, paste a link to the page/layer to be edited into Link to Selection field, then reconnect plugin.",
    OUTSIDE_SCOPE: "Operation Denied: Node outside editable scope. Verify if user intends for changes to be made to this particular node. If so, advise user to disconnect plugin, paste a link to this page/layer into Link to Selection field, then reconnect plugin.",
    PARENT_OUTSIDE_SCOPE: "Operation Denied: Parent outside editable scope. Verify if user intends for changes to be made to the parent node. If so, advise user to disconnect plugin, paste a link to the parent page/layer into Link to Selection field, then reconnect plugin.",
    CLONING_SOURCE_NODE_OUTSIDE_SCOPE: "Operation Denied: Node to be cloned is outside editable scope. Verify if user intends for this node to be cloned. If so, advise user to disconnect plugin, paste a link to this page/layer into Link to Selection field, then reconnect plugin.",
    ROOT_INSTANCE_DISALLOWED: "Operation Denied: Cannot create instance at root with current editable scope. Verify if user intends for the instance to be created on this page. If so, advise user to disconnect plugin, paste a link to this page into Link to Selection field, then reconnect plugin.",
    SCOPE_DELETED: "Operation Denied: The specific Node set as the Editable Scope no longer exists/cannot be found. Advise user to disconnect the plugin and Select a new Editable Scope.",

    // Node ID Errors
    NAME_MISMATCH: "Operation Denied: nodeName does not match name of nodeId. Refresh context & recheck to ensure correct nodeId is passed in.",
    PARENT_NAME_MISMATCH: "Operation Denied: parentNodeName does not match name of parentId. Refresh context & recheck to ensure correct parentId is passed in.",

    // Parameter Errors
    MISSING_NODE_IDS: "Missing or Invalid nodeIds parameter",
    MISSING_TARGET_NODE_IDS: "Missing targetNodeIds parameter",
    MISSING_SOURCE_INSTANCE_ID: "Missing sourceInstanceId parameter",
    INVALID_TARGET_NODE_IDS: "targetNodeIds must be an array",
};

// Plugin state
const state = {
    serverPort: 3055, // Default port
    scopeRootId: null,
    readOnly: false // Default to false, but connection flow will set this
};

// Helper: Format error message with current scope ID
function formatScopeError(errorMessage) {
    return `${errorMessage} (Current Editable Scope Node ID: ${state.scopeRootId || 'None'})`;
}

// Helper: Check if a node is within the allowed scope
async function checkScopeAccess(nodeId) {
    if (state.readOnly) return false;

    // If scope is not set, we assume restricted access (deny) unless strict flow says otherwise.
    // However, based on the flow: "Empty -> Read-Only", "Link -> Scoped".
    // So if we are NOT read-only, we MUST have a scopeRootId.
    if (!state.scopeRootId) return false;

    // Check if scope root still exists
    const scopeNode = await figma.getNodeByIdAsync(state.scopeRootId);
    if (!scopeNode) {
        throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
    }

    let node = await figma.getNodeByIdAsync(nodeId);
    // Be robust against missing nodes
    if (!node) return false;

    // Traverse up
    while (node) {
        if (node.id === state.scopeRootId) return true;
        node = node.parent;
    }
    return false;
}

// Helper: Verify node name matches expected name
async function verifyNodeName(nodeId, expectedName) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) return false; // Node existence checking should happen elsewhere usually, but if missing here, it's a mismatch technically.

    // Block operation if expectedName is not provided
    if (expectedName === undefined || expectedName === null) {
        return false;
    }

    return node.name === expectedName;
}

// Helper: Verify parent name matches expected name
async function verifyParentName(parentId, expectedParentName) {
    const node = await figma.getNodeByIdAsync(parentId);
    if (!node) return false;

    return node.name === expectedParentName;
}

// Helper: Parse Node ID from URL
function parseNodeIdFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const nodeId = urlObj.searchParams.get("node-id");
        return nodeId ? nodeId.replace(/-/g, ":") : null;
    } catch (e) {
        // Fallback for simple paste? Or maybe strictly require URL structure
        // Figma often copies as: "https://www.figma.com/design/..."
        // Regex fallback might be safer if URL object fails or protocol is weird
        const match = url.match(/node-id=([^&]+)/);
        if (match) return match[1].replace(/-/g, ":");
        return null;
    }
}

// Show UI
figma.showUI(__html__, { width: 350, height: 450 });

// Plugin commands from UI
figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
        case "update-settings":
            updateSettings(msg);
            break;
        case "notify":
            figma.notify(msg.message);
            break;
        case "close-plugin":
            figma.closePlugin();
            break;
        case "validate-scope-link":
            const nodeId = parseNodeIdFromUrl(msg.link);
            if (!nodeId) {
                figma.ui.postMessage({ type: "scope-validation-result", valid: false, reason: "Invalid Figma URL" });
                return;
            }
            const node = await figma.getNodeByIdAsync(nodeId);
            if (node) {
                figma.ui.postMessage({
                    type: "scope-validation-result",
                    valid: true,
                    nodeName: node.name,
                    nodeId: node.id,
                    nodeType: node.type
                });
            } else {
                figma.ui.postMessage({ type: "scope-validation-result", valid: false, reason: "Node not found in current document" });
            }
            break;
        case "set-scope":
            if (msg.scopeNodeId) {
                state.scopeRootId = msg.scopeNodeId;
                state.readOnly = false;
                figma.notify(`Scope locked to node: ${msg.scopeNodeId}`);
            } else {
                state.scopeRootId = null;
                state.readOnly = true;
                figma.notify("Connected in Read-Only Mode");
            }
            break;
        case "execute-command":
            // Execute commands received from UI (which gets them from WebSocket)
            // Use a promise chain (queue) to serialize execution and prevent race conditions
            state.commandQueue = (state.commandQueue || Promise.resolve()).then(async () => {
                try {
                    const result = await handleCommand(msg.command, msg.params);
                    // Send result back to UI
                    figma.ui.postMessage({
                        type: "command-result",
                        id: msg.id,
                        result,
                    });
                } catch (error) {
                    figma.ui.postMessage({
                        type: "command-error",
                        id: msg.id,
                        error: error.message || "Error executing command",
                    });
                }
            });
            break;
    }
};

// Listen for plugin commands from menu
figma.on("run", ({ command }) => {
    // Auto-connect removed to enforce Scope Selection workflow.
    // figma.ui.postMessage({ type: "auto-connect" });
});

// Update plugin settings
function updateSettings(settings) {
    if (settings.serverPort) {
        state.serverPort = settings.serverPort;
    }

    figma.clientStorage.setAsync("settings", {
        serverPort: state.serverPort,
    });
}

// Handle commands from UI
async function handleCommand(command, params) {
    switch (command) {
        case "set_fill_color":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setFillColor(params);
        case "set_stroke_color":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setStrokeColor(params);
        case "set_corner_radius":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setCornerRadius(params);
        case "set_auto_layout":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setAutoLayout(params);
        case "set_bound_variable":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setBoundVariable(params);
        case "set_node_name":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setNodeName(params);

        case "group_nodes":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!params || !params.nodes || !Array.isArray(params.nodes)) throw new Error("Missing or Invalid nodes parameter");

            // Explicitly validate all nodes share the same parent
            if (params.nodes.length > 0) {
                const firstNode = await figma.getNodeByIdAsync(params.nodes[0].nodeId);
                if (!firstNode) throw new Error(`Node ${params.nodes[0].nodeId} not found`);
                const parentId = firstNode.parent?.id;

                for (const item of params.nodes) {
                    if (!(await checkScopeAccess(item.nodeId))) throw new Error(formatScopeError(`Operation denied: Node ${item.nodeId} outside editable scope`));
                    if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);

                    // Check parent consistency
                    const node = await figma.getNodeByIdAsync(item.nodeId);
                    if (node.parent?.id !== parentId) {
                        throw new Error(`Invalid Grouping: All nodes must share the same parent. Node "${node.name}" is under a different parent than "${firstNode.name}". Use 'insert_child' to reparent them first.`);
                    }
                }
            }
            return await groupNodes(params);

        case "ungroup_nodes":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await ungroupNodes(params);

        case "flatten_node":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await flattenNode(params);

        case "insert_child":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            // Validate parent
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            // Validate child
            if (!(await checkScopeAccess(params ? params.childId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.childId : null, params ? params.childNodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await insertChild(params);

        case "move_node":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await moveNode(params);
        case "resize_node":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await resizeNode(params);
        case "clone_node":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.CLONING_SOURCE_NODE_OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await cloneNode(params);

        case "create_rectangle":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createRectangle(params);
        case "create_frame":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createFrame(params);
        case "create_text":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createText(params);
        case "create_ellipse":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createEllipse(params);
        case "create_polygon_star":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createPolygonStar(params);
        case "create_component_instance":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);

            if (params && params.parentId) {
                if (!(await checkScopeAccess(params.parentId))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
                if (!(await verifyParentName(params.parentId, params.parentNodeName))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            } else {
                if (state.scopeRootId) throw new Error(formatScopeError(ERRORS.ROOT_INSTANCE_DISALLOWED));
            }
            return await createComponentInstance(params);

        case "create_connections":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);

            // Validate connectorId if setting default
            if (params && params.connectorId) {
                if (!(await checkScopeAccess(params.connectorId))) throw new Error(formatScopeError(`Operation denied: Connector node ${params.connectorId} outside editable scope`));
            }

            // Validate connections if creating lines
            if (params && params.connections && Array.isArray(params.connections)) {
                for (const conn of params.connections) {
                    if (!(await checkScopeAccess(conn.startNodeId))) throw new Error(formatScopeError(`Operation denied: Start node ${conn.startNodeId} outside editable scope`));
                    if (!(await verifyNodeName(conn.startNodeId, conn.startNodeName))) throw new Error(ERRORS.NAME_MISMATCH);

                    if (!(await checkScopeAccess(conn.endNodeId))) throw new Error(formatScopeError(`Operation denied: End node ${conn.endNodeId} outside editable scope`));
                    if (!(await verifyNodeName(conn.endNodeId, conn.endNodeName))) throw new Error(ERRORS.NAME_MISMATCH);
                }
            }
            return await createConnections(params);

        case "set_multiple_text_contents":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!params || !params.text || !Array.isArray(params.text)) throw new Error("Missing or Invalid text parameter");
            for (const item of params.text) {
                if (!(await checkScopeAccess(item.nodeId))) throw new Error(formatScopeError(`Operation denied: Node ${item.nodeId} outside editable scope`));
                if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
            }
            return await setMultipleTextContents(params);

        case "set_text_style":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setTextStyle(params);

        case "set_multiple_annotations":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!params || !params.annotations || !Array.isArray(params.annotations)) throw new Error("Missing or Invalid annotations parameter");
            for (const item of params.annotations) {
                if (!(await checkScopeAccess(item.nodeId))) throw new Error(formatScopeError(`Operation denied: Node ${item.nodeId} outside editable scope`));
                if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
            }
            return await setMultipleAnnotations(params);

        case "delete_multiple_nodes":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!params || !params.nodes || !Array.isArray(params.nodes)) throw new Error("Missing or Invalid nodes parameter");

            const nodeIdsToDelete = [];
            for (const item of params.nodes) {
                if (!(await checkScopeAccess(item.nodeId))) throw new Error(formatScopeError(`Operation denied: Node ${item.nodeId} outside editable scope`));
                if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
                nodeIdsToDelete.push(item.nodeId);
            }

            return await deleteMultipleNodes({ nodeIds: nodeIdsToDelete });

        case "set_instance_overrides":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);

            // Check if targetNodes parameter is provided
            if (params && params.targetNodes) {
                // Validate that targetNodes is an array
                if (!Array.isArray(params.targetNodes)) {
                    throw new Error("targetNodes must be an array");
                }

                const targetNodeIds = [];

                // Permission check and name verification
                for (const item of params.targetNodes) {
                    if (!(await checkScopeAccess(item.nodeId))) throw new Error(formatScopeError(`Operation denied: Target instance ${item.nodeId} outside editable scope`));
                    if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
                    targetNodeIds.push(item.nodeId);
                }

                // Get the instance nodes by IDs
                const targetNodesResult = await getValidTargetInstances(targetNodeIds);
                if (!targetNodesResult.success) {
                    figma.notify(targetNodesResult.message);
                    return { success: false, message: targetNodesResult.message };
                }

                if (params.sourceInstanceId) {
                    // get source instance data
                    let sourceInstanceData = null;
                    sourceInstanceData = await getSourceInstanceData(params.sourceInstanceId);

                    if (!sourceInstanceData.success) {
                        figma.notify(sourceInstanceData.message);
                        return { success: false, message: sourceInstanceData.message };
                    }
                    return await setInstanceOverrides(targetNodesResult.targetInstances, sourceInstanceData);
                } else {
                    throw new Error(ERRORS.MISSING_SOURCE_INSTANCE_ID);
                }
            }
            throw new Error(ERRORS.MISSING_TARGET_NODE_IDS);

        case "get_document_info":
            return await getDocumentInfo();
        case "get_page_info":
            return await getPageInfo(params);
        case "get_selection":
            return await getSelection();
        case "get_nodes_info":
            if (params && params.nodeIds && Array.isArray(params.nodeIds) && params.nodeIds.length > 0) {
                return await getNodesInfo(params.nodeIds);
            }

            // If no nodeIds provided, return the editable scope info
            if (state.scopeRootId) {
                return await getNodesInfo([state.scopeRootId]);
            }

            // Read-Only Mode: Return empty array
            return [];
        case "read_my_design":
            return await readMyDesign();
        case "get_styles":
            return await getStyles();
        case "get_components":
            return await getComponents(params);
        case "export_node_as_image":
            return await exportNodeAsImage(params);
        case "scan_text_nodes":
            return await scanTextNodes(params);
        case "get_annotations":
            return await getAnnotations(params);
        case "scan_nodes_by_types":
            return await scanNodesByTypes(params);
        case "get_instance_overrides":
            // Check if instanceNode parameter is provided
            if (params && params.instanceNodeId) {
                // Get the instance node by ID
                const instanceNode = await figma.getNodeByIdAsync(params.instanceNodeId);
                if (!instanceNode) {
                    throw new Error(`Instance node not found with ID: ${params.instanceNodeId}`);
                }
                return await getInstanceOverrides(instanceNode);
            }
            // Call without instance node if not provided
            return await getInstanceOverrides();
        case "get_reactions":
            if (!params || !params.nodeIds || !Array.isArray(params.nodeIds)) {
                throw new Error(ERRORS.MISSING_NODE_IDS);
            }
            return await getReactions(params.nodeIds);

        case "set_selections":
            return await setSelections(params);
        case "get_variables":
            return await getVariables(params);
        case "get_node_variables":
            return await getNodeVariables(params);

        case "manage_variables":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            // Document level, no scope check needed for creation? 
            // Often variables are global. But if we are scoped to a page/frame... variables are collection based.
            // Collections are document global. So we allow it if not read-only.
            return await handleVariableRequest(params);

        case "create_style":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            // Styles are document global.
            return await createStyle(params);

        case "apply_style":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await applyStyle(params);

        case "create_component":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await createComponent(params);

        case "create_component_set":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);

            // Validate properties match
            const props = params.properties || [];
            if (params.components) {
                if (!Array.isArray(params.components)) throw new Error("components must be an array");

                for (const comp of params.components) {
                    // Check scope and name for each component
                    if (!(await checkScopeAccess(comp.nodeId))) throw new Error(formatScopeError(`Operation denied: Component ${comp.nodeId} outside editable scope`));
                    if (!(await verifyNodeName(comp.nodeId, comp.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);

                    // Check property count
                    if (!comp.propertyValues || comp.propertyValues.length !== props.length) {
                        throw new Error(`Property values count for component ${comp.nodeName} does not match properties count`);
                    }
                }
            }

            // Check parent scope if provided
            if (params.parentId) {
                if (!(await checkScopeAccess(params.parentId))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
                if (!(await verifyParentName(params.parentId, params.parentNodeName))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            }

            return await createComponentSet(params);

        case "create_node_from_svg":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            // For creation, we check parent Scope
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createNodeFromSvg(params);

        case "set_effects":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setEffects(params);

        default:
            throw new Error(`Unknown command: ${command}`);
    }
}
