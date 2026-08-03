/**
 * Annotation handlers for Figma plugin
 * Handles annotation operations
 */

import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';
import { batchEnvelope } from '../utils/batchResult.js';
import { describeError, REFUSALS } from '../utils/errors.js';
import { getContainingPageNode } from '../utils/nodeUtils.js';
import { createPageLoadCoordinator, PageLoadCoordinator } from '../utils/pageLoad.js';

/**
 * Q32 (Rev 46): the D7/Q9 partial-mutation vocabulary reaches the annotation
 * aggregator. An append that commits and then throws is a mutate-then-fail row,
 * and the shared field names (`partialMutation`, `whatChanged`, `before`) are
 * how the model learns one convention across batch rows and single-object tools
 * (Q18). Q10's before/after counts remain the retry-identity mechanism; this
 * labels the state those counts describe so a `failed` row is not blind-retried.
 */
interface AnnotationAttempt {
    success: boolean;
    nodeId?: string;
    error?: string;
    beforeCount: number | null;
    afterCount: number | null;
    beforeCountVerified: boolean;
    afterCountVerified: boolean;
    partialMutation?: boolean;
    outcomeUnknown?: boolean;
    whatChanged?: string;
    before?: { annotationCount: number };
    postStateError?: string;
}

interface AnnotationCountObservation {
    count: number | null;
    verified: boolean;
    error?: string;
}

/**
 * Normalizes an annotation read back from Figma so it can be written again.
 *
 * Figma's `node.annotations` **getter** returns every stored annotation with
 * BOTH `label` and `labelMarkdown` populated, but its **setter** refuses an
 * annotation carrying both: `Property "annotations" failed validation: Only one
 * of label or labelMarkdown should be given. at index 0`. Appending with
 * `[...existing, next]` therefore fails on the pre-existing entry, not on the
 * new one — so `annotation_set` could only ever append the FIRST annotation to
 * a node, and every later append on that node failed. That also broke the Q10
 * retry contract, whose whole recovery is `annotation_list` then re-append.
 *
 * Live-measured on channel `gf32` (2026-08-02): a node holding one annotation
 * refused every subsequent append, with or without `properties`, and
 * `annotation_list` showed the stored entry carrying both fields.
 *
 * Round-tripping keeps `labelMarkdown` (the field this tool writes and the one
 * the schema exposes) and drops the derived `label`. Unknown keys are preserved
 * untouched: this is Figma's own object going back to Figma, and dropping a
 * field we do not model would silently discard a pre-existing annotation's data.
 */
/**
 * Attaches recovery to Figma's node-type-gated annotation-property rejection.
 *
 * `annotation_set.properties[].type` is advertised as the full pinned
 * `AnnotationProperty` catalogue, but Figma gates each entry by node type and
 * refuses the write. The host message names the offending property and node
 * type and is therefore diagnostic, but it carries no recovery, so an agent
 * cannot derive the next call from the error text alone (the D9 acceptance bar).
 *
 * The validity table is deliberately NOT simulated here. Q17's boundary rule is
 * "pre-validate what one read can confirm; disclose what only execution can
 * reveal", and live measurement on channel `gf32` (2026-08-02) shows the rule is
 * not derivable from node-property presence: `textAlignHorizontal` is a real
 * TEXT property yet is refused as an annotation property on a TEXT node, and
 * `textStyleId` was refused on both TEXT and RECTANGLE. A hand-built map would
 * refuse calls Figma accepts — exactly the failure Q17 rejects. Figma stays the
 * authority; this makes its answer actionable.
 */
export function withAnnotationPropertyRecovery(message: string): string {
    if (typeof message !== "string") return message;
    if (!/Invalid property\s+"[^"]*"\s+for a\b/.test(message)) return message;
    return `${message}. Annotation property validity is decided by Figma per node type, and this tool's enum is the full catalogue rather than the subset valid for this node — drop that entry from 'properties' (or annotate a node that has it) and resend only the non-success rows.`;
}

export function normalizeExistingAnnotation(annotation: any): any {
    if (annotation === null || typeof annotation !== "object") return annotation;
    if (!("label" in annotation) || !("labelMarkdown" in annotation)) return annotation;
    if (annotation.labelMarkdown === undefined || annotation.labelMarkdown === null) {
        return annotation;
    }
    const { label: _label, ...rest } = annotation;
    return rest;
}

