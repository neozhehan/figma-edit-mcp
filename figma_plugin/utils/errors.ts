// The ratified legacy fallback (Q16). Exported and named once so every
// reference within the plugin bundle is the same identifier, not a repeated
// literal (any plugin handler that surfaces an `UNKNOWN_ERROR` errorCode
// imports this rather than re-typing the string); the server-side mirror
// lives in `src/shared/errorCodes.ts`, kept as a SEPARATE definition to avoid
// a runtime import across the plugin-bundle boundary (Q27) — a parity test
// (`v2.3.3.phase4.test.ts`) enforces the two agree.
export const UNKNOWN_ERROR = "UNKNOWN_ERROR";

/**
 * Canonical guard/denial error messages — the LEGACY, pre-v2.3.3 surface.
 *
 * Single source for every message that more than one layer can emit — the
 * dispatcher (src/main.ts) and handler-level prevalidation (e.g.
 * componentHandlers.ts validateCreateComponentSetPlan) must import from here
 * rather than repeating the literals, so each denial ships with exactly one
 * wording (v2.3.2 rule: no superseded error variants).
 *
 * Scope (open-questions Q27, resolved 2026-07-23): this table holds ONLY
 * messages thrown as plain strings that predate v2.3.3's D9 structured-error
 * convention — they are outside Q16's "adds or edits" rule and travel as the
 * ratified `UNKNOWN_ERROR` fallback (converted to coded factories only as
 * each is touched, per the v2.3.4 burn-down). Every code this release adds
 * that can originate inside the plugin — D5/D6/D10 verification refusals and
 * the Phase 10–11 operational codes — lives in the `REFUSALS` factory registry
 * below, not here. Socket-admission and MCP-client state codes live at their
 * actual origins under `src/shared`. Do not add new entries.
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
};

/**
 * The plugin-origin v2.3.3 coded-refusal registry (Q16; scope corrected by
 * Q27 and Change 5 P9-F3): design-system verification (D5), parent/category
 * verification (D6/D10), Phase 10's live page-load codes, and Phase 11's
 * connector placeholder live here as message factories, not as plain strings
 * in `ERRORS`. "Every
 * coded refusal originates from the central registry of message factories"
 * means the registry at the layer that can actually raise it: this table for
 * plugin-origin codes, `CHANNEL_REFUSALS` for socket admission, and
 * `CLIENT_REFUSALS` for pre-wire MCP-client state. `ERRORS` above remains the
 * separate, closed legacy-only surface Q27 scopes it to.
 *
 * Message factories, not strings: handlers pass operands in and never compose
 * refusal text locally, so each code has exactly one authored message carrying
 * the D5 stored/received operands AND the D9 recovery (the read tool that
 * supplies the correct value, "pass it back verbatim"). Throw the returned
 * object as-is — the dispatcher forwards `{code, message, details?}` untouched.
 */
