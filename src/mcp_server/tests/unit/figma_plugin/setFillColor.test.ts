import { describe, it, expect, beforeEach, mock } from "bun:test";
import { setFillColor } from "../../../../../figma_plugin/handlers/stylingHandlers.js";
import { base64ToBytes } from "../../../../../figma_plugin/utils/exportUtils.js";

// Capture the thrown message so guard assertions are exact (a substring match
// would pass even if the message were wrapped/changed).
async function caughtMessage(fn: () => Promise<unknown>): Promise<string> {
    try {
        await fn();
    } catch (e: any) {
        return e?.message ?? String(e);
    }
    throw new Error("expected the call to throw, but it resolved");
}

describe("setFillColor", () => {
    let mockNode: any;

    beforeEach(() => {
        mockNode = {
            id: "node-1",
            name: "Test Node",
            fills: []
        };
        (globalThis as any).figma = {
            getNodeByIdAsync: mock(async (id: string) => {
                if (id === "node-1") return mockNode;
                return null;
            }),
            createImageAsync: mock(async () => ({ hash: "hash-url" })),
            createImage: mock((bytes: Uint8Array) => ({ hash: "hash-bytes" }))
        };
    });

    it("solid payload still produces a SOLID paint (regression)", async () => {
        const result = await setFillColor({
            nodeId: "node-1",
            color: { r: 1, g: 0, b: 0, a: 1 }
        });
        expect(result.fills[0].type).toBe("SOLID");
        expect(mockNode.fills[0].type).toBe("SOLID");
    });

    it("url payload produces an IMAGE paint with the resolved hash", async () => {
        const result = await setFillColor({
            nodeId: "node-1",
            image: { url: "http://example.com/img.png" }
        });
        expect(result.fills[0].type).toBe("IMAGE");
        expect(result.fills[0].imageHash).toBe("hash-url");
        expect((globalThis as any).figma.createImageAsync).toHaveBeenCalledWith("http://example.com/img.png");
    });

    it("bytesBase64 payload produces an IMAGE paint and createImage receives the decoded Uint8Array", async () => {
        const b64 = "SGVsbG8="; // "Hello"
        const result = await setFillColor({
            nodeId: "node-1",
            image: { bytesBase64: b64 }
        });
        expect(result.fills[0].type).toBe("IMAGE");
        expect(result.fills[0].imageHash).toBe("hash-bytes");
        const bytes = base64ToBytes(b64);
        expect((globalThis as any).figma.createImage).toHaveBeenCalledWith(bytes);
    });

    it("createImage sync throw surfaces the structured Figma-rejection error", async () => {
        (globalThis as any).figma.createImage = mock(() => {
            throw new Error("Image is too large");
        });
        await expect(setFillColor({
            nodeId: "node-1",
            image: { bytesBase64: "SGVsbG8=" }
        })).rejects.toThrow(/Figma rejected the image/);
    });

    it("createImageAsync rejection surfaces the structured Figma-rejection error", async () => {
        (globalThis as any).figma.createImageAsync = mock(async () => {
            throw new Error("Image type is unsupported");
        });
        await expect(setFillColor({
            nodeId: "node-1",
            image: { url: "http://example.com/img.png" }
        })).rejects.toThrow(/Figma rejected the image/);
    });

    it("URL fetch/CORS failure surfaces the fetch error", async () => {
        (globalThis as any).figma.createImageAsync = mock(async () => {
            throw new Error("Failed to fetch");
        });
        await expect(setFillColor({
            nodeId: "node-1",
            image: { url: "http://example.com/img.png" }
        })).rejects.toThrow(/could not fetch image from URL 'http:\/\/example.com\/img.png' \(network\/CORS\)/);
    });

    it("unsupported node (!('fills' in node)) throws the node_set_fill guard error", async () => {
        const mockNoFillsNode = { id: "node-2", name: "No Fills", type: "GROUP" };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockNoFillsNode);
        const msg = await caughtMessage(() => setFillColor({ nodeId: "node-2", color: { r: 1, g: 1, b: 1 } }));
        // Consistent shape with the clear-path guard (G-C).
        expect(msg).toBe("node_set_fill: 'No Fills' (type GROUP) has no 'fills' property to set a fill on.");
    });

    it("clear payload sets node.fills to an empty array", async () => {
        mockNode.fills = [{ type: "SOLID" }];
        const result = await setFillColor({
            nodeId: "node-1",
            clear: true
        });
        expect(result.fills.length).toBe(0);
        expect(mockNode.fills.length).toBe(0);
    });

    it("clear payload on unsupported node throws PRD guard error before mutation", async () => {
        const mockNoFillsNode = { id: "node-2", name: "No Fills", type: "GROUP" };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockNoFillsNode);
        const msg = await caughtMessage(() => setFillColor({ nodeId: "node-2", clear: true }));
        expect(msg).toBe("node_set_fill: 'No Fills' (type GROUP) has no 'fills' property to clear.");
    });
});
