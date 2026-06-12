import { describe, it, expect, vi, beforeEach } from "vitest";
import { setTextStyle } from "../../../../../figma_plugin/handlers/textHandlers.js";

describe("Phase 6 Text Contract Repairs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.figma = {
            mixed: Symbol("figma.mixed"),
            getNodeByIdAsync: vi.fn(),
            loadFontAsync: vi.fn().mockResolvedValue(undefined),
        } as any;
    });

    describe("§15 text_set_style schema↔handler repair", () => {
        it("actually changes the font (regression: fontName was silently dropped)", async () => {
            const node: any = {
                id: "1:1", name: "T", type: "TEXT",
                fontName: { family: "Inter", style: "Regular" },
            };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node);

            const res = await setTextStyle({ nodeId: "1:1", fontName: { family: "Roboto", style: "Bold" } });

            // The requested font is loaded and assigned (not the node's current font).
            expect(global.figma.loadFontAsync).toHaveBeenCalledWith({ family: "Roboto", style: "Bold" });
            expect(node.fontName).toEqual({ family: "Roboto", style: "Bold" });
            expect(res.fontName).toEqual({ family: "Roboto", style: "Bold" });
        });

        it("surfaces an actionable error when the requested font is unavailable", async () => {
            const node: any = {
                id: "1:1", name: "T", type: "TEXT",
                fontName: { family: "Inter", style: "Regular" },
            };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node);
            (global.figma.loadFontAsync as any).mockRejectedValue(new Error("font not found"));

            await expect(setTextStyle({ nodeId: "1:1", fontName: { family: "Ghost", style: "Bold" } }))
                .rejects.toThrow("Failed to load requested font Ghost Bold");
        });

        it("applies lineHeight {unit:'AUTO'}, textAlign*, and paragraphIndent", async () => {
            const node: any = {
                id: "1:1", name: "T", type: "TEXT",
                fontName: { family: "Inter", style: "Regular" },
            };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node);

            await setTextStyle({
                nodeId: "1:1",
                lineHeight: { unit: "AUTO" },
                textAlignHorizontal: "CENTER",
                textAlignVertical: "BOTTOM",
                paragraphIndent: 24,
            });

            // No fontName given → the node's current (non-mixed) font is loaded before writing.
            expect(global.figma.loadFontAsync).toHaveBeenCalledWith({ family: "Inter", style: "Regular" });
            expect(node.lineHeight).toEqual({ unit: "AUTO" });
            expect(node.textAlignHorizontal).toBe("CENTER");
            expect(node.textAlignVertical).toBe("BOTTOM");
            expect(node.paragraphIndent).toBe(24);
        });
    });

    describe("§10 mixed-font loading", () => {
        it("loads every distinct font on a mixed-font node before styling (deduped)", async () => {
            const node: any = {
                id: "1:1", name: "T", type: "TEXT",
                fontName: (global.figma as any).mixed,
                getStyledTextSegments: vi.fn().mockReturnValue([
                    { fontName: { family: "Inter", style: "Regular" } },
                    { fontName: { family: "Inter", style: "Bold" } },
                    { fontName: { family: "Inter", style: "Regular" } }, // duplicate
                ]),
            };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node);

            await setTextStyle({ nodeId: "1:1", fontSize: 20 });

            expect(node.getStyledTextSegments).toHaveBeenCalledWith(["fontName"]);
            // Deduped to 2 unique families/styles.
            expect(global.figma.loadFontAsync).toHaveBeenCalledTimes(2);
            expect(global.figma.loadFontAsync).toHaveBeenCalledWith({ family: "Inter", style: "Regular" });
            expect(global.figma.loadFontAsync).toHaveBeenCalledWith({ family: "Inter", style: "Bold" });
            expect(node.fontSize).toBe(20);
        });

        it("throws an actionable error on an unavailable font (no skip-and-proceed)", async () => {
            const node: any = {
                id: "1:1", name: "T", type: "TEXT",
                fontName: (global.figma as any).mixed,
                getStyledTextSegments: vi.fn().mockReturnValue([
                    { fontName: { family: "GhostFont", style: "Regular" } },
                ]),
            };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(node);
            (global.figma.loadFontAsync as any).mockRejectedValue(new Error("unavailable"));

            await expect(setTextStyle({ nodeId: "1:1", fontSize: 20 }))
                .rejects.toThrow("Failed to load font GhostFont Regular");
        });
    });
});