export const REFUSALS = {
    // Phase 9's four D13 codes are NOT here by design (Change 5, P9-F3). They
    // are channel-admission refusals decided by the socket bridge before any
    // frame reaches Figma, so the plugin has no throw site for them and a
    // bundle-side copy would be dead weight in `code.js`. They live only in
    // `src/shared/channelProtocol.ts`; a regression asserts their absence here.
    // Phase 10's page-load entries are raised through pageLoad.ts. Phase 11's
    // connector entry remains a placeholder until that phase lands; both are
    // plugin-thrown and therefore belong in this registry.
    //
    // Page codes are operational failures, not safety refusals — no "Operation
    // Denied:" prefix (D9 reserves the prefix for policy/verification refusals).
    PAGE_LOAD_FAILED: (pageId?: string, cause?: string) => ({
        code: "PAGE_LOAD_FAILED",
        message: `Failed to load Figma page${pageId ? ` "${pageId}"` : ""} — it may be too large or temporarily unavailable. Retry the call; if the page keeps failing, list pages with page_info and continue with the pages that load.`,
        ...(pageId || cause
            ? { details: { ...(pageId ? { pageId } : {}), ...(cause ? { cause } : {}) } }
            : {}),
    }),
    PAGE_NOT_FOUND: (pageId?: string) => ({
        code: "PAGE_NOT_FOUND",
        message: `Page not found${pageId ? `: "${pageId}"` : ""} does not exist in this document. List pages with page_info and pass a page ID back verbatim.`,
        ...(pageId ? { details: { pageId } } : {}),
    }),
    TARGET_NOT_PAGE: (pageId?: string, actualType?: string) => ({
        code: "TARGET_NOT_PAGE",
        message: `Target${pageId ? ` "${pageId}"` : ""} is not a PAGE${actualType ? ` (resolved type: ${actualType})` : ""}. List pages with page_info and pass a page ID, not a node ID.`,
        ...(pageId || actualType
            ? { details: { ...(pageId ? { pageId } : {}), ...(actualType ? { actualType } : {}) } }
            : {}),
    }),
    PAGE_LOAD_TIMEOUT: (pageId?: string, timeoutMs?: number) => ({
        code: "PAGE_LOAD_TIMEOUT",
        message: `Figma page${pageId ? ` "${pageId}"` : ""} did not load within the bounded per-page timeout. Retry the call; if the page keeps timing out, continue with the other pages and report the failing page to the user.`,
        ...(pageId || timeoutMs
            ? { details: { ...(pageId ? { pageId } : {}), ...(timeoutMs ? { timeoutMs } : {}) } }
            : {}),
    }),
    DOCUMENT_SCAN_INCOMPLETE: (pageErrors?: any[]) => ({
        code: "DOCUMENT_SCAN_INCOMPLETE",
        message: "Operation Denied: Document scan incomplete because one or more pages could not be loaded — a page error can never mean zero consumers, so the destructive operation was aborted. Retry when every page loads, or resolve the failing page in Figma first.",
        ...(Array.isArray(pageErrors) && pageErrors.length > 0
            ? {
                details: {
                    coverage: {
                        complete: false,
                        pageErrors,
                    },
                },
            }
            : {}),
    }),
    CONNECTOR_TEMPLATE_REQUIRED: () => ({
        code: "CONNECTOR_TEMPLATE_REQUIRED",
        message: "Operation Denied: No valid connector template was found in the document. Find a connector with page_info/node_info (pasting one from FigJam if the file has none) and pass its ID and exact current name.",
    }),
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
    // D10 annotation-category verification (Q30, Rev 46). A category ID can only
    // be checked against the document, so — unlike a duplicate target (Q23) —
    // this is a coded execution refusal, not a Layer 1 payload rejection.
    ANNOTATION_CATEGORY_NOT_FOUND: (received: string) => ({
        code: "ANNOTATION_CATEGORY_NOT_FOUND",
        message: `Operation Denied: categoryId does not resolve to an annotation category in this document — received categoryId "${received}". List the file's categories with annotation_list (includeCategories: true) and pass a returned category ID back verbatim, or omit categoryId entirely.`,
    }),
};

