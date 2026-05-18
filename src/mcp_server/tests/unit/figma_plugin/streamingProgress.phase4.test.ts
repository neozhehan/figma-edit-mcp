import { describe, it, expect, beforeEach } from "bun:test";

// Phase 4 §2: Progress Event Streaming Tests
// Phase 4 §2a: sendProgressUpdate Caller Regression Tests
// Phase 4 §2b: getPagesInfo Does Not Call figma.loadAllPagesAsync()
//
// These tests verify that:
// - getPagesInfo emits correctly-ordered progress events with yield-between-chunks
// - sendProgressUpdate callers await properly (regression for Phase 1 changes)
// - loadAllPagesAsync is NEVER called in any getPagesInfo code path

// ---- Shared mock builder ----

function makeMockFigma(opts: {
    pages: Array<{ id: string; name: string; children?: any[] }>;
    extraNodes?: Record<string, any>;
}) {
    const root: any = { id: "0:0", name: "Mock Document", children: [] };
    root.children = opts.pages.map((p) => {
        const children = p.children ?? [];
        const page: any = {
            id: p.id,
            name: p.name,
            type: "PAGE",
            children,
            async loadAsync() {
                this._loaded = true;
            },
            _loaded: false,
            parent: root,
        };
        return page;
    });
    const byId: Record<string, any> = { [root.id]: root };
    for (const p of root.children) byId[p.id] = p;
    if (opts.extraNodes) {
        for (const [id, n] of Object.entries(opts.extraNodes)) {
            byId[id] = n;
        }
    }

    const postedMessages: any[] = [];
    let loadAllPagesAsyncCalls = 0;
    let setTimeoutCalls = 0;

    // Track setTimeout(fn, 0) calls for yield verification
    const origSetTimeout = globalThis.setTimeout;
    (globalThis as any).setTimeout = (fn: any, ms: number, ...args: any[]) => {
        if (ms === 0) setTimeoutCalls++;
        return origSetTimeout(fn, ms, ...args);
    };

    return {
        figma: {
            root,
            getNodeByIdAsync: async (id: string) => byId[id] ?? null,
            loadAllPagesAsync: async () => {
                loadAllPagesAsyncCalls += 1;
            },
            ui: {
                postMessage: (msg: any) => postedMessages.push(msg),
            },
        },
        postedMessages,
        getLoadAllPagesAsyncCalls: () => loadAllPagesAsyncCalls,
        getSetTimeoutCalls: () => setTimeoutCalls,
        getPages: () => root.children,
        restoreSetTimeout: () => { (globalThis as any).setTimeout = origSetTimeout; },
    };
}

// ============================================================
// §2: Progress Event Streaming Tests for getPagesInfo
// ============================================================

describe("Phase 4 §2: getPagesInfo progress event streaming", () => {
    let mockEnv: ReturnType<typeof makeMockFigma>;
    let getPagesInfo: (params?: any) => Promise<any>;

    beforeEach(async () => {
        mockEnv = makeMockFigma({
            pages: [
                { id: "p1", name: "P1", children: [] },
                { id: "p2", name: "P2", children: [] },
                { id: "p3", name: "P3", children: [] },
            ],
        });
        (globalThis as any).figma = mockEnv.figma;
        const mod = await import(
            "../../../../figma_plugin/handlers/nodeReaders.js?phase4-streaming"
        );
        getPagesInfo = mod.getPagesInfo;
    });

    it("emits started → in_progress (one per id) → completed, in that order", async () => {
        await getPagesInfo({
            commandId: "cmd_stream",
            pageIds: ["p1", "p2", "p3"],
        });

        const progressEvents = mockEnv.postedMessages.filter(
            (m) => m && m.type === "command_progress",
        );
        expect(progressEvents.length).toBe(5); // started + 3*in_progress + completed

        expect(progressEvents[0].status).toBe("started");
        expect(progressEvents[1].status).toBe("in_progress");
        expect(progressEvents[2].status).toBe("in_progress");
        expect(progressEvents[3].status).toBe("in_progress");
        expect(progressEvents[4].status).toBe("completed");
    });

    it("processedItems increments correctly across progress events", async () => {
        await getPagesInfo({
            commandId: "cmd_inc",
            pageIds: ["p1", "p2", "p3"],
        });

        const events = mockEnv.postedMessages.filter(
            (m) => m && m.type === "command_progress",
        );
        expect(events[0].processedItems).toBe(0); // started
        expect(events[1].processedItems).toBe(1); // in_progress #1
        expect(events[2].processedItems).toBe(2); // in_progress #2
        expect(events[3].processedItems).toBe(3); // in_progress #3
        expect(events[4].processedItems).toBe(3); // completed
    });

    it("each progress event carries the correct commandId", async () => {
        await getPagesInfo({
            commandId: "cmd_id_check",
            pageIds: ["p1", "p2"],
        });

        const events = mockEnv.postedMessages.filter(
            (m) => m && m.type === "command_progress",
        );
        for (const ev of events) {
            expect(ev.commandId).toBe("cmd_id_check");
            expect(ev.commandType).toBe("get_pages_info");
        }
    });

    it("yield-between-chunks: setTimeout(fn, 0) is scheduled between consecutive postMessage calls", async () => {
        const setTimeoutBefore = mockEnv.getSetTimeoutCalls();

        await getPagesInfo({
            commandId: "cmd_yield",
            pageIds: ["p1", "p2", "p3"],
        });

        const events = mockEnv.postedMessages.filter(
            (m) => m && m.type === "command_progress",
        );
        // 5 progress events → 5 setTimeout(fn, 0) calls (one per sendProgressUpdate)
        const setTimeoutAfter = mockEnv.getSetTimeoutCalls();
        const yieldCount = setTimeoutAfter - setTimeoutBefore;
        expect(yieldCount).toBeGreaterThanOrEqual(events.length);
    });

    it("emits no progress events when commandId is absent", async () => {
        await getPagesInfo({ pageIds: ["p1", "p2"] });
        const events = mockEnv.postedMessages.filter(
            (m) => m && m.type === "command_progress",
        );
        expect(events.length).toBe(0);
    });
});

