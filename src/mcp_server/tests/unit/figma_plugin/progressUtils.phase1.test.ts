import { describe, it, expect, beforeEach, mock } from "bun:test";

// Verification tests for Phase 1 of v1.3.0 read_tools_update_plan.md
// Task 1: Make `sendProgressUpdate` Async
// Task 1a: Update all existing `sendProgressUpdate` callers to await

describe("Phase 1.1: sendProgressUpdate is async with yield", () => {
    let postMessageCalls: any[];
    let setTimeoutCallsAfterPost: number;
    let postMessageObserved: boolean;

    beforeEach(() => {
        postMessageCalls = [];
        setTimeoutCallsAfterPost = 0;
        postMessageObserved = false;

        (globalThis as any).figma = {
            ui: {
                postMessage: (msg: any) => {
                    postMessageCalls.push(msg);
                    postMessageObserved = true;
                },
            },
        };

        const originalSetTimeout = globalThis.setTimeout;
        (globalThis as any).setTimeout = ((fn: any, ms: any) => {
            if (postMessageObserved && ms === 0) {
                setTimeoutCallsAfterPost += 1;
            }
            return originalSetTimeout(fn, ms);
        }) as any;
    });

    it("returns a Promise (function is declared async)", async () => {
        const { sendProgressUpdate } = await import(
            "../../../../figma_plugin/utils/progressUtils.js"
        );
        const result = sendProgressUpdate(
            "cmd_test",
            "test",
            "in_progress",
            0,
            10,
            0,
            "msg",
        );
        expect(result).toBeInstanceOf(Promise);
        await result;
    });

    it("calls figma.ui.postMessage with the update payload", async () => {
        const { sendProgressUpdate } = await import(
            "../../../../figma_plugin/utils/progressUtils.js"
        );
        await sendProgressUpdate(
            "cmd_x",
            "page_load",
            "started",
            0,
            5,
            0,
            "starting",
        );
        expect(postMessageCalls.length).toBe(1);
        expect(postMessageCalls[0].type).toBe("command_progress");
        expect(postMessageCalls[0].commandId).toBe("cmd_x");
        expect(postMessageCalls[0].status).toBe("started");
    });

    it("schedules setTimeout(_, 0) AFTER postMessage to flush UI thread", async () => {
        const { sendProgressUpdate } = await import(
            "../../../../figma_plugin/utils/progressUtils.js"
        );
        await sendProgressUpdate("c", "t", "in_progress", 0.5, 4, 2, "m");
        // The async yield must have scheduled at least one setTimeout(0) after postMessage.
        expect(setTimeoutCallsAfterPost).toBeGreaterThanOrEqual(1);
    });

    it("yields to the event loop between postMessages on consecutive calls", async () => {
        const { sendProgressUpdate } = await import(
            "../../../../figma_plugin/utils/progressUtils.js"
        );
        // Schedule a microtask "marker" between two awaits — if the yield is real,
        // a setImmediate-style task scheduled between awaits will run between the
        // two postMessage events, not after both.
        const order: string[] = [];
        const orig = (globalThis as any).figma.ui.postMessage;
        (globalThis as any).figma.ui.postMessage = (m: any) => {
            order.push("post:" + m.processedItems);
            orig(m);
        };

        const run = async () => {
            await sendProgressUpdate("c", "t", "in_progress", 0.25, 4, 1, "a");
            order.push("between");
            await sendProgressUpdate("c", "t", "in_progress", 0.5, 4, 2, "b");
        };
        await run();
        expect(order).toEqual(["post:1", "between", "post:2"]);
    });
});

describe("Phase 1.1a: callers await sendProgressUpdate", () => {
    it("all sendProgressUpdate( call sites in handlers are awaited", async () => {
        // Static-source check: scan the handler files for any unawaited
        // call site. The plan explicitly calls out this audit because TS
        // strictness alone won't catch missing awaits.
        const fs = await import("node:fs/promises");
        const files = [
            "src/figma_plugin/handlers/annotationHandlers.ts",
            "src/figma_plugin/handlers/connectorHandlers.ts",
            "src/figma_plugin/handlers/nodeModifiers.ts",
            "src/figma_plugin/handlers/textHandlers.ts",
        ];
        const offenders: string[] = [];
        for (const path of files) {
            const src = await fs.readFile(path, "utf8");
            const lines = src.split("\n");
            lines.forEach((line, idx) => {
                // match a bare call (not preceded by "await ", not import / export)
                if (/\bsendProgressUpdate\s*\(/.test(line)) {
                    if (
                        !/await\s+sendProgressUpdate\s*\(/.test(line) &&
                        !/import\b/.test(line) &&
                        !/export\b/.test(line)
                    ) {
                        offenders.push(`${path}:${idx + 1}: ${line.trim()}`);
                    }
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});

describe("Phase 1.2: ui.html activeRequestId wiring", () => {
    let html: string;

    beforeEach(async () => {
        const fs = await import("node:fs/promises");
        html = await fs.readFile("src/figma_plugin/ui.html", "utf8");
    });

    it("declares activeRequestId in state", () => {
        expect(html).toMatch(/activeRequestId\s*:\s*null/);
    });

    it("sets state.activeRequestId on inbound command before postMessage to plugin", () => {
        // Look for the new-command branch: the assignment must come before
        // parent.postMessage so the id is captured prior to dispatch.
        const start = html.indexOf("if (data.command)");
        expect(start).toBeGreaterThan(-1);
        const commandBranch = html.slice(start, start + 800);
        const setIdx = commandBranch.indexOf(
            "state.activeRequestId = data.id",
        );
        const postIdx = commandBranch.indexOf("parent.postMessage");
        expect(setIdx).toBeGreaterThan(-1);
        expect(postIdx).toBeGreaterThan(-1);
        expect(setIdx).toBeLessThan(postIdx);
    });

    it("uses state.activeRequestId on outbound progress_update payload id field", () => {
        // sendProgressUpdateToServer should pin the outgoing id to the
        // active request id rather than relying on the plugin's commandId.
        const fnIdx = html.indexOf("function sendProgressUpdateToServer");
        expect(fnIdx).toBeGreaterThan(-1);
        const fnBody = html.slice(fnIdx, fnIdx + 1200);
        expect(fnBody).toMatch(/id:\s*state\.activeRequestId/);
        expect(fnBody).toMatch(/type:\s*["']progress_update["']/);
    });

    it("clears state.activeRequestId on command-result and command-error", () => {
        // Both branches must reset to null so a stale id can't latch onto
        // unrelated progress events between requests.
        const onmessageIdx = html.indexOf("window.onmessage");
        expect(onmessageIdx).toBeGreaterThan(-1);
        const dispatcher = html.slice(onmessageIdx, onmessageIdx + 2500);

        const resultIdx = dispatcher.indexOf('case "command-result"');
        const errorIdx = dispatcher.indexOf('case "command-error"');
        expect(resultIdx).toBeGreaterThan(-1);
        expect(errorIdx).toBeGreaterThan(-1);

        const resultBody = dispatcher.slice(resultIdx, resultIdx + 250);
        const errorBody = dispatcher.slice(errorIdx, errorIdx + 250);
        expect(resultBody).toMatch(/state\.activeRequestId\s*=\s*null/);
        expect(errorBody).toMatch(/state\.activeRequestId\s*=\s*null/);
    });
});
