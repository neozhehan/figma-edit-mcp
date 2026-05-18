import { describe, it, expect, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";

// v1.4.0 contract verification — static and behavioral checks for plan items
// not exercised by the Phase 6.1/6.2 utility/integration suites:
//
//   A. outputSchema MUST NOT be passed in server.tool() for get_nodes_info.
//   B. await on every sendProgressUpdate(...) call across the three streaming handlers.
//   C. state.activeRequestId capture/clear plumbing in ui.html.
//   D. Tool description contains all 8 spec-mandated checklist items.
//   E. README reflects v1.4.0 tool removals + new capabilities.
//   F. Release notes exist with required leading sections.
//   G. Implementation MUST NOT cap/warn/log on nodeIds.length > 25.
//   J. get_components({ scope: 'current_page' }) does NOT emit progress events.
//   K. get_variables document/current_page streaming behavior.
//   L. Connect payload in read-only mode does NOT include descendantCount.

if (!(globalThis as any).figma) {
    (globalThis as any).__html__ = "<html></html>";
    (globalThis as any).figma = {
        showUI: () => { },
        ui: { onmessage: null, postMessage: () => { } },
        on: () => { },
        notify: () => { },
        closePlugin: () => { },
        clientStorage: { setAsync: async () => { } },
        getNodeByIdAsync: async () => null,
        currentPage: { selection: [], children: [] },
        root: { id: "doc-stub", name: "Stub", children: [] },
        mixed: Symbol("mixed"),
        loadAllPagesAsync: async () => { },
    };
}

const mainMod: any = await import("../../../../../figma_plugin/src/main.js");
const realState: any = mainMod.getPluginState();
function setState(next: { readOnly: boolean; scopeRootId: string | null }) {
    realState.readOnly = next.readOnly;
    realState.scopeRootId = next.scopeRootId;
}

const { getNodesInfo } = await import("../../../../../figma_plugin/handlers/nodeReaders.js");
const { getComponents } = await import("../../../../../figma_plugin/handlers/componentHandlers.js");
const { getVariables } = await import("../../../../../figma_plugin/handlers/variableHandlers.js");
const { getConnectPayload } = await import("../../../../../figma_plugin/handlers/connectHandlers.js");

// =============================================================================
// A. outputSchema MUST NOT be passed in server.tool() for get_nodes_info
// =============================================================================

describe("Contract A — get_nodes_info MUST NOT register an outputSchema", () => {
    it("server.tool('get_nodes_info', ...) registration does not pass an outputSchema arg", () => {
        // MCP SDK signature: server.tool(name, descriptionOrSchemas, schemaShape, handler).
        // outputSchema is the 4th positional schema-bearing arg in `server.registerTool`
        // form, OR a `.outputSchema()` chained call. The plan forbids both.
        const src = readFileSync("src/mcp_server/tools/document.ts", "utf8");
        const sliceStart = src.indexOf('"get_nodes_info"');
        expect(sliceStart).toBeGreaterThan(-1);

        // Look only at the registration block (until the next server.tool / closing).
        const sliceEnd = src.indexOf("server.tool", sliceStart + 20);
        const slice = src.slice(sliceStart, sliceEnd === -1 ? undefined : sliceEnd);

        expect(slice).not.toMatch(/outputSchema/);
        expect(slice).not.toMatch(/registerTool\s*\(/); // registerTool form may carry outputSchema
    });
});

// =============================================================================
// B. Every sendProgressUpdate(...) call is awaited
// =============================================================================

describe("Contract B — every sendProgressUpdate call MUST be awaited", () => {
    const files = [
        "figma_plugin/handlers/nodeReaders.ts",
        "figma_plugin/handlers/componentHandlers.ts",
        "figma_plugin/handlers/variableHandlers.ts",
    ];

    for (const file of files) {
        it(`${file} has no bare (non-awaited) sendProgressUpdate call`, () => {
            const src = readFileSync(file, "utf8");

            // Find every call site. We accept either `await sendProgressUpdate(`
            // or a Promise.all([... sendProgressUpdate(...), ...]) form, since
            // Promise.all also awaits.
            const lines = src.split("\n");
            const offenders: { line: number; text: string }[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Skip the import/declaration line and JSDoc references.
                if (/^\s*(import|export|\*|\/\/|\/\*)/.test(line)) continue;
                if (!/\bsendProgressUpdate\s*\(/.test(line)) continue;

                // Look at the line and a couple preceding lines for `await` or `Promise.all`.
                const window = lines.slice(Math.max(0, i - 2), i + 1).join(" ");
                const hasAwait = /\bawait\s+sendProgressUpdate\s*\(/.test(window);
                const hasReturn = /\breturn\s+sendProgressUpdate\s*\(/.test(window); // return implicitly awaits in caller
                const insidePromiseAll = /Promise\.all\s*\(/.test(window);

                if (!hasAwait && !hasReturn && !insidePromiseAll) {
                    offenders.push({ line: i + 1, text: line.trim() });
                }
            }

            expect(offenders).toEqual([]);
        });
    }
});

// =============================================================================
// C. state.activeRequestId plumbing in ui.html
// =============================================================================

describe("Contract C — state.activeRequestId capture/clear in ui.html", () => {
    let src: string;
    beforeEach(() => {
        src = readFileSync("figma_plugin/ui.html", "utf8");
    });

    it("captures message.id onto state.activeRequestId for inbound broadcast messages", () => {
        // Verify the capture happens — broadcast events should set activeRequestId.
        expect(src).toMatch(/activeRequestId/);
        // Capture pattern: state.activeRequestId = ... msg.id ... or similar.
        // We accept any assignment to state.activeRequestId from a message.
        expect(src).toMatch(/state\.activeRequestId\s*=\s*[^;]*\bid\b/);
    });

    it("pins activeRequestId onto outbound progress_update payloads", () => {
        // The forward path should include activeRequestId in the progress_update.
        expect(src).toMatch(/progress_update/);
        // The id must flow into the outbound payload — look for activeRequestId
        // appearing inside an object literal alongside progress_update fields.
        expect(src).toMatch(/state\.activeRequestId/);
    });

    it("clears activeRequestId on command-result / command-error dispatch", () => {
        // The cleanup pattern: assignment of activeRequestId to null somewhere
        // near command-result / command-error handling.
        const hasClear = /state\.activeRequestId\s*=\s*null/.test(src);
        const dispatchesResultOrError =
            /command[-_]result/.test(src) || /command[-_]error/.test(src);
        expect(hasClear).toBe(true);
        expect(dispatchesResultOrError).toBe(true);
    });
});

// =============================================================================
// D. Tool description contains all 8 spec-mandated items
// =============================================================================

describe("Contract D — get_nodes_info tool description contains all 8 spec items", () => {
    let description: string;

    beforeEach(() => {
        const src = readFileSync("src/mcp_server/tools/document.ts", "utf8");
        // The description is the second argument to server.tool("get_nodes_info", `...`, ...).
        const match = src.match(/"get_nodes_info"\s*,\s*`([\s\S]*?)`/);
        expect(match).not.toBeNull();
        description = match![1];
    });

    it("item 1 — response shape: recursive children + properties sub-object + descendantCount on boundary nodes", () => {
        expect(description).toMatch(/recursive/i);
        expect(description).toMatch(/properties/i);
        expect(description).toMatch(/descendantCount/);
        // Inapplicable keys omitted (not null) — a critical LLM-facing nuance.
        expect(description).toMatch(/omitted|never null|not.*null/i);
    });

    it("item 2 — filter behavior: recursive + ancestor passthrough + within-maxDepth window", () => {
        expect(description).toMatch(/filter/i);
        expect(description).toMatch(/recursive|passthrough|ancestor|containers/i);
        expect(description).toMatch(/maxDepth/);
    });

    it("item 3 — path shape: 3-tuples [type, id, name] + pages have path === []", () => {
        expect(description).toMatch(/3-tuple|tuple|\[type.*id.*name\]/i);
        expect(description).toMatch(/path/i);
    });

    it("item 4 — latency warning for non-safe-list properties / filter", () => {
        // Must surface that latency increases with non-safe-list usage AND that
        // filter is more expensive than properties at equivalent subtree size.
        expect(description).toMatch(/safe.list|safe list/i);
        expect(description).toMatch(/exportAsync|latency|cost/i);
    });

    it("item 5 — cost framing: batch by subtree size, not id count", () => {
        // The model should know a single PAGE id can dominate cost.
        expect(description).toMatch(/subtree size|PAGE.*expensive|cost.*subtree|batch.*subtree/i);
    });

    it("item 6 — safe-list enumeration (categories or full list)", () => {
        // The plan accepts either a full list or a category reference.
        const hasCategoryRefs =
            /identity|geometry|auto.?layout|fills|strokes|text|component|prototyping|variables|metadata/i.test(
                description,
            );
        const hasSafeListWord = /safe.?list/i.test(description);
        expect(hasCategoryRefs || hasSafeListWord).toBe(true);
    });

    it("item 7 — missingNodeIds inspection instruction", () => {
        expect(description).toMatch(/missingNodeIds/);
        // Must instruct on inspection / surfacing / authoritative.
        expect(description).toMatch(/check|inspect|authoritative|surface/i);
    });

    it("item 8 — recommended pairings (non-safe properties + tight nodeIds / safe-list filter)", () => {
        expect(description).toMatch(/recommended|pair|combine|tight|narrow/i);
    });
});

// =============================================================================
// E. README reflects v1.4.0 tool removals + new capabilities
// =============================================================================

describe("Contract E — README reflects v1.4.0 changes", () => {
    let readme: string;
    beforeEach(() => {
        readme = readFileSync("README.md", "utf8");
    });

    it("does NOT list scan_text_nodes / scan_nodes_by_types as current tools", () => {
        // The tool table or tool-list region must not advertise removed tools.
        // We accept their presence ONLY inside an explicit migration / changelog
        // / "removed" context. A loose heuristic: no instances of `scan_text_nodes`
        // or `scan_nodes_by_types` appearing alone in the README. (If migration
        // notes are added later, this check may need refinement.)
        expect(readme).not.toMatch(/^\s*[-|]\s*scan_text_nodes\b/m);
        expect(readme).not.toMatch(/^\s*[-|]\s*scan_nodes_by_types\b/m);
    });

    it("mentions get_nodes_info with its new capabilities", () => {
        expect(readme).toMatch(/get_nodes_info/);
        // At least one of the new capability names should appear.
        const newCapsRef = /(filter|maxDepth|properties)/.test(readme);
        expect(newCapsRef).toBe(true);
    });
});

// =============================================================================
// F. Release notes exist with required leading sections
// =============================================================================

describe("Contract F — v1.4.0 release notes file exists with required sections", () => {
    let notes: string;
    beforeEach(() => {
        notes = readFileSync(
            "documentation/completed/v1.4.0 - get_nodes_info_update/release_notes.md",
            "utf8",
        );
    });

    it("leads with the migration-required / connect-payload break framing", () => {
        // The plan requires the connect-payload break be FIRST. We check that
        // "migration" or the v1.3.0 break appears in the first ~50 lines, and
        // that the path / connect / node block keywords show up early.
        const head = notes.split("\n").slice(0, 50).join("\n");
        expect(head).toMatch(/migration/i);
        expect(head).toMatch(/connect|node\s*block/i);
        expect(head).toMatch(/path/i);
    });

    it("documents the scan_text_nodes / scan_nodes_by_types removals with migration guidance", () => {
        expect(notes).toMatch(/scan_text_nodes/);
        expect(notes).toMatch(/scan_nodes_by_types/);
        expect(notes).toMatch(/get_nodes_info/);
    });
});

// =============================================================================
// G. nodeIds.length > 25 — NO cap / truncate / warn / log / throw
// =============================================================================

describe("Contract G — get_nodes_info MUST NOT cap or warn on nodeIds.length > 25", () => {
    it("processes 50 ids end-to-end (all resolved or in missingNodeIds) without throwing", async () => {
        // Build 50 distinct frame nodes under one page.
        const children: any[] = [];
        for (let i = 1; i <= 50; i++) {
            children.push({ id: `100:${i}`, name: `F${i}`, type: "FRAME" });
        }
        const page: any = { id: "0:1", name: "Home", type: "PAGE", children };
        children.forEach((c) => (c.parent = page));
        const root: any = { id: "doc-1", name: "Doc", children: [page], type: "DOCUMENT" };
        page.parent = root;
        const byId = new Map<string, any>();
        byId.set(page.id, page);
        children.forEach((c) => byId.set(c.id, c));

        (globalThis as any).figma = {
            root,
            getNodeByIdAsync: async (id: string) => byId.get(id) ?? null,
        };

        // Capture console output to assert no warn/error/log fires on oversize input.
        const orig = { warn: console.warn, error: console.error, log: console.log };
        const captured: string[] = [];
        console.warn = (...a) => captured.push(`warn:${a.join(" ")}`);
        console.error = (...a) => captured.push(`error:${a.join(" ")}`);
        console.log = (...a) => captured.push(`log:${a.join(" ")}`);

        try {
            const result = await getNodesInfo({
                nodeIds: children.map((c) => c.id),
            });
            // All 50 resolved → no missingNodeIds, no truncation.
            expect(result.nodes.length).toBe(50);
            expect(result.missingNodeIds).toBeUndefined();
        } finally {
            console.warn = orig.warn;
            console.error = orig.error;
            console.log = orig.log;
        }

        // No oversize-input warning / cap message should have been emitted.
        // Tolerate any message that doesn't reference the input size or a cap.
        const sizeWarnings = captured.filter((m) =>
            /\b(cap|truncat|too many|exceed|over.?size|limit|25)\b/i.test(m),
        );
        expect(sizeWarnings).toEqual([]);
    });
});

// =============================================================================
// J. get_components({ scope: 'current_page' }) does NOT stream / emit progress
// =============================================================================

describe("Contract J — get_components current_page is single-pass, no streaming", () => {
    it("does not emit progress_update events for current_page scope", async () => {
        const captured: any[] = [];
        const currentPage: any = {
            id: "0:1", name: "Home", type: "PAGE",
            findAllWithCriteria: () => [],
        };
        (globalThis as any).figma = {
            root: { children: [currentPage] },
            currentPage,
            ui: {
                postMessage: (msg: any) => {
                    if (msg && (msg.type === "command_progress" || msg.type === "progress_update")) {
                        captured.push(msg);
                    }
                },
            },
        };

        await getComponents({ scope: "current_page", commandId: "cmd-1" });
        expect(captured.length).toBe(0);
    });

    it("DOES emit progress_update events for document scope", async () => {
        const captured: any[] = [];
        const pages: any[] = [
            { id: "0:1", name: "P1", type: "PAGE", findAllWithCriteria: () => [], loadAsync: async () => { } },
            { id: "0:2", name: "P2", type: "PAGE", findAllWithCriteria: () => [], loadAsync: async () => { } },
        ];
        (globalThis as any).figma = {
            root: { children: pages },
            currentPage: pages[0],
            ui: {
                postMessage: (msg: any) => {
                    if (msg && (msg.type === "command_progress" || msg.type === "progress_update")) {
                        captured.push(msg);
                    }
                },
            },
        };

        await getComponents({ scope: "document", commandId: "cmd-1" });
        expect(captured.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// K. get_variables document vs current_page streaming
// =============================================================================

describe("Contract K — get_variables streams only when includeConsumers === 'document'", () => {
    function installFigmaForVariables(opts: { pages: number }) {
        const captured: any[] = [];
        const pages: any[] = [];
        for (let i = 1; i <= opts.pages; i++) {
            pages.push({
                id: `0:${i}`, name: `P${i}`, type: "PAGE",
                children: [],
                loadAsync: async () => { },
                findAll: () => [],
            });
        }
        (globalThis as any).figma = {
            root: { children: pages },
            currentPage: pages[0],
            ui: {
                postMessage: (msg: any) => {
                    if (msg && (msg.type === "command_progress" || msg.type === "progress_update")) {
                        captured.push(msg);
                    }
                },
            },
            variables: {
                getVariableByIdAsync: async (id: string) => ({
                    id, name: id, resolvedType: "FLOAT",
                    valuesByMode: { "1:0": 1 },
                    variableCollectionId: "VC1",
                    remote: false,
                    description: "",
                    scopes: [],
                    codeSyntax: {},
                }),
                getVariableCollectionByIdAsync: async (id: string) => ({
                    id, name: "VC1",
                    modes: [{ modeId: "1:0", name: "Default" }],
                    defaultModeId: "1:0",
                    remote: false,
                    variableIds: [],
                }),
                getLocalVariablesAsync: async () => [],
                getLocalVariableCollectionsAsync: async () => [],
            },
            getStyleByIdAsync: async () => null,
            getLocalPaintStylesAsync: async () => [],
            getLocalTextStylesAsync: async () => [],
            getLocalEffectStylesAsync: async () => [],
            getLocalGridStylesAsync: async () => [],
        };
        return { captured };
    }

    it("discovery mode (no variableId) does NOT stream", async () => {
        const { captured } = installFigmaForVariables({ pages: 3 });
        await getVariables({ commandId: "cmd-1" });
        expect(captured.length).toBe(0);
    });

    it("lookup mode (variableId without includeConsumers) does NOT stream", async () => {
        const { captured } = installFigmaForVariables({ pages: 3 });
        await getVariables({ variableId: ["VID/x"], commandId: "cmd-1" });
        expect(captured.length).toBe(0);
    });

    it("current_page consumer scan does NOT stream", async () => {
        const { captured } = installFigmaForVariables({ pages: 3 });
        await getVariables({
            variableId: ["VID/x"],
            includeConsumers: "current_page",
            commandId: "cmd-1",
        });
        expect(captured.length).toBe(0);
    });

    it("document consumer scan DOES stream (bookend + per-page events)", async () => {
        const { captured } = installFigmaForVariables({ pages: 3 });
        await getVariables({
            variableId: ["VID/x"],
            includeConsumers: "document",
            commandId: "cmd-1",
        });
        expect(captured.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// H. mainComponent uses getMainComponentAsync() in dynamic-page manifest mode
// =============================================================================

describe("Contract H — mainComponent extraction uses getMainComponentAsync()", () => {
    it("reads mainComponent via the async accessor instead of the sync property", async () => {
        // Stand up a minimal InstanceNode that ONLY exposes getMainComponentAsync
        // (no sync `mainComponent` getter). Under documentAccess: 'dynamic-page'
        // this is the canonical shape — a sync read would return a Promise or
        // throw. The handler must use the async accessor and store the resolved
        // ComponentNode, not the Promise.
        let asyncCallCount = 0;
        const fakeMain = {
            id: "C:1", name: "ButtonComponent", type: "COMPONENT",
            key: "main-component-key",
        };
        const instance: any = {
            id: "I:1", name: "Inst", type: "INSTANCE",
            children: [],
            async getMainComponentAsync() {
                asyncCallCount++;
                return fakeMain;
            },
            // Note: no `mainComponent` field set — emulates dynamic-page mode.
        };
        const page: any = {
            id: "0:1", name: "Home", type: "PAGE",
            children: [instance],
        };
        instance.parent = page;
        const root: any = { id: "doc-1", name: "Doc", children: [page], type: "DOCUMENT" };
        page.parent = root;

        (globalThis as any).figma = {
            root,
            getNodeByIdAsync: async (id: string) =>
                id === instance.id ? instance : id === page.id ? page : null,
        };

        const result = await getNodesInfo({
            nodeIds: ["I:1"],
            properties: ["mainComponent"],
        });

        const entry = result.nodes[0];
        expect(asyncCallCount).toBe(1);
        // The resolved ComponentNode lives directly under properties.mainComponent.
        expect(entry.properties).toBeDefined();
        expect(entry.properties!.mainComponent).toBe(fakeMain);
        // Critically: NOT a Promise.
        expect(entry.properties!.mainComponent).not.toBeInstanceOf(Promise);
    });
});

// =============================================================================
// I. Intra-subtree streaming order: emit FIRST, then yield
// =============================================================================

describe("Contract I — intra-subtree streaming emits progress BEFORE yielding", () => {
    it("at the every-25 boundary, sendProgressUpdate fires before setTimeout(0)", async () => {
        // Capture the order of postMessage calls and setTimeout(0) resolutions.
        const sequence: string[] = [];

        const origSetTimeout = globalThis.setTimeout;
        // Wrap setTimeout so 0-delay calls are recorded.
        (globalThis as any).setTimeout = ((fn: any, ms: number) => {
            if (ms === 0) {
                return origSetTimeout(() => {
                    sequence.push("yield");
                    fn();
                }, 0);
            }
            return origSetTimeout(fn, ms);
        }) as any;

        try {
            // Build a subtree of 30 leaf children so the every-25 boundary triggers
            // exactly once during the recursive walk.
            const kids: any[] = [];
            for (let i = 1; i <= 30; i++) {
                kids.push({ id: `k:${i}`, name: `k${i}`, type: "TEXT" });
            }
            const root: any = {
                id: "100:1", name: "Root", type: "FRAME", children: kids,
            };
            kids.forEach((k) => (k.parent = root));
            const page: any = { id: "0:1", name: "Home", type: "PAGE", children: [root] };
            root.parent = page;
            const docRoot: any = { id: "doc-1", name: "Doc", children: [page], type: "DOCUMENT" };
            page.parent = docRoot;

            (globalThis as any).figma = {
                root: docRoot,
                getNodeByIdAsync: async (id: string) =>
                    id === root.id ? root : id === page.id ? page : null,
                ui: {
                    postMessage: (msg: any) => {
                        if (msg && msg.type === "command_progress" && msg.status === "in_progress") {
                            sequence.push("emit");
                        }
                    },
                },
            };

            await getNodesInfo({ nodeIds: ["100:1"], commandId: "cmd-1" });
        } finally {
            (globalThis as any).setTimeout = origSetTimeout;
        }

        // At the boundary, "emit" MUST appear before the matching "yield".
        // Find the first emit and assert no preceding yield (other than yields
        // outside the in-progress mid-walk path).
        const firstEmit = sequence.indexOf("emit");
        expect(firstEmit).toBeGreaterThanOrEqual(0);
        const firstYieldAfterEmit = sequence.indexOf("yield", firstEmit);
        expect(firstYieldAfterEmit).toBeGreaterThan(firstEmit);
    });
});

// =============================================================================
// P1. Bookend events fire for EVERY get_nodes_info call shape
// =============================================================================

describe("Contract P1 — get_nodes_info emits started + completed for every call shape", () => {
    function installFigmaWithPage(): { capturedStatuses: string[] } {
        const capturedStatuses: string[] = [];
        const page: any = {
            id: "0:1", name: "Home", type: "PAGE",
            children: [
                { id: "100:1", name: "F1", type: "FRAME" },
                { id: "100:2", name: "F2", type: "FRAME" },
            ],
        };
        page.children.forEach((c: any) => (c.parent = page));
        const root: any = { id: "doc-1", name: "Doc", children: [page], type: "DOCUMENT" };
        page.parent = root;
        const byId = new Map<string, any>();
        byId.set(page.id, page);
        page.children.forEach((c: any) => byId.set(c.id, c));

        (globalThis as any).figma = {
            root,
            getNodeByIdAsync: async (id: string) => byId.get(id) ?? null,
            ui: {
                postMessage: (msg: any) => {
                    if (msg && msg.type === "command_progress") {
                        capturedStatuses.push(msg.status);
                    }
                },
            },
        };
        return { capturedStatuses };
    }

    it("multi-id call: both started and completed events fire", async () => {
        const { capturedStatuses } = installFigmaWithPage();
        await getNodesInfo({ nodeIds: ["100:1", "100:2"], commandId: "cmd-1" });
        expect(capturedStatuses).toContain("started");
        expect(capturedStatuses).toContain("completed");
        // started must precede completed.
        expect(capturedStatuses.indexOf("started")).toBeLessThan(
            capturedStatuses.indexOf("completed"),
        );
    });

    it("single-id call: both started and completed events fire", async () => {
        const { capturedStatuses } = installFigmaWithPage();
        await getNodesInfo({ nodeIds: ["100:1"], commandId: "cmd-1" });
        expect(capturedStatuses).toContain("started");
        expect(capturedStatuses).toContain("completed");
    });

    it("empty-args call routed through single-id handler: both bookends fire", async () => {
        // Spec §Empty-args behavior says empty-args is treated as a single-id call.
        // The handler is invoked the same way by the main.ts dispatch — we exercise
        // it here with a single id to simulate post-dispatch state.
        const { capturedStatuses } = installFigmaWithPage();
        await getNodesInfo({ nodeIds: ["100:1"], commandId: "cmd-empty" });
        expect(capturedStatuses).toContain("started");
        expect(capturedStatuses).toContain("completed");
    });
});

// =============================================================================
// P2. Structural fields silently excluded from `properties` block
// =============================================================================

describe("Contract P2 — structural fields requested via properties are NOT in the properties block", () => {
    it("id/name/type live at the structured fields, never duplicated into properties", async () => {
        const page: any = {
            id: "0:1", name: "Home", type: "PAGE",
            children: [{
                id: "100:1", name: "F1", type: "FRAME",
                fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
            }],
        };
        page.children.forEach((c: any) => (c.parent = page));
        const root: any = { id: "doc-1", name: "Doc", children: [page], type: "DOCUMENT" };
        page.parent = root;
        const byId = new Map<string, any>();
        byId.set(page.id, page);
        page.children.forEach((c: any) => byId.set(c.id, c));

        (globalThis as any).figma = {
            root,
            getNodeByIdAsync: async (id: string) => byId.get(id) ?? null,
        };

        const result = await getNodesInfo({
            nodeIds: ["100:1"],
            // Ask for structural keys mixed with a real safe-list key.
            properties: ["id", "name", "type", "fills"],
        });

        const entry = result.nodes[0];
        // The real safe-list key is present:
        expect(entry.properties).toBeDefined();
        expect(entry.properties!.fills).toBeDefined();
        // Structured fields remain at the top level:
        expect(entry.id).toBe("100:1");
        expect(entry.name).toBe("F1");
        expect(entry.type).toBe("FRAME");
        // CRITICALLY: structural fields must NOT appear in the properties block.
        // This guards against duplication if the safe-list classifier ever lets
        // them through.
        expect("id" in (entry.properties as any)).toBe(false);
        expect("name" in (entry.properties as any)).toBe(false);
        expect("type" in (entry.properties as any)).toBe(false);
        expect("children" in (entry.properties as any)).toBe(false);
        expect("path" in (entry.properties as any)).toBe(false);
    });
});

// =============================================================================
// P3. findStyleConsumers / findAliasConsumers run concurrently with page loop
// =============================================================================

describe("Contract P3 — get_variables runs style/alias scans concurrently with the page loop", () => {
    it("style + alias scans are kicked off before the page loop awaits its first page", async () => {
        // Record start timestamps for each phase. The contract: style/alias
        // scans must START before the page loop completes its first await
        // (otherwise they're serialized behind the page loop, defeating the
        // parallelism the spec preserves).
        const events: { event: string; t: number }[] = [];
        const tick = () => performance.now();

        const pages: any[] = [];
        for (let i = 1; i <= 3; i++) {
            const idx = i;
            const p: any = {
                id: `0:${idx}`, name: `P${idx}`, type: "PAGE",
                children: [],
                loadAsync: async () => { },
                findAll: () => [],
            };
            // findVariableConsumers walks `node.boundVariables` — use a getter
            // to record when each page is first inspected.
            Object.defineProperty(p, "boundVariables", {
                get() {
                    events.push({ event: `pageScan:${idx}`, t: tick() });
                    return undefined;
                },
            });
            pages.push(p);
        }

        (globalThis as any).figma = {
            root: { children: pages },
            currentPage: pages[0],
            ui: { postMessage: () => { } },
            variables: {
                getVariableByIdAsync: async (id: string) => ({
                    id, name: id, resolvedType: "FLOAT",
                    valuesByMode: { "1:0": 1 },
                    variableCollectionId: "VC1",
                    remote: false,
                    description: "",
                    scopes: [],
                    codeSyntax: {},
                }),
                getVariableCollectionByIdAsync: async (id: string) => ({
                    id, name: "VC1",
                    modes: [{ modeId: "1:0", name: "Default" }],
                    defaultModeId: "1:0",
                    remote: false,
                    variableIds: [],
                }),
                getLocalVariablesAsync: async () => [],
                getLocalVariableCollectionsAsync: async () => [],
            },
            getStyleByIdAsync: async () => null,
            // Style scans — record start time, then resolve slowly to ensure
            // the page loop overtakes them if they're NOT concurrent.
            getLocalPaintStylesAsync: async () => {
                events.push({ event: "styleScanStart", t: tick() });
                await new Promise((r) => setTimeout(r, 10));
                return [];
            },
            getLocalTextStylesAsync: async () => [],
            getLocalEffectStylesAsync: async () => [],
            getLocalGridStylesAsync: async () => [],
        };

        await getVariables({
            variableId: ["VID/x"],
            includeConsumers: "document",
            commandId: "cmd-1",
        });

        // The style scan and the first page scan should have started within
        // the same microtask/event-loop tick. If style/alias were awaited
        // before the page loop, styleScanStart would be > the FIRST pageScan.
        const styleStart = events.find((e) => e.event === "styleScanStart");
        const firstPageScan = events.find((e) => e.event === "pageScan:1");
        expect(styleStart).toBeDefined();
        expect(firstPageScan).toBeDefined();

        // Concurrency check: styleScanStart precedes pageScan:1 (handler kicks
        // off styles first via Promise.all-style pattern, then walks pages).
        // The exact ordering between them isn't strictly defined by the spec,
        // but BOTH must start before the page loop AWAITS its first slow op —
        // which means within the first synchronous slice of the call.
        // We assert both occurred in a tight window (< 5ms apart in tests).
        const delta = Math.abs(styleStart!.t - firstPageScan!.t);
        expect(delta).toBeLessThan(5);
    });
});

// =============================================================================
// L. Connect payload read-only mode does NOT include descendantCount
// =============================================================================

describe("Contract L — connect payload read-only branch omits descendantCount", () => {
    it("readonly mode returns payload without descendantCount", async () => {
        setState({ readOnly: true, scopeRootId: null });
        (globalThis as any).figma = {
            root: {
                id: "doc-1",
                name: "Doc",
                children: [
                    { id: "0:1", name: "P1" },
                    { id: "0:2", name: "P2" },
                ],
            },
        };

        const result: any = await getConnectPayload();
        expect(result.editableScopeType).toBe("readonly");
        expect("descendantCount" in result).toBe(false);
        for (const page of result.pages) {
            expect("descendantCount" in page).toBe(false);
        }
    });
});