interface AnnotationAttemptReport {
    beforeCount?: number;
    appendAttempted?: boolean;
}

function annotationDisclosure(
    beforeCount: number | null,
    beforeCountVerified: boolean,
    after: AnnotationCountObservation,
    appendAttempted: boolean,
) {
    if (!appendAttempted) return {};
    if (!after.verified || after.count === null || !beforeCountVerified || beforeCount === null) {
        return {
            // Fail safe: the write crossed the setter boundary and mutation
            // cannot be ruled out. `outcomeUnknown` distinguishes this from a
            // confirmed count delta while retaining the shared Q9 recovery flag.
            partialMutation: true,
            outcomeUnknown: true,
            whatChanged: "the annotation append was attempted, but the post-attempt annotation count could not be verified; the append may have committed.",
            ...(beforeCountVerified && beforeCount !== null
                ? { before: { annotationCount: beforeCount } }
                : {}),
            ...(after.error ? { postStateError: after.error } : {}),
        };
    }
    if (after.count === beforeCount) return {};
    return {
        partialMutation: true,
        whatChanged: `the annotation was appended before the failure occurred — the node's annotation count went from ${beforeCount} to ${after.count}.`,
        before: { annotationCount: beforeCount },
    };
}

function observeAnnotationCount(node: any): AnnotationCountObservation {
    try {
        if (!node || !("annotations" in node)) {
            return {
                count: null,
                verified: false,
                error: "the target does not expose a readable annotations collection",
            };
        }
        const annotations = node.annotations;
        if (!annotations || typeof annotations.length !== "number") {
            return {
                count: null,
                verified: false,
                error: "the target's annotations collection has no readable length",
            };
        }
        return { count: annotations.length, verified: true };
    } catch (error: any) {
        return {
            count: null,
            verified: false,
            error: `post-attempt annotation count read failed: ${describeError(error)}`,
        };
    }
}

/**
 * Gets annotations from nodes
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - Optional node ID to get annotations from
 * @param {boolean} params.includeCategories - Whether to include category info
 * @returns {Promise<Object>} Annotations result
 */
export async function getAnnotations(
    params: any,
    pageLoads: PageLoadCoordinator = createPageLoadCoordinator(),
) {
    try {
        const { nodeId, pageId, includeCategories = true } = params || {};

        if ((nodeId && pageId) || (!nodeId && !pageId)) {
            throw new Error("Exactly one of pageId or nodeId is required");
        }

        // Get categories first if needed
        let categoriesMap: any = {};
        if (includeCategories) {
            const categories = await figma.annotations.getAnnotationCategoriesAsync();
            categoriesMap = categories.reduce((map: any, category: any) => {
                map[category.id] = {
                    id: category.id,
                    label: category.label,
                    color: category.color,
                    isPreset: category.isPreset,
                };
                return map;
            }, {});
        }

        if (pageId) {
            const page = await pageLoads.require(pageId);

            // Get all annotations in the page
            const annotations: any[] = [];
            const processNode = async (node: any) => {
                if (
                    "annotations" in node &&
                    node.annotations &&
                    node.annotations.length > 0
                ) {
                    annotations.push({
                        nodeId: node.id,
                        name: node.name,
                        annotations: node.annotations,
                    });
                }
                if ("children" in node) {
                    for (const child of node.children) {
                        await processNode(child);
                    }
                }
            };

            try {
                await processNode(page);
            } catch (error: any) {
                throw pageLoads.fail(page.id, error).error;
            }

            const result: any = {
                annotatedNodes: annotations,
                coverage: pageLoads.coverage(),
            };

            if (includeCategories) {
                result.categories = Object.values(categoriesMap);
            }

            return result;
        } else {
            // Get annotations for a specific node
            const node = await figma.getNodeByIdAsync(nodeId);
            if (!node) {
                throw new Error(`Node not found: ${nodeId}`);
            }
            const containingPage = getContainingPageNode(node) as PageNode | null;
            if (containingPage) {
                const loaded = await pageLoads.load(containingPage);
                if (!loaded.ok) throw loaded.error;
            }

            // Use the same grouped ownership shape as page mode. Flattening
            // individual annotations loses which descendant owns each one and
            // makes list-before-retry ambiguous. The root itself need not
            // implement AnnotationsMixin: traversable containers such as GROUP
            // can own descendants that do.
            const annotatedNodes: any[] = [];
            const collect = async (n: any) => {
                if ("annotations" in n && n.annotations && n.annotations.length > 0) {
                    annotatedNodes.push({
                        nodeId: n.id,
                        name: n.name,
                        annotations: n.annotations,
                    });
                }
                if ("children" in n) {
                    for (const child of n.children) {
                        await collect(child);
                    }
                }
            };
            try {
                await collect(node);
            } catch (error: any) {
                // Single-node mode has one page, so a traversal failure is the
                // whole answer: rethrow it as the canonical PAGE_SCAN_FAILED.
                // Outside a page (a DOCUMENT-rooted node) there is no page to
                // blame, so the original error is the honest one.
                if (containingPage) {
                    throw pageLoads.fail(containingPage.id, error).error;
                }
                throw error;
            }

            const result: any = {
                annotatedNodes,
                coverage: pageLoads.coverage(),
            };

            if (includeCategories) {
                result.categories = Object.values(categoriesMap);
            }

            return result;
        }
    } catch (error: any) {
        console.error("Error in getAnnotations:", error);
        throw error;
    }
}



