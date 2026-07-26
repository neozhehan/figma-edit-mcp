/**
 * Annotation handlers for Figma plugin
 * Handles annotation operations
 */

import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';
import { batchEnvelope } from '../utils/batchResult.js';
import { describeError } from '../utils/errors.js';

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

            // Collect annotations from this node and all its descendants
            const mergedAnnotations: any[] = [];
            const collect = async (n: any) => {
                if ("annotations" in n && n.annotations && n.annotations.length > 0) {
                    for (const a of n.annotations) {
                        mergedAnnotations.push({ nodeId: n.id, annotation: a });
                    }
                }
                if ("children" in n) {
                    for (const child of n.children) {
                        await collect(child);
                    }
                }
            };
            await collect(node);

            const result: any = {
                nodeId: node.id,
                name: node.name,
                annotations: mergedAnnotations,
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
async function setAnnotation(params: any) {
    const { nodeId, labelMarkdown, categoryId, properties } = params || {};

    if (!nodeId) {
        return { success: false, error: "Missing nodeId parameter" };
    }

    if (!labelMarkdown) {
        return { success: false, error: "Missing labelMarkdown parameter" };
    }

    try {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (!node) {
            return { success: false, error: `Node not found: ${nodeId}` };
        }

        if (!("annotations" in node)) {
            return { success: false, error: `Node type ${node.type} does not support annotations` };
        }

        // Create the annotation object
        const annotationObj: any = {
            label: {
                type: "MARKDOWN",
                content: labelMarkdown,
            },
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
        const existingAnnotations = node.annotations || [];
        node.annotations = [...existingAnnotations, annotationObj];

        return {
            success: true,
            nodeId: nodeId,
            annotationCount: node.annotations.length,
        };
    } catch (error: any) {
        console.error("Error in setAnnotation:", error);
        return { success: false, error: describeError(error) };
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

    if (!annotations || annotations.length === 0) {
        console.error("Validation failed: No annotations provided");
        return { success: false, error: "No annotations provided" };
    }

    console.log(
        `Processing ${annotations.length} annotations for node ${nodeId}`
    );

    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let hasFailed = false;

    // Process annotations sequentially
    for (let i = 0; i < annotations.length; i++) {
        const annotation = annotations[i];
        if (hasFailed) {
            skippedCount++;
            results.push({
                success: false,
                status: "skipped",
                nodeId: annotation.nodeId || "unknown",
                error: "Skipped due to previous failure in batch",
            });
            continue;
        }

        console.log(
            `\nProcessing annotation ${i + 1}/${annotations.length}:`,
            JSON.stringify(annotation, null, 2)
        );

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
            });

            console.log("setAnnotation result:", JSON.stringify(result, null, 2));

            if (result.success) {
                successCount++;
                results.push({
                    success: true,
                    status: "success",
                    nodeId: annotation.nodeId
                });
                console.log(`✓ Annotation ${i + 1} applied successfully`);
            } else {
                hasFailed = true;
                failureCount++;
                results.push({
                    success: false,
                    status: "failed",
                    nodeId: annotation.nodeId,
                    error: result.error,
                });
                console.error(`✗ Annotation ${i + 1} failed:`, result.error);
            }
        } catch (error: any) {
            hasFailed = true;
            failureCount++;
            results.push({
                success: false,
                status: "failed",
                nodeId: annotation.nodeId,
                error: describeError(error),
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
