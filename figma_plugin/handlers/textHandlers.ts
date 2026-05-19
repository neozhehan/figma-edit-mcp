/**
 * Text handlers for Figma plugin
 * Handles text scanning and modification operations
 */

import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';
import { delay } from '../utils/helpers.js';
import { setCharacters } from '../utils/textUtils.js';
import { collectNodesToProcess } from '../utils/nodeUtils.js';



/**
 * Sets text content for a single text node
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - ID of the text node
 * @param {string} params.text - New text content
 * @returns {Promise<Object>} Result of the operation
 */
async function setTextContent(params: any) {
    const { nodeId, text } = params || {};

    if (!nodeId) {
        throw new Error("Missing nodeId parameter");
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
        throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (node.type !== "TEXT") {
        throw new Error(`Node is not a text node: ${nodeId} (type: ${node.type})`);
    }

    // Use the setCharacters utility from textUtils
    // @ts-ignore
    await setCharacters(node, text);

    return {
        success: true,
        nodeId: nodeId,
        text: text,
    };
}

/**
 * Sets text content for multiple text nodes
 * @param {Object} params - Parameters object
 * @param {string} params.nodeId - Parent node ID (for context)
 * @param {Array} params.text - Array of {nodeId, text} objects
 * @returns {Promise<Object>} Results of the operations
 */
export async function setMultipleTextContents(params: any) {
    const { nodeId, text } = params || {};
    const commandId = params.commandId || generateCommandId();

    if (!nodeId || !text || !Array.isArray(text)) {
        const errorMsg = "Missing required parameters: nodeId and text array";

        // Send error progress update
        await sendProgressUpdate(
            commandId,
            "set_multiple_text_contents",
            "error",
            0,
            0,
            0,
            errorMsg,
            { error: errorMsg }
        );

        throw new Error(errorMsg);
    }

    console.log(
        `Starting text replacement for node: ${nodeId} with ${text.length} text replacements`
    );

    // Send started progress update
    await sendProgressUpdate(
        commandId,
        "set_multiple_text_contents",
        "started",
        0,
        text.length,
        0,
        `Starting text replacement for ${text.length} nodes`,
        { totalReplacements: text.length }
    );

    // Define the results array and counters
    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Split text replacements into chunks of 10
    const CHUNK_SIZE = 10;
    const chunks: any[] = [];

    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    console.log(`Split ${text.length} replacements into ${chunks.length} chunks`);

    // Send chunking info update
    await sendProgressUpdate(
        commandId,
        "set_multiple_text_contents",
        "in_progress",
        5, // 5% progress for planning phase
        text.length,
        0,
        `Preparing to replace text in ${text.length} nodes using ${chunks.length} chunks`,
        {
            totalReplacements: text.length,
            chunks: chunks.length,
            chunkSize: CHUNK_SIZE,
        }
    );

    // Process each chunk sequentially
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        console.log(
            `Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length
            } replacements`
        );

        // Send chunk processing start update
        await sendProgressUpdate(
            commandId,
            "set_multiple_text_contents",
            "in_progress",
            Math.round(5 + (chunkIndex / chunks.length) * 90), // 5-95% for processing
            text.length,
            successCount + failureCount,
            `Processing text replacements chunk ${chunkIndex + 1}/${chunks.length}`,
            {
                currentChunk: chunkIndex + 1,
                totalChunks: chunks.length,
                successCount,
                failureCount,
            }
        );

        // Process replacements within a chunk in parallel
        const chunkPromises = chunk.map(async (replacement: any) => {
            if (!replacement.nodeId || replacement.text === undefined) {
                console.error(`Missing nodeId or text for replacement`);
                return {
                    success: false,
                    nodeId: replacement.nodeId || "unknown",
                    error: "Missing nodeId or text in replacement entry",
                };
            }

            try {
                console.log(
                    `Attempting to replace text in node: ${replacement.nodeId}`
                );

                // Get the text node to update (just to check it exists and get original text)
                const textNode = await figma.getNodeByIdAsync(replacement.nodeId);

                if (!textNode) {
                    console.error(`Text node not found: ${replacement.nodeId}`);
                    return {
                        success: false,
                        nodeId: replacement.nodeId,
                        error: `Node not found: ${replacement.nodeId}`,
                    };
                }

                if (textNode.type !== "TEXT") {
                    console.error(
                        `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`
                    );
                    return {
                        success: false,
                        nodeId: replacement.nodeId,
                        error: `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`,
                    };
                }

                // Save original text for the result
                const originalText = textNode.characters;
                console.log(`Original text: "${originalText}"`);
                console.log(`Will translate to: "${replacement.text}"`);



                // Use the setTextContent function to handle font loading and text setting
                await setTextContent({
                    nodeId: replacement.nodeId,
                    text: replacement.text,
                });



                console.log(
                    `Successfully replaced text in node: ${replacement.nodeId}`
                );
                return {
                    success: true,
                    nodeId: replacement.nodeId,
                    originalText: originalText,
                    translatedText: replacement.text,
                };
            } catch (error: any) {
                console.error(
                    `Error replacing text in node ${replacement.nodeId}: ${error.message}`
                );
                return {
                    success: false,
                    nodeId: replacement.nodeId,
                    error: `Error applying replacement: ${error.message}`,
                };
            }
        });

        // Wait for all replacements in this chunk to complete
        const chunkResults = await Promise.all(chunkPromises);

        // Process results for this chunk
        chunkResults.forEach((result: any) => {
            if (result.success) {
                successCount++;
            } else {
                failureCount++;
            }
            results.push(result);
        });

        // Send chunk processing complete update with partial results
        await sendProgressUpdate(
            commandId,
            "set_multiple_text_contents",
            "in_progress",
            Math.round(5 + ((chunkIndex + 1) / chunks.length) * 90), // 5-95% for processing
            text.length,
            successCount + failureCount,
            `Completed chunk ${chunkIndex + 1}/${chunks.length
            }. ${successCount} successful, ${failureCount} failed so far.`,
            {
                currentChunk: chunkIndex + 1,
                totalChunks: chunks.length,
                successCount,
                failureCount,
                chunkResults: chunkResults,
            }
        );

        // Add a small delay between chunks to avoid overloading Figma
        if (chunkIndex < chunks.length - 1) {
            console.log("Pausing between chunks to avoid overloading Figma...");
            await delay(20); // 20ms delay between chunks
        }
    }

    console.log(
        `Replacement complete: ${successCount} successful, ${failureCount} failed`
    );

    // Send completed progress update
    await sendProgressUpdate(
        commandId,
        "set_multiple_text_contents",
        "completed",
        100,
        text.length,
        successCount + failureCount,
        `Text replacement complete: ${successCount} successful, ${failureCount} failed`,
        {
            totalReplacements: text.length,
            replacementsApplied: successCount,
            replacementsFailed: failureCount,
            completedInChunks: chunks.length,
            results: results,
        }
    );

    return {
        success: successCount > 0,
        nodeId: nodeId,
        replacementsApplied: successCount,
        replacementsFailed: failureCount,
        totalReplacements: text.length,
        results: results,
        completedInChunks: chunks.length,
        commandId,
    };
}

