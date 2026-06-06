import { describe, it, expect, beforeEach, mock } from "bun:test";

// Phase 4 §3a/§3b: Behavioral + snapshot tests for getConnectPayload.
//
// DESIGN NOTE: Direct handler invocation of getConnectPayload requires importing
// connectHandlers.js, which chains to main.js. main.js has side effects
// (figma.ui.onmessage binding) that conflict with componentHandlers.test.ts's
// Security Gates tests when run in the same bun process. The Phase 2 getPagesInfo
// tests avoid this by importing nodeReaders.js (which does NOT chain to main.js).
//
// Therefore, this file uses TWO complementary strategies:
// A) Direct handler invocation via nodeReaders.js-style figma sandbox mocking
//    (for getPagesInfo handler tests that DO NOT require main.js).
// B) Integration tests through the join_channel MCP tool layer, which exercises
//    getConnectPayload's response shapes end-to-end via mocked sendCommandToFigma.
//
// The three connect-payload shapes are validated as snapshots via strategy (B).
// The loadAllPagesAsync regression is validated via strategy (A) + static analysis.

// ============================================================
// §3a: Static Analysis — getConnectPayload Handler Branch Verification
// (Complementary to connectFlow.phase3.test.ts static checks)
// ============================================================

describe("Phase 4 §3a (static): getConnectPayload handler never calls loadAllPagesAsync", () => {
    it("connectHandlers.ts source does not reference loadAllPagesAsync", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "figma_plugin/handlers/connectHandlers.ts",
            "utf8",
        );
        expect(src).not.toMatch(/loadAllPagesAsync/);
    });
});

