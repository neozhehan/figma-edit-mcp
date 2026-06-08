/**
 * Figma Plugin Main Entry Point
 * This file bundles all handlers and utilities for the Figma plugin
 */

// Import utilities
import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';
import { sanitizeForPostMessage } from '../utils/sanitize.js';

// Import handlers
import { getNodesInfo, getPagesInfo } from '../handlers/nodeReaders.js';
import { createShape, createFrame, createText, cloneNode } from '../handlers/nodeCreators.js';
import { transformNode, deleteMultipleNodes, viewNavigate, setNodeName, groupNodes, ungroupNodes, flattenNode, insertChild } from '../handlers/nodeModifiers.js';
import { setFillColor, setStroke, setCornerRadius, setEffects } from '../handlers/stylingHandlers.js';

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
    createComponentSet,
    setComponentInstanceProperty,
    manageComponentProperty,
    deleteComponentProperty
} from '../handlers/componentHandlers.js';

import { getReactions, createConnections } from '../handlers/connectorHandlers.js';
import { updateReactions } from '../handlers/prototypingHandlers.js';
import { setMultipleTextContents, setTextStyle } from '../handlers/textHandlers.js';
import { getAnnotations, setMultipleAnnotations } from '../handlers/annotationHandlers.js';
import { getVariables, setBoundVariable, handleVariableRequest, deleteVariables } from '../handlers/variableHandlers.js';
import { createStyle, applyStyle, deleteStyle } from '../handlers/styleHandlers.js';
import { createNodeFromSvg } from '../handlers/vectorHandlers.js';
import { getConnectPayload } from '../handlers/connectHandlers.js';


// Constants
const ERRORS: any = {
    // Editable Scope Errors
    READ_ONLY_MODE: "Operation Denied: Figma Plugin in Read-Only Mode. Verify if user intends for changes to be made. If so, advise user to disconnect plugin, paste a link to the page/layer to be edited into Link to Selection field, then reconnect plugin.",
    OUTSIDE_SCOPE: "Operation Denied: Node outside editable scope. Verify if user intends for changes to be made to this particular node. If so, advise user to disconnect plugin, paste a link to this page/layer into Link to Selection field, then reconnect plugin.",
    PARENT_OUTSIDE_SCOPE: "Operation Denied: Parent outside editable scope. Verify if user intends for changes to be made to the parent node. If so, advise user to disconnect plugin, paste a link to the parent page/layer into Link to Selection field, then reconnect plugin.",
    CLONING_SOURCE_NODE_OUTSIDE_SCOPE: "Operation Denied: Node to be cloned is outside editable scope. Verify if user intends for this node to be cloned. If so, advise user to disconnect plugin, paste a link to this page/layer into Link to Selection field, then reconnect plugin.",
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
const state: any = {
    serverPort: 3055, // Default port
    scopeRootId: null,
    readOnly: false // Default to false, but connection flow will set this
};

export function getPluginState() {
    return state;
}

// Helper: Format error message with current scope ID
function formatScopeError(errorMessage: any) {
    return `${errorMessage} (Current Editable Scope Node ID: ${state.scopeRootId || 'None'})`;
}

// Helper: Check if a node is within the allowed scope
async function checkScopeAccess(nodeId: any) {
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
async function verifyNodeName(nodeId: any, expectedName: any) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) return false; // Node existence checking should happen elsewhere usually, but if missing here, it's a mismatch technically.

    // Block operation if expectedName is not provided
    if (expectedName === undefined || expectedName === null) {
        return false;
    }

    return node.name === expectedName;
}

// Helper: Verify parent name matches expected name
async function verifyParentName(parentId: any, expectedParentName: any) {
    const node = await figma.getNodeByIdAsync(parentId);
    if (!node) return false;

    return node.name === expectedParentName;
}

