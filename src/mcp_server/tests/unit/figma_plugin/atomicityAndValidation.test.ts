import { describe, it, expect, beforeEach } from "bun:test";

const gateNodeMap = new Map<string, any>();
const gatePendingPromises = new Map<string | number, (msg: any) => void>();

const gateFigma = {
    showUI: () => { },
    ui: {
        onmessage: null as any,
        postMessage: (msg: any) => {
            const resolver = gatePendingPromises.get(msg.id);
            if (resolver) {
                resolver(msg);
                gatePendingPromises.delete(msg.id);
            }
        },
    },
    on: () => { },
    notify: () => { },
    closePlugin: () => { },
    clientStorage: { setAsync: async () => { } },
    getNodeByIdAsync: async (id: string) => gateNodeMap.get(id) || null,
    root: { id: "doc", name: "Doc", children: [] as any[] },
    mixed: Symbol("mixed"),
    loadFontAsync: async () => {},
};

(globalThis as any).__html__ = "<html></html>";
(globalThis as any).figma = gateFigma;

// Import main module and handlers
const mainMod: any = await import("../../../../../figma_plugin/src/main.js?scope=atomicity");
const pluginState = mainMod.getPluginState();
const gateOnMessage = gateFigma.ui.onmessage as (msg: any) => Promise<void> | void;

const { setMultipleTextContents } = await import("../../../../../figma_plugin/handlers/textHandlers.js");
const { setMultipleAnnotations } = await import("../../../../../figma_plugin/handlers/annotationHandlers.js");
const { setInstanceOverrides } = await import("../../../../../figma_plugin/handlers/componentHandlers.js");
const { deleteMultipleNodes } = await import("../../../../../figma_plugin/handlers/nodeModifiers.js");

// Set up plugin state
pluginState.allowEditNode = "node";
pluginState.scopeRootId = "scope-root";

type FakeNode = {
    id: string;
    name: string;
    type: string;
    parent?: FakeNode;
    children?: FakeNode[];
    characters?: string;
    annotations?: any[];
    swapComponent?: (c: any) => void;
    setProperties?: (p: any) => void;
    fontName?: any;
    remove?: () => void;
};

function attachParents(root: FakeNode): FakeNode {
    if (root.children) {
        for (const child of root.children) {
            child.parent = root;
            attachParents(child);
        }
    }
    return root;
}

function installFigma(nodes: FakeNode[]) {
    gateNodeMap.clear();
    const index = (n: FakeNode) => {
        gateNodeMap.set(n.id, n);
        n.children?.forEach(index);
    };
    nodes.forEach(index);
    gateFigma.root.children = nodes;
    return { byId: gateNodeMap };
}

