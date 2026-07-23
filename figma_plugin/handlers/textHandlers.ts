/**
 * Text handlers for Figma plugin
 * Handles text scanning and modification operations
 */

import { generateCommandId, sendProgressUpdate } from '../utils/progressUtils.js';
import { delay } from '../utils/helpers.js';
import { setCharacters } from '../utils/textUtils.js';
import { collectNodesToProcess } from '../utils/nodeUtils.js';
import { batchEnvelope } from '../utils/batchResult.js';



/**
 * Sets text content for multiple text nodes.
 *
 * `deps.setCharacters` is an injectable seam (defaults to the real utility) —
 * the module-level `setCharacters` import is globally replaced by bun's
 * `mock.module` in other test files and cannot be un-mocked per-file, so this
 * seam lets the fault-path tests drive a controlled font-mutation-then-failure
 * deterministically. Production always uses the default.
 *
 * @param {Object} params - Parameters object
 * @param {Array} params.text - Array of {nodeId, characters} objects
 * @returns {Promise<Object>} Results of the operations
 */
export async function setMultipleTextContents(params: any, deps: { setCharacters?: typeof setCharacters } = {}) {
    const applyChars = deps.setCharacters || setCharacters;
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
        { requestedCount: text.length }
    );

    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let hasFailed = false;

    for (let i = 0; i < text.length; i++) {
        const replacement = text[i];
        if (hasFailed) {
            skippedCount++;
            results.push({
                success: false,
                status: "skipped",
                nodeId: replacement.nodeId || "unknown",
                error: "Skipped due to previous failure in batch",
            });
            continue;
        }

        if (!replacement.nodeId || replacement.characters === undefined) {
            hasFailed = true;
            failureCount++;
            results.push({
                success: false,
                status: "failed",
                nodeId: replacement.nodeId || "unknown",
                error: "Missing nodeId or characters in replacement entry",
            });
            continue;
        }

        let originalText = "";
        // C1: the report is loop-scoped so the catch can read it even when
        // setTextContent throws (a character-assignment failure after the font
        // was mutated). setCharacters fills beforeFont before any mutation.
        const report: { fontMutated?: boolean; beforeFont?: any } = {};
        try {
            console.log(`Attempting to replace text in node: ${replacement.nodeId}`);
            const textNode = await figma.getNodeByIdAsync(replacement.nodeId);

            if (!textNode) {
                hasFailed = true;
                failureCount++;
                results.push({
                    success: false,
                    status: "failed",
                    nodeId: replacement.nodeId,
                    error: `Node not found: ${replacement.nodeId}`,
                });
                continue;
            }

            if (textNode.type !== "TEXT") {
                hasFailed = true;
                failureCount++;
                results.push({
                    success: false,
                    status: "failed",
                    nodeId: replacement.nodeId,
                    error: `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`,
                });
                continue;
            }

            originalText = textNode.characters;
            // Apply directly to the already-validated node (no redundant re-fetch)
            // and forward the Q24 report so a font mutation before a failed
            // character assignment is disclosed.
            const ok = await applyChars(textNode, replacement.characters, undefined, report);
            if (!ok) {
                throw new Error(`Failed to set characters on node ${replacement.nodeId}`);
            }

            successCount++;
            results.push({
                success: true,
                status: "success",
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
                successCount + failureCount + skippedCount,
                `Processed ${i + 1}/${text.length} text replacements`
            );
            await new Promise(r => setTimeout(r, 0));

        } catch (error: any) {
            console.error(`Error replacing text in node ${replacement.nodeId}: ${error.message}`);
            hasFailed = true;
            failureCount++;
            // Q24 (as corrected for C1/C2): disclose partial mutation whenever
            // setCharacters actually changed the node's font before the character
            // assignment failed — the fallback path AND the mixed-font
            // normalization path both mutate `fontName`. The before-value is the
            // pre-mutation font snapshot. Clean failures (node gone, not TEXT,
            // char-assign failure with no font change) carry no flag.
            const row: any = {
                success: false,
                status: "failed",
                nodeId: replacement.nodeId,
                error: `Error applying replacement: ${error.message}`,
            };
            if (report.fontMutated) {
                row.partialMutation = true;
                row.whatChanged = "the node's font was changed to satisfy the text edit before the character assignment failed";
                row.before = { fontName: report.beforeFont };
            }
            results.push(row);
            continue;
        }
    }

    // Send completed/error progress update
    await sendProgressUpdate(
        commandId,
        "set_multiple_text_contents",
        failureCount > 0 ? "error" : "completed",
        100,
        text.length,
        successCount + failureCount + skippedCount,
        `Text replacement complete: ${successCount} successful, ${failureCount} failed, ${skippedCount} skipped`,
        {
            // Q26: only the shared envelope counts — the legacy `totalReplacements`
            // / `replacementsApplied` progress copies are dropped.
            requestedCount: text.length,
            succeededCount: successCount,
            failedCount: failureCount,
            skippedCount: skippedCount,
            results: results,
        }
    );

    return {
        ...batchEnvelope(text.length, successCount, failureCount, skippedCount),
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
