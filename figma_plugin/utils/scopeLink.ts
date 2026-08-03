/**
 * Scope-link parsing for the plugin UI's `validate-scope-link` message.
 *
 * Extracted from `src/main.ts` so it can be tested directly: importing main
 * installs Figma UI bindings at module load, which is why Change 11 needed a
 * subprocess harness to reach a handler there. This function is pure.
 */

/**
 * Extracts the `node-id` from a pasted Figma link and returns it in API form.
 *
 * There used to be a `new URL(url)` branch in front of the regex below. The
 * Phase 14 manual probe (2026-08-02, dedicated *MCP Test* file) established
 * that the Figma sandbox provides no `URL` global, so that branch always threw
 * and the regex fallback always ran. The fallback never percent-decoded, so a
 * real link carrying `node-id=1%3A2` reported "Node not found in current
 * document" while the same node written `node-id=1-2` validated. Both spellings
 * now resolve to the same ID.
 *
 * Decoding is failure-tolerant on purpose: a malformed escape such as `%zz`
 * makes `decodeURIComponent` throw, and a hand-edited link should fall back to
 * the raw value rather than failing scope validation outright.
 */
export function parseNodeIdFromUrl(url: any): string | null {
    if (typeof url !== "string") return null;
    const match = url.match(/node-id=([^&#]+)/);
    if (!match) return null;
    const raw = match[1];
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw.replace(/\+/g, " "));
    } catch (e: any) {
        decoded = raw;
    }
    const nodeId = decoded.trim();
    if (!nodeId) return null;
    return nodeId.replace(/-/g, ":");
}