describe("Phase 4: Atomicity & Pre-Validation in dispatch", () => {
    beforeEach(() => {
        pluginState.allowEditNode = "node";
        pluginState.scopeRootId = "scope-root";
    });

    it("throws explicit 'Node X not found' for stale IDs", async () => {
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [{ id: "100:1", name: "A", type: "TEXT", characters: "original", fontName: { family: "Inter", style: "Regular" } }]
        });
        installFigma([root]);

        // text_set_content with a nonexistent node ID
        const msg = {
            type: "execute-command",
            command: "text_set_content",
            id: "cmd-1",
            params: {
                nodeId: "scope-root",
                text: [
                    { nodeId: "100:1", nodeName: "A", text: "newA" },
                    { nodeId: "ghost-id", nodeName: "B", text: "newB" }
                ]
            }
        };

        const resultPromise = new Promise<any>((resolve) => {
            gatePendingPromises.set(msg.id, resolve);
        });

        await gateOnMessage!(msg);
        const res = await resultPromise;

        expect(res.type).toBe("command-error");
        expect(res.error.message).toBe("Node ghost-id not found");
    });

    it("pre-validates types: text_set_content rejects non-TEXT targets", async () => {
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "TEXT", characters: "original", fontName: { family: "Inter", style: "Regular" } },
                { id: "100:2", name: "B", type: "FRAME" } // Not a TEXT node
            ]
        });
        installFigma([root]);

        const msg = {
            type: "execute-command",
            command: "text_set_content",
            id: "cmd-2",
            params: {
                nodeId: "scope-root",
                text: [
                    { nodeId: "100:1", nodeName: "A", text: "newA" },
                    { nodeId: "100:2", nodeName: "B", text: "newB" }
                ]
            }
        };

        const resultPromise = new Promise<any>((resolve) => {
            gatePendingPromises.set(msg.id, resolve);
        });

        await gateOnMessage!(msg);
        const res = await resultPromise;

        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Node is not a text node");
    });

    it("pre-validates types: annotation_set rejects unsupported targets", async () => {
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "TEXT", annotations: [] }
            ]
        });
        installFigma([root]);

        const targetNode = root.children![0];
        delete (targetNode as any).annotations; // Remove annotations support

        const msg = {
            type: "execute-command",
            command: "annotation_set",
            id: "cmd-3",
            params: {
                annotations: [
                    { nodeId: "100:1", nodeName: "A", labelMarkdown: "test" }
                ]
            }
        };

        const resultPromise = new Promise<any>((resolve) => {
            gatePendingPromises.set(msg.id, resolve);
        });

        await gateOnMessage!(msg);
        const res = await resultPromise;

        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("does not support annotations");
    });

    it("pre-validates names: annotation_set refuses a mismatched nodeName with zero mutation", async () => {
        // G2 applies to every batch item. Phase 7 reauthored this tool's item
        // schema, so the name gate is asserted at the layer that enforces it —
        // the dispatcher — not only through the handler tests that bypass it.
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "TEXT", annotations: [] },
                { id: "100:2", name: "B", type: "TEXT", annotations: [] }
            ]
        });
        installFigma([root]);

        const msg = {
            type: "execute-command",
            command: "annotation_set",
            id: "cmd-3b",
            params: {
                annotations: [
                    { nodeId: "100:1", nodeName: "A", labelMarkdown: "would apply first" },
                    { nodeId: "100:2", nodeName: "StaleName", labelMarkdown: "mismatched" }
                ]
            }
        };

        const resultPromise = new Promise<any>((resolve) => {
            gatePendingPromises.set(msg.id, resolve);
        });

        await gateOnMessage!(msg);
        const res = await resultPromise;

        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("nodeName does not match");
        // Prevalidation is batch-wide: the first, valid item must not have run.
        expect((root.children![0] as any).annotations).toEqual([]);
        expect((root.children![1] as any).annotations).toEqual([]);
    });

    it("pre-validates types: instance_set_overrides rejects non-INSTANCE targets/source", async () => {
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "FRAME" }, // Not an INSTANCE
                { id: "100:2", name: "B", type: "INSTANCE" }
            ]
        });
        installFigma([root]);

        const msg = {
            type: "execute-command",
            command: "instance_set_overrides",
            id: "cmd-4",
            params: {
                sourceInstanceId: "100:2",
                targetNodes: [
                    { nodeId: "100:1", nodeName: "A" }
                ]
            }
        };

        const resultPromise = new Promise<any>((resolve) => {
            gatePendingPromises.set(msg.id, resolve);
        });

        await gateOnMessage!(msg);
        const res = await resultPromise;

        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Target is not an instance node");
    });
});

