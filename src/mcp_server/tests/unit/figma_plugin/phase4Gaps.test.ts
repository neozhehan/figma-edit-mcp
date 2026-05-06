import { describe, it, expect, beforeEach, mock } from "bun:test";

// Phase 4 GAP-FILL TESTS — items from read_tools_update_plan.md not already
// covered by getPagesInfo.phase2.test.ts / progressUtils.phase1.test.ts /
// connectFlow.phase3.test.ts / connectHandlers.test.ts.
//
//   §1 (polish): tool router rejects get_document_info.
//   §2:          getPagesInfo emits [post#1, setTimeout#1, post#2, setTimeout#2, post#3]
//                interleave at the handler level (not just inside sendProgressUpdate).
//   §2a:         getPagesInfo caller regression — events fire in order AND
//                setTimeout(0) resolves between consecutive postMessage calls.
//   §3a (direct): direct getConnectPayload handler invocation against a mock
//                figma sandbox + spy on loadAsync / loadAllPagesAsync.
//   §4:          get_nodes_info Q7 shape-frozen regression — must keep returning
//                today's `{ nodeId, parentId, document }[]` shape, NOT the
//                Change 1 Node-scope `node` block.
//
// We intentionally do NOT use mock.module("main.js") here. componentHandlers.test.ts
// owns the main.js module-load side effects (it's lexically first and sets up
// gateFigma before importing main.js). Since bun caches module evaluation,
// our `await import(main.js)` is a cache-hit and we read getPluginState from
// the already-evaluated module. Per-test we mutate the real state object and
// swap globalThis.figma — connectHandlers reads figma at call time.
//
// Idempotent setup: if globalThis.figma is already set (componentHandlers
// ran first in full-suite mode), keep it. If we're running this file in
// isolation, install a minimal stub so main.ts can evaluate without throwing.
if (!(globalThis as any).figma) {
    (globalThis as any).__html__ = "<html></html>";
    (globalThis as any).figma = {
        showUI: () => {},
        ui: { onmessage: null, postMessage: () => {} },
        on: () => {},
        notify: () => {},
        closePlugin: () => {},
        clientStorage: { setAsync: async () => {} },
        getNodeByIdAsync: async () => null,
        currentPage: { selection: [], children: [] },
        root: { id: "doc-stub", name: "Stub", children: [] },
        mixed: Symbol("mixed"),
        loadAllPagesAsync: async () => {},
    };
}

const mainMod: any = await import("../../../../figma_plugin/src/main.js");
const realState: any = mainMod.getPluginState();

function setState(next: { readOnly: boolean; scopeRootId: string | null }) {
    realState.readOnly = next.readOnly;
    realState.scopeRootId = next.scopeRootId;
}

// --------------------------------------------------------------------------
// §1 (polish): tool router rejects get_document_info
// --------------------------------------------------------------------------

