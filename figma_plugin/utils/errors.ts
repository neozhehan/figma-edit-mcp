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
    // PARENT_NAME_MISSING / PARENT_NAME_MISMATCH moved to the REFUSALS factory
    // registry below (Q22, Rev 31 — distinct-cause coded pair). The merged
    // string that was here is superseded.

    // Parameter Errors
    MISSING_NODE_IDS: "Missing or Invalid nodeIds parameter",
    MISSING_TARGET_NODE_IDS: "Missing targetNodeIds parameter",
    MISSING_SOURCE_INSTANCE_ID: "Missing sourceInstanceId parameter",
    INVALID_TARGET_NODE_IDS: "targetNodeIds must be an array",

    // New Refusal and Operational Error Codes (v2.3.3)
    PLUGIN_PEER_UNAVAILABLE: "Operation Denied: Figma Plugin is not running or available. Please open the Figma document, start the figma-edit-mcp plugin, and reconnect.",
    PLUGIN_PEER_AMBIGUOUS: "Operation Denied: Multiple plugin peers are connected to this channel. Ensure the figma-edit-mcp plugin is open in exactly one Figma tab/document.",
    CHANNEL_IN_USE: "Operation Denied: This channel is already in use by another MCP session. Please use a different channel name or disconnect the other session.",
    VERSION_MISMATCH: "Operation Denied: Version mismatch between MCP server and Figma plugin. Please ensure both are updated to the same version.",
    // Page codes are operational failures, not safety refusals — no "Operation
    // Denied:" prefix (D9 reserves the prefix for policy/verification refusals).
    PAGE_LOAD_FAILED: "Failed to load the Figma page — it may be too large or temporarily unavailable. Retry the call; if the page keeps failing, list pages with page_info and continue with the pages that load.",
    PAGE_NOT_FOUND: "Page not found: the specified page ID does not exist in this document. List pages with page_info and pass a page ID back verbatim.",
    TARGET_NOT_PAGE: "Target node is not a PAGE. List pages with page_info and pass a page ID, not a node ID.",
    PAGE_LOAD_TIMEOUT: "Page load timed out. Retry the call; if the page keeps timing out, continue with the other pages and report the failing page to the user.",
    DOCUMENT_SCAN_INCOMPLETE: "Operation Denied: Document scan incomplete because one or more pages could not be loaded — a page error can never mean zero consumers, so the destructive operation was aborted. Retry when every page loads, or resolve the failing page in Figma first.",
    CONNECTOR_TEMPLATE_REQUIRED: "Operation Denied: No valid connector template was found in the document. Find a connector with page_info/node_info (pasting one from FigJam if the file has none) and pass its ID and exact current name.",
};

/**
 * Design-system verification refusals (v2.3.3 D5, code inventory per Q16).
 *
 * Message factories, not strings: handlers pass operands in and never compose
 * refusal text locally, so each code has exactly one authored message carrying
 * the D5 stored/received operands AND the D9 recovery (the read tool that
 * supplies the correct value, "pass it back verbatim"). Throw the returned
 * object as-is — the dispatcher forwards `{code, message, details?}` untouched.
 */
