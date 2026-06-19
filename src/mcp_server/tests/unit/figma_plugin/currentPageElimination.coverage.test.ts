import { describe, it, expect, mock, beforeEach } from "bun:test";
import { readFileSync } from "fs";

// Phase 6 coverage for the §1 `figma.currentPage` elimination items that lacked
// unit tests: node_clone parentless, createComponentSet page resolution,
// getInstanceOverrides no-id, getSelection removal, and creation-tool parent
// rejection (missing + unresolved) across all five creators.

// nodeCreators imports `setCharacters` from textUtils — mock it so createText
// reaches its parentId check without real font logic.
mock.module("../../../../../figma_plugin/utils/textUtils.js", () => ({
    setCharacters: mock(async (node: any, chars: any) => {
        node.characters = chars;
        node.width = String(chars).length * 7;
        return true;
    }),
}));

const { createShape, createFrame, createText, cloneNode } = await import(
    "../../../../../figma_plugin/handlers/nodeCreators.js"
);
const { createNodeFromSvg } = await import("../../../../../figma_plugin/handlers/vectorHandlers.js");
const { createComponentInstance, createComponentSet, getInstanceOverrides } = await import(
    "../../../../../figma_plugin/handlers/componentHandlers.js"
);

describe("node_clone (cloneNode): no figma.currentPage fallback", () => {
    it("throws when the source node has no parent", async () => {
        const orphan: any = { id: "n1", name: "Orphan", clone: () => ({ id: "c1", name: "Orphan" }), parent: null };
        (globalThis as any).figma = { getNodeByIdAsync: async () => orphan };
        expect(cloneNode({ nodeId: "n1" })).rejects.toThrow("has no parent");
    });

    it("appends the clone to the source node's parent (never currentPage)", async () => {
        const appended: any[] = [];
        const parent: any = { id: "p1", appendChild: (n: any) => appended.push(n) };
        const clone: any = { id: "c1", name: "Orig" };
        const orig: any = { id: "n1", name: "Orig", parent, clone: () => clone };
        (globalThis as any).figma = {
            getNodeByIdAsync: async () => orig,
            currentPage: { appendChild: () => { throw new Error("must not fall back to currentPage"); } },
        };
        const res = await cloneNode({ nodeId: "n1" });
        expect(appended).toContain(clone);
        expect(res.id).toBe("c1");
    });
});

describe("createComponentSet: combines on the first component's containing page", () => {
    it("passes the containing page (not currentPage) to combineAsVariants", async () => {
        const page: any = { id: "page-1", type: "PAGE" };
        const c1: any = { id: "c1", name: "c1", type: "COMPONENT", parent: page };
        const c2: any = { id: "c2", name: "c2", type: "COMPONENT", parent: page };
        let combinePageArg: any = null;
        (globalThis as any).figma = {
            getNodeByIdAsync: async (id: string) => ({ c1, c2 } as any)[id] ?? null,
            combineAsVariants: (_comps: any[], pageArg: any) => {
                combinePageArg = pageArg;
                return { id: "set1", name: "Set", children: [], variantGroupProperties: {} };
            },
            currentPage: { id: "CURRENT_PAGE", type: "PAGE" },
        };
        await createComponentSet({
            components: [
                { nodeId: "c1", propertyValues: ["A"] },
                { nodeId: "c2", propertyValues: ["B"] },
            ],
            properties: ["Prop"],
            componentSetName: "Set",
        });
        expect(combinePageArg).toBe(page);
        expect(combinePageArg.id).not.toBe("CURRENT_PAGE");
    });

    it("throws when the first component is detached (no containing page)", async () => {
        const c1: any = { id: "c1", name: "c1", type: "COMPONENT", parent: null };
        (globalThis as any).figma = {
            getNodeByIdAsync: async () => c1,
            combineAsVariants: () => ({}),
            currentPage: {},
        };
        expect(
            createComponentSet({ components: [{ nodeId: "c1", propertyValues: ["A"] }], properties: ["Prop"], componentSetName: "Set" })
        ).rejects.toThrow("not on a page");
    });
});

