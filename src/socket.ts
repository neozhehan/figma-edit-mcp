import { createServer, type Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import { realpathSync } from "fs";
import { resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { parseCliArgs } from "./cli.js";
import {
  acknowledgedResultFrame,
  CHANNEL_REFUSALS,
  isKnownChannelVersion,
  joinErrorFrame,
  normalizeChannelVersion,
  type ChannelClientType,
  type RelayFrame,
} from "./shared/channelProtocol.js";

/**
 * A dispatched route is reclaimed once it has been idle this long (Change 5,
 * P9-F4). The bound is on INACTIVITY, not age: a long command that keeps
 * emitting progress refreshes its route, so pruning can never evict work that
 * is still running. It exists so a command that never receives a terminal
 * frame — a client-side timeout, or a plugin that stops answering — cannot
 * leak its route for the life of the binding.
 */
const ROUTE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface SocketLogger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface ConnectedPeer {
  socket: WebSocket;
  peerId: string;
  clientType: ChannelClientType | null;
  channel: string | null;
  pluginVersion?: string;
  serverVersion?: string;
}

interface PendingRoute {
  requestId: string;
  pluginPeerId: string;
  mcpPeerId: string;
  /** Refreshed by progress forwarding; drives idle reclamation (P9-F4). */
  lastActivityAt: number;
}

interface ChannelState {
  name: string;
  plugin: ConnectedPeer | null;
  mcp: ConnectedPeer | null;
  serverVersion?: string;
  pending: Map<string, PendingRoute>;
}

export interface FigmaSocketServerOptions {
  logger?: SocketLogger;
  peerIdFactory?: () => string;
  /** Injectable clock so route-reclamation tests need no wall-clock wait. */
  now?: () => number;
  /** Override the idle bound; tests use a short one. */
  routeIdleTimeoutMs?: number;
}

export interface FigmaSocketServer {
  httpServer: HttpServer;
  webSocketServer: WebSocketServer;
  close(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object";
}

/**
 * Construct the socket server without listening. Keeping construction separate
 * from the CLI entry point lets protocol tests bind an ephemeral port and drive
 * the real WebSocket transport deterministically.
 */
export function createFigmaSocketServer(
  options: FigmaSocketServerOptions = {},
): FigmaSocketServer {
  const logger = options.logger ?? console;
  const peerIdFactory = options.peerIdFactory ?? randomUUID;
  const now = options.now ?? Date.now;
  const routeIdleTimeoutMs = options.routeIdleTimeoutMs ?? ROUTE_IDLE_TIMEOUT_MS;
  const channels = new Map<string, ChannelState>();
  const peers = new Map<WebSocket, ConnectedPeer>();

  /**
   * Reclaim routes whose request produced no terminal frame and no progress
   * within the idle bound (P9-F4). Called on dispatch, so the map is bounded
   * by the number of genuinely active requests rather than by session length.
   */
  const pruneIdleRoutes = (channel: ChannelState) => {
    const cutoff = now() - routeIdleTimeoutMs;
    for (const [requestId, route] of channel.pending) {
      if (route.lastActivityAt <= cutoff) channel.pending.delete(requestId);
    }
  };

  const httpServer = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket server running");
  });

  const webSocketServer = new WebSocketServer({ noServer: true });

  const send = (peer: ConnectedPeer, frame: unknown): boolean => {
    if (peer.socket.readyState !== WebSocket.OPEN) return false;
    try {
      peer.socket.send(JSON.stringify(frame));
      return true;
    } catch (error) {
      logger.error("Error sending socket frame:", error);
      return false;
    }
  };

  const sendProtocolError = (peer: ConnectedPeer, message: string) => {
    send(peer, { type: "error", message });
  };

  const sendJoinedNotice = (peer: ConnectedPeer, channel: string) => {
    send(peer, {
      type: "system",
      message: `Joined channel: ${channel}`,
      channel,
    });
  };

  const sendPeerJoinedNotice = (
    recipient: ConnectedPeer | null,
    channel: string,
  ) => {
    if (!recipient) return;
    send(recipient, {
      type: "system",
      message: "A new user has joined the channel",
      channel,
    });
  };

  const sendPeerLeftNotice = (
    recipient: ConnectedPeer | null,
    channel: string,
  ) => {
    if (!recipient) return;
    send(recipient, {
      type: "system",
      message: "A user has left the channel",
      channel,
    });
  };

  const detachMcp = (
    channel: ChannelState,
    peer: ConnectedPeer,
    notifyPlugin: boolean,
  ) => {
    if (channel.mcp !== peer) return;
    channel.pending.clear();
    channel.mcp = null;
    channel.serverVersion = undefined;
    peer.channel = null;
    peer.serverVersion = undefined;
    if (notifyPlugin) sendPeerLeftNotice(channel.plugin, channel.name);
    if (!channel.plugin) channels.delete(channel.name);
  };

  const detachPlugin = (
    channel: ChannelState,
    peer: ConnectedPeer,
    notifyMcp: boolean,
  ) => {
    if (channel.plugin !== peer) return;

    channel.pending.clear();
    channel.plugin = null;
    peer.channel = null;
    peer.pluginVersion = undefined;

    const boundMcp = channel.mcp;
    if (boundMcp) {
      channel.mcp = null;
      channel.serverVersion = undefined;
      boundMcp.channel = null;
      boundMcp.serverVersion = undefined;

      if (notifyMcp) {
        const error = CHANNEL_REFUSALS.PLUGIN_DISCONNECTED(
          channel.name,
          peer.peerId,
        );
        send(boundMcp, {
          type: "peer_disconnected",
          channel: channel.name,
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        });
      }
    }

    channels.delete(channel.name);
  };

  const leavePeer = (peer: ConnectedPeer, notifyBoundPeer: boolean) => {
    const channelName = peer.channel;
    if (!channelName) return;
    const channel = channels.get(channelName);
    if (!channel) {
      peer.channel = null;
      return;
    }

    if (channel.plugin === peer) {
      detachPlugin(channel, peer, notifyBoundPeer);
    } else if (channel.mcp === peer) {
      detachMcp(channel, peer, notifyBoundPeer);
    } else {
      peer.channel = null;
    }
  };

  const acknowledgePluginJoin = (
    peer: ConnectedPeer,
    id: unknown,
    channelName: string,
    pluginVersion: string,
  ) => {
    sendJoinedNotice(peer, channelName);
    send(
      peer,
      acknowledgedResultFrame(id, channelName, {
        pluginVersion,
      }),
    );
  };

  const acknowledgeMcpJoin = (
    peer: ConnectedPeer,
    id: unknown,
    channelName: string,
    serverVersion: string,
    pluginVersion: string,
  ) => {
    sendJoinedNotice(peer, channelName);
    send(
      peer,
      acknowledgedResultFrame(id, channelName, {
        serverVersion,
        pluginVersion,
      }),
    );
  };

  const handlePluginJoin = (
    peer: ConnectedPeer,
    data: Record<string, any>,
    channelName: string,
  ) => {
    if (peer.clientType && peer.clientType !== "plugin") {
      sendProtocolError(
        peer,
        "A socket connection cannot change clientType after joining.",
      );
      return;
    }
    peer.clientType = "plugin";

    if (peer.channel && peer.channel !== channelName) {
      sendProtocolError(
        peer,
        `Leave channel '${peer.channel}' before joining another channel.`,
      );
      return;
    }

    // Normalized on ingest so the stored value is the one both the
    // known-version test and the equality test see (P9-F6).
    const pluginVersion = normalizeChannelVersion(data.pluginVersion);
    const existing = channels.get(channelName);

    if (existing?.plugin && existing.plugin !== peer) {
      send(
        peer,
        joinErrorFrame(
          data.id,
          CHANNEL_REFUSALS.PLUGIN_PEER_AMBIGUOUS(channelName),
        ),
      );
      return;
    }

    if (existing?.plugin === peer) {
      acknowledgePluginJoin(
        peer,
        data.id,
        channelName,
        normalizeChannelVersion(existing.plugin.pluginVersion),
      );
      return;
    }

    const channel: ChannelState =
      existing ?? {
        name: channelName,
        plugin: null,
        mcp: null,
        pending: new Map(),
      };
    channel.plugin = peer;
    channels.set(channelName, channel);
    peer.channel = channelName;
    peer.pluginVersion = pluginVersion;

    acknowledgePluginJoin(
      peer,
      data.id,
      channelName,
      pluginVersion,
    );
    sendPeerJoinedNotice(channel.mcp, channelName);
  };

  const handleMcpJoin = (
    peer: ConnectedPeer,
    data: Record<string, any>,
    channelName: string,
  ) => {
    if (peer.clientType && peer.clientType !== "mcp") {
      sendProtocolError(
        peer,
        "A socket connection cannot change clientType after joining.",
      );
      return;
    }
    peer.clientType = "mcp";

    if (peer.channel && peer.channel !== channelName) {
      sendProtocolError(
        peer,
        `Leave channel '${peer.channel}' before joining another channel.`,
      );
      return;
    }

    const channel = channels.get(channelName);
    if (!channel?.plugin) {
      send(
        peer,
        joinErrorFrame(
          data.id,
          CHANNEL_REFUSALS.PLUGIN_PEER_UNAVAILABLE(channelName),
        ),
      );
      return;
    }

    if (channel.mcp && channel.mcp !== peer) {
      send(
        peer,
        joinErrorFrame(
          data.id,
          CHANNEL_REFUSALS.CHANNEL_IN_USE(channelName),
        ),
      );
      return;
    }

    const serverVersion = normalizeChannelVersion(data.serverVersion);
    const pluginVersion = normalizeChannelVersion(channel.plugin.pluginVersion);

    if (
      isKnownChannelVersion(serverVersion) &&
      isKnownChannelVersion(pluginVersion) &&
      serverVersion !== pluginVersion
    ) {
      send(
        peer,
        joinErrorFrame(
          data.id,
          CHANNEL_REFUSALS.VERSION_MISMATCH(
            channelName,
            serverVersion,
            pluginVersion,
          ),
        ),
      );
      return;
    }

    channel.mcp = peer;
    channel.serverVersion = serverVersion;
    peer.channel = channelName;
    peer.serverVersion = serverVersion;

    acknowledgeMcpJoin(
      peer,
      data.id,
      channelName,
      serverVersion,
      pluginVersion,
    );
    sendPeerJoinedNotice(channel.plugin, channelName);
  };

  const handleJoin = (
    peer: ConnectedPeer,
    data: Record<string, any>,
  ) => {
    const channelName = data.channel;
    if (!channelName || typeof channelName !== "string") {
      sendProtocolError(peer, "Channel name is required");
      return;
    }

    if (data.clientType === "plugin") {
      handlePluginJoin(peer, data, channelName);
      return;
    }
    if (data.clientType === "mcp") {
      handleMcpJoin(peer, data, channelName);
      return;
    }

    sendProtocolError(
      peer,
      "clientType must be exactly 'plugin' or 'mcp'.",
    );
  };

  const handleLeave = (
    peer: ConnectedPeer,
    data: Record<string, any>,
  ) => {
    const requestedChannel =
      typeof data.channel === "string" ? data.channel : peer.channel;
    const actualChannel = peer.channel;

    // Unbind the connection's real pair rather than trusting a caller-supplied
    // room name. An idempotent repeat still receives an acknowledgement.
    leavePeer(peer, true);

    const channelName = actualChannel ?? requestedChannel ?? "";
    send(
      peer,
      acknowledgedResultFrame(data.id, channelName, {
        left: true,
        channel: channelName,
      }),
    );
  };

  const forwardCommand = (
    channel: ChannelState,
    peer: ConnectedPeer,
    data: RelayFrame,
  ) => {
    if (channel.mcp !== peer || !channel.plugin) return;
    if (data.type !== "message") return;

    const requestId =
      typeof data.message.id === "string" ? data.message.id : data.id;
    if (
      typeof requestId !== "string" ||
      typeof data.message.command !== "string"
    ) {
      return;
    }
    if (
      typeof data.id === "string" &&
      typeof data.message.id === "string" &&
      data.id !== data.message.id
    ) {
      return;
    }

    pruneIdleRoutes(channel);
    channel.pending.set(requestId, {
      requestId,
      pluginPeerId: channel.plugin.peerId,
      mcpPeerId: peer.peerId,
      lastActivityAt: now(),
    });

    send(channel.plugin, {
      type: "broadcast",
      message: data.message,
      sender: "peer",
      channel: channel.name,
    });
  };

  const forwardPluginFrame = (
    channel: ChannelState,
    peer: ConnectedPeer,
    data: RelayFrame,
  ) => {
    if (channel.plugin !== peer || !channel.mcp) return;
    const requestId =
      typeof data.message.id === "string" ? data.message.id : data.id;
    if (typeof requestId !== "string") return;
    if (
      typeof data.id === "string" &&
      typeof data.message.id === "string" &&
      data.id !== data.message.id
    ) {
      return;
    }

    const route = channel.pending.get(requestId);
    if (
      !route ||
      route.pluginPeerId !== peer.peerId ||
      route.mcpPeerId !== channel.mcp.peerId
    ) {
      // A response is accepted only from the exact plugin peer to which this
      // request was dispatched. Forged, stale, and cross-peer replies disappear.
      return;
    }

    const isProgress =
      data.type === "progress_update" ||
      data.message.type === "progress_update";
    if (isProgress) {
      // Progress is liveness evidence: refresh the route so a long-running
      // command that keeps reporting is never reclaimed under it (P9-F4).
      route.lastActivityAt = now();
      send(channel.mcp, {
        id: requestId,
        type: "progress_update",
        message: data.message,
        sender: "peer",
        channel: channel.name,
      });
      return;
    }

    const isTerminal =
      Object.prototype.hasOwnProperty.call(data.message, "result") ||
      Object.prototype.hasOwnProperty.call(data.message, "error");
    if (!isTerminal) return;

    send(channel.mcp, {
      type: "broadcast",
      message: data.message,
      sender: "peer",
      channel: channel.name,
    });
    channel.pending.delete(requestId);
  };

  const handleRelay = (
    peer: ConnectedPeer,
    data: Record<string, any>,
  ) => {
    const channelName = data.channel;
    if (
      typeof channelName !== "string" ||
      peer.channel !== channelName ||
      !isRecord(data.message)
    ) {
      return;
    }

    const channel = channels.get(channelName);
    if (!channel || !channel.plugin || !channel.mcp) return;

    if (channel.mcp === peer) {
      forwardCommand(channel, peer, data as RelayFrame);
    } else if (channel.plugin === peer) {
      forwardPluginFrame(channel, peer, data as RelayFrame);
    }
  };

  httpServer.on("upgrade", (req, socket, head) => {
    webSocketServer.handleUpgrade(req, socket, head, (ws) => {
      webSocketServer.emit("connection", ws, req);
    });
  });

  webSocketServer.on("connection", (socket: WebSocket) => {
    const peer: ConnectedPeer = {
      socket,
      peerId: peerIdFactory(),
      clientType: null,
      channel: null,
    };
    peers.set(socket, peer);
    logger.log("New client connected");

    send(peer, {
      type: "system",
      message: "Please join a channel to start chatting",
      peerId: peer.peerId,
    });

    socket.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (!isRecord(data) || typeof data.type !== "string") {
          sendProtocolError(peer, "Invalid socket frame");
          return;
        }

        if (data.type === "join") {
          handleJoin(peer, data);
        } else if (data.type === "leave") {
          handleLeave(peer, data);
        } else if (
          data.type === "message" ||
          data.type === "progress_update"
        ) {
          handleRelay(peer, data);
        }
      } catch (error) {
        logger.error("Error handling message:", error);
        sendProtocolError(peer, "Invalid JSON socket frame");
      }
    });

    socket.on("close", () => {
      logger.log("Client disconnected");
      leavePeer(peer, true);
      peers.delete(socket);
    });
  });

  const close = async () => {
    for (const client of webSocketServer.clients) client.terminate();

    const webSocketClose = new Promise<void>((resolveClose) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        resolveClose();
      };
      // `ws` in noServer mode can omit the close callback after the owning HTTP
      // server has already drained every upgraded connection. Bound the helper
      // used by tests/shutdown rather than leaving teardown wedged indefinitely.
      const fallback = setTimeout(finish, 250);
      fallback.unref?.();
      webSocketServer.close(finish);
    });

    const httpClose = httpServer.listening
      ? new Promise<void>((resolveClose, rejectClose) => {
          let settled = false;
          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(fallback);
            if (error) rejectClose(error);
            else resolveClose();
          };
          // Bun/Node can keep the HTTP close callback pending for an upgraded
          // socket even after `ws.terminate()`. The WebSocket side is already
          // force-closed above; this bound keeps programmatic teardown usable.
          const fallback = setTimeout(() => finish(), 250);
          fallback.unref?.();
          httpServer.close((error) => finish(error));
        })
      : Promise.resolve();

    await Promise.all([webSocketClose, httpClose]);
  };

  return { httpServer, webSocketServer, close };
}

export function isSocketCliEntry(
  entry: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url,
): boolean {
  if (!entry) return false;
  try {
    // npm/pnpm expose bins through symlinks. `import.meta.url` resolves to the
    // real module while argv[1] may retain the symlink path, so textual URL
    // equality would silently turn the executable into a no-op.
    return (
      realpathSync(resolve(entry)) === realpathSync(fileURLToPath(moduleUrl))
    );
  } catch {
    // Preserve the ordinary direct-source comparison if either path cannot be
    // canonicalized (for example, a non-file loader URL).
    return moduleUrl === pathToFileURL(resolve(entry)).href;
  }
}

if (isSocketCliEntry()) {
  const { port, host } = parseCliArgs("figma-edit-mcp-socket");
  const server = createFigmaSocketServer();
  server.httpServer.listen(port, host, () => {
    console.log(`WebSocket server running on ${host}:${port}`);
  });
}
