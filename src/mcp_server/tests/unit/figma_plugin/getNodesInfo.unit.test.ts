import { describe, it, expect, beforeEach } from "bun:test";

// v1.4.0 Phase 6.1 — getNodesInfo unit tests for filter logic + input dedup.
//
// These exercise the public `getNodesInfo` handler against an in-memory mock
// figma sandbox. The handler's private helpers (`checkFilterMatch`,
// `mapNodeRecursive`) are exercised indirectly through observable output —
// the response tree and `missingNodeIds` ordering.
//
// Idempotent global setup: keep an existing figma global if a sibling test
// file installed one; otherwise install a minimal stub.

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

import { getNodesInfo } from "../../../../../figma_plugin/handlers/nodeReaders.js";

// ---------------- fixture helpers ----------------

type FakeNode = {
    id: string;
    name: string;
    type: string;
    parent?: FakeNode;
    children?: FakeNode[];
    layoutMode?: string;
};

function makeNode(
    id: string,
    type: string,
    extras: Partial<FakeNode> = {},
): FakeNode {
    return { id, name: id, type, ...extras };
}

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
    const byId = new Map<string, FakeNode>();
    const index = (n: FakeNode) => {
        byId.set(n.id, n);
        n.children?.forEach(index);
    };
    nodes.forEach(index);
    (globalThis as any).figma = {
        getNodeByIdAsync: async (id: string) => byId.get(id) ?? null,
        root: { id: "doc", name: "Doc", children: nodes },
    };
}

// ---------------- input deduplication & ordering ----------------

describe("getNodesInfo — input deduplication & ordering (Phase 6.1)", () => {
    beforeEach(() => {
        const page = attachParents(
            makeNode("0:1", "PAGE", {
                children: [
                    makeNode("100:1", "FRAME"),
                    makeNode("100:2", "FRAME"),
                ],
            }),
        );
        installFigma([page]);
    });

    it("dedupes ids first-occurrence and preserves order in `nodes`", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1", "100:2", "100:1", "100:2", "100:1"],
        });
        expect(result.nodes.map((n: any) => n.id)).toEqual(["100:1", "100:2"]);
    });

    it("preserves deduped input order across resolvable + missing ids", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1", "ghost-a", "100:2", "ghost-a", "ghost-b"],
        });
        expect(result.nodes.map((n: any) => n.id)).toEqual(["100:1", "100:2"]);
        // missingNodeIds reflects deduped first-occurrence order.
        expect(result.missingNodeIds).toEqual(["ghost-a", "ghost-b"]);
    });

    it("omits `missingNodeIds` entirely when every id resolves", async () => {
        const result = await getNodesInfo({ nodeIds: ["100:1", "100:2"] });
        expect(result.missingNodeIds).toBeUndefined();
    });

    it("surfaces unresolved ids in `missingNodeIds` rather than throwing", async () => {
        const result = await getNodesInfo({
            nodeIds: ["does-not-exist-1", "does-not-exist-2"],
        });
        expect(result.nodes).toEqual([]);
        expect(result.missingNodeIds).toEqual([
            "does-not-exist-1",
            "does-not-exist-2",
        ]);
    });

    it("filters out empty / non-string ids during dedup (defensive)", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1", "", null as any, undefined as any, "100:1"],
        });
        expect(result.nodes.map((n: any) => n.id)).toEqual(["100:1"]);
        expect(result.missingNodeIds).toBeUndefined();
    });
});

// ---------------- filter logic ----------------

