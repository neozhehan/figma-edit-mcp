import { describe, expect, it } from "bun:test";
import {
    JOIN_ATTEMPT_RELEASED_CHANNEL,
    mergeReleasedChannelDetails,
} from "../../../shared/channelProtocol.js";
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
    it("C6-F5: the shared released-channel merger preserves every JSON details shape", () => {
        expect(mergeReleasedChannelDetails(undefined, "good")).toEqual({
            releasedChannel: "good",
        });
        expect(mergeReleasedChannelDetails({
            scopeRootId: "1:2",
        }, "good")).toEqual({
            scopeRootId: "1:2",
            releasedChannel: "good",
        });
        expect(mergeReleasedChannelDetails({
            scopeRootId: "1:2",
            releasedChannel: "untrusted",
        }, "good")).toEqual({
            originDetails: {
                scopeRootId: "1:2",
                releasedChannel: "untrusted",
            },
            releasedChannel: "good",
        });
        for (const originDetails of [
            null,
            ["array", 7],
            "string",
            42,
            true,
        ]) {
            expect(
                mergeReleasedChannelDetails(originDetails, "good"),
            ).toEqual({
                originDetails,
                releasedChannel: "good",
            });
        }
    });

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
            "No channel is bound to this session",
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
            "No channel is bound to this session",
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
            "No channel is bound to this session",
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
            releasedChannel: "versioned",
        });
        await expect(client.sendCommandToFigma("page_info")).rejects.toThrow(
            "No channel is bound to this session",
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

    it("P9-F2: a failed join names the working channel it had to release", async () => {
        // A connection owns one reservation, so switching channels must leave
        // first. When the new join then fails — the common case being a
        // mistyped channel code — the caller has silently lost a live
        // connection. Both the join error and every later command must say so.
        const client = await importFreshClient("released-channel");
        const { socket } = await establishBinding(client, "good");

        const joinPromise = client.joinChannel("typo");
        const leaveFrame = socket.lastFrame();
        expect(leaveFrame.type).toBe("leave");
        socket.acknowledge(leaveFrame, { left: true, channel: "good" });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const joinFrame = socket.lastFrame();
        expect(joinFrame.type).toBe("join");
        socket.emitFrame({
            type: "join_error",
            id: joinFrame.id,
            code: "PLUGIN_PEER_UNAVAILABLE",
            message: "Operation Denied: Figma Plugin is not running or available.",
            details: { channel: "typo", peerCount: 0 },
        });

        let joinError: any;
        try {
            await joinPromise;
        } catch (error) {
            joinError = error;
        }
        // Q20 is preserved: the originating code and message pass through.
        expect(joinError.code).toBe("PLUGIN_PEER_UNAVAILABLE");
        expect(joinError.message).toContain("Figma Plugin is not running");
        // ...with the released channel added alongside the origin's details.
        expect(joinError.details).toEqual({
            channel: "typo",
            peerCount: 0,
            releasedChannel: "good",
        });

        // Rev 57: the blocked command is a coded CHANNEL_NOT_BOUND carrying the
        // released channel in both its message and its structured details.
        let blocked: any;
        try {
            await client.sendCommandToFigma("page_info");
        } catch (error) {
            blocked = error;
        }
        expect(blocked.code).toBe("CHANNEL_NOT_BOUND");
        expect(blocked.message).toContain("released the previously joined channel 'good'");
        expect(blocked.message).toContain("Call channel_join with 'good'");
        expect(blocked.details).toEqual({ releasedChannel: "good" });
    });

    it("C6-F5: a leg-1 refusal preserves non-record details beside released-channel evidence", async () => {
        const client = await importFreshClient("released-array-details");
        const { socket } = await establishBinding(client, "good");

        const joinPromise = client.joinChannel("next");
        const leaveFrame = socket.lastFrame();
        socket.acknowledge(leaveFrame, { left: true, channel: "good" });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const joinFrame = socket.lastFrame();
        socket.emitFrame({
            type: "join_error",
            id: joinFrame.id,
            code: "PLUGIN_PEER_UNAVAILABLE",
            message: "No plugin is available.",
            details: ["socket-origin", 7],
        });

        let joinError: any;
        try {
            await joinPromise;
        } catch (error) {
            joinError = error;
        }
        expect(joinError.code).toBe("PLUGIN_PEER_UNAVAILABLE");
        expect(joinError.details).toEqual({
            originDetails: ["socket-origin", 7],
            releasedChannel: "good",
        });
        expect(joinError[JOIN_ATTEMPT_RELEASED_CHANNEL]).toBe("good");
    });

    it("P9-F2: a failed same-channel rejoin discloses the healthy binding it released", async () => {
        // Rejoining the channel already held still releases its live socket
        // reservation first. If the replacement join fails, that healthy
        // binding was lost and must be named just like a cross-channel switch.
        const client = await importFreshClient("same-channel-rejoin");
        const { socket } = await establishBinding(client, "same");

        const joinPromise = client.joinChannel("same");
        const leaveFrame = socket.lastFrame();
        socket.acknowledge(leaveFrame, { left: true, channel: "same" });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const joinFrame = socket.lastFrame();
        socket.emitFrame({
            type: "join_error",
            id: joinFrame.id,
            code: "PLUGIN_PEER_UNAVAILABLE",
            message: "Operation Denied: Figma Plugin is not running or available.",
        });

        let joinError: any;
        try {
            await joinPromise;
        } catch (error) {
            joinError = error;
        }
        expect(joinError.code).toBe("PLUGIN_PEER_UNAVAILABLE");
        expect(joinError.details?.releasedChannel).toBe("same");

        let blocked: any;
        try {
            await client.sendCommandToFigma("page_info");
        } catch (error) {
            blocked = error;
        }
        expect(blocked.code).toBe("CHANNEL_NOT_BOUND");
        expect(blocked.message).toContain("released the previously joined channel 'same'");
        expect(blocked.message).toContain("Call channel_join with 'same'");
        expect(blocked.details).toEqual({ releasedChannel: "same" });
    });

    it("P9-F2: leg-2 cleanup preserves a healthy predecessor in fail-closed state", async () => {
        const client = await importFreshClient("leg2-release");
        const { socket } = await establishBinding(client, "good");

        const joinPromise = client.joinChannel("scope-fails");
        const priorLeave = socket.lastFrame();
        socket.acknowledge(priorLeave, { left: true, channel: "good" });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const joinFrame = socket.lastFrame();
        socket.acknowledge(joinFrame, {
            serverVersion: SERVER_VERSION,
            pluginVersion: SERVER_VERSION,
        });
        const joined = await joinPromise;
        expect(joined).toEqual({
            serverVersion: SERVER_VERSION,
            pluginVersion: SERVER_VERSION,
            releasedChannel: "good",
        });

        // This is the exact state transition channel.ts performs after its
        // get_connect_payload leg fails.
        const detachPromise = client.resetChannel({
            releasedChannel: joined.releasedChannel,
        });
        const failedScopeLeave = socket.lastFrame();
        expect(failedScopeLeave.channel).toBe("scope-fails");
        socket.acknowledge(failedScopeLeave, {
            left: true,
            channel: "scope-fails",
        });
        await detachPromise;

        let blocked: any;
        try {
            await client.sendCommandToFigma("page_info");
        } catch (error) {
            blocked = error;
        }
        expect(blocked.code).toBe("CHANNEL_NOT_BOUND");
        expect(blocked.details).toEqual({ releasedChannel: "good" });
    });

    it("C6-T6: the registered callback preserves real leg-1 details without a second merge", async () => {
        const client = await importFreshClient("registered-leg1-release");
        const { socket } = await establishBinding(client, "good");
        const channelTools = await import(
            "../../tools/channel.js?registered-real-client-leg1-change6"
        );
        let registeredJoin: ((args: any) => Promise<any>) | undefined;
        channelTools.registerChannelTools({
            registerTool(
                name: string,
                _options: unknown,
                handler: (args: any) => Promise<any>,
            ) {
                if (name === "channel_join") registeredJoin = handler;
            },
        } as any, {
            joinChannel: client.joinChannel,
            sendCommandToFigma: client.sendCommandToFigma,
            resetChannel: client.resetChannel,
        });
        expect(registeredJoin).toBeDefined();

        const toolPromise = registeredJoin!({ channel: "typo" });
        const priorLeave = socket.lastFrame();
        socket.acknowledge(priorLeave, { left: true, channel: "good" });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const joinFrame = socket.lastFrame();
        socket.emitFrame({
            type: "join_error",
            id: joinFrame.id,
            code: "PLUGIN_PEER_UNAVAILABLE",
            message: "No plugin is available.",
            details: { channel: "typo", peerCount: 0 },
        });

        const toolResult = await toolPromise;
        expect(toolResult.structuredContent).toEqual({
            status: "error",
            channel: "typo",
            errorCode: "PLUGIN_PEER_UNAVAILABLE",
            errorMessage:
                "No plugin is available. This attempt also disconnected the previously joined channel 'good'; call channel_join with 'good' to restore it.",
            errorDetails: {
                channel: "typo",
                peerCount: 0,
                releasedChannel: "good",
            },
        });
    });

    it("C6-T6: the registered callback carries real join metadata through leg-2 cleanup into CHANNEL_NOT_BOUND", async () => {
        const client = await importFreshClient("registered-leg2-release");
        const { socket } = await establishBinding(client, "good");
        const channelTools = await import(
            "../../tools/channel.js?registered-real-client-change6"
        );
        let registeredJoin: ((args: any) => Promise<any>) | undefined;
        channelTools.registerChannelTools({
            registerTool(
                name: string,
                _options: unknown,
                handler: (args: any) => Promise<any>,
            ) {
                if (name === "channel_join") registeredJoin = handler;
            },
        } as any, {
            joinChannel: client.joinChannel,
            sendCommandToFigma: client.sendCommandToFigma,
            resetChannel: client.resetChannel,
        });
        expect(registeredJoin).toBeDefined();

        const toolPromise = registeredJoin!({ channel: "scope-fails" });
        const priorLeave = socket.lastFrame();
        expect(priorLeave).toMatchObject({
            type: "leave",
            channel: "good",
        });
        socket.acknowledge(priorLeave, { left: true, channel: "good" });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const joinFrame = socket.lastFrame();
        expect(joinFrame).toMatchObject({
            type: "join",
            channel: "scope-fails",
        });
        socket.acknowledge(joinFrame, {
            serverVersion: SERVER_VERSION,
            pluginVersion: SERVER_VERSION,
        });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const scopeFrame = socket.lastFrame();
        expect(scopeFrame).toMatchObject({
            type: "message",
            channel: "scope-fails",
            message: {
                command: "get_connect_payload",
            },
        });
        socket.acknowledge(scopeFrame, {
            errorCode: "SCOPE_INVALID",
            errorMessage: "The editable scope became invalid.",
            details: ["plugin-origin", 9],
        });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const cleanupLeave = socket.lastFrame();
        expect(cleanupLeave).toMatchObject({
            type: "leave",
            channel: "scope-fails",
        });
        socket.acknowledge(cleanupLeave, {
            left: true,
            channel: "scope-fails",
        });

        const toolResult = await toolPromise;
        expect(toolResult.structuredContent).toEqual({
            status: "error",
            channel: "scope-fails",
            errorCode: "SCOPE_INVALID",
            errorMessage:
                "The editable scope became invalid. This attempt also disconnected the previously joined channel 'good'; call channel_join with 'good' to restore it.",
            errorDetails: {
                originDetails: ["plugin-origin", 9],
                releasedChannel: "good",
            },
        });

        const sentCount = socket.sent.length;
        let blocked: any;
        try {
            await client.sendCommandToFigma("page_info");
        } catch (error) {
            blocked = error;
        }
        expect(blocked.code).toBe("CHANNEL_NOT_BOUND");
        expect(blocked.details).toEqual({ releasedChannel: "good" });
        expect(socket.sent.length).toBe(sentCount);
    });

    it("P9-F2: an invalidated binding is not reported as released by a later failed join", async () => {
        const client = await importFreshClient("invalidated-no-release");
        const { socket } = await establishBinding(client, "already-gone");

        socket.emitFrame({
            type: "peer_disconnected",
            channel: "already-gone",
            code: "PLUGIN_DISCONNECTED",
            message: "The bound plugin already left.",
        });

        const joinPromise = client.joinChannel("next");
        const staleLeave = socket.lastFrame();
        expect(staleLeave.type).toBe("leave");
        socket.acknowledge(staleLeave, {
            left: true,
            channel: "already-gone",
        });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const joinFrame = socket.lastFrame();
        socket.emitFrame({
            type: "join_error",
            id: joinFrame.id,
            code: "PLUGIN_PEER_UNAVAILABLE",
            message: "No plugin is available.",
        });

        let joinError: any;
        try {
            await joinPromise;
        } catch (error) {
            joinError = error;
        }
        expect(joinError.code).toBe("PLUGIN_PEER_UNAVAILABLE");
        expect(joinError.details?.releasedChannel).toBeUndefined();

        let blocked: any;
        try {
            await client.sendCommandToFigma("page_info");
        } catch (error) {
            blocked = error;
        }
        expect(blocked.code).toBe("CHANNEL_NOT_BOUND");
        expect(blocked.details).toBeUndefined();
    });

    it("P9-F7: a failure to leave the previous channel is not reported as a join timeout", async () => {
        const client = await importFreshClient("leave-phase");
        const { socket } = await establishBinding(client, "held");

        const joinPromise = client.joinChannel("next");
        const leaveFrame = socket.lastFrame();
        expect(leaveFrame.type).toBe("leave");
        // A malformed acknowledgement fails the leave, so the join is never
        // attempted — the old code still reported a join-acknowledgement timeout.
        socket.acknowledge(leaveFrame, { left: false });

        let leaveError: any;
        try {
            await joinPromise;
        } catch (error) {
            leaveError = error;
        }
        expect(leaveError.code).toBe("CHANNEL_JOIN_FAILED");
        expect(leaveError.message).toContain("Could not leave the current channel 'held'");
        expect(leaveError.details).toEqual({
            phase: "leave-previous-channel",
            previousChannel: "held",
            requestedChannel: "next",
        });
        // No join frame was ever emitted after the failed leave.
        expect(socket.lastFrame().type).toBe("leave");
        expect(socket.readyState).toBe(3);

        const sentCount = socket.sent.length;
        let blocked: any;
        try {
            await client.sendCommandToFigma("page_info");
        } catch (error) {
            blocked = error;
        }
        expect(blocked.code).toBe("CHANNEL_NOT_BOUND");
        expect(blocked.details).toBeUndefined();
        expect(socket.sent.length).toBe(sentCount);
    });
});
