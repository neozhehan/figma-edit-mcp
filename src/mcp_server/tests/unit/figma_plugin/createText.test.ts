import { describe, it, expect, mock, beforeEach } from "bun:test";

// `setCharacters` is async (font matching + writing characters). createText must
// await it — otherwise the node has no text when createText reads/returns it
// (the live bug: characters:"" / width:0). Mock it with an async boundary so a
// missing `await` is observable. nodeCreators imports ONLY setCharacters from
// textUtils, so a minimal mock is sufficient.
mock.module("../../../../../figma_plugin/utils/textUtils.js", () => ({
    setCharacters: mock(async (node: any, chars: any) => {
        await Promise.resolve(); // async boundary — value set only after await
        node.characters = chars;
        node.width = String(chars).length * 7;
    }),
}));

const { createText } = await import("../../../../../figma_plugin/handlers/nodeCreators.js");

describe("createText (WS5): awaits setCharacters", () => {
    beforeEach(() => {
        (globalThis as any).figma = {
            createText: mock(() => ({
                id: "text-1", type: "TEXT", name: "",
                x: 0, y: 0, width: 0, height: 17, characters: "",
                fontName: { family: "Inter", style: "Regular" }, fontSize: 14,
                fills: [],
                parent: { id: "page-1" },
            })),
            loadFontAsync: mock(async () => {}),
            currentPage: { appendChild: mock(() => {}) },
            getNodeByIdAsync: mock(async (id: string) => {
                if (id === "page-1") {
                    return { id: "page-1", type: "PAGE", appendChild: mock(() => {}) };
                }
                return null;
            }),
        };
    });

    it("returns the text content (proves setCharacters was awaited)", async () => {
        const res = await createText({ parentId: "page-1", x: 5, y: 6, text: "hello typed style" });
        expect(res.characters).toBe("hello typed style");
        expect(res.width).toBeGreaterThan(0);
    });
});
