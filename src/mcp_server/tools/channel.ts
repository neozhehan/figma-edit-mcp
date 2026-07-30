import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
    joinChannel as defaultJoinChannel,
    sendCommandToFigma as defaultSendCommandToFigma,
    resetChannel as defaultResetChannel,
} from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";
import { UNKNOWN_ERROR } from "../../shared/errorCodes.js";
import {
    isolateUntrustedReleasedChannelDetails,
    JOIN_ATTEMPT_RELEASED_CHANNEL,
    mergeReleasedChannelDetails,
} from "../../shared/channelProtocol.js";

// Q20 (resolved 2026-07-18, Option A): join failures pass their structured
// codes through verbatim — unknown codes included, never collapsed to
// UNKNOWN_ERROR — and recovery guidance is keyed by code, never derived from
// message prose. The two locally-generated failures are coded at origin in
// figma-client (CHANNEL_JOIN_FAILED on join timeout, PLUGIN_DISCONNECTED on
// connection close). The in-band envelope shape is unchanged (v2.3.4 PRD Q1).
// Guidance receives the originating error so a code with more than one cause
// can name the right one (Change 5, P9-F7): a failure to LEAVE the previous
// channel used to be reported as a join-acknowledgement timeout.
/**
 * Terminates a borrowed origin message so appended recovery reads as its own
 * sentence. Transport errors are not authored for concatenation — a raw
 * `Request timed out after 30000ms` ran straight into the next clause. This is
 * the same run-on Change 8 fixed in `VARIABLE_IN_USE`; here the operand comes
 * from outside, so the join is what has to normalize it.
 */
function asSentence(message: unknown): string {
    const text = typeof message === "string" ? message.trim() : String(message ?? "");
    if (text.length === 0) return text;
    return /[.!?]$/.test(text) ? text : `${text}.`;
}

const JOIN_RECOVERY: Record<string, (channel: string, error: any) => string> = {
    CHANNEL_NOT_FOUND: (ch) => `Channel '${ch}' was not found. Verify the channel name and that the Figma plugin is running and connected.`,
    CHANNEL_JOIN_FAILED: (ch, error) =>
        error?.details?.phase === "leave-previous-channel"
            ? `${error.message} The requested join was not sent. This session's local channel binding was cleared, and its socket was closed to release any uncertain bridge reservation. Wait for the automatic bridge reconnect, then call channel_join with '${error.details.previousChannel}' to restore the previous channel or with '${error.details.requestedChannel}' to retry the requested channel.`
            // Change 12 (C12-F1): the scope-payload leg has its own cause. The
            // socket join SUCCEEDED and the plugin then failed to return the
            // editable scope, so the default wording below — "did not
            // acknowledge the join" — would name the wrong step, which is the
            // same wrong-cause defect C6-F7/C6-F3 fixed for the leave leg.
            : error?.details?.phase === "scope-payload"
                ? `${asSentence(error.message)} The channel was joined, but the Figma plugin did not return the editable scope in time, so no binding was established and this session currently holds none. Call channel_join with '${ch}' again; if it keeps failing, reopen the plugin in Figma and retry.`
                : `Failed to join channel '${ch}'. The Figma plugin did not acknowledge the join within the expected time. Try reconnecting the plugin.`,
    PLUGIN_DISCONNECTED: () => "The Figma plugin disconnected before the editable scope could be read. Reopen the plugin and try again.",
};

interface ChannelToolDependencies {
    joinChannel: typeof defaultJoinChannel;
    sendCommandToFigma: typeof defaultSendCommandToFigma;
    resetChannel: typeof defaultResetChannel;
}

type ReleasedChannelContext =
    | { source: "client-join"; releasedChannel?: string }
    | { source: "join-attempt"; releasedChannel?: string };

function joinFailure(
    channel: string,
    error: any,
    releaseContext: ReleasedChannelContext,
) {
    const hasExplicitCode =
        error !== null
        && typeof error === "object"
        && typeof error.code === "string";
    const errorCode = hasExplicitCode
        ? error.code
        : UNKNOWN_ERROR;
    const guidance = JOIN_RECOVERY[errorCode];
    const originMessage =
        error !== null
        && typeof error === "object"
        && typeof error.message === "string"
            ? error.message
            : String(error);
    // Codes without local guidance keep their originating message verbatim —
    // a D9 message already embeds its own recovery. This includes an explicit
    // UNKNOWN_ERROR from the plugin: only a code-less value gets the generic
    // fallback wrapper.
    const baseMessage = guidance
        ? guidance(channel, error)
        : hasExplicitCode
            ? originMessage
            : `An unexpected error occurred while joining the channel: ${originMessage}.`;

    // P9-F2: a failed join can only be attempted after releasing whatever
    // channel this session already held. Saying so in the always-visible
    // message — not only in errorDetails — is what keeps recovery to one round
    // trip when the cause was a mistyped channel code.
    // Both legs receive trusted attempt context, including authoritative
    // absence. Leg 1 reads a non-wire Symbol set only by joinChannel; leg 2
    // uses the local result metadata. Origin details can never fabricate it.
    const releasedCandidate = releaseContext.releasedChannel;
    const released = typeof releasedCandidate === "string"
        && releasedCandidate.length > 0
        ? releasedCandidate
        : undefined;
    const errorMessage = typeof released === "string" && released.length > 0
        ? `${baseMessage} This attempt also disconnected the previously joined channel '${released}'; call channel_join with '${released}' to restore it.`
        : baseMessage;
    const originDetails = error !== null && typeof error === "object"
        ? error.details
        : undefined;
    const errorDetails = typeof released === "string" && released.length > 0
        ? releaseContext.source === "client-join"
            // joinChannel already merged and provenance-marked these details.
            ? originDetails
            : mergeReleasedChannelDetails(originDetails, released)
        : isolateUntrustedReleasedChannelDetails(originDetails);

    return {
        status: "error",
        channel,
        errorCode,
        errorMessage,
        ...(errorDetails !== undefined ? { errorDetails } : {}),
    };
}

