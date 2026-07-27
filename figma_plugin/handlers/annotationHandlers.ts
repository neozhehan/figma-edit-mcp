/**
 * Annotation handlers for Figma plugin
 * Handles annotation operations
 */

import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';
import { batchEnvelope } from '../utils/batchResult.js';
import { describeError, REFUSALS } from '../utils/errors.js';

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
    beforeCount: number;
    afterCount: number;
    partialMutation?: boolean;
    whatChanged?: string;
    before?: { annotationCount: number };
}

function annotationDisclosure(beforeCount: number, afterCount: number) {
    if (afterCount === beforeCount) return {};
    return {
        partialMutation: true,
        whatChanged: `the annotation was appended before the failure occurred — the node's annotation count went from ${beforeCount} to ${afterCount}.`,
        before: { annotationCount: beforeCount },
    };
}

/**
 * Gets annotations from nodes
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - Optional node ID to get annotations from
 * @param {boolean} params.includeCategories - Whether to include category info
 * @returns {Promise<Object>} Annotations result
 */
export async function getAnnotations(params: any) {
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
            const page = await figma.getNodeByIdAsync(pageId);
            if (!page) {
                throw new Error(`pageId with ID ${pageId} not found`);
            }
            if (page.type !== 'PAGE') {
                throw new Error("pageId does not resolve to a PAGE");
            }

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

            await processNode(page);

            const result: any = {
                annotatedNodes: annotations,
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

            if (!("annotations" in node)) {
                throw new Error(`Node type ${node.type} does not support annotations`);
            }

            // Use the same grouped ownership shape as page mode. Flattening
            // individual annotations loses which descendant owns each one and
            // makes list-before-retry ambiguous.
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
            await collect(node);

            const result: any = {
                annotatedNodes,
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
async function setAnnotation(params: any, report: { beforeCount?: number } = {}): Promise<AnnotationAttempt> {
    const { nodeId, labelMarkdown, categoryId, properties } = params || {};
    let node: any = null;
    let beforeCount = 0;
    let afterCount = 0;

    if (!nodeId) {
        return { success: false, error: "Missing nodeId parameter", beforeCount, afterCount };
    }

    if (typeof labelMarkdown !== "string" || labelMarkdown.trim().length === 0) {
        return { success: false, error: "Missing or blank labelMarkdown parameter", beforeCount, afterCount };
    }

    try {
        node = await figma.getNodeByIdAsync(nodeId);
        if (!node) {
            return { success: false, error: `Node not found: ${nodeId}`, beforeCount, afterCount };
        }

        if (!("annotations" in node)) {
            return {
                success: false,
                error: `Node type ${node.type} does not support annotations`,
                beforeCount,
                afterCount,
            };
        }

        const existingAnnotations = node.annotations || [];
        beforeCount = existingAnnotations.length;
        afterCount = beforeCount;
        // Q32/R12: publish the pre-mutation count to the caller's loop scope the
        // moment it is known, so a throw that escapes this function still has a
        // truthful before-value instead of one read back after the failure.
        report.beforeCount = beforeCount;

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

        // Add the annotation to the node
        node.annotations = [...existingAnnotations, annotationObj];
        afterCount = node.annotations.length;

        return {
            success: true,
            nodeId: nodeId,
            beforeCount,
            afterCount,
        };
    } catch (error: any) {
        console.error("Error in setAnnotation:", error);
        // A setter can theoretically commit and then throw. Read the synchronous
        // property again so the row reports the observable post-attempt count.
        try {
            if (node && "annotations" in node && node.annotations) {
                afterCount = node.annotations.length;
            }
        } catch {
            // Keep the last count observed before the failing read/write.
        }
        return {
            success: false,
            error: describeError(error),
            beforeCount,
            afterCount,
            ...annotationDisclosure(beforeCount, afterCount),
        };
    }
}

async function readAnnotationCount(nodeId: string): Promise<number> {
    try {
        const node: any = await figma.getNodeByIdAsync(nodeId);
        if (node && "annotations" in node && node.annotations) {
            return node.annotations.length;
        }
    } catch {
        // This is evidence for an unattempted row, not a new execution outcome.
    }
    return 0;
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
                beforeCount: annotationCount,
                afterCount: annotationCount,
            });
            continue;
        }

        console.log(
            `\nProcessing annotation ${i + 1}/${annotations.length}:`,
            JSON.stringify(annotation, null, 2)
        );

        // Loop-scoped so the catch below can read the pre-mutation count even
        // when setAnnotation throws past its own handler (the C1 pattern).
        const report: { beforeCount?: number } = {};
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
                successCount++;
                results.push({
                    success: true,
                    status: "success",
                    nodeId: annotation.nodeId,
                    beforeCount: result.beforeCount,
                    afterCount: result.afterCount,
                });
                console.log(`✓ Annotation ${i + 1} applied successfully`);
            } else {
                hasFailed = true;
                failureCount++;
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
                    ...annotationDisclosure(result.beforeCount, result.afterCount),
                });
                console.error(`✗ Annotation ${i + 1} failed:`, result.error);
            }
        } catch (error: any) {
            const observedCount = await readAnnotationCount(annotation.nodeId);
            // R12: the before-value is the count captured BEFORE the attempt,
            // never one read back after the failure — a post-hoc read would make
            // before equal after and hide a mutation that did happen.
            const beforeCount = report.beforeCount ?? observedCount;
            hasFailed = true;
            failureCount++;
            results.push({
                success: false,
                status: "failed",
                nodeId: annotation.nodeId || "unknown",
                error: describeError(error),
                beforeCount,
                afterCount: observedCount,
                ...annotationDisclosure(beforeCount, observedCount),
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
