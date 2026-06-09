import { describe, it, expect } from "bun:test";
import {
    filterFigmaNode,
    buildPathArray,
    countDescendants,
    SAFE_LIST_PROPERTIES,
    getContainingPageNode,
} from "../../../../../figma_plugin/utils/nodeUtils.js";

describe("filterFigmaNode", () => {
    it("should return null for VECTOR nodes", () => {
        const node = { id: "1:1", name: "Vec", type: "VECTOR" };
        expect(filterFigmaNode(node)).toBeNull();
    });

    it("should always include id, name, type", () => {
        const node = { id: "1:2", name: "Frame", type: "FRAME", fills: [] };
        const result = filterFigmaNode(node, ["componentProperties"]);
        expect(result).toEqual({ id: "1:2", name: "Frame", type: "FRAME" });
    });

    it("should include requested fields if present", () => {
        const node = { 
            id: "1:3", name: "Comp", type: "COMPONENT", 
            componentPropertyDefinitions: { "Size": { type: "VARIANT", defaultValue: "Small" } },
            fills: []
        };
        const result = filterFigmaNode(node, ["componentPropertyDefinitions", "fills"]);
        expect(result).toEqual({
            id: "1:3",
            name: "Comp",
            type: "COMPONENT",
            componentPropertyDefinitions: { "Size": { type: "VARIANT", defaultValue: "Small" } },
            fills: []
        });
    });

    it("should silently drop requested fields if absent", () => {
        const node = { id: "1:4", name: "Frame", type: "FRAME", fills: [] };
        const result = filterFigmaNode(node, ["componentPropertyDefinitions", "fills"]);
        expect(result).toEqual({
            id: "1:4",
            name: "Frame",
            type: "FRAME",
            fills: []
        });
    });

    it("should always recurse into children and pass fields down", () => {
        const node = {
            id: "1:5",
            name: "Parent",
            type: "FRAME",
            fills: ["red"],
            children: [
                {
                    id: "1:6",
                    name: "Child",
                    type: "RECTANGLE",
                    strokes: ["blue"],
                    fills: ["green"]
                }
            ]
        };

        const result = filterFigmaNode(node, ["fills"]);
        expect(result).toEqual({
            id: "1:5",
            name: "Parent",
            type: "FRAME",
            fills: ["red"],
            children: [
                {
                    id: "1:6",
                    name: "Child",
                    type: "RECTANGLE",
                    fills: ["green"]
                }
            ]
        });
    });
});

// ----------------------------------------------------------------------------
// v1.4.0 Phase 6.1 — utility primitive unit tests
// ----------------------------------------------------------------------------

describe("SAFE_LIST_PROPERTIES classifier", () => {
    it("contains every safe-list category enumerated in the spec", () => {
        // Identity & structure
        expect(SAFE_LIST_PROPERTIES.has("id")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("name")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("type")).toBe(true);
        // Visibility
        expect(SAFE_LIST_PROPERTIES.has("visible")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("locked")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("opacity")).toBe(true);
        // Geometry & transform
        expect(SAFE_LIST_PROPERTIES.has("absoluteBoundingBox")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("x")).toBe(true);
        // Auto-layout
        expect(SAFE_LIST_PROPERTIES.has("layoutMode")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("primaryAxisAlignItems")).toBe(true);
        // Corner radius
        expect(SAFE_LIST_PROPERTIES.has("cornerRadius")).toBe(true);
        // Fills & strokes
        expect(SAFE_LIST_PROPERTIES.has("fills")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("strokes")).toBe(true);
        // Effects
        expect(SAFE_LIST_PROPERTIES.has("effects")).toBe(true);
        // Text
        expect(SAFE_LIST_PROPERTIES.has("characters")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("fontSize")).toBe(true);
        // Component / instance
        expect(SAFE_LIST_PROPERTIES.has("componentProperties")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("mainComponent")).toBe(true);
        // Prototyping
        expect(SAFE_LIST_PROPERTIES.has("reactions")).toBe(true);
        // Variables
        expect(SAFE_LIST_PROPERTIES.has("boundVariables")).toBe(true);
        // Export & dev metadata
        expect(SAFE_LIST_PROPERTIES.has("annotations")).toBe(true);
    });

    it("does NOT include style, but includes vector geometry from the official fields list", () => {
        // `style` is the canonical non-safe-list aggregate called out in the spec.
        expect(SAFE_LIST_PROPERTIES.has("style")).toBe(false);
        // Vector geometry — now part of safe list in v2.0.0
        expect(SAFE_LIST_PROPERTIES.has("fillGeometry")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("strokeGeometry")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("vectorNetwork")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("vectorPaths")).toBe(true);
    });

    it("returns false for typos / unrecognized names (must NOT force export fallback)", () => {
        // Per spec: unrecognized property names are silently dropped from the
        // response and do NOT push the call into the export-fallback path.
        expect(SAFE_LIST_PROPERTIES.has("fillz")).toBe(false);
        expect(SAFE_LIST_PROPERTIES.has("Characters")).toBe(false); // case-sensitive
        expect(SAFE_LIST_PROPERTIES.has("")).toBe(false);
        expect(SAFE_LIST_PROPERTIES.has("definitely-not-a-real-property")).toBe(false);
    });

    it("R3.8: includes shape-specific fields generated from the typings (the live gap)", () => {
        // These were missing from the hand-maintained list → node_info couldn't
        // read them (confirmed live). Now generated from @figma/plugin-typings.
        expect(SAFE_LIST_PROPERTIES.has("pointCount")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("innerRadius")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("arcData")).toBe(true);
    });

    it("R3.8: resolved node-refs present; raw-only node-refs and library-refs handled", () => {
        // Serialized to id / id[] by extractProperties → safe-list members.
        for (const ref of ["parent", "mainComponent", "instances", "exposedInstances", "stuckNodes", "attachedConnectors"]) {
            expect(SAFE_LIST_PROPERTIES.has(ref)).toBe(true);
        }
        // Other node-typed fields must NOT be raw-readable (DataCloneError risk).
        expect(SAFE_LIST_PROPERTIES.has("defaultVariant")).toBe(false);
        expect(SAFE_LIST_PROPERTIES.has("textBackground")).toBe(false);
        // Library references stay (extractProperties resolves them to {id, name}).
        expect(SAFE_LIST_PROPERTIES.has("fillStyleId")).toBe(true);
        expect(SAFE_LIST_PROPERTIES.has("explicitVariableModes")).toBe(true);
    });
});

