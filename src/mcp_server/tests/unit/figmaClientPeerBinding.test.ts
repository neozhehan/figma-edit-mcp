import { describe, expect, it } from "bun:test";
import { SERVER_VERSION } from "../../../shared/version.js";

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    readyState = 1;
    sent: string[] = [];
    private listeners: Record<string, Array<(event: any) => void>> = {};

    constructor(public url: string) {
        FakeWebSocket.instances.push(this);
    }

    addEventListener(type: string, callback: (event: any) => void) {
        (this.listeners[type] ??= []).push(callback);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.readyState = 3;
        this.emit("close", {});
    }

    emit(type: string, event: any) {
        for (const callback of this.listeners[type] ?? []) callback(event);
    }

    emitFrame(frame: unknown) {
        this.emit("message", { data: JSON.stringify(frame) });
    }

    frames() {
        return this.sent.map((item) => JSON.parse(item));
    }

    lastFrame() {
        return this.frames().at(-1);
    }

    acknowledge(frame: any, result: unknown) {
        this.emitFrame({
            type: "system",
            channel: frame.channel,
            message: { id: frame.id, result },
        });
    }
}

function newestSocket() {
    const socket = FakeWebSocket.instances.at(-1);
    expect(socket).toBeDefined();
    return socket!;
}

async function importFreshClient(key: string) {
    (globalThis as any).WebSocket = FakeWebSocket;
    return import(`../../figma-client.js?phase9-binding-${key}`);
}

async function establishBinding(client: any, channel = "phase9", pluginVersion = SERVER_VERSION) {
    client.connectToFigma(9999);
    const socket = newestSocket();
    const joinPromise = client.joinChannel(channel);
    const joinFrame = socket.lastFrame();
    socket.acknowledge(joinFrame, {
        serverVersion: SERVER_VERSION,
        pluginVersion,
    });
    const result = await joinPromise;
    return { socket, result, joinFrame };
}