// Helper: Parse Node ID from URL
function parseNodeIdFromUrl(url: any) {
    try {
        // @ts-ignore
        const urlObj = new URL(url);
        const nodeId = urlObj.searchParams.get("node-id");
        return nodeId ? nodeId.replace(/-/g, ":") : null;
    } catch (e: any) {
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
figma.ui.onmessage = async (msg: any) => {
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
                    // Send result back to UI. Sanitize first: any field that is
                    // figma.mixed (a Symbol) — or any other non-cloneable — would
                    // otherwise throw "Cannot unwrap symbol" on postMessage and
                    // fail a command whose mutation already succeeded.
                    figma.ui.postMessage({
                        type: "command-result",
                        id: msg.id,
                        result: sanitizeForPostMessage(result),
                    });
                } catch (error: any) {
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
figma.on("run", ({ command }: any) => {
    // Auto-connect removed to enforce Scope Selection workflow.
    // figma.ui.postMessage({ type: "auto-connect" });
});

// Update plugin settings
function updateSettings(settings: any) {
    if (settings.serverPort) {
        state.serverPort = settings.serverPort;
    }

    figma.clientStorage.setAsync("settings", {
        serverPort: state.serverPort,
    });
}

// Handle commands from UI
async function handleCommand(command: any, params: any) {
    switch (command) {
        case "get_connect_payload":
            return await getConnectPayload();
        case "node_set_fill":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setFillColor(params);
        case "node_set_stroke":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setStroke(params);
        case "node_set_corner_radius":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setCornerRadius(params);
        case "node_set_auto_layout":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setAutoLayout(params);
        case "node_bind_variable":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setBoundVariable(params);
        case "node_rename":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setNodeName(params);

        case "node_group":
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
                    // @ts-ignore
                    if (node.parent?.id !== parentId) {
                        // @ts-ignore
                        throw new Error(`Invalid Grouping: All nodes must share the same parent. Node "${node.name}" is under a different parent than "${firstNode.name}". Use 'insert_child' to reparent them first.`);
                    }
                }
            }
            return await groupNodes(params);

        case "node_ungroup":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await ungroupNodes(params);

        case "node_flatten":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await flattenNode(params);

        case "node_insert_child":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            // Validate parent
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            // Validate child
            if (!(await checkScopeAccess(params ? params.childId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.childId : null, params ? params.childNodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await insertChild(params);

        case "node_transform":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await transformNode(params);
        case "node_clone":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.CLONING_SOURCE_NODE_OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await cloneNode(params);

        case "create_shape":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createShape(params);
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
        case "create_instance":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createComponentInstance(params);

        case "create_connection":
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

        case "text_set_content":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!params || !params.text || !Array.isArray(params.text)) throw new Error("Missing or Invalid text parameter");
            for (const item of params.text) {
                if (!(await checkScopeAccess(item.nodeId))) throw new Error(formatScopeError(`Operation denied: Node ${item.nodeId} outside editable scope`));
                if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
            }
            return await setMultipleTextContents(params);

        case "text_set_style":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setTextStyle(params);

        case "annotation_set":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!params || !params.annotations || !Array.isArray(params.annotations)) throw new Error("Missing or Invalid annotations parameter");
            for (const item of params.annotations) {
                if (!(await checkScopeAccess(item.nodeId))) throw new Error(formatScopeError(`Operation denied: Node ${item.nodeId} outside editable scope`));
                if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
            }
            return await setMultipleAnnotations(params);

        case "node_delete":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!params || !params.nodes || !Array.isArray(params.nodes)) throw new Error("Missing or Invalid nodes parameter");

            const nodeIdsToDelete: any[] = [];
            for (const item of params.nodes) {
                if (!(await checkScopeAccess(item.nodeId))) throw new Error(formatScopeError(`Operation denied: Node ${item.nodeId} outside editable scope`));
                if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
                nodeIdsToDelete.push(item.nodeId);
            }

            return await deleteMultipleNodes({ nodeIds: nodeIdsToDelete });

        case "instance_set_overrides":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);

            // Check if targetNodes parameter is provided
            if (params && params.targetNodes) {
                // Validate that targetNodes is an array
                if (!Array.isArray(params.targetNodes)) {
                    throw new Error("targetNodes must be an array");
                }

                const targetNodeIds: any[] = [];

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
                        // @ts-ignore
                        figma.notify(sourceInstanceData.message);
                        return { success: false, message: sourceInstanceData.message };
                    }
                    return await setInstanceOverrides(targetNodesResult.targetInstances, sourceInstanceData);
                } else {
                    throw new Error(ERRORS.MISSING_SOURCE_INSTANCE_ID);
                }
            }
            throw new Error(ERRORS.MISSING_TARGET_NODE_IDS);

        case "instance_set_property":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setComponentInstanceProperty(params);

        case "component_manage_property":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await manageComponentProperty(params);

        case "component_delete_property":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await deleteComponentProperty(params);

        case "page_info":
            return await getPagesInfo(params);
        case "node_info":
            // 1. Prepare nodeIds (Empty-args dispatch)
            const effectiveNodeIds = (params && params.nodeIds && Array.isArray(params.nodeIds) && params.nodeIds.length > 0) 
                ? params.nodeIds 
                : (state.scopeRootId ? [state.scopeRootId] : []);
            
            // 2. Read-Only Mode check for empty-args
            if (effectiveNodeIds.length === 0 && state.readOnly) {
                return { nodes: [] };
            }

            // 3. Call unified handler path
            // NOTE: Avoid object spread (...) — Figma's plugin sandbox JS engine does not support it.
            return await getNodesInfo(Object.assign({}, params, {
                nodeIds: effectiveNodeIds,
                commandId: (params && params.commandId) ? params.commandId : generateCommandId()
            }));

        case "style_list":
            return await getStyles();
        case "component_list":
            return await getComponents(params);
        case "node_export_visual":
            return await exportNodeAsImage(params);
        case "annotation_list":
            return await getAnnotations(params);
        case "instance_get_overrides":
            if (!params || !params.instanceNodeId) {
                throw new Error("Missing instanceNodeId parameter");
            }
            // Get the instance node by ID
            const instanceNode = await figma.getNodeByIdAsync(params.instanceNodeId);
            if (!instanceNode) {
                throw new Error(`Instance node not found with ID: ${params.instanceNodeId}`);
            }
            // @ts-ignore
            return await getInstanceOverrides(instanceNode);
        case "reaction_list":
            if (!params || !params.nodeIds || !Array.isArray(params.nodeIds)) {
                throw new Error(ERRORS.MISSING_NODE_IDS);
            }
            return await getReactions(params.nodeIds);
        case "reaction_update":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            return await updateReactions(params);

        case "view_navigate":
            return await viewNavigate(params);
        case "variable_list":
            return await getVariables(params);

        case "variable_manage":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            // Document level, no scope check needed for creation? 
            // Often variables are global. But if we are scoped to a page/frame... variables are collection based.
            // Collections are document global. So we allow it if not read-only.
            return await handleVariableRequest(params);

        case "variable_delete":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            return await deleteVariables(params);

        case "style_manage":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            // Styles are document global.
            return await createStyle(params);

        case "style_delete":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            return await deleteStyle(params);

        case "node_apply_style":
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

        case "create_svg":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            // For creation, we check parent Scope
            if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
            if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
            return await createNodeFromSvg(params);

        case "node_set_effects":
            if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
            if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
            if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
            return await setEffects(params);

        default:
            throw new Error(`Unknown command: ${command}`);
    }
}
