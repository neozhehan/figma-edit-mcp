import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { joinChannel, sendCommandToFigma, resetChannel } from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";
import { UNKNOWN_ERROR } from "../../shared/errorCodes.js";

// Q20 (resolved 2026-07-18, Option A): join failures pass their structured
// codes through verbatim — unknown codes included, never collapsed to
// UNKNOWN_ERROR — and recovery guidance is keyed by code, never derived from
// message prose. The two locally-generated failures are coded at origin in
// figma-client (CHANNEL_JOIN_FAILED on join timeout, PLUGIN_DISCONNECTED on
// connection close). The in-band envelope shape is unchanged (v2.3.4 PRD Q1).
const JOIN_RECOVERY: Record<string, (channel: string) => string> = {
    CHANNEL_NOT_FOUND: (ch) => `Channel '${ch}' was not found. Verify the channel name and that the Figma plugin is running and connected.`,
    CHANNEL_JOIN_FAILED: (ch) => `Failed to join channel '${ch}'. The Figma plugin did not acknowledge the join within the expected time. Try reconnecting the plugin.`,
    PLUGIN_DISCONNECTED: () => "The Figma plugin disconnected before the editable scope could be read. Reopen the plugin and try again.",
};

function joinFailure(channel: string, error: any) {
    const errorCode = (error !== null && typeof error === "object" && typeof error.code === "string")
        ? error.code
        : UNKNOWN_ERROR;
    const guidance = JOIN_RECOVERY[errorCode];
    // Codes without local guidance keep their originating message verbatim —
    // a D9 message already embeds its own recovery.
    const errorMessage = guidance
        ? guidance(channel)
        : errorCode !== UNKNOWN_ERROR
            ? (error.message || String(error))
            : `An unexpected error occurred while joining the channel: ${error?.message || String(error)}.`;
    return {
        status: "error",
        channel,
        errorCode,
        errorMessage,
        ...(error !== null && typeof error === "object" && error.details !== undefined ? { errorDetails: error.details } : {}),
    };
}

async function detachAfterJoinFailure() {
    try {
        await resetChannel();
    } catch {
        // resetChannel clears the local binding before awaiting the socket leave
        // acknowledgement. Preserve the originating scope/transport failure;
        // the client remains fail-closed even if the bridge cannot acknowledge.
    }
}

export function registerChannelTools(server: McpServer) {
    // 1. Join Channel Tool
    server.registerTool(
        "channel_join",
        {
            title: "Join Channel",
            description: "Join a plugin channel to establish the live connection to the Figma document.",
            inputSchema: z.object({
                channel: z
                    .string()
                    .describe("The name of the channel to join"),
            }),
            outputSchema: looseOutput({
                status: z.enum(["success", "error"]).describe("Connection status"),
                channel: z.string().describe("Channel name"),
                errorCode: z.string().optional().describe("Error code if status is error"),
                errorMessage: z.string().optional().describe("Error message if status is error"),
                errorDetails: z.any().optional().describe("Structured error context if status is error and the underlying failure carried any"),
                serverVersion: z.string().optional().describe("Self-reported MCP server build version (present on every successful join)"),
                pluginVersion: z.string().optional().describe("Self-reported bound Figma plugin build version (present on every successful join)"),
                allowEditNode: z.union([z.boolean(), z.string()]).optional().describe("false | 'page' | 'node'"),
                allowEditVariable: z.boolean().optional().describe("Whether variable edits are allowed"),
                allowEditStyle: z.boolean().optional().describe("Whether style edits are allowed"),
                editableScopeType: z.string().optional().describe("readonly, page, or node"),
                scopeRootId: z.string().nullable().optional().describe("Editable scope root node ID"),
                documentId: z.string().optional().describe("Figma document ID"),
                documentName: z.string().optional().describe("Figma document name"),
                pageCount: z.number().optional().describe("Number of pages in the document"),
                pages: z.array(z.object({
                    pageId: z.string(),
                    pageName: z.string(),
                    descendantCount: z.number().optional(),
                    children: z.array(z.object({
                        id: z.string(),
                        name: z.string(),
                        type: z.string()
                    })).optional()
                })).optional(),
                node: z.object({
                    nodeId: z.string(),
                    nodeName: z.string(),
                    type: z.string(),
                    path: z.array(z.array(z.string())).optional(),
                    descendantCount: z.number().optional(),
                    children: z.array(z.object({
                        id: z.string(),
                        name: z.string(),
                        type: z.string()
                    })).optional()
                }).optional()
            }),
            annotations: {
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async ({ channel }: any) => {
            if (!channel) {
                return toolResult({
                    status: "error",
                    channel: "",
                    errorCode: "MISSING_CHANNEL",
                    errorMessage: "Channel name must be provided."
                });
            }

            try {
                let versions: { serverVersion: string; pluginVersion: string };
                try {
                    versions = await joinChannel(channel);
                } catch (error: any) {
                    return toolResult(joinFailure(channel, error));
                }

                // Get connect payload
                let payload: any;
                try {
                    payload = await sendCommandToFigma("get_connect_payload");
                } catch (error: any) {
                    await detachAfterJoinFailure();
                    return toolResult(joinFailure(channel, error));
                }

                // Handle structured plugin error. `details` is forwarded when
                // present (P4-4 follow-up, 2026-07-23) — this leg previously
                // dropped it unconditionally, inconsistent with joinFailure()
                // below, which already relays `errorDetails` on the other leg.
                if (payload && payload.errorCode) {
                    await detachAfterJoinFailure();
                    return toolResult({
                        status: "error",
                        channel,
                        errorCode: payload.errorCode,
                        errorMessage: payload.errorMessage,
                        ...(payload.details !== undefined ? { errorDetails: payload.details } : {}),
                    });
                }

                // Success path
                return toolResult({
                    ...payload,
                    status: "success",
                    channel,
                    ...versions,
                });
            } catch (error: any) {
                return toolResult({
                    status: "error",
                    channel,
                    errorCode: UNKNOWN_ERROR,
                    errorMessage: `An unexpected error occurred while joining the channel: ${error.message || String(error)}.`
                });
            }
        }
    );
}
