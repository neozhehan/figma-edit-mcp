/**
 * Ratified error-code inventory for v2.3.3 (open-questions Q16, Option A;
 * amended by PRD Rev 27). One authoritative list, used by the MCP-server code
 * and cross-checked against the plugin's registries by the inventory test —
 * the plugin bundle keeps its own registry (`figma_plugin/utils/errors.ts`)
 * to avoid a runtime import across the bundle boundary; the two are kept from
 * drifting by a parity test, not a shared import. This split — plus each
 * side unifying on ONE message-factory pattern internally — is the recorded
 * Q27 decision (Option B, resolved 2026-07-23), not an ad hoc scope-down.
 */

/** The ratified legacy fallback: a failure not thrown as a coded object. */
export const UNKNOWN_ERROR = "UNKNOWN_ERROR";

/** Operational codes registered for Phases 9–11 (task-list header). */
export const OPERATIONAL_CODES = [
    "PLUGIN_PEER_UNAVAILABLE",
    "PLUGIN_PEER_AMBIGUOUS",
    "CHANNEL_IN_USE",
    "VERSION_MISMATCH",
    "PAGE_LOAD_FAILED",
    "PAGE_NOT_FOUND",
    "TARGET_NOT_PAGE",
    "PAGE_LOAD_TIMEOUT",
    "DOCUMENT_SCAN_INCOMPLETE",
    "CONNECTOR_TEMPLATE_REQUIRED",
] as const;

/** D5 verification refusal codes (Phase 4; seven, per Rev 27). */
export const VERIFICATION_CODES = [
    "VARIABLE_NAME_MISSING",
    "VARIABLE_NAME_MISMATCH",
    "COLLECTION_NAME_MISSING",
    "COLLECTION_NAME_MISMATCH",
    "STYLE_NAME_MISSING",
    "STYLE_NAME_MISMATCH",
    "VARIABLE_SCOPES_MISSING",
] as const;

/**
 * D6 parent-verification refusal codes (Phase 5; Q22, Rev 31). The edited
 * parent-name refusal joins the coded regime as a distinct-cause pair —
 * missing vs. mismatched — on D9's "adds or edits" rule (the same precedent
 * that added VARIABLE_SCOPES_MISSING). Message factories live beside the D5
 * refusals in the plugin registry.
 */
export const PARENT_VERIFICATION_CODES = [
    "PARENT_NAME_MISSING",
    "PARENT_NAME_MISMATCH",
] as const;

/**
 * Pre-existing join-flow codes — NOT new v2.3.3 inventory. Origin-assigned
 * since Q20 (figma-client codes them where the failure is created; channel.ts
 * passes them through and keys recovery guidance on them, never on prose).
 */
export const JOIN_CODES = [
    "MISSING_CHANNEL",
    "CHANNEL_NOT_FOUND",
    "CHANNEL_JOIN_FAILED",
    "PLUGIN_DISCONNECTED",
] as const;

/** The full ratified v2.3.3 inventory: nineteen codes plus the fallback. */
export const RATIFIED_CODES = [
    ...OPERATIONAL_CODES,
    ...VERIFICATION_CODES,
    ...PARENT_VERIFICATION_CODES,
    UNKNOWN_ERROR,
] as const;
