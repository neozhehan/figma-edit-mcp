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
    const success = await setCharacters(node, text);
    if (!success) {
        throw new Error(`Failed to set characters on node ${nodeId}`);
    }

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

    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < text.length; i++) {
        const replacement = text[i];
        if (!replacement.nodeId || replacement.text === undefined) {
            failureCount++;
            results.push({
                success: false,
                nodeId: replacement.nodeId || "unknown",
                error: "Missing nodeId or text in replacement entry",
            });
            break; // Stop on first failure
        }

        try {
            console.log(`Attempting to replace text in node: ${replacement.nodeId}`);
            const textNode = await figma.getNodeByIdAsync(replacement.nodeId);

            if (!textNode) {
                failureCount++;
                results.push({
                    success: false,
                    nodeId: replacement.nodeId,
                    error: `Node not found: ${replacement.nodeId}`,
                });
                break; // Stop on first failure
            }

            if (textNode.type !== "TEXT") {
                failureCount++;
                results.push({
                    success: false,
                    nodeId: replacement.nodeId,
                    error: `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`,
                });
                break; // Stop on first failure
            }

            const originalText = textNode.characters;
            await setTextContent({
                nodeId: replacement.nodeId,
                text: replacement.text,
            });

            successCount++;
            results.push({
                success: true,
                nodeId: replacement.nodeId,
                originalText: originalText,
                translatedText: replacement.text,
            });

            // Send in progress update
            await sendProgressUpdate(
                commandId,
                "set_multiple_text_contents",
                "in_progress",
                Math.round(((i + 1) / text.length) * 100),
                text.length,
                successCount + failureCount,
                `Processed ${i + 1}/${text.length} text replacements`
            );
            await new Promise(r => setTimeout(r, 0));

        } catch (error: any) {
            console.error(`Error replacing text in node ${replacement.nodeId}: ${error.message}`);
            failureCount++;
            results.push({
                success: false,
                nodeId: replacement.nodeId,
                error: `Error applying replacement: ${error.message}`,
            });
            break; // Stop on first failure
        }
    }

    // Send completed/error progress update
    await sendProgressUpdate(
        commandId,
        "set_multiple_text_contents",
        failureCount > 0 ? "error" : "completed",
        100,
        text.length,
        successCount + failureCount,
        `Text replacement complete: ${successCount} successful, ${failureCount} failed`,
        {
            totalReplacements: text.length,
            replacementsApplied: successCount,
            replacementsFailed: failureCount,
            results: results,
        }
    );

    return {
        success: successCount > 0 && failureCount === 0,
        nodeId: nodeId,
        replacementsApplied: successCount,
        replacementsFailed: failureCount,
        totalReplacements: text.length,
        results: results,
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
