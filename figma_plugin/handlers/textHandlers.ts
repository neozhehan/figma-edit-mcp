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
    const { text } = params || {};
    const commandId = params.commandId || generateCommandId();

    if (!text || !Array.isArray(text)) {
        const errorMsg = "Missing required parameters: text array";

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
        `Starting text replacement with ${text.length} text replacements`
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
        if (!replacement.nodeId || replacement.characters === undefined) {
            failureCount++;
            results.push({
                success: false,
                nodeId: replacement.nodeId || "unknown",
                error: "Missing nodeId or characters in replacement entry",
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
                text: replacement.characters,
            });

            successCount++;
            results.push({
                success: true,
                nodeId: replacement.nodeId,
                originalText: originalText,
                translatedText: replacement.characters,
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
        replacementsApplied: successCount,
        replacementsFailed: failureCount,
        totalReplacements: text.length,
        results: results,
        commandId,
    };
}

async function loadAllFontsForNode(node: any) {
    if (node.fontName !== figma.mixed) return;
    
    const segments = node.getStyledTextSegments(['fontName']);
    const uniqueFonts: any[] = [];
    const seen = new Set<string>();
    
    for (const segment of segments) {
        const font = segment.fontName;
        const key = `${font.family}-${font.style}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueFonts.push(font);
        }
    }
    
    for (const font of uniqueFonts) {
        try {
            await figma.loadFontAsync(font);
        } catch (error: any) {
            throw new Error(`Failed to load font ${font.family} ${font.style}: ${error.message}`);
        }
    }
}

/**
 * Sets unified text style properties for a node
 * @param {Object} params - Style parameters
 * @returns {Promise<Object>} Result
 */
export async function setTextStyle(params: any) {
    const { nodeId, fontName, fontSize,
        letterSpacing, lineHeight, paragraphSpacing, textCase,
        textDecoration, textAlignHorizontal, textAlignVertical, paragraphIndent } = params;

    const node = await figma.getNodeByIdAsync(nodeId);

    if (!node) {
        throw new Error(`Node with ID ${nodeId} not found`);
    }

    // Type check
    if (node.type !== "TEXT") {
        throw new Error(`Node is not a text node (got ${node.type})`);
    }

    // Optimization: Conditional Font Loading
    if (fontName) {
        const targetFamily = fontName.family;
        const targetStyle = fontName.style;
        
        try {
            await figma.loadFontAsync({ family: targetFamily, style: targetStyle });
        } catch (error: any) {
            throw new Error(`Failed to load requested font ${targetFamily} ${targetStyle}: ${error.message}`);
        }
        node.fontName = { family: targetFamily, style: targetStyle };
    } else {
        // Ensure current font is loaded before modifying other properties
        if (node.fontName !== figma.mixed) {
            try {
                await figma.loadFontAsync(node.fontName);
            } catch (error: any) {
                throw new Error(`Failed to load current font ${node.fontName.family} ${node.fontName.style}: ${error.message}`);
            }
        } else {
            await loadAllFontsForNode(node);
        }
    }

    // Apply only provided properties
    if (fontSize !== undefined) node.fontSize = fontSize;
    if (letterSpacing !== undefined) node.letterSpacing = letterSpacing;
    if (lineHeight !== undefined) node.lineHeight = lineHeight;
    if (paragraphSpacing !== undefined) node.paragraphSpacing = paragraphSpacing;
    if (paragraphIndent !== undefined) node.paragraphIndent = paragraphIndent;
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
