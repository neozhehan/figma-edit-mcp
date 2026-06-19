import { describe, it, expect, vi, beforeEach } from "vitest";
import { insertChild, transformNode } from "../../../../../figma_plugin/handlers/nodeModifiers.js";
import { setAutoLayout } from "../../../../../figma_plugin/handlers/layoutHandlers.js";
import { createFrame, createText } from "../../../../../figma_plugin/handlers/nodeCreators.js";

describe("Phase 4 Validations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.figma = {
            getNodeByIdAsync: vi.fn(),
            createFrame: vi.fn(),
            createText: vi.fn(),
            loadFontAsync: vi.fn().mockResolvedValue(undefined),
        } as any;
    });

    describe("§3 Cyclic / self-parent & §13 Index bounds guard", () => {
        it("rejects self-parenting", async () => {
            const node = { id: "1:1", name: "Node", children: [] };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node as any);

            await expect(insertChild({ parentId: "1:1", childId: "1:1" }))
                .rejects.toThrow("A node cannot be inserted into itself");
        });

        it("rejects cyclic parent", async () => {
            const parent = { id: "1:2", name: "Parent", parent: { id: "1:1" }, children: [] };
            const child = { id: "1:1", name: "Child" }; // parent is a descendant of child
            parent.parent = child as any; // child is an ancestor of parent

            (global.figma.getNodeByIdAsync as any).mockImplementation(async (id: string) => {
                if (id === "1:2") return parent as any;
                if (id === "1:1") return child as any;
                return null;
            });

            await expect(insertChild({ parentId: "1:2", childId: "1:1" }))
                .rejects.toThrow("parent is a descendant of the node (cyclic hierarchy)");
        });

        it("rejects out of bounds index", async () => {
            const parent = { id: "1:2", name: "Parent", children: [{}, {}], type: "FRAME" };
            const child = { id: "1:1", name: "Child", type: "FRAME" };

            (global.figma.getNodeByIdAsync as any).mockImplementation(async (id: string) => {
                if (id === "1:2") return parent as any;
                if (id === "1:1") return child as any;
                return null;
            });

            await expect(insertChild({ parentId: "1:2", childId: "1:1", index: 3 }))
                .rejects.toThrow("index 3 is out of range");

            await expect(insertChild({ parentId: "1:2", childId: "1:1", index: -1 }))
                .rejects.toThrow("index -1 is out of range");
        });

        it("inserts correctly with valid index and omitted index", async () => {
            const parent = { 
                id: "1:2", 
                name: "Parent", 
                children: [{}], 
                type: "FRAME",
                insertChild: vi.fn(),
                appendChild: vi.fn()
            };
            const child = { id: "1:1", name: "Child", type: "FRAME" };

            (global.figma.getNodeByIdAsync as any).mockImplementation(async (id: string) => {
                if (id === "1:2") return parent as any;
                if (id === "1:1") return child as any;
                return null;
            });

            parent.children.indexOf = vi.fn().mockReturnValue(1);

            const res1 = await insertChild({ parentId: "1:2", childId: "1:1", index: 1 });
            expect(parent.insertChild).toHaveBeenCalledWith(1, child);
            expect(res1.index).toBe(1);

            const res2 = await insertChild({ parentId: "1:2", childId: "1:1" });
            expect(parent.appendChild).toHaveBeenCalledWith(child);
        });
    });

    describe("§9 Auto-layout child transform", () => {
        it("rejects x/y change for auto-layout child not ABSOLUTE", async () => {
            const parent = { id: "0:1", name: "Parent", layoutMode: "HORIZONTAL" };
            const node = { id: "1:1", name: "Node", x: 0, y: 0, layoutPositioning: "AUTO", parent };

            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node as any);

            await expect(transformNode({ nodeId: "1:1", x: 10 }))
                .rejects.toThrow("has Auto-layout applied and the node is not absolutely positioned");
        });

        it("returns warnings when resizing hug/fill child", async () => {
            const parent = { id: "0:1", name: "Parent", layoutMode: "HORIZONTAL" };
            const node = { 
                id: "1:1", 
                name: "Node", 
                width: 100, 
                height: 100,
                resize: vi.fn(),
                layoutPositioning: "AUTO", 
                layoutSizingHorizontal: "FILL",
                layoutSizingVertical: "HUG",
                parent 
            };

            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node as any);

            const result = await transformNode({ nodeId: "1:1", width: 200, height: 200 });
            expect(result.warnings).toHaveLength(2);
            expect(result.warnings![0]).toMatch(/Horizontal resize applied.*reverted its layoutSizingHorizontal from FILL to FIXED/);
            expect(result.warnings![1]).toMatch(/Vertical resize applied.*reverted its layoutSizingVertical from HUG to FIXED/);
        });
        
        it("returns warnings when resizing node itself that has auto-layout hugging", async () => {
            const node = { 
                id: "1:1", 
                name: "Node", 
                width: 100, 
                height: 100,
                resize: vi.fn(),
                layoutMode: "NONE",
                layoutSizingHorizontal: "HUG",
                layoutSizingVertical: "HUG",
                parent: null
            };

            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node as any);

            const result = await transformNode({ nodeId: "1:1", width: 200, height: 200 });
            expect(result.warnings).toHaveLength(2);
        });
    });

    describe("§8 Auto-layout FILL sizing guard", () => {
        it("rejects FILL under non-auto-layout parent", async () => {
            const parent = { id: "0:1", name: "Parent", layoutMode: "NONE" };
            const node = { id: "1:1", name: "Node", type: "FRAME", parent };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node as any);

            await expect(setAutoLayout({ nodeId: "1:1", layoutSizingHorizontal: "FILL" }))
                .rejects.toThrow("requires the parent to be an Auto-Layout frame");
        });

        it("succeeds FILL under auto-layout parent", async () => {
            const parent = { id: "0:1", name: "Parent", layoutMode: "HORIZONTAL" };
            const node = { id: "1:1", name: "Node", type: "FRAME", parent };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node as any);

            const result = await setAutoLayout({ nodeId: "1:1", layoutSizingHorizontal: "FILL" });
            expect(node).toHaveProperty("layoutSizingHorizontal", "FILL");
        });

        it("rejects silent-drop of padding/alignment on NONE frame", async () => {
            const node = { id: "1:1", name: "Node", type: "FRAME", layoutMode: "NONE" };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node as any);

            await expect(setAutoLayout({ nodeId: "1:1", paddingTop: 10 }))
                .rejects.toThrow("because its layoutMode is NONE");
        });
    });

    describe("§12 NaN opacity bug", () => {
        it("frame without alpha yields opacity 1", async () => {
            const parent = { id: "0:1", name: "Parent", appendChild: vi.fn() };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(parent as any);

            const frameNode = { id: "1:1", name: "Frame", resize: vi.fn(), parent } as any;
            (global.figma.createFrame as any).mockReturnValue(frameNode);

            const result = await createFrame({ parentId: "0:1", fillColor: { r: 1, g: 0, b: 0 } });
            expect(frameNode.fills[0].opacity).toBe(1);
        });

        it("text without alpha yields opacity 1", async () => {
            const parent = { id: "0:1", name: "Parent", appendChild: vi.fn() };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(parent as any);

            const textNode = { id: "1:1", name: "Text", parent } as any;
            (global.figma.createText as any).mockReturnValue(textNode);

            // Mock loadFontAsync
            const result = await createText({ parentId: "0:1", fontColor: { r: 1, g: 0, b: 0 } });
            expect(textNode.fills[0].opacity).toBe(1);
        });
    });
});
