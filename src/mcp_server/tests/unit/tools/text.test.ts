
import { jest } from '@jest/globals';

// Define mocks
jest.unstable_mockModule('../../../figma-client.js', () => ({
    sendCommandToFigma: jest.fn(),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

// Import modules
const { registerTextTools } = await import('../../../tools/text.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Text Tools", () => {
    let mockServer: any;
    let registeredTools: Record<string, Function> = {};

    beforeEach(() => {
        registeredTools = {};
        mockServer = {
            tool: jest.fn((name, description, schema, handler) => {
                registeredTools[name] = handler;
            }),
            prompt: jest.fn()
        };
        (sendCommandToFigma as jest.Mock).mockReset();
    });

    it("should register text tools", () => {
        registerTextTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["create_text"]).toBeDefined();
        expect(registeredTools["set_multiple_text_contents"]).toBeDefined();
        expect(registeredTools["scan_text_nodes"]).toBeDefined();
    });

    it("create_text should call sendCommandToFigma with correct params", async () => {
        registerTextTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ name: "Text Node", id: "text-1" });

        const params = { x: 10, y: 10, text: "Hello", fontSize: 16 };
        const result = await registeredTools["create_text"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("create_text", expect.objectContaining({
            x: 10,
            y: 10,
            text: "Hello",
            fontSize: 16
        }));
        expect(result.content[0].text).toContain('Created text "Text Node" with ID: text-1');
    });

    it("set_multiple_text_contents should call sendCommandToFigma with correct params", async () => {
        registerTextTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({
            success: true,
            replacementsApplied: 1,
            completedInChunks: 1
        });

        const params = {
            nodeId: "parent-1",
            text: [{ nodeId: "text-1", nodeName: "Text", text: "New Text" }]
        };
        const result = await registeredTools["set_multiple_text_contents"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_multiple_text_contents", params);
        expect(result.content[0].text).toContain("Starting text replacement");
    });

    it("scan_text_nodes should call sendCommandToFigma with correct params", async () => {
        registerTextTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({
            success: true,
            totalNodes: 5,
            processedNodes: 5,
            chunks: 1,
            textNodes: []
        });

        const params = { nodeId: "node-1" };
        const result = await registeredTools["scan_text_nodes"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("scan_text_nodes", {
            nodeId: "node-1",
            useChunking: true,
            chunkSize: 10
        }, 120000);
        expect(result.content[0].text).toContain("Starting text node scanning");
    });
});
