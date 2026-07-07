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
import { z } from "zod";

/**
 * Loose output schema per the convention above: declared fields validate,
 * and extra document-dependent keys always pass — the explicit `catchall`
 * survives every zod→JSON-Schema converter (older SDK/zod versions emit
 * `additionalProperties: false` for a plain `z.object`, which made clients
 * reject successful results — the §6 failure class).
 */
export function looseOutput<T extends z.ZodRawShape>(shape: T) {
    return z.object(shape).catchall(z.any());
}

export function toolResult(result: unknown) {
    const payload: Record<string, unknown> =
        result && typeof result === "object" ? (result as Record<string, unknown>) : {};

    const isRasterImage =
        payload &&
        (payload.format === "PNG" || payload.format === "JPG") &&
        typeof payload.imageData === "string" &&
        typeof payload.mimeType === "string";

    if (isRasterImage) {
        // Create a copy of payload without imageData for the text block summary
        const { imageData, ...summary } = payload;
        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify(summary),
                },
                {
                    type: "image" as const,
                    data: imageData as string,
                    mimeType: payload.mimeType as string,
                }
            ],
            structuredContent: payload,
        };
    }

    return {
        content: [{ type: "text" as const, text: JSON.stringify(result ?? {}) }],
        structuredContent: payload,
    };
}
