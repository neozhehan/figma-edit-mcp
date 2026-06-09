import { describe, it, expect } from "bun:test";
import { toolResult } from "../../../tools/_result.js";

describe("Phase 5: MCP Image Content Blocks (toolResult)", () => {
    it("returns native image block + metadata text summary for PNG", () => {
        const result = {
            nodeId: "1:2",
            format: "PNG",
            scale: 2,
            mimeType: "image/png",
            imageData: "iVBORw0KGgoAAAANSUhEUgAA...",
        };

        const formatted = toolResult(result);

        // Expect two content blocks
        expect(formatted.content.length).toBe(2);
        
        // 1. Text block with metadata (excl. imageData)
        expect(formatted.content[0].type).toBe("text");
        const parsedText = JSON.parse((formatted.content[0] as any).text);
        expect(parsedText.nodeId).toBe("1:2");
        expect(parsedText.format).toBe("PNG");
        expect(parsedText.scale).toBe(2);
        expect(parsedText.mimeType).toBe("image/png");
        expect(parsedText.imageData).toBeUndefined(); // Crucially excluded

        // 2. Native image block
        expect(formatted.content[1].type).toBe("image");
        expect((formatted.content[1] as any).data).toBe("iVBORw0KGgoAAAANSUhEUgAA...");
        expect((formatted.content[1] as any).mimeType).toBe("image/png");

        // structuredContent should preserve the full JSON including imageData
        expect(formatted.structuredContent).toEqual(result);
    });

    it("returns native image block + metadata text summary for JPG", () => {
        const result = {
            nodeId: "1:3",
            format: "JPG",
            scale: 1,
            mimeType: "image/jpeg",
            imageData: "/9j/4AAQSkZJRgABAQE...",
        };

        const formatted = toolResult(result);

        expect(formatted.content.length).toBe(2);
        expect(formatted.content[0].type).toBe("text");
        const parsedText = JSON.parse((formatted.content[0] as any).text);
        expect(parsedText.imageData).toBeUndefined();

        expect(formatted.content[1].type).toBe("image");
        expect((formatted.content[1] as any).data).toBe("/9j/4AAQSkZJRgABAQE...");
        expect((formatted.content[1] as any).mimeType).toBe("image/jpeg");

        expect(formatted.structuredContent).toEqual(result);
    });

    it("falls through to standard text block for SVG format", () => {
        const result = {
            nodeId: "1:4",
            format: "SVG",
            svg: "<svg>...</svg>",
        };

        const formatted = toolResult(result);

        expect(formatted.content.length).toBe(1);
        expect(formatted.content[0].type).toBe("text");
        const parsedText = JSON.parse((formatted.content[0] as any).text);
        expect(parsedText.svg).toBe("<svg>...</svg>");

        expect(formatted.structuredContent).toEqual(result);
    });

    it("falls through to standard text block for PDF format", () => {
        const result = {
            nodeId: "1:5",
            format: "PDF",
            mimeType: "application/pdf",
            imageData: "JVBERi0xLjQK...",
        };

        const formatted = toolResult(result);

        expect(formatted.content.length).toBe(1);
        expect(formatted.content[0].type).toBe("text");
        const parsedText = JSON.parse((formatted.content[0] as any).text);
        expect(parsedText.format).toBe("PDF");
        expect(parsedText.imageData).toBe("JVBERi0xLjQK...");

        expect(formatted.structuredContent).toEqual(result);
    });
});
