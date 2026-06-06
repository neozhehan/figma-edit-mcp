import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { joinChannel, sendCommandToFigma, resetChannel } from "../figma-client.js";
import { toolResult } from "./_result.js";

export function registerChannelTools(server: McpServer) {
    // 1. Join Channel Tool
    server.registerTool(
        "channel.join",
        {
            title: "Join Channel",
            description: "Join a plugin channel to establish the live connection to the Figma document.",
            inputSchema: z.object({
                channel: z
                    .string()
                    .describe("The name of the channel to join"),
            }),
            outputSchema: z.object({
                status: z.enum(["success", "error"]).describe("Connection status"),
                channel: z.string().describe("Channel name"),
                errorCode: z.string().optional().describe("Error code if status is error"),
                errorMessage: z.string().optional().describe("Error message if status is error"),
                readOnly: z.boolean().optional().describe("Whether the connection is read-only"),
                scopeRootId: z.string().nullable().optional().describe("Editable scope root node ID"),
                documentId: z.string().optional().describe("Figma document ID"),
                documentName: z.string().optional().describe("Figma document name"),
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
                try {
                    await joinChannel(channel);
                } catch (error: any) {
                    let errorCode = "UNKNOWN_ERROR";
                    let errorMessage = `An unexpected error occurred while joining the channel: ${error.message || String(error)}.`;

                    if (error.joinErrorCode === "CHANNEL_NOT_FOUND") {
                        errorCode = "CHANNEL_NOT_FOUND";
                        errorMessage = `Channel '${channel}' was not found. Verify the channel name and that the Figma plugin is running and connected.`;
                    } else if (error.message && error.message.includes("timed out")) {
                        errorCode = "CHANNEL_JOIN_FAILED";
                        errorMessage = `Failed to join channel '${channel}'. The Figma plugin did not acknowledge the join within the expected time. Try reconnecting the plugin.`;
                    } else if (error.message && error.message.includes("Connection closed")) {
                        errorCode = "PLUGIN_DISCONNECTED";
                        errorMessage = "The Figma plugin disconnected before the editable scope could be read. Reopen the plugin and try again.";
                    }

                    return toolResult({
                        status: "error",
                        channel,
                        errorCode,
                        errorMessage
                    });
                }

                // Get connect payload
                let payload: any;
                try {
                    payload = await sendCommandToFigma("get_connect_payload");
                } catch (error: any) {
                    resetChannel();
                    let errorCode = "UNKNOWN_ERROR";
                    let errorMessage = `An unexpected error occurred while joining the channel: ${error.message || String(error)}.`;

                    if (error.message && error.message.includes("Connection closed")) {
                        errorCode = "PLUGIN_DISCONNECTED";
                        errorMessage = "The Figma plugin disconnected before the editable scope could be read. Reopen the plugin and try again.";
                    }

                    return toolResult({
                        status: "error",
                        channel,
                        errorCode,
                        errorMessage
                    });
                }

                // Handle structured plugin error
                if (payload && payload.errorCode) {
                    resetChannel();
                    return toolResult({
                        status: "error",
                        channel,
                        errorCode: payload.errorCode,
                        errorMessage: payload.errorMessage
                    });
                }

                // Success path
                return toolResult({
                    status: "success",
                    channel,
                    ...payload
                });
            } catch (error: any) {
                return toolResult({
                    status: "error",
                    channel,
                    errorCode: "UNKNOWN_ERROR",
                    errorMessage: `An unexpected error occurred while joining the channel: ${error.message || String(error)}.`
                });
            }
        }
    );
}