/**
 * Sets a single annotation on a node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the node to annotate
 * @param {string} params.labelMarkdown - Annotation text in markdown
 * @param {string} params.categoryId - Optional category ID
 * @param {Array} params.properties - Optional additional properties
 * @returns {Promise<Object>} Result of the annotation operation
 */
async function setAnnotation(params: any, report: AnnotationAttemptReport = {}): Promise<AnnotationAttempt> {
    const { nodeId, labelMarkdown, categoryId, properties } = params || {};
    let node: any = null;
    let beforeCount: number | null = null;
    let beforeCountVerified = false;
    let afterCount: number | null = null;
    let afterCountVerified = false;
    let appendAttempted = false;

    if (!nodeId) {
        return {
            success: false,
            error: "Missing nodeId parameter",
            beforeCount,
            afterCount,
            beforeCountVerified,
            afterCountVerified,
        };
    }

    if (typeof labelMarkdown !== "string" || labelMarkdown.trim().length === 0) {
        return {
            success: false,
            error: "Missing or blank labelMarkdown parameter",
            beforeCount,
            afterCount,
            beforeCountVerified,
            afterCountVerified,
        };
    }

    try {
        node = await figma.getNodeByIdAsync(nodeId);
        if (!node) {
            return {
                success: false,
                error: `Node not found: ${nodeId}`,
                beforeCount,
                afterCount,
                beforeCountVerified,
                afterCountVerified,
            };
        }

        if (!("annotations" in node)) {
            return {
                success: false,
                error: `Node type ${node.type} does not support annotations`,
                beforeCount,
                afterCount,
                beforeCountVerified,
                afterCountVerified,
            };
        }

        const existingAnnotations = node.annotations || [];
        const verifiedBeforeCount = existingAnnotations.length;
        beforeCount = verifiedBeforeCount;
        beforeCountVerified = true;
        afterCount = verifiedBeforeCount;
        afterCountVerified = true;
        // Q32/R12: publish the pre-mutation count to the caller's loop scope the
        // moment it is known, so a throw that escapes this function still has a
        // truthful before-value instead of one read back after the failure.
        report.beforeCount = verifiedBeforeCount;

        // Match the pinned Figma Annotation shape directly. `label` is a plain
        // optional string in the API; the legacy nested MARKDOWN label object
        // was never a supported annotation payload.
        const annotationObj: any = {
            labelMarkdown,
        };

        // Add category if provided
        if (categoryId) {
            annotationObj.categoryId = categoryId;
        }

        // Add properties if provided
        if (properties && Array.isArray(properties)) {
            annotationObj.properties = properties;
        }

        // Add the annotation to the node. Pre-existing entries are normalized
        // first: Figma's getter returns both `label` and `labelMarkdown`, its
        // setter refuses both, so writing the array back unchanged fails on
        // index 0 rather than on the annotation being appended.
        appendAttempted = true;
        report.appendAttempted = true;
        node.annotations = [
            ...existingAnnotations.map(normalizeExistingAnnotation),
            annotationObj,
        ];
        afterCount = node.annotations.length;
        afterCountVerified = true;

        return {
            success: true,
            nodeId: nodeId,
            beforeCount,
            afterCount,
            beforeCountVerified,
            afterCountVerified,
        };
    } catch (error: any) {
        const initiatingError = withAnnotationPropertyRecovery(describeError(error));
        try {
            console.error("Error in setAnnotation:", error);
        } catch {
            // Diagnostics must never replace the initiating setter/read error.
        }
        // A setter can commit and then throw. Re-read once, but represent a
        // failed read as unknown — never default it to the before-count.
        const observedAfter = observeAnnotationCount(node);
        afterCount = observedAfter.count;
        afterCountVerified = observedAfter.verified;
        return {
            success: false,
            error: initiatingError,
            beforeCount,
            afterCount,
            beforeCountVerified,
            afterCountVerified,
            ...annotationDisclosure(
                beforeCount,
                beforeCountVerified,
                observedAfter,
                appendAttempted,
            ),
        };
    }
}