export const REFUSALS = {
    VARIABLE_NAME_MISSING: () => ({
        code: "VARIABLE_NAME_MISSING",
        message: "Operation Denied: currentVariableName is missing. Read the variable's current exact name with variable_list and pass it back verbatim.",
    }),
    VARIABLE_NAME_MISMATCH: (storedName: string, received: string) => ({
        code: "VARIABLE_NAME_MISMATCH",
        message: `Operation Denied: currentVariableName does not match the variable's stored name — stored name "${storedName}", received currentVariableName "${received}". Read the current name with variable_list and pass it back verbatim.`,
    }),
    COLLECTION_NAME_MISSING: () => ({
        code: "COLLECTION_NAME_MISSING",
        message: "Operation Denied: collectionName is missing. Read the collection's current exact name with variable_list and pass it back verbatim.",
    }),
    COLLECTION_NAME_MISMATCH: (storedName: string, received: string) => ({
        code: "COLLECTION_NAME_MISMATCH",
        message: `Operation Denied: collectionName does not match the resolved collection's stored name — stored name "${storedName}", received collectionName "${received}". Read the current name with variable_list and pass it back verbatim.`,
    }),
    STYLE_NAME_MISSING: () => ({
        code: "STYLE_NAME_MISSING",
        message: "Operation Denied: currentStyleName is missing. Read the style's current exact name with style_list and pass it back verbatim.",
    }),
    STYLE_NAME_MISMATCH: (storedName: string, received: string) => ({
        code: "STYLE_NAME_MISMATCH",
        message: `Operation Denied: currentStyleName does not match the resolved style's stored name — stored name "${storedName}", received currentStyleName "${received}". Read the current name with style_list and pass it back verbatim.`,
    }),
    VARIABLE_SCOPES_MISSING: () => ({
        code: "VARIABLE_SCOPES_MISSING",
        message: "Operation Denied: scopes is missing for CREATE_VARIABLE. Pass the allowed scopes explicitly — supply an empty array to deliberately set none; omission is rejected.",
    }),
    // D6 parent verification (Q22, Rev 31) — distinct causes, so an agent that
    // omits the name is not steered into swapping a correct parentId.
    PARENT_NAME_MISSING: () => ({
        code: "PARENT_NAME_MISSING",
        message: "Operation Denied: parentNodeName is missing. Read the parent node's current exact name with node_info and pass it back verbatim.",
    }),
    PARENT_NAME_MISMATCH: (storedName: string, received: string) => ({
        code: "PARENT_NAME_MISMATCH",
        message: `Operation Denied: parentNodeName does not match the parent's stored name — stored name "${storedName}", received parentNodeName "${received}". Read the parent's current name with node_info and pass it back verbatim.`,
    }),
};

/**
 * Wraps an unexpected mid-update failure with the Q18 partial-mutation
 * disclosure. The field names are shared with the D7 batch failure rows:
 * `partialMutation: true`, a plain-language `whatChanged` statement, and
 * cheap `before` values so the restoring write composes directly from the
 * error. Callers invoke this ONLY when at least one mutation already applied —
 * a clean failure never carries the flag.
 */
export function withPartialDisclosure(e: any, whatChanged: string, before: Record<string, any>) {
    const base = getStructuredError(e);
    return {
        code: base.code,
        message: `${base.message} Partial mutation: ${whatChanged}`,
        details: { ...(base.details || {}), partialMutation: true, whatChanged, before },
    };
}

// Appends the scope-root suffix every scope denial carries.
export function formatScopeError(errorMessage: any, scopeRootId: string | null) {
    return `${errorMessage} (Current Editable Scope Node ID: ${scopeRootId || 'None'})`;
}

// Helper: Extract a human-readable string message from any thrown value.
export function describeError(e: any): string {
    if (e == null) return "Error executing command";
    if (typeof e === "string") return e;
    if (typeof e.message === "string" && e.message.length > 0) {
        return e.name && e.name !== "Error" ? `${e.name}: ${e.message}` : e.message;
    }
    if (typeof e.toString === "function") {
        const s = e.toString();
        if (s && s !== "[object Object]") return s;
    }
    try {
        const json = JSON.stringify(e);
        if (json && json !== "{}") return json;
    } catch { /* not serializable */ }
    return e.name || "Error executing command";
}

// Formats a thrown value into the structured `{code, message, details?}` shape.
// The only classification is structural (Q16): a thrown coded object passes
// through untouched; anything else is the ratified legacy fallback
// UNKNOWN_ERROR, whose recovery is the message text itself. Codes are never
// derived from message prose.
export function getStructuredError(e: any): { code: string; message: string; details?: any } {
    if (e && typeof e === "object") {
        if (typeof e.code === "string") {
            return {
                code: e.code,
                message: e.message || "Error executing command",
                details: e.details
            };
        }
        if (e.error && typeof e.error.code === "string") {
            return {
                code: e.error.code,
                message: e.error.message || "Error executing command",
                details: e.error.details
            };
        }
    }

    return { code: "UNKNOWN_ERROR", message: describeError(e) };
}
