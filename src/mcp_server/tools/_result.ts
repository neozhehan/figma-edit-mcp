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

/**
 * Q25 shared per-item row vocabulary for the four batch aggregators
 * (`node_delete`, `text_set_content`, `annotation_set`, `instance_set_overrides`).
 * Every row carries `nodeId` (identity) and `status`; a non-success row carries an
 * actionable `error`; the Q9/Q24 partial-mutation fields attach where applicable.
 *
 * `.catchall(z.any())` keeps each tool's legitimate additive fields (e.g.
 * `nodeInfo`, `instanceName`, `appliedCount`, `originalText`) so encoding the
 * contract vocabulary validates real handler rows rather than rejecting them.
 * At the server boundary this schema rejects a row that omits `nodeId`/`status`
 * (including a legacy `instanceId`/`message`-only row), and the refinement below
 * rejects a non-success row without an actionable reason. It intentionally does
 * not enforce an exact row or top-level key set: additive unknown keys remain
 * accepted, and Rev 43 records top-level envelope exactness as test-enforced
 * rather than advertised-schema-enforced.
 */
export const batchResultRow = z
    .object({
        nodeId: z.string().describe("Identity of the target node (Q25 contract key)"),
        status: z.enum(["success", "failed", "skipped"]).describe("Per-item outcome (Q25 contract key)"),
        success: z.boolean().optional().describe("Legacy per-row boolean; mirrors status === 'success'"),
        error: z.string().optional().describe("Actionable reason, REQUIRED on any non-success row (Q25 contract key)"),
        partialMutation: z.boolean().optional().describe("Q9/Q24: set when the item mutated before it failed"),
        whatChanged: z.string().optional().describe("Q9/Q24: plain-language statement of what changed"),
        before: z.any().optional().describe("Q9/Q24: diagnostic evidence of the known pre-mutation state; not guaranteed to be a directly executable restoring-write input"),
    })
    .catchall(z.any())
    // Q25/D7: "every failure/skip row carries an actionable per-item reason" is
    // the property that makes a partial_success retryable. `error` cannot be
    // declared unconditionally required (success rows omit it), so the
    // conditional requirement is enforced here — a `failed`/`skipped` row with
    // no reason is a contract violation, not a tolerable shape (R3).
    .superRefine((row, ctx) => {
        if (row.status === "failed" || row.status === "skipped") {
            if (typeof row.error !== "string" || row.error.trim() === "") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["error"],
                    message: `A '${row.status}' row must carry an actionable 'error' reason (Q25 row vocabulary).`,
                });
            }
        }
    });

/**
 * The Q25 batch `results` array: one `batchResultRow` per input, in input order.
 * Optional because an error-envelope (`isError`) result carries no `results`.
 */
export function batchResults(description = "Detailed results per node (one row per input, in input order)") {
    return z.array(batchResultRow).optional().describe(description);
}

/**
 * The D9 structured-error envelope every tool can return in `structuredContent`
 * on `isError: true` results: `{error: {code, message, details?}}`. Advertised
 * as an optional field on every output schema (see `withStrictInputSchemas`) so
 * the pinned SDK client — which validates `structuredContent` against the
 * advertised output schema even on error results — accepts error envelopes
 * instead of failing them with `-32602`.
 */
export const errorEnvelope = z.object({
    code: z.string().describe("Stable machine-readable failure code (see the error playbook)"),
    message: z.string().describe("Human/agent-readable message embedding its own recovery"),
    details: z.any().optional().describe("Optional structured context (e.g. partialMutation, before-values)"),
});

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
