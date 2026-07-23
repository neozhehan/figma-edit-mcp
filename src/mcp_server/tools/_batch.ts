import { z } from "zod";
import { normalizeNodeId } from "../utils.js";

/**
 * Q23 Option B (review P6-6): Layer 1 duplicate-target rejection. A per-tool
 * `.superRefine()` for a batch array of `{ nodeId }` items that normalizes ID
 * spellings (`1-2` vs `1:2`) and rejects a repeated target at the schema
 * boundary — the same layer as `[]` and unknown keys, because duplicates are
 * payload-only validation. The message carries its own recovery. The plugin
 * dispatcher keeps an equivalent check as uncoded defense in depth.
 */
export function noDuplicateTargets(items: Array<{ nodeId: string }>, ctx: z.RefinementCtx) {
    const seen = new Set<string>();
    items.forEach((item, i) => {
        const norm = normalizeNodeId(item.nodeId) || item.nodeId;
        if (seen.has(norm)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [i, "nodeId"],
                message: `Duplicate target nodeId "${item.nodeId}" — a batch must not repeat a target, and the "1-2" and "1:2" spellings are the same node. Remove the duplicate entry and resend the batch.`,
            });
        }
        seen.add(norm);
    });
}
