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

  PLUGIN_PEER_AMBIGUOUS: (channel: string): ChannelProtocolError => ({
    code: "PLUGIN_PEER_AMBIGUOUS",
    message:
      "Operation Denied: Multiple plugin peers are connected to this channel. Ensure the figma-edit-mcp plugin is open in exactly one Figma tab/document.",
    details: { channel, peerCount: 2 },
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