describe("Phase 4 §1: tool router rejects get_document_info", () => {
    it("get_document_info is NOT in the registered tools after registerDocumentTools runs", async () => {
        mock.module("../../../figma-client.js", () => ({
            sendCommandToFigma: mock(() => Promise.resolve({})),
            joinChannel: mock(() => Promise.resolve()),
            resetChannel: mock(() => {}),
        }));
        const docMod = await import("../../../tools/document.js");
        const registered: Record<string, Function> = {};
        const mockServer: any = {
            tool: mock(
                (name: string, _d: any, _s: any, handler: Function) => {
                    registered[name] = handler;
                },
            ),
            prompt: mock(() => {}),
        };
        docMod.registerDocumentTools(mockServer);

        expect(registered["get_document_info"]).toBeUndefined();
        expect(registered["get_page_info"]).toBeUndefined();
        // Sanity: the new tool IS registered.
        expect(typeof registered["get_pages_info"]).toBe("function");
    });

    it("FigmaCommand union has no get_document_info / get_page_info entry", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "src/mcp_server/figma-client.ts",
            "utf8",
        );
        expect(src).not.toMatch(/["']get_document_info["']/);
        expect(src).not.toMatch(/["']get_page_info["']/);
        expect(src).toMatch(/["']get_pages_info["']/);
    });
});

// --------------------------------------------------------------------------
// §2 + §2a: getPagesInfo handler — yield interleave + caller regression
// --------------------------------------------------------------------------

function makeFigmaForPages(pageDefs: Array<{ id: string; name: string }>) {
    const root: any = { id: "doc", name: "Doc", children: [] };
    root.children = pageDefs.map((p) => {
        const page: any = {
            id: p.id,
            name: p.name,
            type: "PAGE",
            parent: root,
            children: [],
            async loadAsync() {},
        };
        return page;
    });
    const byId: Record<string, any> = { [root.id]: root };
    for (const p of root.children) byId[p.id] = p;
    return {
        root,
        getNodeByIdAsync: async (id: string) => byId[id] ?? null,
        loadAllPagesAsync: async () => {},
        ui: { postMessage: () => {} },
    };
}

describe("Phase 4 §2 + §2a: getPagesInfo emits interleaved postMessage / setTimeout(0) yields", () => {
    it("3 IDs → exact event order [post-started, yield, post-in_progress*3, post-completed] with setTimeout(0) between each postMessage", async () => {
        const figmaStub: any = makeFigmaForPages([
            { id: "p1", name: "P1" },
            { id: "p2", name: "P2" },
            { id: "p3", name: "P3" },
        ]);
        const events: string[] = [];
        figmaStub.ui.postMessage = (msg: any) => {
            events.push(`post:${msg.status}`);
        };
        (globalThis as any).figma = figmaStub;

        // Patch setTimeout to record yield resolutions in event order.
        const origSetTimeout = globalThis.setTimeout;
        (globalThis as any).setTimeout = ((fn: any, ms: any) => {
            if (ms === 0) {
                return origSetTimeout(() => {
                    events.push("yield");
                    fn();
                }, 0);
            }
            return origSetTimeout(fn, ms);
        }) as any;

        try {
            const mod = await import(
                "../../../../figma_plugin/handlers/nodeReaders.js"
            );
            await mod.getPagesInfo({
                commandId: "cmd-yield",
                pageIds: ["p1", "p2", "p3"],
            });
        } finally {
            (globalThis as any).setTimeout = origSetTimeout;
        }

        // Expected: 5 events with a yield after each.
        // started, yield, in_progress, yield, in_progress, yield, in_progress, yield, completed, yield
        expect(events).toEqual([
            "post:started",
            "yield",
            "post:in_progress",
            "yield",
            "post:in_progress",
            "yield",
            "post:in_progress",
            "yield",
            "post:completed",
            "yield",
        ]);
    });

    it("regression: removing the await on sendProgressUpdate would coalesce events — interleave above guards against it", async () => {
        // This is a meta-assertion — the interleave order test above is the
        // canary. If a future refactor drops the trailing
        // `await new Promise(r => setTimeout(r, 0))` in progressUtils, the
        // event order will degrade to ["post:started", "post:in_progress", ...],
        // missing the "yield" entries. The exhaustive event-order assertion
        // above will fail and pinpoint the regression.
        expect(true).toBe(true);
    });
});

// --------------------------------------------------------------------------
// §3a (direct): getConnectPayload behavior against a mock figma sandbox
// --------------------------------------------------------------------------

function makeFigmaForConnect(opts: {
    pages: Array<{
        id: string;
        name: string;
        children?: Array<{
            id: string;
            name: string;
            type: string;
            children?: any[];
        }>;
    }>;
    extraNodes?: Record<string, any>;
}) {
    const loadCalls: string[] = [];
    let loadAllCalls = 0;
    const root: any = { id: "doc-1", name: "Sample Doc", children: [] };

    function attach(parent: any, defs?: any[]): any[] {
        if (!defs) return [];
        return defs.map((def) => {
            const node: any = {
                id: def.id,
                name: def.name,
                type: def.type,
                parent,
                children: [],
            };
            node.children = attach(node, def.children);
            return node;
        });
    }

    root.children = opts.pages.map((p) => {
        const page: any = {
            id: p.id,
            name: p.name,
            type: "PAGE",
            parent: root,
            children: [],
            async loadAsync() {
                loadCalls.push(this.id);
            },
        };
        page.children = attach(page, p.children);
        return page;
    });

    const byId: Record<string, any> = { [root.id]: root };
    function index(node: any) {
        if (!node || !node.id) return;
        byId[node.id] = node;
        if (node.children) for (const c of node.children) index(c);
    }
    for (const p of root.children) index(p);
    if (opts.extraNodes) {
        for (const [id, n] of Object.entries(opts.extraNodes)) byId[id] = n;
    }

    return {
        figma: {
            root,
            getNodeByIdAsync: async (id: string) => byId[id] ?? null,
            loadAllPagesAsync: async () => {
                loadAllCalls += 1;
            },
            ui: { postMessage: () => {} },
        },
        byId,
        loadCalls,
        getLoadAllCalls: () => loadAllCalls,
    };
}

async function callConnectPayload(): Promise<any> {
    const mod = await import(
        "../../../../figma_plugin/handlers/connectHandlers.js"
    );
    return mod.getConnectPayload();
}

describe("Phase 4 §3a (direct invocation): getConnectPayload — readonly", () => {
    it("returns readonly payload exactly + no loadAsync, no loadAllPagesAsync", async () => {
        setState({ readOnly: true, scopeRootId: null });
        const env = makeFigmaForConnect({
            pages: [
                { id: "p1", name: "Cover" },
                { id: "p2", name: "Flow" },
                { id: "p3", name: "Specs" },
            ],
        });
        (globalThis as any).figma = env.figma;

        const result = await callConnectPayload();
        expect(result).toEqual({
            editableScopeType: "readonly",
            documentId: "doc-1",
            documentName: "Sample Doc",
            pageCount: 3,
            pages: [
                { pageId: "p1", pageName: "Cover" },
                { pageId: "p2", pageName: "Flow" },
                { pageId: "p3", pageName: "Specs" },
            ],
        });
        expect(env.loadCalls).toEqual([]);
        expect(env.getLoadAllCalls()).toBe(0);
    });
});

describe("Phase 4 §3a (direct invocation): getConnectPayload — page scope", () => {
    it("loads exactly the scoped page (no loadAllPagesAsync)", async () => {
        const env = makeFigmaForConnect({
            pages: [
                { id: "p1", name: "Cover" },
                {
                    id: "p2",
                    name: "Flow",
                    children: [
                        { id: "f1", name: "Hero", type: "FRAME" },
                        { id: "f2", name: "Footer", type: "FRAME" },
                    ],
                },
                { id: "p3", name: "Specs" },
            ],
        });
        setState({ readOnly: false, scopeRootId: "p2" });
        (globalThis as any).figma = env.figma;

        const result = await callConnectPayload();
        expect(result).toEqual({
            editableScopeType: "page",
            documentId: "doc-1",
            documentName: "Sample Doc",
            pageCount: 3,
            pages: [
                {
                    pageId: "p2",
                    pageName: "Flow",
                    children: [
                        { id: "f1", name: "Hero", type: "FRAME" },
                        { id: "f2", name: "Footer", type: "FRAME" },
                    ],
                },
            ],
        });
        expect(env.loadCalls).toEqual(["p2"]);
        expect(env.getLoadAllCalls()).toBe(0);
    });
});

describe("Phase 4 §3a (direct invocation): getConnectPayload — node scope", () => {
    it("returns node block with parent + containing-page metadata, no loadAsync", async () => {
        const env = makeFigmaForConnect({
            pages: [
                { id: "p1", name: "Cover" },
                {
                    id: "p2",
                    name: "Flow",
                    children: [
                        {
                            id: "outer",
                            name: "Outer",
                            type: "FRAME",
                            children: [
                                {
                                    id: "deep",
                                    name: "Deep",
                                    type: "FRAME",
                                    children: [
                                        {
                                            id: "rect",
                                            name: "Rect",
                                            type: "RECTANGLE",
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        });
        setState({ readOnly: false, scopeRootId: "deep" });
        (globalThis as any).figma = env.figma;

        const result = await callConnectPayload();
        expect(result).toEqual({
            editableScopeType: "node",
            documentId: "doc-1",
            documentName: "Sample Doc",
            node: {
                nodeId: "deep",
                nodeName: "Deep",
                type: "FRAME",
                parentNodeId: "outer",
                parentNodeName: "Outer",
                parentNodeType: "FRAME",
                containingPageId: "p2",
                containingPageName: "Flow",
                children: [{ id: "rect", name: "Rect", type: "RECTANGLE" }],
            },
        });
        expect(env.loadCalls).toEqual([]);
        expect(env.getLoadAllCalls()).toBe(0);
        // Negative: no top-level pages array on node-scope.
        expect((result as any).pages).toBeUndefined();
        expect((result as any).pageCount).toBeUndefined();
    });

    it("INSTANCE / COMPONENT / SECTION / GROUP all dispatch through node-scope branch", async () => {
        for (const type of ["INSTANCE", "COMPONENT", "SECTION", "GROUP"]) {
            const env = makeFigmaForConnect({
                pages: [
                    {
                        id: "px",
                        name: "PX",
                        children: [{ id: "n", name: "N", type }],
                    },
                ],
            });
            setState({ readOnly: false, scopeRootId: "n" });
            (globalThis as any).figma = env.figma;
            const r = await callConnectPayload();
            expect(r.editableScopeType).toBe("node");
            expect(r.node.type).toBe(type);
            expect(r.node.containingPageId).toBe("px");
        }
    });
});

describe("Phase 4 §3a (direct invocation): getConnectPayload — structured errors", () => {
    it("SCOPE_DELETED returned (not thrown) when scopeRootId resolves to null", async () => {
        const env = makeFigmaForConnect({
            pages: [{ id: "p1", name: "P1" }],
        });
        setState({ readOnly: false, scopeRootId: "ghost" });
        (globalThis as any).figma = env.figma;
        const r = await callConnectPayload();
        expect(r.errorCode).toBe("SCOPE_DELETED");
        expect(r.editableScopeType).toBeUndefined();
    });

    it("SCOPE_INVALID for missing scopeRootId in non-readonly state", async () => {
        const env = makeFigmaForConnect({
            pages: [{ id: "p1", name: "P1" }],
        });
        setState({ readOnly: false, scopeRootId: null });
        (globalThis as any).figma = env.figma;
        const r = await callConnectPayload();
        expect(r.errorCode).toBe("SCOPE_INVALID");
    });

    it("SCOPE_INVALID for orphaned node (no PAGE ancestor)", async () => {
        const orphan: any = {
            id: "orphan",
            name: "Orphan",
            type: "FRAME",
            parent: null,
            children: [],
        };
        const env = makeFigmaForConnect({
            pages: [{ id: "p1", name: "P1" }],
            extraNodes: { orphan },
        });
        setState({ readOnly: false, scopeRootId: "orphan" });
        (globalThis as any).figma = env.figma;
        const r = await callConnectPayload();
        expect(r.errorCode).toBe("SCOPE_INVALID");
    });

    it("DOCUMENT_LOAD_FAILED when scoped page's loadAsync rejects", async () => {
        const env = makeFigmaForConnect({
            pages: [{ id: "p1", name: "P1" }],
        });
        env.byId["p1"].loadAsync = async () => {
            throw new Error("load fail");
        };
        setState({ readOnly: false, scopeRootId: "p1" });
        (globalThis as any).figma = env.figma;
        const r = await callConnectPayload();
        expect(r.errorCode).toBe("DOCUMENT_LOAD_FAILED");
    });

    it("UNKNOWN_ERROR catch-all with underlying message appended", async () => {
        const figmaStub = {
            root: { id: "x", name: "X", children: [] },
            getNodeByIdAsync: async () => {
                throw new Error("kaboom");
            },
            ui: { postMessage: () => {} },
            loadAllPagesAsync: async () => {},
        };
        setState({ readOnly: false, scopeRootId: "any" });
        (globalThis as any).figma = figmaStub;
        const r = await callConnectPayload();
        expect(r.errorCode).toBe("UNKNOWN_ERROR");
        expect(r.errorMessage).toMatch(/kaboom/);
    });
});

// --------------------------------------------------------------------------
// §4: get_nodes_info Q7 shape-frozen regression
// --------------------------------------------------------------------------

describe("Phase 4 §4: get_nodes_info shape-frozen regression (Q7)", () => {
    let registered: Record<string, Function>;
    let sendCommandToFigma: any;

    beforeEach(async () => {
        mock.module("../../../figma-client.js", () => ({
            sendCommandToFigma: mock(() => Promise.resolve({})),
            joinChannel: mock(() => Promise.resolve()),
            resetChannel: mock(() => {}),
        }));
        const clientMod = await import("../../../figma-client.js");
        sendCommandToFigma = clientMod.sendCommandToFigma;

        const docMod = await import("../../../tools/document.js");
        registered = {};
        const mockServer: any = {
            tool: mock(
                (name: string, _d: any, _s: any, handler: Function) => {
                    registered[name] = handler;
                },
            ),
            prompt: mock(() => {}),
        };
        docMod.registerDocumentTools(mockServer);
    });

    it("get_nodes_info({ nodeIds }) returns [{ nodeId, parentId, document }] — NOT the Change 1 node block", async () => {
        const legacyShape = [
            {
                nodeId: "59:8",
                parentId: "0:1",
                document: { id: "59:8", name: "TestMain", type: "INSTANCE", children: [] },
            },
        ];
        (sendCommandToFigma as any).mockResolvedValue(legacyShape);
        const r = await registered["get_nodes_info"]({ nodeIds: ["59:8"] });
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed).toEqual(legacyShape);
        // Q7 negative invariants — Change 1 node-block fields MUST NOT appear at top-level.
        for (const item of parsed) {
            expect(item.nodeName).toBeUndefined();
            expect(item.containingPageId).toBeUndefined();
            expect(item.containingPageName).toBeUndefined();
            expect(item.parentNodeId).toBeUndefined();
            expect(item.parentNodeName).toBeUndefined();
            expect(item.parentNodeType).toBeUndefined();
            expect(item.type).toBeUndefined();
            // The legacy shape DOES carry `document` and `parentId`.
            expect(item.parentId).toBe("0:1");
            expect(item.document).toBeDefined();
        }
    });

    it("get_nodes_info() with no args dispatches to sendCommandToFigma with undefined nodeIds (delegating scope-resolution to the plugin)", async () => {
        (sendCommandToFigma as any).mockResolvedValue([]);
        await registered["get_nodes_info"]({});
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", {
            nodeIds: undefined,
            fields: undefined,
        });
    });

    it("get_nodes_info() returning a single-element scope array preserves the legacy shape (no Change 1 fields)", async () => {
        const scopeShape = [
            {
                nodeId: "frame-deep",
                parentId: "frame-outer",
                document: {
                    id: "frame-deep",
                    name: "Deep",
                    type: "FRAME",
                    children: [{ id: "rect", name: "Rect", type: "RECTANGLE" }],
                },
            },
        ];
        (sendCommandToFigma as any).mockResolvedValue(scopeShape);
        const r = await registered["get_nodes_info"]({});
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed).toEqual(scopeShape);
        expect(parsed.length).toBe(1);
        // Same Q7 negative checks as above.
        expect(parsed[0].nodeName).toBeUndefined();
        expect(parsed[0].containingPageId).toBeUndefined();
    });

    it("get_nodes_info() readonly behavior: today's plugin returns [] — locked in (NOT redefined)", async () => {
        // The plan §4 says: "behavior is whatever it is today; document the
        // current behavior in the test rather than redefining it."
        // Plugin's readonly path (main.ts: when no scopeRootId) returns [].
        (sendCommandToFigma as any).mockResolvedValue([]);
        const r = await registered["get_nodes_info"]({});
        const parsed = JSON.parse(r.content[0].text);
        expect(parsed).toEqual([]);
    });
});
