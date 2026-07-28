/**
 * Canonical server-side channel protocol for the v2.3.3 peer-bound transport.
 *
 * The Figma plugin bundle deliberately keeps its own refusal registry because it
 * cannot import server modules at runtime. Socket-originated refusals live here,
 * so `src/socket.ts` never reconstructs codes or messages inline.
 */

export type ChannelClientType = "plugin" | "mcp";

export interface ChannelProtocolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PluginJoinFrame {
  id?: string;
  type: "join";
  channel: string;
  clientType: "plugin";
  pluginVersion?: string;
}

export interface McpJoinFrame {
  id: string;
  type: "join";
  channel: string;
  clientType: "mcp";
  serverVersion?: string;
}

export interface LeaveFrame {
  id: string;
  type: "leave";
  channel: string;
}

export interface RelayFrame {
  id?: string;
  type: "message" | "progress_update";
  channel: string;
  message: {
    id?: string;
    command?: string;
    result?: unknown;
    error?: unknown;
    type?: string;
    [key: string]: unknown;
  };
}

export type IncomingChannelFrame =
  | PluginJoinFrame
  | McpJoinFrame
  | LeaveFrame
  | RelayFrame;

export interface ChannelJoinResult {
  serverVersion: string;
  pluginVersion: string;
}

export interface ChannelLeaveResult {
  left: true;
  channel: string;
}

export const CHANNEL_REFUSALS = {
  PLUGIN_PEER_UNAVAILABLE: (channel: string): ChannelProtocolError => ({
    code: "PLUGIN_PEER_UNAVAILABLE",
    message:
      "Operation Denied: Figma Plugin is not running or available. Please open the Figma document, start the figma-edit-mcp plugin, and reconnect.",
    details: { channel, peerCount: 0 },
  }),

  // Delivered to the JOINING plugin peer, never to an MCP caller: a channel
  // holds one plugin slot, so the second plugin is refused here and
  // `channel_join` can never observe two (Change 5, P9-F1).
  //
  // No `peerCount` here. It was previously the literal `2` regardless of how
  // many peers were involved, which presented a constant as an observation
  // (P9-F5). `PLUGIN_PEER_UNAVAILABLE` keeps its count because zero is real.
  PLUGIN_PEER_AMBIGUOUS: (channel: string): ChannelProtocolError => ({
    code: "PLUGIN_PEER_AMBIGUOUS",
    message:
      "Operation Denied: Multiple plugin peers are connected to this channel. Ensure the figma-edit-mcp plugin is open in exactly one Figma tab/document.",
    details: { channel },
  }),

  CHANNEL_IN_USE: (channel: string): ChannelProtocolError => ({
    code: "CHANNEL_IN_USE",
    message:
      "Operation Denied: This channel is already in use by another MCP session. Please use a different channel name or disconnect the other session.",
    details: { channel },
  }),

  VERSION_MISMATCH: (
    channel: string,
    serverVersion: string,
    pluginVersion: string,
  ): ChannelProtocolError => ({
    code: "VERSION_MISMATCH",
    message:
      "Operation Denied: Version mismatch between MCP server and Figma plugin. Please ensure both are updated to the same version.",
    details: { channel, serverVersion, pluginVersion },
  }),

  PLUGIN_DISCONNECTED: (
    channel: string,
    pluginPeerId: string,
  ): ChannelProtocolError => ({
    code: "PLUGIN_DISCONNECTED",
    message:
      "The bound Figma plugin peer disconnected. Reopen the plugin and successfully rejoin the channel before calling another tool.",
    details: { channel, pluginPeerId },
  }),
} as const;

/**
 * Refusals raised by the MCP client itself, before any frame reaches the
 * socket. Kept separate from `CHANNEL_REFUSALS` on the same rule the Change 5
 * origin split established: a factory lives where its code can actually be
 * thrown. No `Operation Denied:` prefix — like `PLUGIN_DISCONNECTED`, this
 * reports a missing precondition, not a policy denial (D9 reserves the prefix
 * for policy/verification refusals).
 */
export const CLIENT_REFUSALS = {
  /**
   * `releasedChannel` is present only when a failed `channel_join` gave up a
   * working binding to attempt it (P9-F2), which is the case where the agent
   * needs a specific channel name to get back to where it was.
   */
  CHANNEL_NOT_BOUND: (releasedChannel?: string): ChannelProtocolError => ({
    code: "CHANNEL_NOT_BOUND",
    message: releasedChannel
      ? `No channel is bound to this session: a failed channel_join released the previously joined channel '${releasedChannel}'. Call channel_join with '${releasedChannel}' to reconnect to it before sending another command.`
      : "No channel is bound to this session. Call channel_join with the channel code shown in the Figma plugin's status bar before sending commands.",
    ...(releasedChannel === undefined ? {} : { details: { releasedChannel } }),
  }),
} as const;

/**
 * Canonical form of a self-reported version. Both join paths normalize on
 * ingest so the "is this known?" test and the equality test operate on the
 * same value — previously the former trimmed and the latter did not, so a
 * padded self-report could be counted as known AND as unequal to its own
 * unpadded twin (Change 5, P9-F6).
 */
export function normalizeChannelVersion(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "unknown";
}

/**
 * D13 refuses a known unequal pair. The plugin's build fallback is deliberately
 * `"unknown"` rather than another hard-coded version surface, so an unavailable
 * self-report is not misclassified as a known mismatch.
 */
export function isKnownChannelVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().toLowerCase() !== "unknown"
  );
}

export function joinErrorFrame(
  id: unknown,
  error: ChannelProtocolError,
) {
  return {
    type: "join_error" as const,
    ...(typeof id === "string" ? { id } : {}),
    code: error.code,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

export function acknowledgedResultFrame(
  id: unknown,
  channel: string,
  result: Record<string, unknown>,
) {
  return {
    type: "system" as const,
    message: {
      ...(typeof id === "string" ? { id } : {}),
      result,
    },
    channel,
  };
}
