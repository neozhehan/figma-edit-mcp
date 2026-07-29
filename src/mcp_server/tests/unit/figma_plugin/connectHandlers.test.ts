import { describe, it, expect, beforeEach, mock } from "bun:test";
import { JOIN_ATTEMPT_RELEASED_CHANNEL } from "../../../../shared/channelProtocol.js";
import { SERVER_VERSION } from "../../../../shared/version.js";

const PHASE9_JOIN_VERSIONS = {
    serverVersion: SERVER_VERSION,
    pluginVersion: SERVER_VERSION,
};

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
        // Legacy connect-payload codes are quoted literals in this handler.
        for (const code of ["SCOPE_DELETED", "SCOPE_INVALID"]) {
            expect(src).toMatch(new RegExp(`errorCode:\\s*["']${code}["']`));
        }
        // Change 8 (F3): the scope-page load branch no longer mints its own
        // `DOCUMENT_LOAD_FAILED` — a code that was never in the D9 inventory and
        // so could never earn a playbook entry. It goes through the bounded
        // Phase 10 coordinator and forwards whichever ratified code it raised.
        expect(src, "the scope page load must use the bounded coordinator").toMatch(/pageLoads\.load\(/);
        // Change 10 (C10-T1): the code is forwarded through the shared projector
        // rather than an inline literal — asserted behaviourally by the seam
        // tests below, and structurally by the delegation check further down.
        expect(src, "DOCUMENT_LOAD_FAILED is retired").not.toMatch(/["']DOCUMENT_LOAD_FAILED["']/);
        // UNKNOWN_ERROR must be the imported CONSTANT, not a re-hardcoded
        // literal (P4-5 dedup, 2026-07-24): require the identifier form and
        // reject a quoted literal, so the fix cannot silently regress.
        expect(src, "connectHandlers must use the imported UNKNOWN_ERROR constant").toMatch(/errorCode:\s*UNKNOWN_ERROR\b/);
        expect(src, "connectHandlers must not re-hardcode a quoted \"UNKNOWN_ERROR\"").not.toMatch(/errorCode:\s*["']UNKNOWN_ERROR["']/);
        // No throw statements with error codes
        expect(src).not.toMatch(/throw\s+new\s+Error\([^)]*SCOPE_DELETED/);
        expect(src).not.toMatch(/throw\s+new\s+Error\([^)]*SCOPE_INVALID/);
    });

    it("readonly branch does not call loadAsync", () => {
        const readonlySection = src.split("!state.allowEditNode")[1] ?? "";
        const beforePageScope = readonlySection.split("if (state.scopeRootId)")[0];
        expect(beforePageScope).not.toMatch(/\.loadAsync\(/);
    });

    it("page-scope branch loads the resolved PAGE node through the bounded coordinator", () => {
        // Change 8 (F3): the load is no longer a bare `scopeNode.loadAsync()`.
        // It goes through the Phase 10 coordinator so it inherits the Q12
        // per-page timeout — this sits on channel_join's second leg, where an
        // unbounded load wedged the join itself.
        expect(src).toMatch(/await\s+pageLoads\.load\(scopeNode\s+as\s+PageNode\)/);
        expect(src, "no unbounded direct loadAsync may remain").not.toMatch(/scopeNode\s*(as\s+PageNode\s*)?\)?\.loadAsync\(\)/);
        // Change 10 (C10-T1): the failure shape comes from the shared projector
        // rather than a hand-built literal, so the key that C9-F1 got wrong is
        // decided in exactly one place. This asserts the handler DELEGATES; the
        // behavioural seam test below proves the resulting shape survives the
        // plugin -> channel_join boundary. The previous assertion pinned the
        // literal spelling `details: loaded.error.details`, which a routine
        // refactor could satisfy or break without changing behaviour either way.
        expect(src).toMatch(/return\s+toConnectPayloadError\(loaded\.error\)/);
        expect(src, "the connect-payload error shape must not be rebuilt inline").not.toMatch(/errorCode:\s*loaded\.error\.code/);
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
            joinChannel: mock(() => Promise.resolve(PHASE9_JOIN_VERSIONS)),
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
                if (name === "channel_join") {
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
            // The plugin payload is not authoritative for transport-owned
            // identity. These values exercise the merge order explicitly.
            status: "error",
            channel: "spoofed-channel",
            serverVersion: "spoofed-server",
            pluginVersion: "spoofed-plugin",
            editableScopeType: "readonly",
            allowEditNode: false,
            allowEditVariable: false,
            allowEditStyle: false,
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
        expect(parsed.serverVersion).toBe(SERVER_VERSION);
        expect(parsed.pluginVersion).toBe(SERVER_VERSION);
        expect(parsed.editableScopeType).toBe("readonly");
        expect(parsed.allowEditNode).toBe(false);
        expect(parsed.allowEditVariable).toBe(false);
        expect(parsed.allowEditStyle).toBe(false);
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
            allowEditNode: "page",
            allowEditVariable: false,
            allowEditStyle: true,
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
        expect(parsed.serverVersion).toBe(SERVER_VERSION);
        expect(parsed.pluginVersion).toBe(SERVER_VERSION);
        expect(parsed.editableScopeType).toBe("page");
        expect(parsed.allowEditNode).toBe("page");
        expect(parsed.allowEditVariable).toBe(false);
        expect(parsed.allowEditStyle).toBe(true);
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
            allowEditNode: "node",
            allowEditVariable: true,
            allowEditStyle: true,
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
        expect(parsed.serverVersion).toBe(SERVER_VERSION);
        expect(parsed.pluginVersion).toBe(SERVER_VERSION);
        expect(parsed.editableScopeType).toBe("node");
        expect(parsed.allowEditNode).toBe("node");
        expect(parsed.allowEditVariable).toBe(true);
        expect(parsed.allowEditStyle).toBe(true);
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
    let joinChannel: any;
    let resetChannel: any;

    beforeEach(async () => {
        mock.module("../../../figma-client.js", () => ({
            sendCommandToFigma: mock(() => Promise.resolve({})),
            joinChannel: mock(() => Promise.resolve(PHASE9_JOIN_VERSIONS)),
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
                if (name === "channel_join") {
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

    it("PAGE_LOAD_FAILED: structured error + resetChannel", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({ errorCode: "PAGE_LOAD_FAILED", errorMessage: "load fail" })
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("PAGE_LOAD_FAILED");
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("P4-4 follow-up: get_connect_payload's structured error forwards details as errorDetails", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({
                    errorCode: "SCOPE_INVALID",
                    errorMessage: "bad state",
                    details: { reportedScope: "node", scopeRootId: null },
                })
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("SCOPE_INVALID");
        expect(parsed.errorDetails).toEqual({ reportedScope: "node", scopeRootId: null });
    });

    // Change 10 (C10-T1): the real seam. C9-F1 was a producer/consumer key
    // mismatch that every existing test missed, because the producer side was
    // only ever asserted by reading handler source and the consumer side was
    // only ever fed a hand-written payload. Q27 forbids the plugin bundle
    // importing `src/shared`, so the two sides cannot share a constant and a
    // test is the only possible guard. This drives a REAL coordinator failure
    // through the REAL projector into the REAL registered tool. Red-proof: with
    // the pre-C9 `errorDetails` key on the producer, `payload.details` is
    // undefined and the public `errorDetails` assertion below fails.
    it("C10-T1 seam: a real page-load failure's diagnostics survive plugin -> channel_join", async () => {
        const { createPageLoadCoordinator, toConnectPayloadError } =
            await import("../../../../../figma_plugin/utils/pageLoad.js");

        const previousFigma = (globalThis as any).figma;
        const scopePage: any = {
            id: "page-scope",
            name: "Scope Page",
            type: "PAGE",
            children: [],
            loadAsync: async () => { throw new Error("scope page unavailable"); },
        };
        (globalThis as any).figma = { root: { id: "doc-1", name: "Doc", children: [scopePage] } };

        try {
            // The producer half, built exactly as connectHandlers builds it.
            const pageLoads = createPageLoadCoordinator();
            const loaded = await pageLoads.load(scopePage);
            expect(loaded.ok).toBe(false);
            if (loaded.ok) throw new Error("unreachable");
            const payload = toConnectPayloadError(loaded.error);

            // The consumer half: the real registered channel_join.
            (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                cmd === "get_connect_payload"
                    ? Promise.resolve(payload)
                    : Promise.resolve({}),
            );
            const r = await registeredTools["join_channel"]({ channel: "ch1" });
            const parsed = JSON.parse(r.content[0].text);

            expect(parsed.status).toBe("error");
            expect(parsed.errorCode).toBe("PAGE_LOAD_FAILED");
            // The diagnostics C9-F1 silently dropped must reach the caller.
            expect(parsed.errorDetails.pageId).toBe("page-scope");
            expect(parsed.errorDetails.cause).toContain("scope page unavailable");
        } finally {
            (globalThis as any).figma = previousFigma;
        }
    });

    it("C10-T1 seam: a timed-out scope page carries its timeoutMs across the same boundary", async () => {
        const { createPageLoadCoordinator, toConnectPayloadError } =
            await import("../../../../../figma_plugin/utils/pageLoad.js");

        const previousFigma = (globalThis as any).figma;
        const scopePage: any = {
            id: "page-slow",
            name: "Slow Page",
            type: "PAGE",
            children: [],
            loadAsync: () => new Promise<void>(() => { }),
        };
        (globalThis as any).figma = { root: { id: "doc-1", name: "Doc", children: [scopePage] } };

        try {
            const pageLoads = createPageLoadCoordinator(5);
            const loaded = await pageLoads.load(scopePage);
            if (loaded.ok) throw new Error("unreachable");
            const payload = toConnectPayloadError(loaded.error);

            (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                cmd === "get_connect_payload"
                    ? Promise.resolve(payload)
                    : Promise.resolve({}),
            );
            const r = await registeredTools["join_channel"]({ channel: "ch1" });
            const parsed = JSON.parse(r.content[0].text);

            expect(parsed.errorCode).toBe("PAGE_LOAD_TIMEOUT");
            expect(parsed.errorDetails).toEqual({ pageId: "page-slow", timeoutMs: 5 });
        } finally {
            (globalThis as any).figma = previousFigma;
        }
    });

    it("P4-4 follow-up: no details field on the payload means no errorDetails key at all", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({ errorCode: "SCOPE_INVALID", errorMessage: "bad state" })
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect("errorDetails" in parsed).toBe(false);
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

    it("PLUGIN_DISCONNECTED from transport: coded at origin, passed through (Q20)", async () => {
        // Mirrors figma-client's close handler, which now codes the rejection
        // at origin instead of leaving channel.ts to sniff message prose.
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.reject(Object.assign(new Error("Connection closed"), { code: "PLUGIN_DISCONNECTED" }))
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("PLUGIN_DISCONNECTED");
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("Phase 9: an awaited leave failure never replaces the originating leg-2 error", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.reject(Object.assign(
                    new Error("The bound peer disconnected during scope read"),
                    {
                        code: "PLUGIN_DISCONNECTED",
                        details: { pluginPeerId: "plugin-old" },
                    },
                ))
                : Promise.resolve({}),
        );
        (resetChannel as any).mockRejectedValue(
            new Error("leave acknowledgement timed out"),
        );

        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("PLUGIN_DISCONNECTED");
        expect(parsed.errorMessage).toContain("disconnected");
        expect(parsed.errorDetails).toEqual({ pluginPeerId: "plugin-old" });
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("P9-F2: a thrown leg-2 failure discloses and preserves the healthy predecessor", async () => {
        (joinChannel as any).mockResolvedValue({
            ...PHASE9_JOIN_VERSIONS,
            releasedChannel: "good",
        });
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.reject(Object.assign(
                    new Error("The scope read failed after admission."),
                    {
                        code: "PLUGIN_DISCONNECTED",
                        details: { pluginPeerId: "plugin-new" },
                    },
                ))
                : Promise.resolve({}),
        );

        const r = await registeredTools["join_channel"]({
            channel: "scope-fails",
        });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("PLUGIN_DISCONNECTED");
        expect(parsed.errorMessage).toContain(
            "disconnected the previously joined channel 'good'",
        );
        expect(parsed.errorDetails).toEqual({
            pluginPeerId: "plugin-new",
            releasedChannel: "good",
        });
        expect((resetChannel as any).mock.calls).toEqual([
            [{ releasedChannel: "good" }],
        ]);
    });

    it("P9-F2: a structured leg-2 failure discloses and preserves the healthy predecessor", async () => {
        (joinChannel as any).mockResolvedValue({
            ...PHASE9_JOIN_VERSIONS,
            releasedChannel: "good",
        });
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({
                    errorCode: "SCOPE_INVALID",
                    errorMessage: "The editable scope is invalid.",
                    details: { scopeRootId: "stale-node" },
                })
                : Promise.resolve({}),
        );

        const r = await registeredTools["join_channel"]({
            channel: "scope-fails",
        });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("SCOPE_INVALID");
        expect(parsed.errorMessage).toContain(
            "disconnected the previously joined channel 'good'",
        );
        expect(parsed.errorDetails).toEqual({
            scopeRootId: "stale-node",
            releasedChannel: "good",
        });
        expect((resetChannel as any).mock.calls).toEqual([
            [{ releasedChannel: "good" }],
        ]);
    });

    it("C6-F6: leg-2 origin details cannot fabricate released-channel evidence", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({
                    errorCode: "SCOPE_INVALID",
                    errorMessage: "The editable scope is invalid.",
                    details: {
                        releasedChannel: "fabricated",
                        scopeRootId: "stale-node",
                    },
                })
                : Promise.resolve({}),
        );

        const r = await registeredTools["join_channel"]({
            channel: "scope-fails",
        });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("SCOPE_INVALID");
        expect(parsed.errorMessage).toBe("The editable scope is invalid.");
        expect(parsed.errorMessage).not.toContain(
            "disconnected the previously joined channel",
        );
        // Q20 preserves the plugin's origin details verbatim, but nests the
        // record so its reserved key cannot masquerade as trusted top-level
        // recovery evidence.
        expect(parsed.errorDetails).toEqual({
            originDetails: {
                releasedChannel: "fabricated",
                scopeRootId: "stale-node",
            },
        });
        expect((resetChannel as any).mock.calls).toEqual([[]]);
    });

    it("C6-F4: an explicit structured UNKNOWN_ERROR preserves its canonical message", async () => {
        const originMessage =
            "An unexpected error occurred while joining the channel: scope read exploded.";
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({
                    errorCode: "UNKNOWN_ERROR",
                    errorMessage: originMessage,
                })
                : Promise.resolve({}),
        );

        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("UNKNOWN_ERROR");
        expect(parsed.errorMessage).toBe(originMessage);
        expect(parsed.errorDetails).toBeUndefined();
        expect((resetChannel as any).mock.calls).toEqual([[]]);
    });

    it("C6-F4: released-channel disclosure appends to explicit UNKNOWN_ERROR without rewrapping it", async () => {
        const originMessage =
            "An unexpected error occurred while joining the channel: scope read exploded.";
        (joinChannel as any).mockResolvedValue({
            ...PHASE9_JOIN_VERSIONS,
            releasedChannel: "good",
        });
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({
                    errorCode: "UNKNOWN_ERROR",
                    errorMessage: originMessage,
                    details: { phase: "scope-payload" },
                })
                : Promise.resolve({}),
        );

        const r = await registeredTools["join_channel"]({
            channel: "scope-fails",
        });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("UNKNOWN_ERROR");
        expect(parsed.errorMessage).toBe(
            `${originMessage} This attempt also disconnected the previously joined channel 'good'; call channel_join with 'good' to restore it.`,
        );
        expect(parsed.errorDetails).toEqual({
            phase: "scope-payload",
            releasedChannel: "good",
        });
        expect((resetChannel as any).mock.calls).toEqual([
            [{ releasedChannel: "good" }],
        ]);
    });

    it("P9-F2: internal release metadata is absent from a successful public envelope", async () => {
        (joinChannel as any).mockResolvedValue({
            ...PHASE9_JOIN_VERSIONS,
            releasedChannel: "good",
        });
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({
                    editableScopeType: "page",
                    documentId: "doc",
                    documentName: "Live",
                    pageCount: 1,
                    pages: [],
                })
                : Promise.resolve({}),
        );

        const r = await registeredTools["join_channel"]({ channel: "next" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("success");
        expect(parsed.channel).toBe("next");
        expect(parsed.serverVersion).toBe(SERVER_VERSION);
        expect(parsed.pluginVersion).toBe(SERVER_VERSION);
        expect(parsed.releasedChannel).toBeUndefined();
        expect(parsed.errorDetails).toBeUndefined();
        expect((resetChannel as any).mock.calls.length).toBe(0);
    });

    it("Q20: an unknown structured code passes through verbatim with its message — never collapsed", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.reject(Object.assign(
                    new Error("Operation Denied: no plugin peer is connected. Open the plugin and rejoin."),
                    { code: "PLUGIN_PEER_UNAVAILABLE", details: { peers: 0 } },
                ))
                : Promise.resolve({}),
        );
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("PLUGIN_PEER_UNAVAILABLE");
        expect(parsed.errorMessage).toContain("Open the plugin and rejoin");
        expect(parsed.errorDetails).toEqual({ peers: 0 });
    });

    it("Q20: a leg-1 join failure coded CHANNEL_JOIN_FAILED at origin keeps its code", async () => {
        const { joinChannel } = await import("../../../figma-client.js");
        (joinChannel as any).mockRejectedValue(Object.assign(
            new Error("Request timed out after 30000ms"),
            { code: "CHANNEL_JOIN_FAILED" },
        ));
        const r = await registeredTools["join_channel"]({ channel: "ch1" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("CHANNEL_JOIN_FAILED");
        expect(parsed.errorMessage).toContain("did not acknowledge the join");
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
            joinChannel: mock(() => Promise.resolve(PHASE9_JOIN_VERSIONS)),
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
                if (name === "channel_join") {
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
                    ? Promise.resolve({ errorCode: "PAGE_LOAD_FAILED", errorMessage: "fail" })
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
        // Mirrors what figma-client actually throws: a FigmaError-shaped
        // rejection carrying the socket's code on `code` (not `joinErrorCode`).
        const tagged = Object.assign(new Error("not found"), {
            code: "CHANNEL_NOT_FOUND",
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

    it("P9-F2: the join failure message names the channel the attempt disconnected", async () => {
        // The released channel must reach the ALWAYS-visible errorMessage, not
        // only errorDetails: an agent that mistyped a channel code has to be
        // able to restore the working one from the message alone.
        (joinChannel as any).mockRejectedValue(Object.assign(
            new Error("Operation Denied: Figma Plugin is not running or available."),
            {
                code: "PLUGIN_PEER_UNAVAILABLE",
                details: { channel: "typo", peerCount: 0, releasedChannel: "good" },
                [JOIN_ATTEMPT_RELEASED_CHANNEL]: "good",
            },
        ));

        const r = await registeredTools["join_channel"]({ channel: "typo" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("PLUGIN_PEER_UNAVAILABLE");
        expect(parsed.errorMessage).toContain("Figma Plugin is not running");
        expect(parsed.errorMessage).toContain("disconnected the previously joined channel 'good'");
        expect(parsed.errorMessage).toContain("call channel_join with 'good'");
        expect(parsed.errorDetails).toEqual({
            channel: "typo",
            peerCount: 0,
            releasedChannel: "good",
        });
    });

    it("C6-F6: leg-1 origin details cannot forge the client-only release marker", async () => {
        (joinChannel as any).mockRejectedValue(Object.assign(
            new Error("No plugin is available."),
            {
                code: "PLUGIN_PEER_UNAVAILABLE",
                details: {
                    channel: "typo",
                    releasedChannel: "fabricated",
                },
            },
        ));

        const r = await registeredTools["join_channel"]({ channel: "typo" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorMessage).toBe("No plugin is available.");
        expect(parsed.errorMessage).not.toContain(
            "disconnected the previously joined channel",
        );
        expect(parsed.errorDetails).toEqual({
            originDetails: {
                channel: "typo",
                releasedChannel: "fabricated",
            },
        });
    });

    it("P9-F7: a leave-phase failure is not described as a join-acknowledgement timeout", async () => {
        (joinChannel as any).mockRejectedValue(Object.assign(
            new Error("Could not leave the current channel 'held', so the join to 'next' was not attempted: timed out"),
            {
                code: "CHANNEL_JOIN_FAILED",
                details: {
                    phase: "leave-previous-channel",
                    previousChannel: "held",
                    requestedChannel: "next",
                },
            },
        ));

        const r = await registeredTools["join_channel"]({ channel: "next" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.errorCode).toBe("CHANNEL_JOIN_FAILED");
        expect(parsed.errorMessage).toContain("Could not leave the current channel 'held'");
        expect(parsed.errorMessage).toContain("The requested join was not sent");
        expect(parsed.errorMessage).toContain("local channel binding was cleared");
        expect(parsed.errorMessage).toContain("socket was closed");
        expect(parsed.errorMessage).toContain("automatic bridge reconnect");
        expect(parsed.errorMessage).toContain("channel_join with 'held'");
        expect(parsed.errorMessage).toContain("with 'next'");
        expect(parsed.errorMessage).not.toContain("still held");
        expect(parsed.errorMessage).not.toContain("did not acknowledge the join");
        expect(parsed.errorDetails).toEqual({
            phase: "leave-previous-channel",
            previousChannel: "held",
            requestedChannel: "next",
        });
    });

    it("P9-F7: an ordinary join timeout keeps its original acknowledgement guidance", async () => {
        (joinChannel as any).mockRejectedValue(Object.assign(
            new Error("Request timed out after 30000ms"),
            { code: "CHANNEL_JOIN_FAILED" },
        ));

        const r = await registeredTools["join_channel"]({ channel: "slow" });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed.errorCode).toBe("CHANNEL_JOIN_FAILED");
        expect(parsed.errorMessage).toContain("did not acknowledge the join within the expected time");
        expect(parsed.errorMessage).not.toContain("local channel binding was cleared");
        expect(parsed.errorMessage).not.toContain("automatic bridge reconnect");
    });
});
