import { describe, it, expect, beforeEach } from "bun:test";

// Verification tests for Phase 2 of v1.3.0 read_tools_update_plan.md
// Task 1: Remove get_document_info Tool
// Task 2: Replace get_page_info with get_pages_info
// Task 3: Removed-Fields Search-and-Replace Pass
// Task 4: Version Bump and Changelog

// Build a deterministic mock figma sandbox for getPagesInfo tests.
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
        getPages: () => root.children,
    };
}

describe("Phase 2.1: get_document_info / get_page_info fully removed", () => {
    it("source tree contains no get_document_info, getDocumentInfo, get_page_info, or getPageInfo references", async () => {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        async function walk(dir: string): Promise<string[]> {
            const out: string[] = [];
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.name === "dist" || e.name === "node_modules") continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) out.push(...(await walk(full)));
                else if (
                    e.name.endsWith(".ts") ||
                    e.name.endsWith(".html") ||
                    e.name.endsWith(".js")
                )
                    out.push(full);
            }
            return out;
        }

        const files = await walk("src");
        const offenders: string[] = [];
        for (const f of files) {
            // skip verification test files (they reference old names in test descriptions / regression assertions)
            if (f.includes("/tests/") && f.endsWith(".test.ts")) continue;
            const src = await fs.readFile(f, "utf8");
            const lines = src.split("\n");
            lines.forEach((line, i) => {
                if (
                    /\bget_document_info\b/.test(line) ||
                    /\bgetDocumentInfo\b/.test(line) ||
                    /\bget_page_info\b/.test(line) ||
                    /\bgetPageInfo\b/.test(line)
                ) {
                    offenders.push(`${f}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});

describe("Phase 2.2: get_pages_info MCP tool registration", () => {
    it("tool description surfaces soft batch guidance and streaming semantics", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "src/mcp_server/tools/document.ts",
            "utf8",
        );
        // soft batch guidance — recommend ≤25 pageIds per call
        expect(src).toMatch(/get_pages_info[\s\S]{0,800}25/);
    });

    it("FigmaCommand union includes get_pages_info and excludes get_document_info / get_page_info", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "src/mcp_server/figma-client.ts",
            "utf8",
        );
        expect(src).toMatch(/"get_pages_info"/);
        expect(src).not.toMatch(/"get_document_info"/);
        expect(src).not.toMatch(/"get_page_info"/);
    });
});

describe("Phase 2.2: getPagesInfo handler — no-args / empty array path", () => {
    let mockEnv: ReturnType<typeof makeMockFigma>;
    let getPagesInfo: (params?: any) => Promise<any>;

    beforeEach(async () => {
        mockEnv = makeMockFigma({
            pages: [
                { id: "page-A", name: "Cover" },
                { id: "page-B", name: "Flow" },
                { id: "page-C", name: "Specs" },
            ],
        });
        (globalThis as any).figma = mockEnv.figma;
        // Bust the module cache so the handler picks up the fresh figma global.
        const mod = await import(
            "../../../../figma_plugin/handlers/nodeReaders.js?phase2-noargs"
        );
        getPagesInfo = mod.getPagesInfo;
    });

    it("returns documentId, documentName, pageCount, and pages with id+name only", async () => {
        const result = await getPagesInfo();
        expect(result.documentId).toBe("0:0");
        expect(result.documentName).toBe("Mock Document");
        expect(result.pageCount).toBe(3);
        expect(result.pages).toEqual([
            { pageId: "page-A", pageName: "Cover" },
            { pageId: "page-B", pageName: "Flow" },
            { pageId: "page-C", pageName: "Specs" },
        ]);
    });

    it("does not include children or missingPageIds when no pageIds provided", async () => {
        const result = await getPagesInfo();
        expect(result.missingPageIds).toBeUndefined();
        for (const p of result.pages) {
            expect(p.children).toBeUndefined();
        }
    });

    it("treats empty array the same as no args", async () => {
        const result = await getPagesInfo({ pageIds: [] });
        expect(result.pages.length).toBe(3);
        expect(result.missingPageIds).toBeUndefined();
    });

    it("never calls figma.loadAllPagesAsync", async () => {
        await getPagesInfo();
        await getPagesInfo({ pageIds: [] });
        expect(mockEnv.getLoadAllPagesAsyncCalls()).toBe(0);
    });

    it("never calls page.loadAsync on the no-args path", async () => {
        await getPagesInfo();
        for (const p of mockEnv.getPages()) {
            expect(p._loaded).toBe(false);
        }
    });
});

describe("Phase 2.2: getPagesInfo handler — pageIds path (dedupe + ordering + strict page check)", () => {
    let mockEnv: ReturnType<typeof makeMockFigma>;
    let getPagesInfo: (params?: any) => Promise<any>;

    beforeEach(async () => {
        const otherDocRoot: any = { id: "9:9" };
        const otherDocPage: any = {
            id: "page-OTHER",
            name: "Foreign",
            type: "PAGE",
            parent: otherDocRoot,
            children: [],
            async loadAsync() {},
        };
        const sectionNode: any = {
            id: "section-1",
            name: "Section",
            type: "SECTION",
            children: [],
        };
        const frameNode: any = {
            id: "frame-1",
            name: "Frame",
            type: "FRAME",
            children: [],
        };

        mockEnv = makeMockFigma({
            pages: [
                {
                    id: "page-A",
                    name: "Cover",
                    children: [
                        { id: "1:1", name: "Hero", type: "FRAME" },
                        { id: "1:2", name: "Logo", type: "COMPONENT" },
                    ],
                },
                {
                    id: "page-B",
                    name: "Flow",
                    children: [{ id: "2:1", name: "Step", type: "FRAME" }],
                },
                {
                    id: "page-C",
                    name: "Specs",
                    children: [],
                },
            ],
            extraNodes: {
                "page-OTHER": otherDocPage,
                "section-1": sectionNode,
                "frame-1": frameNode,
            },
        });
        (globalThis as any).figma = mockEnv.figma;
        const mod = await import(
            "../../../../figma_plugin/handlers/nodeReaders.js?phase2-ids"
        );
        getPagesInfo = mod.getPagesInfo;
    });

    it("preserves input order for resolvable ids", async () => {
        const result = await getPagesInfo({
            pageIds: ["page-C", "page-A", "page-B"],
        });
        expect(result.pages.map((p: any) => p.pageId)).toEqual([
            "page-C",
            "page-A",
            "page-B",
        ]);
        expect(result.missingPageIds).toEqual([]);
    });

    it("returns top-level children for resolved pages", async () => {
        const result = await getPagesInfo({ pageIds: ["page-A"] });
        expect(result.pages[0].children).toEqual([
            { id: "1:1", name: "Hero", type: "FRAME" },
            { id: "1:2", name: "Logo", type: "COMPONENT" },
        ]);
    });

    it("skips unresolvable ids and surfaces them via missingPageIds", async () => {
        const result = await getPagesInfo({
            pageIds: ["page-A", "MISSING", "page-B"],
        });
        expect(result.pages.map((p: any) => p.pageId)).toEqual([
            "page-A",
            "page-B",
        ]);
        expect(result.missingPageIds).toEqual(["MISSING"]);
    });

    it("dedupes resolvable ids while preserving first-occurrence order", async () => {
        const result = await getPagesInfo({
            pageIds: ["page-A", "page-A", "page-B"],
        });
        expect(result.pages.map((p: any) => p.pageId)).toEqual([
            "page-A",
            "page-B",
        ]);
        expect(result.missingPageIds).toEqual([]);
    });

    it("dedupes unresolvable ids in first-occurrence order", async () => {
        const result = await getPagesInfo({
            pageIds: ["MISSING", "MISSING", "OTHER_MISSING"],
        });
        expect(result.pages).toEqual([]);
        expect(result.missingPageIds).toEqual(["MISSING", "OTHER_MISSING"]);
    });

    it("rejects SECTION ids — strict page check (parent must be figma.root, type must be PAGE)", async () => {
        const result = await getPagesInfo({
            pageIds: ["page-A", "section-1"],
        });
        expect(result.pages.map((p: any) => p.pageId)).toEqual(["page-A"]);
        expect(result.missingPageIds).toEqual(["section-1"]);
    });

    it("rejects FRAME / COMPONENT ids", async () => {
        const result = await getPagesInfo({
            pageIds: ["frame-1", "page-B"],
        });
        expect(result.pages.map((p: any) => p.pageId)).toEqual(["page-B"]);
        expect(result.missingPageIds).toEqual(["frame-1"]);
    });

    it("rejects PAGE nodes whose parent !== figma.root (different document)", async () => {
        const result = await getPagesInfo({
            pageIds: ["page-OTHER", "page-C"],
        });
        expect(result.pages.map((p: any) => p.pageId)).toEqual(["page-C"]);
        expect(result.missingPageIds).toEqual(["page-OTHER"]);
    });

    it("calls page.loadAsync only on resolved pages", async () => {
        await getPagesInfo({ pageIds: ["page-A", "MISSING", "section-1"] });
        const pages = mockEnv.getPages();
        expect(pages.find((p: any) => p.id === "page-A")._loaded).toBe(true);
        expect(pages.find((p: any) => p.id === "page-B")._loaded).toBe(false);
    });

    it("never calls figma.loadAllPagesAsync on the pageIds path", async () => {
        await getPagesInfo({
            pageIds: ["page-A", "page-B", "page-C", "MISSING"],
        });
        expect(mockEnv.getLoadAllPagesAsyncCalls()).toBe(0);
    });
});

describe("Phase 2.2: getPagesInfo soft-limit non-enforcement", () => {
    it("processes 100 ids without truncation, warning, or error", async () => {
        const pages = Array.from({ length: 100 }, (_, i) => ({
            id: `p-${i}`,
            name: `Page ${i}`,
            children: [],
        }));
        const env = makeMockFigma({ pages });
        (globalThis as any).figma = env.figma;

        // Capture any warn/log signal so the test fails if the handler
        // adds a runtime cap or warning.
        const origWarn = console.warn;
        const origError = console.error;
        const warnings: any[] = [];
        const errors: any[] = [];
        console.warn = (...args: any[]) => warnings.push(args);
        console.error = (...args: any[]) => errors.push(args);

        try {
            const mod = await import(
                "../../../../figma_plugin/handlers/nodeReaders.js?phase2-100"
            );
            const ids = pages.map((p) => p.id);
            const result = await mod.getPagesInfo({ pageIds: ids });
            expect(result.pages.length).toBe(100);
            expect(result.missingPageIds).toEqual([]);
            expect(warnings).toEqual([]);
            expect(errors).toEqual([]);
            expect(env.getLoadAllPagesAsyncCalls()).toBe(0);
        } finally {
            console.warn = origWarn;
            console.error = origError;
        }
    });
});

describe("Phase 2.2: getPagesInfo progress event streaming (commandId path)", () => {
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
            "../../../../figma_plugin/handlers/nodeReaders.js?phase2-progress"
        );
        getPagesInfo = mod.getPagesInfo;
    });

    it("emits started, in_progress (one per id), and completed events when commandId is set", async () => {
        await getPagesInfo({
            commandId: "cmd_abc",
            pageIds: ["p1", "p2", "p3"],
        });

        const progressEvents = mockEnv.postedMessages.filter(
            (m) => m && m.type === "command_progress",
        );
        expect(progressEvents.length).toBe(5); // started + 3*in_progress + completed

        // Each event must carry the well-known fields with correct values —
        // catches the bug where the handler passes a single object literal
        // instead of positional arguments to sendProgressUpdate.
        expect(progressEvents[0].commandId).toBe("cmd_abc");
        expect(progressEvents[0].commandType).toBe("get_pages_info");
        expect(progressEvents[0].status).toBe("started");
        expect(progressEvents[0].totalItems).toBe(3);
        expect(progressEvents[0].processedItems).toBe(0);

        expect(progressEvents[1].status).toBe("in_progress");
        expect(progressEvents[1].processedItems).toBe(1);
        expect(progressEvents[2].processedItems).toBe(2);
        expect(progressEvents[3].processedItems).toBe(3);

        expect(progressEvents[4].status).toBe("completed");
        expect(progressEvents[4].processedItems).toBe(3);
    });

    it("emits no progress events when commandId is absent", async () => {
        await getPagesInfo({ pageIds: ["p1"] });
        const progressEvents = mockEnv.postedMessages.filter(
            (m) => m && m.type === "command_progress",
        );
        expect(progressEvents.length).toBe(0);
    });
});

describe("Phase 2.3: removed-fields sweep", () => {
    it("README has no stale get_document_info / get_page_info references", async () => {
        const fs = await import("node:fs/promises");
        const readme = await fs.readFile("README.md", "utf8");
        expect(readme).not.toMatch(/\bget_document_info\b/);
        expect(readme).not.toMatch(/\bget_page_info\b/);
    });

    it('source has no type: "DOCUMENT" root discriminator', async () => {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        async function walk(dir: string): Promise<string[]> {
            const out: string[] = [];
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.name === "dist" || e.name === "node_modules") continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) out.push(...(await walk(full)));
                else if (e.name.endsWith(".ts") || e.name.endsWith(".html"))
                    out.push(full);
            }
            return out;
        }
        const files = await walk("src");
        const offenders: string[] = [];
        for (const f of files) {
            if (f.endsWith("getPagesInfo.phase2.test.ts")) continue;
            const src = await fs.readFile(f, "utf8");
            if (/type\s*:\s*["']DOCUMENT["']/.test(src))
                offenders.push(f);
        }
        expect(offenders).toEqual([]);
    });

    it("source has no currentPageId / currentPageName / isCurrent (page-context fields)", async () => {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        async function walk(dir: string): Promise<string[]> {
            const out: string[] = [];
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.name === "dist" || e.name === "node_modules") continue;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) out.push(...(await walk(full)));
                else if (e.name.endsWith(".ts") || e.name.endsWith(".html"))
                    out.push(full);
            }
            return out;
        }
        const files = await walk("src");
        const offenders: string[] = [];
        for (const f of files) {
            if (f.endsWith("getPagesInfo.phase2.test.ts")) continue;
            const src = await fs.readFile(f, "utf8");
            const lines = src.split("\n");
            lines.forEach((line, i) => {
                if (/\b(currentPageId|currentPageName|isCurrent)\b/.test(line))
                    offenders.push(`${f}:${i + 1}: ${line.trim()}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});

describe("Phase 2.4: version + changelog", () => {
    it("package.json version is 1.3.0", async () => {
        const fs = await import("node:fs/promises");
        const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
        expect(pkg.version).toBe("1.3.0");
    });

    it("CHANGELOG.md has a [1.3.0] section listing the breaking changes", async () => {
        const fs = await import("node:fs/promises");
        const log = await fs.readFile("CHANGELOG.md", "utf8");
        expect(log).toMatch(/\[1\.3\.0\]/);
        expect(log).toMatch(/get_document_info/);
        expect(log).toMatch(/get_pages_info/);
        expect(log).toMatch(/join_channel/);
        expect(log).toMatch(/editableScopeType/);
    });
});