/**
 * Wraps an unexpected mid-update failure with the Q18 partial-mutation
 * disclosure. The field names are shared with the D7 batch failure rows:
 * `partialMutation: true`, a plain-language `whatChanged` statement, and
 * cheap `before` values as diagnostic evidence of the known pre-mutation state.
 * The evidence is not guaranteed to be a directly executable restore payload.
 * Callers invoke this ONLY when at least one mutation already applied — a clean
 * failure never carries the flag.
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
    const fallback = "Error executing command";
    if (e == null) return fallback;
    if (typeof e === "string") {
        const message = e.trim();
        return message || fallback;
    }
    let rawMessage: unknown;
    let rawName: unknown;
    try {
        rawMessage = e.message;
        rawName = e.name;
    } catch {
        // A thrown Proxy may itself reject property access. Fall through to
        // other renderers without allowing error reporting to throw again.
    }
    if (typeof rawMessage === "string") {
        const message = rawMessage.trim();
        if (!message) return fallback;
        const name = typeof rawName === "string" ? rawName.trim() : "";
        return name && name !== "Error" ? `${name}: ${message}` : message;
    }
    try {
        if (typeof e.toString === "function") {
            const rendered = e.toString();
            if (typeof rendered === "string") {
                const message = rendered.trim();
                if (message && message !== "[object Object]") return message;
            }
        }
    } catch {
        // A custom toString is not trusted input. JSON/name/fallback below
        // still guarantees a non-blank diagnostic.
    }
    try {
        const json = JSON.stringify(e);
        if (json && json !== "{}") return json;
    } catch { /* not serializable */ }
    const name = typeof rawName === "string" ? rawName.trim() : "";
    return name || fallback;
}

/**
 * Delivers a user-facing Figma notification as BEST-EFFORT telemetry.
 *
 * `figma.notify` is a UI call that can throw, and it is invoked from paths that
 * run both before and after mutation. A delivery failure must never enter
 * outcome accounting, change control flow, or erase the D7 envelope that reports
 * a mutation that already happened — the same rule progress delivery follows
 * (C3). Every notification site routes through here so no call site is
 * load-bearing.
 */
export function notifyBestEffort(message: string): void {
    try {
        figma.notify(message);
    } catch (error: any) {
        console.warn(`Notification delivery failed (ignored): ${describeError(error)}`);
    }
}

type SafePropertyRead = {
    readable: boolean;
    value?: any;
};

function readErrorProperty(value: any, property: string): SafePropertyRead {
    try {
        return {
            readable: true,
            value: value[property],
        };
    } catch {
        return { readable: false };
    }
}

/**
 * Copies the top-level details record before it is merged into a
 * partial-mutation disclosure. A hostile Proxy can make enumeration or a field
 * read throw; those optional details are then omitted instead of being allowed
 * to erase the primary outcome.
 */
function copyReadableErrorDetails(value: any): any {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== "object") return value;
    try {
        if (Array.isArray(value)) return [...value];
        return { ...value };
    } catch {
        return undefined;
    }
}

function structuredErrorFromObject(
    value: any,
): { code: string; message: string; details?: any } | null {
    if (value === null || typeof value !== "object") return null;

    const codeRead = readErrorProperty(value, "code");
    if (!codeRead.readable || typeof codeRead.value !== "string") return null;

    const messageRead = readErrorProperty(value, "message");
    const detailsRead = readErrorProperty(value, "details");
    const result: { code: string; message: string; details?: any } = {
        code: codeRead.value,
        message:
            messageRead.readable &&
            typeof messageRead.value === "string" &&
            messageRead.value.length > 0
                ? messageRead.value
                : "Error executing command",
    };
    if (detailsRead.readable) {
        const details = copyReadableErrorDetails(detailsRead.value);
        if (details !== undefined) result.details = details;
    }
    return result;
}

// Formats a thrown value into the structured `{code, message, details?}` shape.
// The only classification is structural (Q16): a thrown coded object passes
// through untouched; anything else is the ratified legacy fallback
// UNKNOWN_ERROR, whose recovery is the message text itself. Codes are never
// derived from message prose. Every property read is guarded because a thrown
// Proxy is adversarial input too: reporting an error must itself be total.
export function getStructuredError(e: any): { code: string; message: string; details?: any } {
    const direct = structuredErrorFromObject(e);
    if (direct) return direct;

    if (e !== null && typeof e === "object") {
        const nestedRead = readErrorProperty(e, "error");
        if (nestedRead.readable) {
            const nested = structuredErrorFromObject(nestedRead.value);
            if (nested) return nested;
        }
    }

    return { code: UNKNOWN_ERROR, message: describeError(e) };
}
