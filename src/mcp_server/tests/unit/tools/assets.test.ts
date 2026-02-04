
import { jest } from '@jest/globals';

// Define mocks
jest.unstable_mockModule('../../../figma-client.js', () => ({
    sendCommandToFigma: jest.fn(),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

// Import modules
const { registerAssetTools } = await import('../../../tools/assets.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Asset Tools", () => {
    let mockServer: any;
    let registeredTools: Record<string, Function> = {};

    beforeEach(() => {
        registeredTools = {};
        mockServer = {
            tool: jest.fn((name, description, schema, handler) => {
                registeredTools[name] = handler;
            })
        };
        (sendCommandToFigma as jest.Mock).mockReset();
    });

    it("should register asset tools", () => {
        registerAssetTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["export_node_as_image"]).toBeDefined();
    });

    it("export_node_as_image should call sendCommandToFigma with correct params", async () => {
        registerAssetTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({
            imageData: "base64data",
            mimeType: "image/png"
        });

        const params = { nodeId: "node-1", format: "PNG", scale: 2 };
        const result = await registeredTools["export_node_as_image"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("export_node_as_image", {
            nodeId: "node-1",
            format: "PNG",
            scale: 2
        });
        expect(result.content[0].type).toBe("image");
        expect(result.content[0].data).toBe("base64data");
    });
});