// ============================================================
// §2a: sendProgressUpdate Caller Regression Tests
// ============================================================

describe("Phase 4 §2a: sendProgressUpdate callers await correctly", () => {
    it("all sendProgressUpdate( call sites in handler source files are awaited", async () => {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        const handlersDir = "figma_plugin/handlers";
        const entries = await fs.readdir(handlersDir);
        const tsFiles = entries.filter((e) => e.endsWith(".ts"));

        const offenders: string[] = [];
        for (const file of tsFiles) {
            const src = await fs.readFile(path.join(handlersDir, file), "utf8");
            const lines = src.split("\n");
            lines.forEach((line, i) => {
                // Match sendProgressUpdate( calls that are NOT preceded by await
                if (/sendProgressUpdate\(/.test(line) && !/await\s+sendProgressUpdate\(/.test(line)) {
                    // Skip import lines
                    if (/import/.test(line)) return;
                    // Skip comments
                    if (/^\s*(\/\/|\*)/.test(line)) return;
                    offenders.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    it("sendProgressUpdate is declared async in progressUtils.ts", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "figma_plugin/utils/progressUtils.ts",
            "utf8",
        );
        expect(src).toMatch(/export\s+async\s+function\s+sendProgressUpdate/);
    });

    it("sendProgressUpdate includes the setTimeout(fn, 0) yield after postMessage", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "figma_plugin/utils/progressUtils.ts",
            "utf8",
        );
        // The postMessage call must come before the setTimeout yield
        const postMsgIdx = src.indexOf("figma.ui.postMessage");
        const yieldIdx = src.indexOf("setTimeout(r, 0)");
        expect(postMsgIdx).toBeGreaterThan(-1);
        expect(yieldIdx).toBeGreaterThan(-1);
        expect(yieldIdx).toBeGreaterThan(postMsgIdx);
    });
});

// ============================================================
// §2b: getPagesInfo Does Not Call figma.loadAllPagesAsync()
// ============================================================

describe("Phase 4 §2b: getPagesInfo never calls figma.loadAllPagesAsync()", () => {
    it("no-args path: loadAllPagesAsync never called", async () => {
        const mockEnv = makeMockFigma({
            pages: [
                { id: "p1", name: "P1" },
                { id: "p2", name: "P2" },
            ],
        });
        (globalThis as any).figma = mockEnv.figma;
        const mod = await import(
            "../../../../figma_plugin/handlers/nodeReaders.js?phase4-2b-noargs"
        );
        await mod.getPagesInfo();
        expect(mockEnv.getLoadAllPagesAsyncCalls()).toBe(0);
        mockEnv.restoreSetTimeout();
    });

    it("single-id path: loadAllPagesAsync never called", async () => {
        const mockEnv = makeMockFigma({
            pages: [{ id: "p1", name: "P1", children: [] }],
        });
        (globalThis as any).figma = mockEnv.figma;
        const mod = await import(
            "../../../../figma_plugin/handlers/nodeReaders.js?phase4-2b-single"
        );
        await mod.getPagesInfo({ pageIds: ["p1"] });
        expect(mockEnv.getLoadAllPagesAsyncCalls()).toBe(0);
        mockEnv.restoreSetTimeout();
    });

    it("multi-id path: loadAllPagesAsync never called", async () => {
        const mockEnv = makeMockFigma({
            pages: [
                { id: "p1", name: "P1", children: [] },
                { id: "p2", name: "P2", children: [] },
                { id: "p3", name: "P3", children: [] },
            ],
        });
        (globalThis as any).figma = mockEnv.figma;
        const mod = await import(
            "../../../../figma_plugin/handlers/nodeReaders.js?phase4-2b-multi"
        );
        await mod.getPagesInfo({ pageIds: ["p1", "p2", "p3"] });
        expect(mockEnv.getLoadAllPagesAsyncCalls()).toBe(0);
        mockEnv.restoreSetTimeout();
    });

    it("missing-ids path: loadAllPagesAsync never called", async () => {
        const mockEnv = makeMockFigma({
            pages: [{ id: "p1", name: "P1", children: [] }],
        });
        (globalThis as any).figma = mockEnv.figma;
        const mod = await import(
            "../../../../figma_plugin/handlers/nodeReaders.js?phase4-2b-missing"
        );
        await mod.getPagesInfo({ pageIds: ["p1", "MISSING", "ALSO_MISSING"] });
        expect(mockEnv.getLoadAllPagesAsyncCalls()).toBe(0);
        mockEnv.restoreSetTimeout();
    });

    it("length-100 path: loadAllPagesAsync never called", async () => {
        const pages = Array.from({ length: 100 }, (_, i) => ({
            id: `p-${i}`,
            name: `Page ${i}`,
            children: [],
        }));
        const mockEnv = makeMockFigma({ pages });
        (globalThis as any).figma = mockEnv.figma;
        const mod = await import(
            "../../../../figma_plugin/handlers/nodeReaders.js?phase4-2b-100"
        );
        const ids = pages.map((p) => p.id);
        await mod.getPagesInfo({ pageIds: ids });
        expect(mockEnv.getLoadAllPagesAsyncCalls()).toBe(0);
        mockEnv.restoreSetTimeout();
    });
});