async function readAnnotationCount(nodeId: string): Promise<AnnotationCountObservation> {
    try {
        const node: any = await figma.getNodeByIdAsync(nodeId);
        if (!node) {
            return {
                count: null,
                verified: false,
                error: `annotation target '${nodeId}' could not be resolved during count verification`,
            };
        }
        return observeAnnotationCount(node);
    } catch (error: any) {
        return {
            count: null,
            verified: false,
            error: `annotation count verification failed: ${describeError(error)}`,
        };
    }
}

/**
 * Validate every supplied category before the first annotation append.
 *
 * A later invalid category must not be discovered after an earlier row has
 * already mutated. Duplicate category IDs are resolved once, but every supplied
 * ID is compared with the category returned by Figma.
 */
async function verifyAnnotationCategories(annotations: any[]): Promise<void> {
    const verified = new Set<string>();
    for (const annotation of annotations) {
        if (annotation.categoryId === undefined || verified.has(annotation.categoryId)) {
            continue;
        }

        const category = await figma.annotations.getAnnotationCategoryByIdAsync(annotation.categoryId);
        if (!category || category.id !== annotation.categoryId) {
            // Q30 (Rev 46): a coded refusal from the central registry, not a
            // handler-local prose throw — this is a verification refusal the
            // release adds, so D9's "adds or edits" rule applies.
            throw REFUSALS.ANNOTATION_CATEGORY_NOT_FOUND(String(annotation.categoryId));
        }
        verified.add(annotation.categoryId);
    }
}

/**
 * Sets multiple annotations on nodes
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - Parent node ID (for context)
 * @param {Array} params.annotations - Array of annotation objects
 * @returns {Promise<Object>} Results of the operations
 */