describe("getInstanceOverrides: requires an instance (selection fallback removed)", () => {
    it("rejects when no instance node is supplied", async () => {
        (globalThis as any).figma = { notify: () => {} };
        expect(getInstanceOverrides(null)).rejects.toThrow("Missing instance node parameter");
    });
});

describe("getSelection / get_selection are removed", () => {
    it("main.ts no longer dispatches the get_selection command", () => {
        const src = readFileSync("figma_plugin/src/main.ts", "utf8");
        expect(src).not.toContain('"get_selection"');
    });
    it("handlers/index.ts no longer re-exports getSelection", () => {
        const idx = readFileSync("figma_plugin/handlers/index.ts", "utf8");
        expect(idx).not.toMatch(/getSelection/);
    });
    it("nodeReaders.ts no longer exports getSelection", () => {
        const readers = readFileSync("figma_plugin/handlers/nodeReaders.ts", "utf8");
        expect(readers).not.toMatch(/getSelection/);
    });
});

describe("Creation tools reject bad parents (missing + unresolved; never currentPage)", () => {
    beforeEach(() => {
        (globalThis as any).figma = {
            createRectangle: () => ({ resize() {} }),
            createFrame: () => ({ resize() {} }),
            createText: () => ({ fills: [] }),
            createNodeFromSvg: () => ({ id: "svg1", name: "" }),
            loadFontAsync: async () => {},
            // Default: every parent lookup is unresolved.
            getNodeByIdAsync: async () => null,
        };
    });

    it("create_shape: missing parentId", async () => {
        expect(createShape({ type: "RECTANGLE", x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow("Missing parentId parameter");
    });
    it("create_shape: unresolved parentId", async () => {
        expect(createShape({ type: "RECTANGLE", x: 0, y: 0, width: 10, height: 10, parentId: "ghost" })).rejects.toThrow("Parent node not found");
    });

    it("create_frame: missing parentId", async () => {
        expect(createFrame({ x: 0, y: 0, width: 10, height: 10 })).rejects.toThrow("Missing parentId parameter");
    });
    it("create_frame: unresolved parentId", async () => {
        expect(createFrame({ x: 0, y: 0, width: 10, height: 10, parentId: "ghost" })).rejects.toThrow("Parent node not found");
    });

    it("create_text: missing parentId", async () => {
        expect(createText({ x: 0, y: 0, text: "hi" })).rejects.toThrow("Missing parentId parameter");
    });
    it("create_text: unresolved parentId", async () => {
        expect(createText({ x: 0, y: 0, text: "hi", parentId: "ghost" })).rejects.toThrow("Parent node not found");
    });

    it("create_svg: missing parentId", async () => {
        expect(createNodeFromSvg({ svg: "<svg/>" })).rejects.toThrow("Missing parentId parameter");
    });
    it("create_svg: unresolved parentId", async () => {
        expect(createNodeFromSvg({ svg: "<svg/>", parentId: "ghost" })).rejects.toThrow("Parent node not found");
    });

    it("create_instance: missing parentId", async () => {
        const comp: any = { id: "comp1", type: "COMPONENT", createInstance: () => ({ id: "i1" }) };
        (globalThis as any).figma.getNodeByIdAsync = async (id: string) => (id === "comp1" ? comp : null);
        expect(createComponentInstance({ componentId: "comp1", x: 0, y: 0 })).rejects.toThrow("Missing parentId parameter");
    });
    it("create_instance: unresolved parentId", async () => {
        const comp: any = { id: "comp1", type: "COMPONENT", createInstance: () => ({ id: "i1" }) };
        (globalThis as any).figma.getNodeByIdAsync = async (id: string) => (id === "comp1" ? comp : null);
        expect(createComponentInstance({ componentId: "comp1", x: 0, y: 0, parentId: "ghost" })).rejects.toThrow("Parent node not found");
    });
});