describe("getNodesInfo — filter logic (Phase 6.1)", () => {
    // Shared mixed-type fixture for filter tests.
    //   PAGE 0:1
    //   └─ FRAME 100:1 (layoutMode: HORIZONTAL)
    //      ├─ TEXT 200:1
    //      ├─ FRAME 200:2 (layoutMode: NONE)
    //      │   └─ TEXT 300:1
    //      ├─ COMPONENT 200:3
    //      └─ FRAME 200:4 (layoutMode: VERTICAL)
    //          └─ RECTANGLE 300:2
    let topFrame: FakeNode;

    beforeEach(() => {
        topFrame = attachParents(
            makeNode("100:1", "FRAME", {
                layoutMode: "HORIZONTAL",
                children: [
                    makeNode("200:1", "TEXT"),
                    makeNode("200:2", "FRAME", {
                        layoutMode: "NONE",
                        children: [makeNode("300:1", "TEXT")],
                    }),
                    makeNode("200:3", "COMPONENT"),
                    makeNode("200:4", "FRAME", {
                        layoutMode: "VERTICAL",
                        children: [makeNode("300:2", "RECTANGLE")],
                    }),
                ],
            }),
        );
        const page = attachParents(
            makeNode("0:1", "PAGE", { children: [topFrame] }),
        );
        installFigma([page]);
    });

    function flatIds(entry: any): string[] {
        const ids: string[] = [entry.id];
        if (entry.children) {
            for (const c of entry.children) ids.push(...flatIds(c));
        }
        return ids;
    }

    it("OR matching: `type: ['TEXT']` retains all TEXT nodes with ancestor passthrough", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1"],
            filter: { type: ["TEXT"] },
        });
        const ids = flatIds(result.nodes[0]);
        // Top-level always retained (it was explicitly requested by id).
        expect(ids).toContain("100:1");
        // Both TEXT nodes present.
        expect(ids).toContain("200:1");
        expect(ids).toContain("300:1");
        // Non-matching ancestors of a match are retained as passthrough containers.
        expect(ids).toContain("200:2");
        // Non-matching, no-match-below subtrees are pruned.
        expect(ids).not.toContain("200:3"); // COMPONENT
        expect(ids).not.toContain("200:4"); // FRAME with no TEXT below
        expect(ids).not.toContain("300:2"); // RECTANGLE
    });

    it("OR matching: `type: ['FRAME', 'COMPONENT']` includes any match in the union", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1"],
            filter: { type: ["FRAME", "COMPONENT"] },
        });
        const ids = flatIds(result.nodes[0]);
        expect(ids).toContain("200:2");
        expect(ids).toContain("200:3");
        expect(ids).toContain("200:4");
        // TEXT/RECTANGLE leaves are pruned unless they're a passthrough.
        // 200:1 is TEXT with no matching descendant → pruned.
        expect(ids).not.toContain("200:1");
    });

    it("OR matching for `layoutMode` with array value", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1"],
            filter: { layoutMode: ["HORIZONTAL", "VERTICAL"] },
        });
        const ids = flatIds(result.nodes[0]);
        // 100:1 (HORIZONTAL) and 200:4 (VERTICAL) match.
        expect(ids).toContain("100:1");
        expect(ids).toContain("200:4");
        // 200:2 has layoutMode NONE → not a match. It's still a leaf wrt the filter
        // tree below, so it should be pruned (no matching descendant).
        expect(ids).not.toContain("200:2");
    });

    it("AND logic: keys are combined; only nodes matching all keys are retained", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1"],
            filter: { type: ["FRAME"], layoutMode: ["VERTICAL"] },
        });
        const ids = flatIds(result.nodes[0]);
        // 200:4 is the only FRAME with layoutMode VERTICAL.
        expect(ids).toContain("200:4");
        // 100:1 is FRAME but HORIZONTAL → only passes because top-level entry
        // is always retained. Confirm 200:2 (FRAME + NONE) is pruned.
        expect(ids).not.toContain("200:2");
        expect(ids).not.toContain("200:1");
        expect(ids).not.toContain("200:3");
    });

    it("ancestor passthrough: non-matching containers are retained to preserve the path to a match", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1"],
            filter: { type: ["TEXT"] },
        });
        // 200:2 (FRAME) is not a match but contains 300:1 (TEXT).
        const ids = flatIds(result.nodes[0]);
        expect(ids).toContain("200:2");
        expect(ids).toContain("300:1");
    });

    it("top-level entries are always returned even if they fail the filter", async () => {
        // 100:1 is a FRAME. Filter for TEXT only — top-level still returned.
        const result = await getNodesInfo({
            nodeIds: ["100:1"],
            filter: { type: ["TEXT"] },
        });
        expect(result.nodes.length).toBe(1);
        expect(result.nodes[0].id).toBe("100:1");
        expect(result.nodes[0].type).toBe("FRAME");
    });

    it("empty filter object matches every node (no pruning)", async () => {
        const result = await getNodesInfo({
            nodeIds: ["100:1"],
            filter: {},
        });
        const ids = flatIds(result.nodes[0]);
        // Whole subtree present.
        expect(ids.sort()).toEqual(
            ["100:1", "200:1", "200:2", "200:3", "200:4", "300:1", "300:2"].sort(),
        );
    });
});
