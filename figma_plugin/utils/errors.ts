/**
 * Canonical guard/denial error messages.
 *
 * Single source for every message that more than one layer can emit — the
 * dispatcher (src/main.ts) and handler-level prevalidation (e.g.
 * componentHandlers.ts validateCreateComponentSetPlan) must import from here
 * rather than repeating the literals, so each denial ships with exactly one
 * wording (v2.3.2 rule: no superseded error variants).
 */
export const ERRORS: any = {
    // Editable Scope Errors
    READ_ONLY_MODE: "Operation Denied: Figma Plugin in Read-Only Mode. Verify if user intends for changes to be made. If so, advise user to disconnect plugin, paste a link to the page/layer to be edited into Link to Selection field, then reconnect plugin.",
    OUTSIDE_SCOPE: "Operation Denied: Node outside editable scope. Verify if user intends for changes to be made to this particular node. If so, advise user to disconnect plugin, paste a link to this page/layer into Link to Selection field, then reconnect plugin.",
    PARENT_OUTSIDE_SCOPE: "Operation Denied: Parent outside editable scope. Verify if user intends for changes to be made to the parent node. If so, advise user to disconnect plugin, paste a link to the parent page/layer into Link to Selection field, then reconnect plugin.",
    CLONING_SOURCE_NODE_OUTSIDE_SCOPE: "Operation Denied: Node to be cloned is outside editable scope. Verify if user intends for this node to be cloned. If so, advise user to disconnect plugin, paste a link to this page/layer into Link to Selection field, then reconnect plugin.",
    SCOPE_DELETED: "Operation Denied: The specific Node set as the Editable Scope no longer exists/cannot be found. Advise user to disconnect the plugin and Select a new Editable Scope.",
    VARIABLE_EDITS_DISABLED: "Operation Denied: Variable editing is disabled. Ask the user to tick 'Allow AI Agent to modify Variables' in the Figma plugin and reconnect.",
    STYLE_EDITS_DISABLED: "Operation Denied: Style editing is disabled. Ask the user to tick 'Allow AI Agent to modify Styles' in the Figma plugin and reconnect.",

    // Node ID Errors
    NAME_MISMATCH: "Operation Denied: nodeName does not match name of nodeId. Refresh context & recheck to ensure correct nodeId is passed in.",
    PARENT_NAME_MISMATCH: "Operation Denied: parentNodeName does not match name of parentId. Refresh context & recheck to ensure correct parentId is passed in.",

    // Parameter Errors
    MISSING_NODE_IDS: "Missing or Invalid nodeIds parameter",
    MISSING_TARGET_NODE_IDS: "Missing targetNodeIds parameter",
    MISSING_SOURCE_INSTANCE_ID: "Missing sourceInstanceId parameter",
    INVALID_TARGET_NODE_IDS: "targetNodeIds must be an array",
};

// Appends the scope-root suffix every scope denial carries.
export function formatScopeError(errorMessage: any, scopeRootId: string | null) {
    return `${errorMessage} (Current Editable Scope Node ID: ${scopeRootId || 'None'})`;
}