describe("Phase 4 §3a (static): getConnectPayload returns structured errors, never throws", () => {
    let src: string;
    beforeEach(async () => {
        const fs = await import("node:fs/promises");
        src = await fs.readFile(
            "figma_plugin/handlers/connectHandlers.ts",
            "utf8",
        );
    });

    it("all error code branches use return, not throw", () => {
        const errorCodes = ["SCOPE_DELETED", "SCOPE_INVALID", "DOCUMENT_LOAD_FAILED", "UNKNOWN_ERROR"];
        for (const code of errorCodes) {
            const pattern = new RegExp(`errorCode:\\s*["']${code}["']`);
            expect(src).toMatch(pattern);
        }
        // No throw statements with error codes
        expect(src).not.toMatch(/throw\s+new\s+Error\([^)]*SCOPE_DELETED/);
        expect(src).not.toMatch(/throw\s+new\s+Error\([^)]*SCOPE_INVALID/);
        expect(src).not.toMatch(/throw\s+new\s+Error\([^)]*DOCUMENT_LOAD_FAILED/);
    });

    it("readonly branch does not call loadAsync", () => {
        const readonlySection = src.split("state.readOnly === true")[1] ?? "";
        const beforePageScope = readonlySection.split("if (state.scopeRootId)")[0];
        expect(beforePageScope).not.toMatch(/\.loadAsync\(/);
    });

    it("page-scope branch calls loadAsync on the resolved PAGE node", () => {
        expect(src).toMatch(/await\s+scopeNode\.loadAsync\(\)/);
    });

    it("node-scope branch includes path array and descendantCount", () => {
        expect(src).toMatch(/path:\s*buildPathArray\(/);
        expect(src).toMatch(/descendantCount:\s*countDescendants\(/);
    });
});

// ============================================================
// §3b: Snapshot Tests for the Three Connect-Payload Shapes
// Exercised via the join_channel MCP tool integration layer.
// ============================================================

describe("Phase 4 §3b: Snapshot — readonly scope (via join_channel integration)", () => {
    let registeredTools: Record<string, Function>;
    let sendCommandToFigma: any;
    let resetChannel: any;

    beforeEach(async () => {
        mock.module("../../../figma-client.js", () => ({
            sendCommandToFigma: mock(() => Promise.resolve({})),
            joinChannel: mock(() => Promise.resolve()),
            resetChannel: mock(() => {}),
        }));
        const clientMod = await import("../../../figma-client.js");
        sendCommandToFigma = clientMod.sendCommandToFigma;
        resetChannel = clientMod.resetChannel;

        const channelMod = await import("../../../tools/channel.js");
        registeredTools = {};
        const mockServer: any = {
            registerTool: mock((name: string, options: any, handler: Function) => {
                const wrapper = async (args: any) => {
                    const res = await handler(args);
                    if (res && res.structuredContent) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(res.structuredContent)
                                }
                            ]
                        };
                    }
                    return res;
                };
                registeredTools[name] = wrapper;
                if (name === "channel.join") {
                    registeredTools["join_channel"] = wrapper;
                }
            }),
            tool: mock((name: string, _desc: any, _schema: any, handler: Function) => {
                registeredTools[name] = handler;
            }),
            prompt: mock(() => {}),
        };
        channelMod.registerChannelTools(mockServer);
    });

    it("readonly payload: exact shape", async () => {
        const payload = {
            editableScopeType: "readonly",
            documentId: "0:0",
            documentName: "Snapshot Doc",
            pageCount: 3,
            pages: [
                { pageId: "sp1", pageName: "Cover" },
                { pageId: "sp2", pageName: "Flow" },
                { pageId: "sp3", pageName: "Specs" },
            ],
        };
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload" ? Promise.resolve(payload) : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("success");
        expect(parsed.channel).toBe("ch1");
        expect(parsed.editableScopeType).toBe("readonly");
        expect(parsed.documentId).toBe("0:0");
        expect(parsed.documentName).toBe("Snapshot Doc");
        expect(parsed.pageCount).toBe(3);
        expect(parsed.pages).toEqual(payload.pages);
        // readonly pages must NOT have children
        for (const p of parsed.pages) {
            expect(p.children).toBeUndefined();
        }
        // Must not have node block
        expect(parsed.node).toBeUndefined();
        expect((resetChannel as any).mock.calls.length).toBe(0);
    });

    it("page-scope payload: exact shape with children", async () => {
        const payload = {
            editableScopeType: "page",
            documentId: "0:0",
            documentName: "Snapshot Doc",
            pageCount: 3,
            pages: [
                {
                    pageId: "sp2",
                    pageName: "Flow",
                    children: [
                        { id: "ch1", name: "Hero", type: "FRAME" },
                        { id: "ch2", name: "Logo", type: "COMPONENT" },
                    ],
                },
            ],
        };
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload" ? Promise.resolve(payload) : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch2" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("success");
        expect(parsed.channel).toBe("ch2");
        expect(parsed.editableScopeType).toBe("page");
        expect(parsed.pages).toHaveLength(1);
        expect(parsed.pages[0].pageId).toBe("sp2");
        expect(parsed.pages[0].children).toEqual([
            { id: "ch1", name: "Hero", type: "FRAME" },
            { id: "ch2", name: "Logo", type: "COMPONENT" },
        ]);
        // Must not have node block
        expect(parsed.node).toBeUndefined();
        expect((resetChannel as any).mock.calls.length).toBe(0);
    });

    it("node-scope payload: exact shape with node block and no pages", async () => {
        const payload = {
            editableScopeType: "node",
            documentId: "0:0",
            documentName: "Snapshot Doc",
            node: {
                nodeId: "n1",
                nodeName: "Target",
                type: "FRAME",
                path: [
                    ["PAGE", "sp2", "Flow"],
                    ["FRAME", "wrapper", "Wrapper"]
                ],
                descendantCount: 1,
                children: [
                    { id: "n1-c1", name: "Child X", type: "RECTANGLE" },
                ],
            },
        };
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload" ? Promise.resolve(payload) : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch3" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("success");
        expect(parsed.channel).toBe("ch3");
        expect(parsed.editableScopeType).toBe("node");
        expect(parsed.node).toEqual(payload.node);
        // Must not have pages array
        expect(parsed.pages).toBeUndefined();
        expect(parsed.node.path[0]).toEqual(["PAGE", "sp2", "Flow"]);
        expect(parsed.node.path[1]).toEqual(["FRAME", "wrapper", "Wrapper"]);
        expect(parsed.node.descendantCount).toBe(1);
        expect(parsed.node.children).toHaveLength(1);
        expect((resetChannel as any).mock.calls.length).toBe(0);
    });
});