describe("v2.3.3 Phase 9: figma-client peer-bound lifecycle", () => {
    it("self-reports the authoritative server version, returns the version pair, and performs an acknowledged leave", async () => {
        const client = await importFreshClient("join-leave");
        const { socket, result, joinFrame } = await establishBinding(client);

        expect(joinFrame.type).toBe("join");
        expect(joinFrame.clientType).toBe("mcp");
        expect(joinFrame.serverVersion).toBe(SERVER_VERSION);
        expect(result).toEqual({
            serverVersion: SERVER_VERSION,
            pluginVersion: SERVER_VERSION,
        });

        const commandPromise = client.sendCommandToFigma("page_info");
        const commandFrame = socket.lastFrame();
        expect(commandFrame.type).toBe("message");
        expect(commandFrame.channel).toBe("phase9");
        socket.acknowledge(commandFrame, { pages: [] });
        expect(await commandPromise).toEqual({ pages: [] });

        const resetPromise = client.resetChannel();
        const leaveFrame = socket.lastFrame();
        expect(leaveFrame).toEqual({
            id: expect.any(String),
            type: "leave",
            channel: "phase9",
        });
        socket.acknowledge(leaveFrame, { left: true, channel: "phase9" });
        await resetPromise;

        const sentCount = socket.sent.length;
        await expect(client.sendCommandToFigma("page_info")).rejects.toThrow(
            "Must join a channel",
        );
        expect(socket.sent.length).toBe(sentCount);
    });

    it("invalidates on the bound plugin disconnect, rejects pending work, blocks frames, then allows leave plus matching rejoin", async () => {
        const client = await importFreshClient("disconnect-rejoin");
        const { socket } = await establishBinding(client, "rejoin-me");

        const pendingCommand = client.sendCommandToFigma("page_info");
        const commandFrame = socket.lastFrame();
        socket.emitFrame({
            type: "peer_disconnected",
            channel: "rejoin-me",
            code: "PLUGIN_DISCONNECTED",
            message: "The bound plugin left.",
            details: { pluginPeerId: "plugin-old" },
        });

        let pendingError: any;
        try {
            await pendingCommand;
        } catch (error) {
            pendingError = error;
        }
        expect(pendingError.code).toBe("PLUGIN_DISCONNECTED");
        expect(pendingError.details).toEqual({ pluginPeerId: "plugin-old" });

        // A late response for the invalidated generation is ignored because its
        // pending request was removed during invalidation.
        socket.acknowledge(commandFrame, { pages: ["stale"] });

        const sentCount = socket.sent.length;
        let blockedError: any;
        try {
            await client.sendCommandToFigma("page_info");
        } catch (error) {
            blockedError = error;
        }
        expect(blockedError.code).toBe("PLUGIN_DISCONNECTED");
        expect(socket.sent.length).toBe(sentCount);

        const rejoinPromise = client.joinChannel("rejoin-me");
        const leaveFrame = socket.lastFrame();
        expect(leaveFrame.type).toBe("leave");
        socket.acknowledge(leaveFrame, { left: true, channel: "rejoin-me" });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const rejoinFrame = socket.lastFrame();
        expect(rejoinFrame.type).toBe("join");
        expect(rejoinFrame.id).not.toBe(leaveFrame.id);
        socket.acknowledge(rejoinFrame, {
            serverVersion: SERVER_VERSION,
            pluginVersion: SERVER_VERSION,
        });
        await expect(rejoinPromise).resolves.toEqual({
            serverVersion: SERVER_VERSION,
            pluginVersion: SERVER_VERSION,
        });

        const recoveredCommand = client.sendCommandToFigma("page_info");
        const recoveredFrame = socket.lastFrame();
        socket.acknowledge(recoveredFrame, { pages: ["fresh"] });
        await expect(recoveredCommand).resolves.toEqual({ pages: ["fresh"] });
    });

    it("leaves after a malformed success acknowledgement so no socket reservation is stranded", async () => {
        const client = await importFreshClient("malformed-ack");
        client.connectToFigma(9997);
        const socket = newestSocket();

        const joinPromise = client.joinChannel("malformed");
        const joinFrame = socket.lastFrame();
        socket.acknowledge(joinFrame, { serverVersion: SERVER_VERSION });
        await Promise.resolve();

        const leaveFrame = socket.lastFrame();
        expect(leaveFrame.type).toBe("leave");
        expect(leaveFrame.channel).toBe("malformed");
        socket.acknowledge(leaveFrame, { left: true, channel: "malformed" });

        let caught: any;
        try {
            await joinPromise;
        } catch (error) {
            caught = error;
        }
        expect(caught.code).toBe("CHANNEL_JOIN_FAILED");
        expect(caught.message).toContain("omitted serverVersion or pluginVersion");

        const frameCount = socket.sent.length;
        await expect(client.sendCommandToFigma("page_info")).rejects.toThrow(
            "Must join a channel",
        );
        expect(socket.sent.length).toBe(frameCount);
    });

    it("does not treat a malformed leave response as an acknowledged reset", async () => {
        const client = await importFreshClient("malformed-leave");
        const { socket } = await establishBinding(client, "leave-check");

        const resetPromise = client.resetChannel();
        const leaveFrame = socket.lastFrame();
        socket.acknowledge(leaveFrame, { left: false, channel: "leave-check" });

        await expect(resetPromise).rejects.toThrow(
            "Channel leave acknowledgement was malformed",
        );
        expect(socket.readyState).toBe(3);

        const sentCount = socket.sent.length;
        await expect(client.sendCommandToFigma("page_info")).rejects.toThrow(
            "Must join a channel",
        );
        expect(socket.sent.length).toBe(sentCount);
    });

    it("detaches the previous binding before a mismatched join and permits a later matching join", async () => {
        const client = await importFreshClient("mismatch-detach");
        const { socket } = await establishBinding(client, "versioned");

        const mismatchPromise = client.joinChannel("versioned");
        const leaveFrame = socket.lastFrame();
        expect(leaveFrame.type).toBe("leave");
        socket.acknowledge(leaveFrame, { left: true, channel: "versioned" });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const mismatchJoin = socket.lastFrame();
        expect(mismatchJoin.type).toBe("join");
        socket.emitFrame({
            type: "join_error",
            id: mismatchJoin.id,
            code: "VERSION_MISMATCH",
            message: "MCP and plugin versions differ.",
            details: {
                serverVersion: SERVER_VERSION,
                pluginVersion: "0.0.0",
            },
        });

        let mismatchError: any;
        try {
            await mismatchPromise;
        } catch (error) {
            mismatchError = error;
        }
        expect(mismatchError.code).toBe("VERSION_MISMATCH");
        expect(mismatchError.details).toEqual({
            serverVersion: SERVER_VERSION,
            pluginVersion: "0.0.0",
        });
        await expect(client.sendCommandToFigma("page_info")).rejects.toThrow(
            "Must join a channel",
        );

        const matchingPromise = client.joinChannel("versioned");
        const matchingJoin = socket.lastFrame();
        expect(matchingJoin.type).toBe("join");
        socket.acknowledge(matchingJoin, {
            serverVersion: SERVER_VERSION,
            pluginVersion: SERVER_VERSION,
        });
        await expect(matchingPromise).resolves.toEqual({
            serverVersion: SERVER_VERSION,
            pluginVersion: SERVER_VERSION,
        });
    });
});
