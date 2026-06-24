import { describe, it, expect, mock, beforeEach } from "bun:test";

mock.module("../../../imageResize.js", () => ({
    resizeIfOversized: mock(async (b64) => ({ base64: b64 }))
}));

mock.module("../../../figma-client.js", () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => {})
}));

const { registerAllTools } = await import("../../../tools/index.js");
const { sendCommandToFigma } = await import("../../../figma-client.js");
const { resizeIfOversized } = await import("../../../imageResize.js");
const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");

describe("node_set_fill routing", () => {
    let server: any;

    beforeEach(() => {
        server = new McpServer({ name: "test", version: "1" });
        registerAllTools(server);
        (sendCommandToFigma as any).mockClear();
        (resizeIfOversized as any).mockClear();
    });

    it("URL path (no network): server handler forwards image.url unchanged and does not call resizeIfOversized", async () => {
        const tool = server._registeredTools["node_set_fill"];
        const params = {
            nodeId: "1:2",
            image: { url: "http://example.com/img.png" }
        };

        await (tool.handler || tool.callback)(params, {} as any);

        expect(resizeIfOversized).not.toHaveBeenCalled();
        expect(sendCommandToFigma).toHaveBeenCalledWith("node_set_fill", params);
    });

    it("oversized bytesBase64 path: forwards the resized base64 to sendCommandToFigma and result carries warnings", async () => {
        (resizeIfOversized as any).mockImplementationOnce(async () => ({
            base64: "resized_base64",
            warning: "image resized"
        }));

        const tool = server._registeredTools["node_set_fill"];
        const params = {
            nodeId: "1:2",
            image: { bytesBase64: "original_base64" }
        };

        const result = await (tool.handler || tool.callback)(params, {} as any);

        expect(resizeIfOversized).toHaveBeenCalledWith("original_base64");
        
        // Ensure the forwarded payload has the resized base64
        const callArgs = (sendCommandToFigma as any).mock.calls[0][1];
        expect(callArgs.image.bytesBase64).toBe("resized_base64");

        // The result carries the warning
        if (result && result.warnings) {
            expect(result.warnings).toContain("image resized");
        } else if (result && result.content) {
            const textContent = result.content.find((c: any) => c.type === 'text')?.text || "";
            expect(textContent).toContain("image resized");
        }
    });
});

describe("node_set_fill schema validation", () => {
    let schema: any;
    beforeEach(async () => {
        const server = new McpServer({ name: "test", version: "1" });
        const { registerAllTools } = await import("../../../tools/index.js");
        registerAllTools(server);
        schema = server._registeredTools["node_set_fill"].inputSchema;
    });

    it("passes with clear:true", () => {
        const result = schema.safeParse({ nodeId: "1:2", nodeName: "Rect", clear: true });
        expect(result.success).toBe(true);
    });

    it("rejects when clear:true is combined with solid color (mutually exclusive)", () => {
        const result = schema.safeParse({ nodeId: "1:2", nodeName: "Rect", clear: true, r: 1, g: 1, b: 1 });
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain("provide exactly one of");
    });

    it("rejects when clear:true is combined with an image (mutually exclusive)", () => {
        const result = schema.safeParse({ nodeId: "1:2", nodeName: "Rect", clear: true, image: { url: "http://example.com/img.png" } });
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain("provide exactly one of");
    });

    it("rejects when none of solid color, image, or clear are provided", () => {
        const result = schema.safeParse({ nodeId: "1:2", nodeName: "Rect" });
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain("provide exactly one of");
    });

    it("regression: passes with solid color", () => {
        const result = schema.safeParse({ nodeId: "1:2", nodeName: "Rect", r: 1, g: 0, b: 0 });
        expect(result.success).toBe(true);
    });

    it("regression: passes with image", () => {
        const result = schema.safeParse({ nodeId: "1:2", nodeName: "Rect", image: { url: "http://example.com/img.png" } });
        expect(result.success).toBe(true);
    });
});
