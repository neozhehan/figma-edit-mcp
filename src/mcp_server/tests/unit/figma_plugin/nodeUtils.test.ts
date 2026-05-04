import { describe, it, expect } from "bun:test";
import { filterFigmaNode } from "../../../../figma_plugin/utils/nodeUtils.js";

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
