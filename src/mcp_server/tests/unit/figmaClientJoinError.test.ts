import { describe, it, expect } from "bun:test";

/**
 * P4-4 follow-up (2026-07-23): the `join_error` WebSocket handler used to
 * construct `new FigmaError({code: json.code, message: json.message})` — a
 * hand-picked object literal that silently dropped `json.details`, even
 * though `FigmaError` fully supports it and the ordinary command-response
 * path (`new FigmaError(myResponse.error)`) already passes the whole object
 * through. The Q20 unit tests gave false confidence here: they constructed a
 * synthetic coded error directly and fed it into `channel.ts`'s `joinFailure`
 * helper, never exercising the REAL `connectToFigma` message listener that is
 * supposed to produce that error in the first place.
 *
 * This file closes that gap: a fake WebSocket drives the real, unmocked
 * `figma-client.ts` module end to end — real `connectToFigma`, real
 * `joinChannel`, real `sendCommandToFigma` request/response correlation —
 * and asserts `.details` survives from the wire message to the rejected
 * promise.
 */

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    readyState = 1; // WS_OPEN in every implementation
    private listeners: Record<string, Array<(event: any) => void>> = {};
    sent: string[] = [];

    constructor(public url: string) {
        FakeWebSocket.instances.push(this);
    }

    addEventListener(type: string, cb: (event: any) => void) {
        (this.listeners[type] ??= []).push(cb);
    }

    send(data: string) {
        this.sent.push(data);
    }

    emit(type: string, event: any) {
        for (const cb of this.listeners[type] ?? []) cb(event);
    }

    lastSentId(): string {
        const last = JSON.parse(this.sent[this.sent.length - 1]);
        return last.id;
    }
}

describe("figma-client join_error transport (P4-4 follow-up): details survive end to end", () => {
    it("a join_error with a details field rejects joinChannel() with that details object intact", async () => {
        (globalThis as any).WebSocket = FakeWebSocket;
        const { connectToFigma, joinChannel } = await import("../../figma-client.js?p44-join-error-details");

        connectToFigma(9999);
        const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

        const joinPromise = joinChannel("test-channel");
        const requestId = ws.lastSentId();

        ws.emit("message", {
            data: JSON.stringify({
                type: "join_error",
                id: requestId,
                code: "PLUGIN_PEER_AMBIGUOUS",
                message: "Operation Denied: multiple plugin peers are connected.",
                details: { peerCount: 2, channel: "test-channel" },
            }),
        });

        let caught: any;
        try {
            await joinPromise;
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeDefined();
        expect(caught.code).toBe("PLUGIN_PEER_AMBIGUOUS");
        expect(caught.details).toEqual({ peerCount: 2, channel: "test-channel" });
    });

    it("a join_error with no details field rejects cleanly (details stays undefined, not dropped-then-fabricated)", async () => {
        (globalThis as any).WebSocket = FakeWebSocket;
        const { connectToFigma, joinChannel } = await import("../../figma-client.js?p44-join-error-no-details");

        connectToFigma(9998);
        const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

        const joinPromise = joinChannel("test-channel-2");
        const requestId = ws.lastSentId();

        ws.emit("message", {
            data: JSON.stringify({
                type: "join_error",
                id: requestId,
                code: "CHANNEL_NOT_FOUND",
                message: "Channel 'test-channel-2' was not found.",
            }),
        });

        let caught: any;
        try {
            await joinPromise;
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeDefined();
        expect(caught.code).toBe("CHANNEL_NOT_FOUND");
        expect(caught.details).toBeUndefined();
    });
});
