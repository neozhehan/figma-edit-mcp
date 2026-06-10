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
        expect(res.error).toBe("Node ghost-id not found");
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
        expect(res.error).toContain("Node is not a text node");
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
        expect(res.error).toContain("does not support annotations");
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
        expect(res.error).toContain("Target is not an instance node");
    });
});

describe("Phase 4: Stop on first failure in batch handlers", () => {
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
        Object.defineProperty(nodeB, "characters", {
            get: () => "originalB",
            set: () => {
                throw new Error("Mock write lock error");
            }
        });

        const result = await setMultipleTextContents({
            nodeId: "scope-root",
            text: [
                { nodeId: "100:1", text: "newA" },
                { nodeId: "100:2", text: "newB" },
                { nodeId: "100:3", text: "newC" }
            ]
        });

        // 100:1 succeeds, 100:2 fails. 100:3 is never reached.
        expect(result.success).toBe(false);
        expect(result.replacementsApplied).toBe(1);
        expect(result.replacementsFailed).toBe(1);
        expect(result.results.length).toBe(2);
        expect(result.results[0].success).toBe(true);
        expect(result.results[1].success).toBe(false);
        const err = result.results[1].error;
        expect(err.includes("Mock write lock error") || err.includes("Failed to set characters on node 100:2")).toBe(true);
        
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
        expect(result.annotationsApplied).toBe(1);
        expect(result.annotationsFailed).toBe(1);
        expect(result.results.length).toBe(2);
        expect(result.results[0].success).toBe(true);
        expect(result.results[1].success).toBe(false);
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

        // node_delete is resilient and processes all IDs, returning partial success
        expect(result.success).toBe(true);
        expect(result.nodesDeleted).toBe(2);
        expect(result.nodesFailed).toBe(1);
    });

    it("setInstanceOverrides stops on the first failure and returns a standardized report (no rollback)", async () => {
        const t1: any = { id: "t1", name: "T1", swapComponent: () => {} };
        const t2: any = { id: "t2", name: "T2", swapComponent: () => { throw new Error("swap fail"); } };
        const t3: any = { id: "t3", name: "T3", swapComponent: () => {} };
        const sourceResult = { sourceInstance: { id: "src" }, mainComponent: { id: "main" }, overrides: [] };

        const result: any = await setInstanceOverrides([t1, t2, t3], sourceResult);

        // t1 succeeds, t2 fails → stop. t3 is never processed.
        expect(result.success).toBe(false);
        expect(result.results.length).toBe(2);
        expect(result.results[0].success).toBe(true);
        expect(result.results[1].success).toBe(false);
    });
});