// ============================================================
// §3a: Error envelope tests — getConnectPayload error paths
// ============================================================

describe("Phase 4 §3a: getConnectPayload error envelopes (via join_channel integration)", () => {
    let registeredTools: Record<string, Function>;
    let sendCommandToFigma: any;
    let resetChannel: any;

    beforeEach(async () => {
        mock.module("../../../figma-client.js", () => ({
            sendCommandToFigma: mock(() => Promise.resolve({})),
            joinChannel: mock(() => Promise.resolve()),
            resetChannel: mock(() => {}),
        }));
        const clientMod = await import("../../../figma-client.js");
        sendCommandToFigma = clientMod.sendCommandToFigma;
        resetChannel = clientMod.resetChannel;

        const channelMod = await import("../../../tools/channel.js");
        registeredTools = {};
        const mockServer: any = {
            registerTool: mock((name: string, options: any, handler: Function) => {
                const wrapper = async (args: any) => {
                    const res = await handler(args);
                    if (res && res.structuredContent) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(res.structuredContent)
                                }
                            ]
                        };
                    }
                    return res;
                };
                registeredTools[name] = wrapper;
                if (name === "channel.join") {
                    registeredTools["join_channel"] = wrapper;
                }
            }),
            tool: mock((name: string, _desc: any, _schema: any, handler: Function) => {
                registeredTools[name] = handler;
            }),
            prompt: mock(() => {}),
        };
        channelMod.registerChannelTools(mockServer);
    });

    it("SCOPE_DELETED: structured error, resetChannel called, no payload fields", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({ errorCode: "SCOPE_DELETED", errorMessage: "scope gone" })
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("SCOPE_DELETED");
        expect(parsed.errorMessage).toBe("scope gone");
        expect(parsed.channel).toBe("ch1");
        expect(parsed.editableScopeType).toBeUndefined();
        expect(parsed.pages).toBeUndefined();
        expect(parsed.node).toBeUndefined();
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("SCOPE_INVALID: structured error + resetChannel", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({ errorCode: "SCOPE_INVALID", errorMessage: "bad state" })
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("SCOPE_INVALID");
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("DOCUMENT_LOAD_FAILED: structured error + resetChannel", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({ errorCode: "DOCUMENT_LOAD_FAILED", errorMessage: "load fail" })
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("DOCUMENT_LOAD_FAILED");
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("UNKNOWN_ERROR from transport: message appended + resetChannel", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.reject(new Error("Request timed out after 30000ms"))
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("UNKNOWN_ERROR");
        expect(parsed.errorMessage).toMatch(/timed out/);
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("PLUGIN_DISCONNECTED from transport: Connection closed", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.reject(new Error("Connection closed"))
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("PLUGIN_DISCONNECTED");
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });
});

// ============================================================
// §3b: Fail-closed tests (Q6 invariants)
// ============================================================

describe("Phase 4 §3b: Fail-closed — no partial success and channel recovery", () => {
    let registeredTools: Record<string, Function>;
    let sendCommandToFigma: any;
    let joinChannel: any;
    let resetChannel: any;

    beforeEach(async () => {
        mock.module("../../../figma-client.js", () => ({
            sendCommandToFigma: mock(() => Promise.resolve({})),
            joinChannel: mock(() => Promise.resolve()),
            resetChannel: mock(() => {}),
        }));
        const clientMod = await import("../../../figma-client.js");
        sendCommandToFigma = clientMod.sendCommandToFigma;
        joinChannel = clientMod.joinChannel;
        resetChannel = clientMod.resetChannel;

        const channelMod = await import("../../../tools/channel.js");
        registeredTools = {};
        const mockServer: any = {
            registerTool: mock((name: string, options: any, handler: Function) => {
                const wrapper = async (args: any) => {
                    const res = await handler(args);
                    if (res && res.structuredContent) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(res.structuredContent)
                                }
                            ]
                        };
                    }
                    return res;
                };
                registeredTools[name] = wrapper;
                if (name === "channel.join") {
                    registeredTools["join_channel"] = wrapper;
                }
            }),
            tool: mock(
                (name: string, _desc: any, _schema: any, handler: Function) => {
                    registeredTools[name] = handler;
                },
            ),
            prompt: mock(() => {}),
        };
        channelMod.registerChannelTools(mockServer);
    });

    it("no partial-success: all failure variants lack payload fields", async () => {
        const failureSetups: Array<() => void> = [
            () => (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                cmd === "get_connect_payload"
                    ? Promise.resolve({ errorCode: "SCOPE_INVALID", errorMessage: "bad" })
                    : Promise.resolve({})),
            () => (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                cmd === "get_connect_payload"
                    ? Promise.reject(new Error("Connection closed"))
                    : Promise.resolve({})),
            () => (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                cmd === "get_connect_payload"
                    ? Promise.resolve({ errorCode: "SCOPE_DELETED", errorMessage: "gone" })
                    : Promise.resolve({})),
            () => (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                cmd === "get_connect_payload"
                    ? Promise.resolve({ errorCode: "DOCUMENT_LOAD_FAILED", errorMessage: "fail" })
                    : Promise.resolve({})),
        ];
        for (const setup of failureSetups) {
            setup();
            const r = await registeredTools["join_channel"]({ channel: "x" });
            const parsed = JSON.parse(r.content[0].text);
            expect(parsed.status).toBe("error");
            expect(parsed.editableScopeType).toBeUndefined();
            expect(parsed.pages).toBeUndefined();
            expect(parsed.node).toBeUndefined();
        }
    });

    it("recovery: after leg-2 failure, re-joining with valid scope returns success", async () => {
        // First call: SCOPE_DELETED
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({ errorCode: "SCOPE_DELETED", errorMessage: "gone" })
                : Promise.resolve({}),
        );
        const r1 = await registeredTools["join_channel"]({ channel: "ch1" });
        expect(JSON.parse(r1.content[0].text).status).toBe("error");
        expect((resetChannel as any).mock.calls.length).toBe(1);

        // Second call: success
        const successPayload = {
            editableScopeType: "page",
            documentId: "0:0",
            documentName: "Doc",
            pageCount: 1,
            pages: [{ pageId: "p1", pageName: "P1", children: [] }],
        };
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve(successPayload)
                : Promise.resolve({}),
        );
        const r2 = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r2.content[0].text);
        expect(parsed.status).toBe("success");
        expect(parsed.editableScopeType).toBe("page");
        expect(parsed.channel).toBe("ch1");
        expect((joinChannel as any).mock.calls.length).toBe(2);
    });

    it("leg-1 CHANNEL_NOT_FOUND: no leg-2 call, no resetChannel needed", async () => {
        const tagged = Object.assign(new Error("not found"), {
            joinErrorCode: "CHANNEL_NOT_FOUND",
        });
        (joinChannel as any).mockRejectedValue(tagged);

        const r = await registeredTools["join_channel"]({ channel: "missing" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("CHANNEL_NOT_FOUND");
        expect(parsed.channel).toBe("missing");
        // No leg-2 call should have been made
        const leg2Calls = (sendCommandToFigma as any).mock.calls.filter(
            (c: any[]) => c[0] === "get_connect_payload",
        );
        expect(leg2Calls.length).toBe(0);
    });
});
