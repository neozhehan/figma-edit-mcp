import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "fs";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { WebSocket } from "ws";
import {
  createFigmaSocketServer,
  isSocketCliEntry,
  type FigmaSocketServer,
} from "../../socket.js";
import { CHANNEL_REFUSALS } from "../../shared/channelProtocol.js";
import { SERVER_VERSION } from "../../shared/version.js";
import { REFUSALS as PLUGIN_REFUSALS } from "../../../figma_plugin/utils/errors.js";

type Predicate = (message: any) => boolean;

interface MessageWaiter {
  predicate: Predicate;
  resolve: (message: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class WirePeer {
  readonly messages: any[] = [];
  readonly waiters: MessageWaiter[] = [];
  peerId = "";

  constructor(readonly socket: WebSocket) {
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      const waiterIndex = this.waiters.findIndex((waiter) =>
        waiter.predicate(message),
      );
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.messages.push(message);
      }
    });
  }

  send(message: unknown) {
    this.socket.send(JSON.stringify(message));
  }

  next(predicate: Predicate, timeoutMs = 1_000): Promise<any> {
    const queuedIndex = this.messages.findIndex(predicate);
    if (queuedIndex >= 0) {
      const [message] = this.messages.splice(queuedIndex, 1);
      return Promise.resolve(message);
    }

    return new Promise((resolve, reject) => {
      const waiter: MessageWaiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for socket frame after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  async expectNo(predicate: Predicate, timeoutMs = 100): Promise<void> {
    try {
      const message = await this.next(predicate, timeoutMs);
      throw new Error(`Unexpected socket frame: ${JSON.stringify(message)}`);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Timed out waiting for socket frame")
      ) {
        return;
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (
      this.socket.readyState === WebSocket.CLOSED ||
      this.socket.readyState === WebSocket.CLOSING
    ) {
      return;
    }
    await new Promise<void>((resolve) => {
      const fallback = setTimeout(() => {
        this.socket.terminate();
        resolve();
      }, 500);
      this.socket.once("close", () => {
        clearTimeout(fallback);
        resolve();
      });
      this.socket.close();
    });
  }
}

describe("Phase 9 D13: socket/plugin refusal parity", () => {
  it("keeps the four D13 code/message pairs identical across the server and plugin registries", () => {
    const pairs = [
      [
        CHANNEL_REFUSALS.PLUGIN_PEER_UNAVAILABLE("parity"),
        PLUGIN_REFUSALS.PLUGIN_PEER_UNAVAILABLE(),
      ],
      [
        CHANNEL_REFUSALS.PLUGIN_PEER_AMBIGUOUS("parity"),
        PLUGIN_REFUSALS.PLUGIN_PEER_AMBIGUOUS(),
      ],
      [
        CHANNEL_REFUSALS.CHANNEL_IN_USE("parity"),
        PLUGIN_REFUSALS.CHANNEL_IN_USE(),
      ],
      [
        CHANNEL_REFUSALS.VERSION_MISMATCH(
          "parity",
          "server-version",
          "plugin-version",
        ),
        PLUGIN_REFUSALS.VERSION_MISMATCH(),
      ],
    ];

    for (const [serverRefusal, pluginRefusal] of pairs) {
      expect({
        code: serverRefusal.code,
        message: serverRefusal.message,
      }).toEqual(pluginRefusal);
    }
  });

  it("recognizes an npm-style symlinked socket bin as direct execution", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "figma-socket-cli-"));
    try {
      const realEntry = fileURLToPath(new URL("../../socket.ts", import.meta.url));
      const symlinkedEntry = join(tempDir, "figma-edit-mcp-socket");
      symlinkSync(realEntry, symlinkedEntry);
      expect(
        isSocketCliEntry(symlinkedEntry, pathToFileURL(realEntry).href),
      ).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Phase 9 D13: peer-bound socket protocol", () => {
  let server: FigmaSocketServer;
  let socketUrl: string;
  let peers: WirePeer[];
  let peerSequence: number;

  beforeEach(async () => {
    peers = [];
    peerSequence = 0;
    server = createFigmaSocketServer({
      logger: { log() {}, error() {} },
      peerIdFactory: () => `peer-${++peerSequence}`,
    });
    await new Promise<void>((resolve, reject) => {
      server.httpServer.once("error", reject);
      server.httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.httpServer.address() as AddressInfo;
    socketUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await Promise.all(peers.map((peer) => peer.close()));
    await server.close();
  });

  async function openPeer(): Promise<WirePeer> {
    const socket = new WebSocket(socketUrl);
    const peer = new WirePeer(socket);
    peers.push(peer);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    const welcome = await peer.next(
      (message) =>
        message.type === "system" &&
        typeof message.message === "string" &&
        typeof message.peerId === "string",
    );
    peer.peerId = welcome.peerId;
    return peer;
  }

  async function joinPlugin(
    peer: WirePeer,
    channel: string,
    pluginVersion = SERVER_VERSION,
    id = `plugin-${channel}`,
  ): Promise<any> {
    peer.send({
      id,
      type: "join",
      channel,
      clientType: "plugin",
      pluginVersion,
    });
    return peer.next(
      (message) =>
        message.type === "system" &&
        message.message?.id === id &&
        message.message?.result,
    );
  }

  async function joinMcp(
    peer: WirePeer,
    channel: string,
    serverVersion = SERVER_VERSION,
    id = `mcp-${channel}`,
  ): Promise<any> {
    peer.send({
      id,
      type: "join",
      channel,
      clientType: "mcp",
      serverVersion,
    });
    return peer.next(
      (message) =>
        (message.type === "system" || message.type === "join_error") &&
        (message.message?.id === id || message.id === id),
    );
  }

  it("assigns connection-lifetime peer IDs and refuses empty, ambiguous, and in-use channels without admitting the refused peer", async () => {
    const loneMcp = await openPeer();
    const plugin = await openPeer();
    const secondPlugin = await openPeer();
    const firstMcp = await openPeer();
    const secondMcp = await openPeer();

    expect([
      loneMcp.peerId,
      plugin.peerId,
      secondPlugin.peerId,
      firstMcp.peerId,
      secondMcp.peerId,
    ]).toEqual(["peer-1", "peer-2", "peer-3", "peer-4", "peer-5"]);

    const unavailable = await joinMcp(
      loneMcp,
      "empty-channel",
      SERVER_VERSION,
      "join-empty",
    );
    expect(unavailable.type).toBe("join_error");
    expect(unavailable.code).toBe("PLUGIN_PEER_UNAVAILABLE");
    expect(unavailable.details).toEqual({
      channel: "empty-channel",
      peerCount: 0,
    });

    const pluginAck = await joinPlugin(
      plugin,
      "bound-channel",
      SERVER_VERSION,
      "join-plugin",
    );
    expect(pluginAck.message.result).toEqual({
      pluginVersion: SERVER_VERSION,
    });

    secondPlugin.send({
      id: "join-second-plugin",
      type: "join",
      channel: "bound-channel",
      clientType: "plugin",
      pluginVersion: SERVER_VERSION,
    });
    const ambiguous = await secondPlugin.next(
      (message) => message.id === "join-second-plugin",
    );
    expect(ambiguous.type).toBe("join_error");
    expect(ambiguous.code).toBe("PLUGIN_PEER_AMBIGUOUS");

    const firstMcpAck = await joinMcp(
      firstMcp,
      "bound-channel",
      SERVER_VERSION,
      "join-first-mcp",
    );
    expect(firstMcpAck.message.result).toEqual({
      serverVersion: SERVER_VERSION,
      pluginVersion: SERVER_VERSION,
    });

    const inUse = await joinMcp(
      secondMcp,
      "bound-channel",
      SERVER_VERSION,
      "join-second-mcp",
    );
    expect(inUse.type).toBe("join_error");
    expect(inUse.code).toBe("CHANNEL_IN_USE");
  });

  it("refuses a known version mismatch without reserving the MCP slot, then permits a matching rejoin", async () => {
    const plugin = await openPeer();
    const mcp = await openPeer();
    await joinPlugin(plugin, "versioned", SERVER_VERSION);

    const mismatch = await joinMcp(
      mcp,
      "versioned",
      "9.9.9",
      "join-mismatch",
    );
    expect(mismatch.type).toBe("join_error");
    expect(mismatch.code).toBe("VERSION_MISMATCH");
    expect(mismatch.details).toEqual({
      channel: "versioned",
      serverVersion: "9.9.9",
      pluginVersion: SERVER_VERSION,
    });

    const matching = await joinMcp(
      mcp,
      "versioned",
      SERVER_VERSION,
      "join-matching",
    );
    expect(matching.type).toBe("system");
    expect(matching.message.result).toEqual({
      serverVersion: SERVER_VERSION,
      pluginVersion: SERVER_VERSION,
    });

    mcp.send({
      id: "after-match",
      type: "message",
      channel: "versioned",
      message: {
        id: "after-match",
        command: "page_info",
        params: {},
      },
    });
    const routed = await plugin.next(
      (message) =>
        message.type === "broadcast" &&
        message.message?.id === "after-match",
    );
    expect(routed.message.command).toBe("page_info");
  });

  it("routes only within the bound pair and accepts progress/terminal responses only from the dispatched plugin peer", async () => {
    const plugin = await openPeer();
    const mcp = await openPeer();
    const foreignPlugin = await openPeer();
    await joinPlugin(plugin, "target", SERVER_VERSION);
    await joinMcp(mcp, "target", SERVER_VERSION);
    await joinPlugin(foreignPlugin, "foreign", SERVER_VERSION);

    mcp.send({
      id: "request-1",
      type: "message",
      channel: "target",
      message: {
        id: "request-1",
        command: "node_info",
        params: { nodeIds: ["1:2"] },
      },
    });
    await plugin.next(
      (message) =>
        message.type === "broadcast" &&
        message.message?.id === "request-1",
    );

    foreignPlugin.send({
      id: "request-1",
      type: "message",
      channel: "target",
      message: {
        id: "request-1",
        result: { forged: true },
      },
    });
    await mcp.expectNo(
      (message) =>
        message.type === "broadcast" &&
        message.message?.id === "request-1",
    );

    plugin.send({
      id: "request-1",
      type: "progress_update",
      channel: "target",
      message: {
        id: "request-1",
        type: "progress_update",
        data: { progress: 50 },
      },
    });
    const progress = await mcp.next(
      (message) =>
        message.type === "progress_update" &&
        message.id === "request-1",
    );
    expect(progress.message.data).toEqual({ progress: 50 });

    plugin.send({
      id: "request-1",
      type: "message",
      channel: "target",
      message: {
        id: "request-1",
        result: { forged: false, nodeId: "1:2" },
      },
    });
    const terminal = await mcp.next(
      (message) =>
        message.type === "broadcast" &&
        message.message?.id === "request-1",
    );
    expect(terminal.message.result).toEqual({
      forged: false,
      nodeId: "1:2",
    });

    // Terminal delivery consumes the correlation entry; even the bound peer
    // cannot replay a second response under the completed request ID.
    plugin.send({
      id: "request-1",
      type: "message",
      channel: "target",
      message: { id: "request-1", result: { replay: true } },
    });
    await mcp.expectNo(
      (message) =>
        message.type === "broadcast" &&
        message.message?.result?.replay === true,
    );
  });

  it("acknowledges leave, unbinds the pair, and releases the MCP reservation", async () => {
    const plugin = await openPeer();
    const firstMcp = await openPeer();
    const secondMcp = await openPeer();
    await joinPlugin(plugin, "leave-test", SERVER_VERSION);
    await joinMcp(firstMcp, "leave-test", SERVER_VERSION);

    firstMcp.send({
      id: "leave-1",
      type: "leave",
      channel: "leave-test",
    });
    const leaveAck = await firstMcp.next(
      (message) =>
        message.type === "system" && message.message?.id === "leave-1",
    );
    expect(leaveAck.message.result).toEqual({
      left: true,
      channel: "leave-test",
    });

    const secondAck = await joinMcp(
      secondMcp,
      "leave-test",
      SERVER_VERSION,
      "join-after-leave",
    );
    expect(secondAck.type).toBe("system");

    firstMcp.send({
      id: "stale-command",
      type: "message",
      channel: "leave-test",
      message: {
        id: "stale-command",
        command: "page_info",
        params: {},
      },
    });
    await plugin.expectNo(
      (message) => message.message?.id === "stale-command",
    );

    secondMcp.send({
      id: "new-command",
      type: "message",
      channel: "leave-test",
      message: {
        id: "new-command",
        command: "page_info",
        params: {},
      },
    });
    const routed = await plugin.next(
      (message) => message.message?.id === "new-command",
    );
    expect(routed.message.command).toBe("page_info");
  });

  it("invalidates the MCP binding on plugin disconnect and routes nothing until an explicit successful rejoin", async () => {
    const firstPlugin = await openPeer();
    const mcp = await openPeer();
    await joinPlugin(firstPlugin, "disconnect-test", SERVER_VERSION);
    await joinMcp(mcp, "disconnect-test", SERVER_VERSION);

    const disconnectedPeerId = firstPlugin.peerId;
    await firstPlugin.close();
    const invalidated = await mcp.next(
      (message) => message.type === "peer_disconnected",
    );
    expect(invalidated.channel).toBe("disconnect-test");
    expect(invalidated.code).toBe("PLUGIN_DISCONNECTED");
    expect(invalidated.details.pluginPeerId).toBe(disconnectedPeerId);

    // This request is sent before a fresh pair exists and must never be queued
    // for a later plugin that happens to claim the same human channel code.
    mcp.send({
      id: "blocked-before-rejoin",
      type: "message",
      channel: "disconnect-test",
      message: {
        id: "blocked-before-rejoin",
        command: "page_info",
        params: {},
      },
    });

    const replacementPlugin = await openPeer();
    await joinPlugin(replacementPlugin, "disconnect-test", SERVER_VERSION);
    await replacementPlugin.expectNo(
      (message) => message.message?.id === "blocked-before-rejoin",
    );

    const rebound = await joinMcp(
      mcp,
      "disconnect-test",
      SERVER_VERSION,
      "join-after-disconnect",
    );
    expect(rebound.type).toBe("system");

    mcp.send({
      id: "after-rejoin",
      type: "message",
      channel: "disconnect-test",
      message: {
        id: "after-rejoin",
        command: "page_info",
        params: {},
      },
    });
    const routed = await replacementPlugin.next(
      (message) => message.message?.id === "after-rejoin",
    );
    expect(routed.message.command).toBe("page_info");
  });
});
