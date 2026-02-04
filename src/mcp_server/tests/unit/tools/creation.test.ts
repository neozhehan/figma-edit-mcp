
import { jest } from '@jest/globals';

// Define mocks before imports
jest.unstable_mockModule('../../../figma-client.js', () => ({
    sendCommandToFigma: jest.fn(),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

// Import modules dynamically
const { registerCreationTools } = await import('../../../tools/creation.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Creation Tools", () => {
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

    it("should register creation tools", () => {
        registerCreationTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["create_rectangle"]).toBeDefined();
    });

    it("create_rectangle should call sendCommandToFigma with correct params", async () => {
        // Setup
        const mockResult = { id: "rect-1", name: "Rectangle" };
        (sendCommandToFigma as jest.Mock).mockResolvedValue(mockResult);

        // Register
        registerCreationTools(mockServer as any);

        // Execute
        const params = { x: 10, y: 20, width: 100, height: 100, name: "Test Rect" };
        const result = await registeredTools["create_rectangle"](params);

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("create_rectangle", expect.objectContaining({
            x: 10, y: 20, width: 100, height: 100, name: "Test Rect"
        }));
        expect(result.content[0].text).toContain("Created rectangle");
    });
});
