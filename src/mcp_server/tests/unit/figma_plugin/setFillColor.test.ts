import { describe, it, expect, beforeEach, mock } from "bun:test";
import { setFillColor } from "../../../../../figma_plugin/handlers/stylingHandlers.js";
import { base64ToBytes } from "../../../../../figma_plugin/utils/exportUtils.js";

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

    it("unsupported node (!('fills' in node)) still throws", async () => {
        const mockNoFillsNode = { id: "node-2", name: "No Fills" };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockNoFillsNode);
        await expect(setFillColor({
            nodeId: "node-2",
            color: { r: 1, g: 1, b: 1 }
        })).rejects.toThrow("Node does not support fills: node-2");
    });
});
