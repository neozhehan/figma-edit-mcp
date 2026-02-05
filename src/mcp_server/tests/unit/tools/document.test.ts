
import { jest } from '@jest/globals';

// Define mocks before imports
jest.unstable_mockModule('../../../figma-client.js', () => ({
    sendCommandToFigma: jest.fn(),
    joinChannel: jest.fn()
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

// Import modules dynamically
const { registerDocumentTools } = await import('../../../tools/document.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Document Tools", () => {
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

    it("should register document tools", () => {
        registerDocumentTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["get_document_info"]).toBeDefined();
        expect(registeredTools["get_page_info"]).toBeDefined();
    });

    it("get_document_info should call sendCommandToFigma and return result", async () => {
        // Setup
        const mockResult = { id: "doc-123", name: "My Doc" };
        (sendCommandToFigma as jest.Mock).mockResolvedValue(mockResult);

        // Register to get the handler
        registerDocumentTools(mockServer as any);

        // Execute
        const result = await registeredTools["get_document_info"]({});

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_document_info");
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });

    it("get_page_info should call sendCommandToFigma with correct params", async () => {
        // Setup
        const mockResult = { id: "page-123", name: "My Page", children: [] };
        (sendCommandToFigma as jest.Mock).mockResolvedValue(mockResult);

        // Register to get the handler
        registerDocumentTools(mockServer as any);

        // Execute
        const params = { pageId: "page-123" };
        const result = await registeredTools["get_page_info"](params);

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_page_info", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });
});