describe("Phase 4: Stop on first failure in batch handlers", () => {
    // Restore this file's clean figma — other test files in the same process
    // can leave globalThis.figma with a throwing loadFontAsync, which would
    // spuriously trigger the Q24 font fallback here.
    beforeEach(() => {
        (globalThis as any).figma = gateFigma;
        gateFigma.loadFontAsync = async () => {};
        gateFigma.getNodeByIdAsync = async (id: string) => gateNodeMap.get(id) || null;
        pluginState.allowEditNode = "node";
        pluginState.scopeRootId = "scope-root";
    });

    it("setMultipleTextContents stops on the first error and returns standardized report", async () => {
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "TEXT", characters: "originalA", fontName: { family: "Inter", style: "Regular" } },
                { id: "100:2", name: "B", type: "TEXT", characters: "originalB", fontName: { family: "Inter", style: "Regular" } }
            ]
        });
        const { byId } = installFigma([root]);

        // Mock setter of characters on 100:2 to throw
        const nodeB = byId.get("100:2")!;
        let bVal = "originalB";
        Object.defineProperty(nodeB, "characters", {
            get: () => bVal,
            set: (val) => {
                bVal = val;
                throw new Error("Mock write lock error");
            }
        });

        const result = await setMultipleTextContents({
            text: [
                { nodeId: "100:1", characters: "newA" },
                { nodeId: "100:2", characters: "newB" },
                { nodeId: "100:3", characters: "newC" }
            ]
        });

        // 100:1 succeeds, 100:2 fails, 100:3 is skipped.
        expect(result.success).toBe(false);
        expect(result.status).toBe("partial_success");
        expect(result.requestedCount).toBe(3);
        expect(result.succeededCount).toBe(1);
        expect(result.failedCount).toBe(1);
        expect(result.skippedCount).toBe(1);
        // Q26: legacy replacementsApplied/replacementsFailed dropped.
        expect(result.replacementsApplied).toBeUndefined();
        expect(result.replacementsFailed).toBeUndefined();

        expect(result.results).toHaveLength(3);
        expect(result.results[0]).toEqual({
            success: true,
            status: "success",
            nodeId: "100:1",
            originalText: "originalA",
            translatedText: "newA"
        });
        expect(result.results[1].success).toBe(false);
        expect(result.results[1].status).toBe("failed");
        // Q24: the real font (Inter) loads fine, so NO fallback occurs — the
        // character assignment fails cleanly. A clean failure carries no flag
        // and no fabricated before-value.
        expect(result.results[1].partialMutation).toBeUndefined();
        expect(result.results[1].before).toBeUndefined();
        // Robust to bun's cross-file mock.module of setCharacters (createText.test):
        // real impl surfaces "Failed to set characters"; the mock surfaces the raw
        // setter throw. Either way it is a clean (no-fallback) failure.
        expect(result.results[1].error).toMatch(/Failed to set characters|Mock write lock error/);

        expect(result.results[2].success).toBe(false);
        expect(result.results[2].status).toBe("skipped");
        expect(result.results[2].error).toContain("Skipped due to previous failure");
        
        // Confirm first succeeded:
        expect(byId.get("100:1")!.characters).toBe("newA");
    });

    it("setMultipleAnnotations stops on first failure and returns report", async () => {
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "TEXT", annotations: [] },
                { id: "100:2", name: "B", type: "TEXT", annotations: [] }
            ]
        });
        const { byId } = installFigma([root]);

        const nodeB = byId.get("100:2")!;
        Object.defineProperty(nodeB, "annotations", {
            get: () => [],
            set: () => {
                throw new Error("Mock write error");
            }
        });

        const result = await setMultipleAnnotations({
            nodeId: "scope-root",
            annotations: [
                { nodeId: "100:1", labelMarkdown: "annA" },
                { nodeId: "100:2", labelMarkdown: "annB" },
                { nodeId: "100:3", labelMarkdown: "annC" }
            ]
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe("partial_success");
        // Q26: legacy annotationsApplied/annotationsFailed dropped.
        expect(result.annotationsApplied).toBeUndefined();
        expect(result.annotationsFailed).toBeUndefined();
        expect(result.succeededCount).toBe(1);
        expect(result.failedCount).toBe(1);
        expect(result.skippedCount).toBe(1);
        expect(result.requestedCount).toBe(3);
        
        expect(result.results).toHaveLength(3);
        expect(result.results[0].success).toBe(true);
        expect(result.results[0].status).toBe("success");
        expect(result.results[0].beforeCount).toBe(0);
        expect(result.results[0].afterCount).toBe(1);
        expect(result.results[1].success).toBe(false);
        expect(result.results[1].status).toBe("failed");
        expect(result.results[1].beforeCount).toBe(0);
        expect(result.results[1].afterCount).toBe(0);
        expect(result.results[2].success).toBe(false);
        expect(result.results[2].status).toBe("skipped");
        expect(result.results[2].beforeCount).toBe(0);
        expect(result.results[2].afterCount).toBe(0);
    });

    it("deleteMultipleNodes is resilient and does not stop on failure", async () => {
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "FRAME", remove: () => {} },
                { id: "100:2", name: "B", type: "FRAME", remove: () => { throw new Error("Mock delete lock"); } },
                { id: "100:3", name: "C", type: "FRAME", remove: () => {} }
            ]
        });
        installFigma([root]);

        const result = await deleteMultipleNodes({
            nodeIds: ["100:1", "100:2", "100:3"]
        });

        // node_delete returns partial success status and success: false because of failed deletion
        expect(result.success).toBe(false);
        expect(result.status).toBe("partial_success");
        // Q26: legacy nodesDeleted/nodesFailed dropped.
        expect(result.nodesDeleted).toBeUndefined();
        expect(result.nodesFailed).toBeUndefined();
        expect(result.succeededCount).toBe(2);
        expect(result.failedCount).toBe(1);
        expect(result.requestedCount).toBe(3);
        expect(result.skippedCount).toBe(0);
        
        expect(result.results).toHaveLength(3);
        expect(result.results[0].status).toBe("success");
        expect(result.results[1].status).toBe("failed");
        expect(result.results[2].status).toBe("success");
    });

    it("setInstanceOverrides stops on the first failure and returns a standardized report (no rollback)", async () => {
        // P6-1: the handler reads the main component via getMainComponentAsync
        // (dynamic-page); the sync `mainComponent` getter is not used.
        const t1: any = { id: "t1", name: "T1", getMainComponentAsync: async () => ({ id: "mc" }), swapComponent: () => {} };
        const t2: any = { id: "t2", name: "T2", getMainComponentAsync: async () => ({ id: "mc" }), swapComponent: () => { throw new Error("swap fail"); } };
        const t3: any = { id: "t3", name: "T3", getMainComponentAsync: async () => ({ id: "mc" }), swapComponent: () => {} };
        const sourceResult = { sourceInstance: { id: "src" }, mainComponent: { id: "main" }, overrides: [] };

        const result: any = await setInstanceOverrides([t1, t2, t3], sourceResult);

        // t1 succeeds, t2 fails → stop. t3 is skipped.
        expect(result.success).toBe(false);
        expect(result.status).toBe("partial_success");
        expect(result.succeededCount).toBe(1);
        expect(result.failedCount).toBe(1);
        expect(result.skippedCount).toBe(1);
        expect(result.requestedCount).toBe(3);
        
        expect(result.results).toHaveLength(3);
        expect(result.results[0].success).toBe(true);
        expect(result.results[0].status).toBe("success");
        expect(result.results[1].success).toBe(false);
        expect(result.results[1].status).toBe("failed");
        expect(result.results[2].success).toBe(false);
        expect(result.results[2].status).toBe("skipped");
    });

    it("setInstanceOverrides reports partialMutation when swap succeeds but overrides fail", async () => {
        const t1: any = {
            id: "t1",
            name: "T1",
            getMainComponentAsync: async () => ({ id: "original-component" }),
            swapComponent: () => {
                // Swap component succeeds
            }
        };
        const sourceResult = { 
            sourceInstance: { id: "src" }, 
            mainComponent: { id: "new-component" }, 
            overrides: [
                {
                    id: "src/child",
                    overriddenFields: ["characters"],
                }
            ] 
        };

        const originalGetNode = gateFigma.getNodeByIdAsync;
        gateFigma.getNodeByIdAsync = async (id: string) => {
            if (id === "t1/child") {
                return {
                    id: "t1/child",
                    type: "TEXT",
                    fontName: { family: "Inter", style: "Regular" },
                    get characters() { return "old-val"; },
                    set characters(val) { throw new Error("Override apply error"); }
                } as any;
            }
            if (id === "src/child") {
                return { id: "src/child" } as any;
            }
            return null;
        };

        try {
            const result: any = await setInstanceOverrides([t1], sourceResult);

            expect(result.success).toBe(false);
            expect(result.status).toBe("failed");
            expect(result.succeededCount).toBe(0);
            expect(result.failedCount).toBe(1);
            expect(result.results).toHaveLength(1);
            expect(result.results[0].success).toBe(false);
            expect(result.results[0].status).toBe("failed");
            expect(result.results[0].partialMutation).toBe(true);
            expect(result.results[0].before).toEqual({ mainComponentId: "original-component" });
        } finally {
            gateFigma.getNodeByIdAsync = originalGetNode;
        }
    });

    it("rejects duplicate node IDs in text_set_content", async () => {
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "TEXT", characters: "originalA" }
            ]
        });
        installFigma([root]);

        const msg = {
            type: "execute-command",
            command: "text_set_content",
            id: "cmd-dup",
            params: {
                nodeId: "scope-root",
                text: [
                    { nodeId: "100:1", nodeName: "A", characters: "val1" },
                    { nodeId: "100-1", nodeName: "A", characters: "val2" } // duplicate normalized spelling
                ]
            }
        };

        const resultPromise = new Promise<any>((resolve) => {
            gatePendingPromises.set(msg.id, resolve);
        });

        await gateOnMessage!(msg);
        const res = await resultPromise;

        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Duplicate node ID detected");
    });

    it("rejects duplicate node IDs in node_delete before any mutation (defense in depth)", async () => {
        const removed: string[] = [];
        const root = attachParents({
            id: "scope-root", name: "Scope", type: "FRAME",
            children: [
                { id: "100:1", name: "A", type: "FRAME", remove: () => { removed.push("100:1"); } }
            ]
        });
        installFigma([root]);

        const msg = {
            type: "execute-command", command: "node_delete", id: "cmd-dup-del",
            params: {
                nodes: [
                    { nodeId: "100:1", nodeName: "A" },
                    { nodeId: "100-1", nodeName: "A" } // duplicate normalized spelling
                ]
            }
        };
        const resultPromise = new Promise<any>((resolve) => gatePendingPromises.set(msg.id, resolve));
        await gateOnMessage!(msg);
        const res = await resultPromise;

        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Duplicate node ID detected");
        expect(removed).toHaveLength(0); // no mutation
    });

    it("rejects duplicate node IDs in instance_set_overrides before any mutation", async () => {
        const swaps: string[] = [];
        const src: any = { id: "src", name: "Src", type: "INSTANCE", getMainComponentAsync: async () => ({ id: "mc" }), overrides: [] };
        const inst: any = { id: "100:1", name: "I", type: "INSTANCE", swapComponent: () => { swaps.push("100:1"); }, getMainComponentAsync: async () => ({ id: "mc" }) };
        const root = attachParents({ id: "scope-root", name: "Scope", type: "FRAME", children: [src, inst] as any });
        installFigma([root]);

        const msg = {
            type: "execute-command", command: "instance_set_overrides", id: "cmd-dup-inst",
            params: {
                sourceInstanceId: "src",
                targetNodes: [
                    { nodeId: "100:1", nodeName: "I" },
                    { nodeId: "100-1", nodeName: "I" } // duplicate normalized spelling
                ]
            }
        };
        const resultPromise = new Promise<any>((resolve) => gatePendingPromises.set(msg.id, resolve));
        await gateOnMessage!(msg);
        const res = await resultPromise;

        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Duplicate node ID detected");
        expect(swaps).toHaveLength(0); // no mutation
    });
});
