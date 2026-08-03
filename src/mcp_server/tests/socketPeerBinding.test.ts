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
import {
  CHANNEL_REFUSALS,
  CLIENT_REFUSALS,
  normalizeChannelVersion,
} from "../../shared/channelProtocol.js";
import { SERVER_VERSION } from "../../shared/version.js";
import {
  CLIENT_OPERATIONAL_CODES,
  SOCKET_OPERATIONAL_CODES,
} from "../../shared/errorCodes.js";
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

describe("Phase 9 D13: socket refusal registry ownership", () => {
  // Change 5 (P9-F3) replaces the old plugin/server parity assertion. Parity
  // was guarding a mirror with no consumer: the plugin has no throw site for a
  // channel-admission refusal, so those four factories were dead strings in
  // `code.js`. The invariant that matters is OWNERSHIP — the socket registry
  // defines exactly these four, and the plugin registry defines none of them.
  it("defines exactly the four socket-origin D13 refusals, each returning its own code", () => {
    expect(Object.keys(CHANNEL_REFUSALS).sort()).toEqual(
      [...SOCKET_OPERATIONAL_CODES, "PLUGIN_DISCONNECTED"].sort(),
    );

    const produced = [
      CHANNEL_REFUSALS.PLUGIN_PEER_UNAVAILABLE("ch"),
      CHANNEL_REFUSALS.PLUGIN_PEER_AMBIGUOUS("ch"),
      CHANNEL_REFUSALS.CHANNEL_IN_USE("ch"),
      CHANNEL_REFUSALS.VERSION_MISMATCH("ch", "1.0.0", "2.0.0"),
    ];
    expect(produced.map((refusal) => refusal.code)).toEqual([
      ...SOCKET_OPERATIONAL_CODES,
    ]);
  });

  it("P9-F3: no socket- or client-origin code regains a dead plugin-side mirror", () => {
    for (const code of [...SOCKET_OPERATIONAL_CODES, ...CLIENT_OPERATIONAL_CODES]) {
      expect(
        code in PLUGIN_REFUSALS,
        `${code} is raised outside the Figma sandbox; the plugin bundle must not ship a factory it can never throw`,
      ).toBe(false);
    }
  });

  it("Rev 57: CLIENT_REFUSALS owns exactly the client-origin codes", () => {
    expect(Object.keys(CLIENT_REFUSALS).sort()).toEqual(
      [...CLIENT_OPERATIONAL_CODES].sort(),
    );
    // Client-origin codes must not also live in the socket registry — the
    // Change 5 rule is one home per code, chosen by where it is thrown.
    for (const code of CLIENT_OPERATIONAL_CODES) {
      expect(code in CHANNEL_REFUSALS).toBe(false);
    }
  });

  it("Rev 57: CHANNEL_NOT_BOUND carries a specific recovery in both shapes", () => {
    const generic = CLIENT_REFUSALS.CHANNEL_NOT_BOUND();
    expect(generic.code).toBe("CHANNEL_NOT_BOUND");
    expect(generic.message).toContain("Call channel_join");
    expect(generic.message).not.toContain("undefined");
    // No fabricated details when there is nothing to report (the P9-F5 rule).
    expect(generic.details).toBeUndefined();

    const released = CLIENT_REFUSALS.CHANNEL_NOT_BOUND("prev");
    expect(released.code).toBe("CHANNEL_NOT_BOUND");
    expect(released.message).toContain("released the previously joined channel 'prev'");
    expect(released.message).toContain("Call channel_join with 'prev'");
    expect(released.details).toEqual({ releasedChannel: "prev" });

    // D9 reserves the "Operation Denied:" prefix for policy/verification
    // refusals; a missing precondition is operational, like PLUGIN_DISCONNECTED.
    expect(generic.message.startsWith("Operation Denied:")).toBe(false);
    expect(released.message.startsWith("Operation Denied:")).toBe(false);
  });

  it("holds the socket refusals to D9's recovery-content bar", () => {
    // The equivalent bar for plugin-thrown codes lives in the Phase 4 suite;
    // this is where the four socket-origin codes are covered after the split.
    const recoveryVerb =
      /\b(retry|reconnect|pass|read|list|ensure|open|start|use|disconnect|update|resolve|reopen)\b/i;
    for (const refusal of [
      CHANNEL_REFUSALS.PLUGIN_PEER_UNAVAILABLE("ch"),
      CHANNEL_REFUSALS.PLUGIN_PEER_AMBIGUOUS("ch"),
      CHANNEL_REFUSALS.CHANNEL_IN_USE("ch"),
      CHANNEL_REFUSALS.VERSION_MISMATCH("ch", "1.0.0", "2.0.0"),
      CHANNEL_REFUSALS.PLUGIN_DISCONNECTED("ch", "peer-1"),
    ]) {
      expect(refusal.message.length).toBeGreaterThanOrEqual(25);
      expect(
        recoveryVerb.test(refusal.message),
        `${refusal.code} names no recovery action`,
      ).toBe(true);
    }
  });

  it("P9-F5: the ambiguous refusal reports no fabricated peer count", () => {
    // It was the literal `2` regardless of how many peers existed. The
    // unavailable refusal keeps its count because zero is genuinely observed.
    expect(CHANNEL_REFUSALS.PLUGIN_PEER_AMBIGUOUS("ch").details).toEqual({
      channel: "ch",
    });
    expect(CHANNEL_REFUSALS.PLUGIN_PEER_UNAVAILABLE("ch").details).toEqual({
      channel: "ch",
      peerCount: 0,
    });
  });

  it("P9-F6: version normalization is shared by the known-check and the comparison", () => {
    expect(normalizeChannelVersion(" 2.3.3 ")).toBe("2.3.3");
    expect(normalizeChannelVersion("2.3.3")).toBe("2.3.3");
    expect(normalizeChannelVersion("   ")).toBe("unknown");
    expect(normalizeChannelVersion(undefined)).toBe("unknown");
    // The defect: a padded self-report was "known" yet unequal to its twin.
    expect(normalizeChannelVersion(" 2.3.3")).toBe(normalizeChannelVersion("2.3.3"));
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

    // P9-T1: this test's title claimed non-admission but only ever asserted the
    // returned codes, so a regression that admitted a refused peer while still
    // replying with the right code would have passed. Prove it behaviourally:
    // neither refused peer may participate in the bound pair's traffic.
    await joinPlugin(plugin, "bound-channel", SERVER_VERSION, "rebind-noop");
    firstMcp.send({
      id: "admission-probe",
      type: "message",
      channel: "bound-channel",
      message: {
        id: "admission-probe",
        command: "page_info",
        params: { commandId: "admission-probe" },
      },
    });

    // The refused PLUGIN must not receive the dispatch...
    await expect(
      secondPlugin.next((m) => m.message?.id === "admission-probe", 400),
    ).rejects.toThrow();
    // ...and the bound plugin must.
    const dispatched = await plugin.next(
      (m) => m.type === "broadcast" && m.message?.id === "admission-probe",
    );
    expect(dispatched.message.command).toBe("page_info");

    // The refused MCP must not receive the bound plugin's reply.
    plugin.send({
      id: "admission-probe",
      type: "message",
      channel: "bound-channel",
      message: { id: "admission-probe", result: { ok: true } },
    });
    await expect(
      secondMcp.next((m) => m.message?.id === "admission-probe", 400),
    ).rejects.toThrow();
    const delivered = await firstMcp.next(
      (m) => m.message?.id === "admission-probe",
    );
    expect(delivered.message.result).toEqual({ ok: true });
  });

  it("P9-D1: refuses a join without clientType and leaves both channel slots unreserved", async () => {
    const rolelessPeer = await openPeer();
    const plugin = await openPeer();
    const mcp = await openPeer();

    rolelessPeer.send({
      id: "join-without-client-type",
      type: "join",
      channel: "role-required",
      pluginVersion: SERVER_VERSION,
    });
    const refusal = await rolelessPeer.next(
      (message) => message.type === "error",
    );
    expect(refusal.message).toContain(
      "clientType must be exactly 'plugin' or 'mcp'",
    );

    // Non-admission is observable, not inferred from the error string: both a
    // legitimate plugin and MCP can still reserve the channel and exchange a
    // command, while the refused connection receives none of that pair's data.
    expect((await joinPlugin(plugin, "role-required")).type).toBe("system");
    expect((await joinMcp(mcp, "role-required")).type).toBe("system");

    mcp.send({
      id: "role-required-probe",
      type: "message",
      channel: "role-required",
      message: {
        id: "role-required-probe",
        command: "page_info",
        params: {},
      },
    });
    const routed = await plugin.next(
      (message) => message.message?.id === "role-required-probe",
    );
    expect(routed.message.command).toBe("page_info");
    await rolelessPeer.expectNo(
      (message) => message.message?.id === "role-required-probe",
    );
  });

  it("P9-F4: expires idle routes by timer and on late-frame arrival without a sweeper command", async () => {
    let clock = 1_000_000;
    interface ManualRouteTimer {
      callback: () => void;
      dueAt: number;
    }
    const routeTimers = new Set<ManualRouteTimer>();
    const routeTimer = {
      set(callback: () => void, delayMs: number): ManualRouteTimer {
        const timer = { callback, dueAt: clock + delayMs };
        routeTimers.add(timer);
        return timer;
      },
      clear(handle: unknown): void {
        routeTimers.delete(handle as ManualRouteTimer);
      },
    };
    const runDueRouteTimers = () => {
      for (;;) {
        const timer = [...routeTimers]
          .filter((candidate) => candidate.dueAt <= clock)
          .sort((left, right) => left.dueAt - right.dueAt)[0];
        if (!timer) return;
        routeTimers.delete(timer);
        timer.callback();
      }
    };

    const idleServer = createFigmaSocketServer({
      logger: { log() {}, error() {} },
      peerIdFactory: () => `idle-peer-${++peerSequence}`,
      now: () => clock,
      routeIdleTimeoutMs: 10_000,
      routeTimer,
    });
    await new Promise<void>((resolve, reject) => {
      idleServer.httpServer.once("error", reject);
      idleServer.httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const { port } = idleServer.httpServer.address() as AddressInfo;
    const url = `ws://127.0.0.1:${port}`;
    const localPeers: WirePeer[] = [];
    const open = async () => {
      const socket = new WebSocket(url);
      const peer = new WirePeer(socket);
      localPeers.push(peer);
      await new Promise<void>((resolve, reject) => {
        socket.once("open", () => resolve());
        socket.once("error", reject);
      });
      await peer.next((m) => typeof m.peerId === "string");
      return peer;
    };

    try {
      const plugin = await open();
      const mcp = await open();
      plugin.send({ id: "p", type: "join", channel: "idle", clientType: "plugin", pluginVersion: SERVER_VERSION });
      await plugin.next((m) => m.message?.result);
      mcp.send({ id: "m", type: "join", channel: "idle", clientType: "mcp", serverVersion: SERVER_VERSION });
      await mcp.next((m) => m.message?.result);

      const dispatch = async (id: string) => {
        mcp.send({
          id, type: "message", channel: "idle",
          message: { id, command: "page_info", params: { commandId: id } },
        });
        await plugin.next((m) => m.type === "broadcast" && m.message?.id === id);
      };

      // Two replies reach the bridge after their logical idle deadline:
      // one progress and one terminal. "idle-only" produces no later traffic
      // at all. "active" keeps reporting progress, so its route must survive
      // the same elapsed time.
      await dispatch("late-progress");
      await dispatch("late-terminal");
      await dispatch("idle-only");
      await dispatch("active");
      expect(routeTimers.size).toBe(4);

      clock += 8_000;
      plugin.send({
        id: "active", type: "progress_update", channel: "idle",
        message: { id: "active", type: "progress_update", data: { progress: 50 } },
      });
      await mcp.next((m) => m.type === "progress_update" && m.id === "active");
      // Refresh cancels/replaces the active route's timer, without growing the
      // timer set or disturbing any inactive neighbour.
      expect(routeTimers.size).toBe(4);

      // Cross the bound for all three inactive routes (16s idle) but not for
      // "active" (8s). Deliberately do not run the injected timer yet: the
      // arrival guard itself must reject both progress and terminal frames
      // after the deadline.
      clock += 8_000;
      plugin.send({
        id: "late-progress", type: "progress_update", channel: "idle",
        message: {
          id: "late-progress",
          type: "progress_update",
          data: { progress: 99 },
        },
      });
      await mcp.expectNo(
        (m) => m.type === "progress_update" && m.id === "late-progress",
      );
      expect(routeTimers.size).toBe(3);

      plugin.send({
        id: "late-terminal", type: "message", channel: "idle",
        message: { id: "late-terminal", result: { late: true } },
      });
      await mcp.expectNo((m) => m.message?.result?.late === true);
      expect(routeTimers.size).toBe(2);

      // Now fire due timers with no subsequent MCP dispatch. The fully idle
      // route is reclaimed in the background; only the refreshed route's
      // future timer remains.
      runDueRouteTimers();
      expect(routeTimers.size).toBe(1);

      plugin.send({
        id: "idle-only", type: "message", channel: "idle",
        message: { id: "idle-only", result: { leaked: true } },
      });
      await mcp.expectNo((m) => m.message?.result?.leaked === true);

      // The refreshed route is untouched and still delivers.
      plugin.send({
        id: "active", type: "message", channel: "idle",
        message: { id: "active", result: { survived: true } },
      });
      const survived = await mcp.next((m) => m.message?.result?.survived === true);
      expect(survived.message.result).toEqual({ survived: true });
      expect(routeTimers.size).toBe(0);

      // Teardown must cancel outstanding expiry work as well.
      await dispatch("pending-at-teardown");
      expect(routeTimers.size).toBe(1);
    } finally {
      await Promise.all(localPeers.map((peer) => peer.close()));
      await idleServer.close();
    }
    expect(routeTimers.size).toBe(0);
  });

  it("P9-F6: normalizes padded versions on real plugin and MCP join frames", async () => {
    const plugin = await openPeer();
    const mcp = await openPeer();

    const pluginAck = await joinPlugin(
      plugin,
      "normalized-versions",
      ` ${SERVER_VERSION}`,
      "join-padded-plugin",
    );
    expect(pluginAck.message.result).toEqual({
      pluginVersion: SERVER_VERSION,
    });

    const mcpAck = await joinMcp(
      mcp,
      "normalized-versions",
      `${SERVER_VERSION} `,
      "join-padded-mcp",
    );
    expect(mcpAck.type).toBe("system");
    expect(mcpAck.message.result).toEqual({
      serverVersion: SERVER_VERSION,
      pluginVersion: SERVER_VERSION,
    });
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
