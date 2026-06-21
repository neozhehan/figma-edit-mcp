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
