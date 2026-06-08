/**
 * Shared tool-result helper.
 *
 * Returns BOTH a serialized text `content` block (MCP back-compat / clients that
 * render unstructured content) and `structuredContent` (for outputSchema-aware
 * clients). Per the MCP spec, a tool that declares an `outputSchema` SHOULD also
 * return functionally-equivalent unstructured content.
 *
 * NOTE: returning a `content` field activates the SDK's output-schema validation
 * (it is skipped for results without `content`). Every tool's `outputSchema` must
 * therefore accept its handler's real return shape — schemas allow extra keys
 * (`.loose()`) and mark non-invariant fields optional so live-document responses
 * never fail validation.
 */
export function toolResult(result: unknown) {
    const payload: Record<string, unknown> =
        result && typeof result === "object" ? (result as Record<string, unknown>) : {};
    return {
        content: [{ type: "text" as const, text: JSON.stringify(result ?? {}) }],
        structuredContent: payload,
    };
}
