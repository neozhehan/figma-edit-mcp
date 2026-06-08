/**
 * Sanitize a handler result before it crosses `figma.ui.postMessage`.
 *
 * Figma's `figma.mixed` is a unique Symbol (returned by any field that has mixed
 * values across a node's range — cornerRadius, fontSize, letterSpacing, …). A
 * Symbol can't be structured-cloned, so posting a result that contains one throws
 * "Cannot unwrap symbol" / DataCloneError — failing the whole command even when
 * the mutation succeeded. This deep-replaces Symbols with the string `"mixed"`
 * (and drops functions, another non-cloneable) so every handler response is safe
 * to post. Plain data passes through structurally unchanged.
 */
export function sanitizeForPostMessage(value: any, seen: WeakSet<object> = new WeakSet()): any {
    if (typeof value === "symbol") return "mixed";
    if (typeof value === "function") return undefined;
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return undefined; // defensive: break cycles
    seen.add(value);
    if (Array.isArray(value)) {
        return value.map((v) => sanitizeForPostMessage(v, seen));
    }
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
        out[key] = sanitizeForPostMessage(value[key], seen);
    }
    return out;
}