export async function setMultipleAnnotations(params: any) {
    console.log("=== setMultipleAnnotations Debug Start ===");
    console.log("Input params:", JSON.stringify(params, null, 2));

    const { nodeId, annotations } = params;

    if (!annotations || !Array.isArray(annotations) || annotations.length === 0) {
        // D7 Layer 2, not Layer 3: an empty batch was never accepted for
        // execution, so it must THROW (a structured refusal with no envelope)
        // rather than return an envelope-less `{success:false, error:"…"}`
        // payload — that shape carries no `status`/counts/rows for the
        // three-layer contract to classify, and its top-level string `error`
        // collides with the D9 error envelope the output schema advertises, so
        // the SDK client rejects the result outright. `deleteMultipleNodes` is
        // the reference shape (P6-5). The schema's `.min(1)` means a conforming
        // client never reaches this; it is the AS1 defense-in-depth path.
        throw new Error("Missing or invalid annotations parameter: annotation_set requires at least one annotation entry.");
    }

    console.log(
        `Processing ${annotations.length} annotations for node ${nodeId}`
    );

    // D10 category validation is batch-wide and happens before any append.
    await verifyAnnotationCategories(annotations);

    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let hasFailed = false;

    // Process annotations sequentially
    for (let i = 0; i < annotations.length; i++) {
        const annotation = annotations[i];
        if (hasFailed) {
            const annotationCount = await readAnnotationCount(annotation.nodeId);
            skippedCount++;
            results.push({
                success: false,
                status: "skipped",
                nodeId: annotation.nodeId || "unknown",
                error: "Skipped due to previous failure in batch",
                beforeCount: annotationCount.count,
                afterCount: annotationCount.count,
                beforeCountVerified: annotationCount.verified,
                afterCountVerified: annotationCount.verified,
                ...(!annotationCount.verified && annotationCount.error
                    ? { postStateError: annotationCount.error }
                    : {}),
            });
            continue;
        }

        console.log(
            `\nProcessing annotation ${i + 1}/${annotations.length}:`,
            JSON.stringify(annotation, null, 2)
        );

        // Loop-scoped so the catch below can read the pre-mutation count even
        // when setAnnotation throws past its own handler (the C1 pattern).
        const report: AnnotationAttemptReport = {};
        try {
            console.log("Calling setAnnotation with params:", {
                nodeId: annotation.nodeId,
                labelMarkdown: annotation.labelMarkdown,
                categoryId: annotation.categoryId,
                properties: annotation.properties,
            });

            const result = await setAnnotation({
                nodeId: annotation.nodeId,
                labelMarkdown: annotation.labelMarkdown,
                categoryId: annotation.categoryId,
                properties: annotation.properties,
            }, report);

            console.log("setAnnotation result:", JSON.stringify(result, null, 2));

            if (result.success) {
                results.push({
                    success: true,
                    status: "success",
                    nodeId: annotation.nodeId,
                    beforeCount: result.beforeCount,
                    afterCount: result.afterCount,
                    beforeCountVerified: result.beforeCountVerified,
                    afterCountVerified: result.afterCountVerified,
                });
                successCount++;
                console.log(`✓ Annotation ${i + 1} applied successfully`);
            } else {
                results.push({
                    success: false,
                    status: "failed",
                    // Q25 identity is a required row key; an item that never
                    // supplied one still gets a schema-valid, honest placeholder
                    // (the same guard `text_set_content` applies).
                    nodeId: annotation.nodeId || "unknown",
                    error: result.error,
                    beforeCount: result.beforeCount,
                    afterCount: result.afterCount,
                    beforeCountVerified: result.beforeCountVerified,
                    afterCountVerified: result.afterCountVerified,
                    ...(result.partialMutation ? { partialMutation: true } : {}),
                    ...(result.outcomeUnknown ? { outcomeUnknown: true } : {}),
                    ...(result.whatChanged ? { whatChanged: result.whatChanged } : {}),
                    ...(result.before ? { before: result.before } : {}),
                    ...(result.postStateError ? { postStateError: result.postStateError } : {}),
                });
                hasFailed = true;
                failureCount++;
                console.error(`✗ Annotation ${i + 1} failed:`, result.error);
            }
        } catch (error: any) {
            const observedCount = await readAnnotationCount(annotation.nodeId);
            // R12: the before-value is the count captured BEFORE the attempt,
            // never one read back after the failure — a post-hoc read would make
            // before equal after and hide a mutation that did happen.
            const beforeCount = report.beforeCount ?? null;
            const beforeCountVerified = report.beforeCount !== undefined;
            hasFailed = true;
            failureCount++;
            results.push({
                success: false,
                status: "failed",
                nodeId: annotation.nodeId || "unknown",
                error: describeError(error),
                beforeCount,
                afterCount: observedCount.count,
                beforeCountVerified,
                afterCountVerified: observedCount.verified,
                ...annotationDisclosure(
                    beforeCount,
                    beforeCountVerified,
                    observedCount,
                    report.appendAttempted === true,
                ),
            });
            console.error(`✗ Annotation ${i + 1} failed with error:`, error);
        }
    }

    // Q26: shared envelope counts only — `annotationsApplied`/`annotationsFailed`
    // dropped. Ratification 4: derived via the shared helper.
    const summary: any = {
        ...batchEnvelope(annotations.length, successCount, failureCount, skippedCount),
        results: results,
    };

    console.log("\n=== setMultipleAnnotations Summary ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log("=== setMultipleAnnotations Debug End ===");

    return summary;
}