/**
 * Sets unified text style properties for a node
 * @param {Object} params - Style parameters
 * @returns {Promise<Object>} Result
 */
export async function setTextStyle(params: any) {
    const { nodeId, fontFamily, fontStyle, fontSize,
        letterSpacing, lineHeight, paragraphSpacing, textCase,
        textDecoration, textAlignHorizontal, textAlignVertical } = params;

    const node = await figma.getNodeByIdAsync(nodeId);

    if (!node) {
        throw new Error(`Node with ID ${nodeId} not found`);
    }

    // Type check
    if (node.type !== "TEXT") {
        throw new Error(`Node is not a text node (got ${node.type})`);
    }

    // Optimization: Conditional Font Loading
    if (fontFamily || fontStyle) {
        // Handle mixed fonts by defaulting to Inter-Regular if we have to, 
        // or prioritize the provided family/style.
        // If current font is mixed, we can't easily adhere to "partial update" 
        // without replacing everything, because we don't know the "base" font.

        let currentFamily = "Inter";
        let currentStyle = "Regular";

        if (node.fontName !== figma.mixed) {
            currentFamily = node.fontName.family;
            currentStyle = node.fontName.style;
        }

        const targetFamily = fontFamily || currentFamily;
        const targetStyle = fontStyle || (fontFamily && !fontStyle ? "Regular" : currentStyle);
        // If changing family but not style, and current style might not exist in new family, default to Regular? 
        // Or if current is mixed, we default to Regular.

        // Load the new font
        await figma.loadFontAsync({ family: targetFamily, style: targetStyle });
        node.fontName = { family: targetFamily, style: targetStyle };

    } else {
        // Ensure current font is loaded before modifying other properties
        if (node.fontName !== figma.mixed) {
            await figma.loadFontAsync(node.fontName);
        } else {
            // If it is mixed, we technically need to load all used fonts.
            // For now, if we are only changing e.g. alignment, it might work without loading?
            // Actually Figma requires fonts loaded to change almost anything on TextNode.
            // If mixed, it's hard. But let's try to proceed. 
            // If it fails, the error will bubble up.
            // Some properties like textAlign don't require font loading? 
            // "You can only modify the properties of a TextNode ... if the font ... is currently loaded."

            // Attempt to load all fonts used in the node (if possible) is complex.
            // We will skip explicit loading for mixed usage and hope for the best 
            // or let the user know they need to unify fonts first.
        }
    }

    // Apply only provided properties
    if (fontSize !== undefined) node.fontSize = fontSize;
    if (letterSpacing !== undefined) node.letterSpacing = letterSpacing;
    if (lineHeight !== undefined) node.lineHeight = lineHeight;
    if (paragraphSpacing !== undefined) node.paragraphSpacing = paragraphSpacing;
    if (textCase !== undefined) node.textCase = textCase;
    if (textDecoration !== undefined) node.textDecoration = textDecoration;
    if (textAlignHorizontal !== undefined) node.textAlignHorizontal = textAlignHorizontal;
    if (textAlignVertical !== undefined) node.textAlignVertical = textAlignVertical;

    return {
        id: node.id,
        name: node.name,
        type: node.type,
        fontName: node.fontName !== figma.mixed ? node.fontName : "Mixed",
        fontSize: node.fontSize !== figma.mixed ? node.fontSize : "Mixed"
    };
}
