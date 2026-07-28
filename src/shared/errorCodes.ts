/**
 * Ratified error-code inventory for v2.3.3 (open-questions Q16, Option A;
 * amended through PRD Rev 58). This is the authoritative membership list.
 * Message factories are origin-scoped: socket admission uses
 * `CHANNEL_REFUSALS`, pre-wire MCP-client state uses `CLIENT_REFUSALS`, and
 * plugin-origin refusals use `figma_plugin/utils/errors.ts`. Inventory tests
 * enforce membership, per-origin parity, and the deliberate absence of dead
 * mirrors. The plugin keeps its own runtime registry because its bundle cannot
 * import `src/shared`; Q27's centralization rule therefore means one factory at
 * the layer that can actually raise each code, not duplicated factories across
 * every layer (Change 5 P9-F3; Change 6 C6-D5).
 */

/** The ratified legacy fallback: a failure not thrown as a coded object. */
export const UNKNOWN_ERROR = "UNKNOWN_ERROR";

/**
 * D13 operational codes whose ONLY origin is the socket bridge (Phase 9).
 *
 * These are refusals about channel admission, so they are decided before any
 * frame reaches Figma and the plugin can never throw one. Their factories live
 * in `channelProtocol.ts` and are deliberately absent from the plugin registry
 * (Change 5, P9-F3): Q27 splits the registries because the plugin bundle cannot
 * import `src/shared` at runtime, which is a reason to duplicate codes the
 * PLUGIN throws — not a reason to ship a mirror of a code it never throws.
 */
export const SOCKET_OPERATIONAL_CODES = [
    "PLUGIN_PEER_UNAVAILABLE",
    "PLUGIN_PEER_AMBIGUOUS",
    "CHANNEL_IN_USE",
    "VERSION_MISMATCH",
] as const;

/**
 * Operational codes raised by the MCP client itself, before any frame is put
 * on the wire (Change 5 follow-up, Rev 57).
 *
 * `CHANNEL_NOT_BOUND` is the state a tool call hits when this session holds no
 * channel binding. It joins the coded regime on D9's "adds or edits" rule —
 * the same precedent that coded `VARIABLE_SCOPES_MISSING` (Rev 27), the D6
 * parent pair (Rev 31), and `ANNOTATION_CATEGORY_NOT_FOUND` (Rev 46) — because
 * P9-F2 made it a NEW reachable state: before Phase 9 a failed join could not
 * release a working binding, so "no binding" only ever meant "never joined".
 * Leaving it on the `UNKNOWN_ERROR` fallback would have denied it the playbook
 * entry D9 requires for a state an agent must recover from.
 */
export const CLIENT_OPERATIONAL_CODES = [
    "CHANNEL_NOT_BOUND",
] as const;

/** Operational codes thrown by the plugin itself (Phases 10–11). */
export const PLUGIN_OPERATIONAL_CODES = [
    "PAGE_LOAD_FAILED",
    "PAGE_NOT_FOUND",
    "TARGET_NOT_PAGE",
    "PAGE_LOAD_TIMEOUT",
    "DOCUMENT_SCAN_INCOMPLETE",
    "CONNECTOR_TEMPLATE_REQUIRED",
] as const;

/**
 * The operational codes of the ratified contract (Q16), grouped by origin.
 * The Change 5 split did not change membership; the Rev 57 addition of
 * `CHANNEL_NOT_BOUND` does, taking the inventory from ten to eleven.
 */
export const OPERATIONAL_CODES = [
    ...SOCKET_OPERATIONAL_CODES,
    ...CLIENT_OPERATIONAL_CODES,
    ...PLUGIN_OPERATIONAL_CODES,
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
 * D10 annotation-category verification code (Phase 7; Q30, Rev 46). The
 * category check is a verification refusal this release ADDS, so D9's "adds or
 * edits" rule codes it — the same precedent that added VARIABLE_SCOPES_MISSING
 * (Rev 27) and the D6 parent pair (Rev 31). Q23's uncoded-prose exception does
 * not transfer: a duplicate target is detectable from the payload alone and so
 * is rejected at Layer 1, whereas a category ID can only be checked against the
 * document, making this a genuine coded execution refusal.
 */
export const ANNOTATION_VERIFICATION_CODES = [
    "ANNOTATION_CATEGORY_NOT_FOUND",
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

/** The full ratified v2.3.3 inventory: twenty-one codes plus the fallback (Rev 57). */
export const RATIFIED_CODES = [
    ...OPERATIONAL_CODES,
    ...VERIFICATION_CODES,
    ...PARENT_VERIFICATION_CODES,
    ...ANNOTATION_VERIFICATION_CODES,
    UNKNOWN_ERROR,
] as const;