/**
 * Codes an uncoded scope-payload (leg 2) failure as `CHANNEL_JOIN_FAILED`.
 *
 * Change 12 (C12-F1). `joinChannel` already codes leg 1's locally-generated
 * failures at origin (Q20), but leg 2 goes through the generic
 * `sendCommandToFigma` path, whose request timeout rejects with a plain `Error`.
 * The identical agent-visible outcome — the join failed, any previous binding
 * was released, and a rejoin is required — was therefore coded on leg 1 and
 * `UNKNOWN_ERROR` on leg 2. Live-reproduced on channel `gt93`.
 *
 * This is not coded at origin because `sendCommandToFigma` serves every tool;
 * a timeout there is not a join failure in general. Leg 2 is the layer that
 * knows the command was part of a join attempt.
 *
 * Q20 is preserved exactly: the test is the structural ABSENCE of a code, never
 * message prose, and any explicit code passes through untouched — including an
 * explicit `UNKNOWN_ERROR`, which C6-F4 established must keep its authored
 * message rather than being reclassified.
 */
function codeScopePayloadFailure(error: any) {
    let code: unknown;
    try {
        code = error !== null && typeof error === "object"
            ? (error as any).code
            : undefined;
    } catch {
        // A hostile thrown value must not make the coding path itself throw.
        code = undefined;
    }
    if (typeof code === "string") return error;

    let message: string;
    try {
        message = error !== null
            && typeof error === "object"
            && typeof (error as any).message === "string"
            ? (error as any).message
            : String(error);
    } catch {
        message = "Error executing command";
    }
    return {
        code: "CHANNEL_JOIN_FAILED",
        message,
        details: { phase: "scope-payload" },
    };
}

async function detachAfterJoinFailure(
    resetChannel: typeof defaultResetChannel,
    releasedChannel?: string,
) {
    try {
        if (typeof releasedChannel === "string" && releasedChannel.length > 0) {
            await resetChannel({ releasedChannel });
        } else {
            await resetChannel();
        }
    } catch {
        // resetChannel clears the local binding before awaiting the socket leave
        // acknowledgement. Preserve the originating scope/transport failure;
        // the client remains fail-closed even if the bridge cannot acknowledge.
    }
}

export function registerChannelTools(
    server: McpServer,
    dependencies: ChannelToolDependencies = {
        joinChannel: defaultJoinChannel,
        sendCommandToFigma: defaultSendCommandToFigma,
        resetChannel: defaultResetChannel,
    },
) {
    const {
        joinChannel,
        sendCommandToFigma,
        resetChannel,
    } = dependencies;

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
                let releasedChannel: string | undefined;
                try {
                    const joined = await joinChannel(channel);
                    versions = {
                        serverVersion: joined.serverVersion,
                        pluginVersion: joined.pluginVersion,
                    };
                    releasedChannel = joined.releasedChannel;
                } catch (error: any) {
                    const releasedChannel =
                        error !== null
                        && typeof error === "object"
                        && typeof error[JOIN_ATTEMPT_RELEASED_CHANNEL] === "string"
                            ? error[JOIN_ATTEMPT_RELEASED_CHANNEL]
                            : undefined;
                    return toolResult(joinFailure(channel, error, {
                        source: "client-join",
                        releasedChannel,
                    }));
                }

                // Get connect payload
                let payload: any;
                try {
                    payload = await sendCommandToFigma("get_connect_payload");
                } catch (error: any) {
                    await detachAfterJoinFailure(resetChannel, releasedChannel);
                    // C12-F1: an uncoded failure on this leg becomes
                    // CHANNEL_JOIN_FAILED with its own phase, matching leg 1.
                    return toolResult(joinFailure(channel, codeScopePayloadFailure(error), {
                        source: "join-attempt",
                        releasedChannel,
                    }));
                }

                // Handle structured plugin error. `details` is forwarded when
                // present (P4-4 follow-up, 2026-07-23) — this leg previously
                // dropped it unconditionally, inconsistent with joinFailure()
                // below, which already relays `errorDetails` on the other leg.
                if (payload && payload.errorCode) {
                    await detachAfterJoinFailure(resetChannel, releasedChannel);
                    return toolResult(joinFailure(channel, {
                        code: payload.errorCode,
                        message: payload.errorMessage,
                        ...(payload.details !== undefined
                            ? { details: payload.details }
                            : {}),
                    }, {
                        source: "join-attempt",
                        releasedChannel,
                    }));
                }

                // Success path
                // `releasedChannel` is internal attempt metadata. A successful
                // scope read completes the switch, so do not expose it in the
                // public success envelope.
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
