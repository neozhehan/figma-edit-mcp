/**
 * Progress update utilities for Figma plugin
 */

/**
 * Generates a unique command ID for tracking operations
 * @returns {string} Unique command ID
 */
export function generateCommandId() {
    return (
        "cmd_" +
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15)
    );
}

/**
 * Sends a progress update to the UI
 * @param {string} commandId - Unique command identifier
 * @param {string} commandType - Type of command being executed
 * @param {string} status - Current status (started, in_progress, completed, error)
 * @param {number} progress - Progress percentage (0-1)
 * @param {number} totalItems - Total number of items to process
 * @param {number} processedItems - Number of items processed
 * @param {string} message - Human-readable progress message
 * @param {Object|null} payload - Optional additional data
 * @returns {Object} The update object that was sent
 */
export async function sendProgressUpdate(
    commandId: any,
    commandType: any,
    status: any,
    progress: any,
    totalItems: any,
    processedItems: any,
    message: any,
    payload: any = null
) {
    const update: any = {
        type: "command_progress",
        commandId,
        commandType,
        status,
        progress,
        totalItems,
        processedItems,
        message,
        timestamp: Date.now(),
    };

    // Add optional chunk information if present
    if (payload) {
        if (
            payload.currentChunk !== undefined &&
            payload.totalChunks !== undefined
        ) {
            update.currentChunk = payload.currentChunk;
            update.totalChunks = payload.totalChunks;
            update.chunkSize = payload.chunkSize;
        }
        update.payload = payload;
    }

    // Send to UI. Progress is best-effort telemetry (C3): a delivery failure
    // must never alter mutation accounting — the handlers push their result
    // rows and counts around these calls, so a throw here would either fabricate
    // a duplicate failure row or reject a handler that already mutated, losing
    // the D7 envelope. Swallow any transport error and continue.
    try {
        figma.ui.postMessage(update);
        await new Promise(r => setTimeout(r, 0));
    } catch (err: any) {
        console.warn(`Progress update delivery failed (ignored): ${err && err.message}`);
    }
    console.log(`Progress update: ${status} - ${progress}% - ${message}`);

    return update;
}