describe("buildPathArray", () => {
    it("returns [] for a page node (page has no ancestors above it)", () => {
        const page = { id: "0:1", name: "Home", type: "PAGE", parent: { type: "DOCUMENT" } };
        expect(buildPathArray(page)).toEqual([]);
    });

    it("returns one element for a direct child of a page", () => {
        const page = { id: "0:1", name: "Home", type: "PAGE", parent: { type: "DOCUMENT" } };
        const frame = { id: "100:1", name: "Section", type: "FRAME", parent: page };
        expect(buildPathArray(frame)).toEqual([["PAGE", "0:1", "Home"]]);
    });

    it("returns the full ancestor chain ordered page → ... → immediate parent", () => {
        const page = { id: "0:1", name: "Home", type: "PAGE", parent: { type: "DOCUMENT" } };
        const section = { id: "100:1", name: "Section", type: "FRAME", parent: page };
        const card = { id: "210:12", name: "Card", type: "FRAME", parent: section };
        const button = { id: "437:96", name: "Button", type: "INSTANCE", parent: card };

        expect(buildPathArray(button)).toEqual([
            ["PAGE", "0:1", "Home"],
            ["FRAME", "100:1", "Section"],
            ["FRAME", "210:12", "Card"],
        ]);
    });

    it("does NOT include the node itself in the returned path", () => {
        const page = { id: "0:1", name: "Home", type: "PAGE", parent: { type: "DOCUMENT" } };
        const frame = { id: "100:1", name: "Section", type: "FRAME", parent: page };
        const path = buildPathArray(frame);
        // Only the page should appear; frame's own id must not.
        expect(path.find((t) => t[1] === "100:1")).toBeUndefined();
    });

    it("stops walking at the PAGE boundary (does not surface DOCUMENT)", () => {
        const page = { id: "0:1", name: "Home", type: "PAGE", parent: { type: "DOCUMENT" } };
        const frame = { id: "100:1", name: "Section", type: "FRAME", parent: page };
        const path = buildPathArray(frame);
        expect(path[0][0]).toBe("PAGE");
        expect(path.find((t) => t[0] === "DOCUMENT")).toBeUndefined();
    });
});

describe("countDescendants", () => {
    it("returns 0 for a leaf node (no children)", () => {
        expect(countDescendants({ id: "1:1", name: "L", type: "TEXT" })).toBe(0);
    });

    it("returns 0 for a node whose children property is an empty array", () => {
        expect(countDescendants({ id: "1:1", name: "F", type: "FRAME", children: [] })).toBe(0);
    });

    it("returns 0 for a node with non-array children property (defensive)", () => {
        // The util guards with Array.isArray — null / undefined children should not crash.
        expect(countDescendants({ id: "1:1", type: "FRAME", children: null as any })).toBe(0);
        expect(countDescendants({ id: "1:2", type: "FRAME" })).toBe(0);
    });

    it("returns exact count for a known subtree (recursively, not including self)", () => {
        // Tree shape:
        //   root (3 direct, 7 total)
        //   ├─ a   (no children)
        //   ├─ b   (2 children)
        //   │   ├─ b1
        //   │   └─ b2 (1 child)
        //   │       └─ b2a
        //   └─ c   (1 child)
        //       └─ c1
        const tree = {
            id: "root", type: "FRAME",
            children: [
                { id: "a", type: "TEXT" },
                {
                    id: "b", type: "FRAME",
                    children: [
                        { id: "b1", type: "TEXT" },
                        {
                            id: "b2", type: "FRAME",
                            children: [{ id: "b2a", type: "TEXT" }],
                        },
                    ],
                },
                {
                    id: "c", type: "FRAME",
                    children: [{ id: "c1", type: "TEXT" }],
                },
            ],
        };
        // 6 descendants: a, b, b1, b2, b2a, c, c1 → 7. Recount: a + b + b1 + b2 + b2a + c + c1 = 7.
        expect(countDescendants(tree)).toBe(7);
    });
});

describe("getContainingPageNode", () => {
    it("returns the node itself if it is a PAGE", () => {
        const page = { id: "0:1", name: "Home", type: "PAGE" };
        expect(getContainingPageNode(page)).toBe(page);
    });

    it("walks up the parent chain to find the PAGE", () => {
        const page = { id: "0:1", name: "Home", type: "PAGE" };
        const frame = { id: "100:1", name: "Section", type: "FRAME", parent: page };
        const rect = { id: "100:2", name: "Rect", type: "RECTANGLE", parent: frame };
        expect(getContainingPageNode(rect)).toBe(page);
    });

    it("returns null for detached or document root nodes", () => {
        const doc = { id: "0:0", name: "Doc", type: "DOCUMENT" };
        const detached = { id: "100:1", name: "Detached", type: "FRAME" };
        expect(getContainingPageNode(doc)).toBeNull();
        expect(getContainingPageNode(detached)).toBeNull();
    });
});
