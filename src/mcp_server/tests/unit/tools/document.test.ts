import { describe, it, expect, beforeEach, mock } from "bun:test";

// Define mocks
mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve())
}));

mock.module('@modelcontextprotocol/sdk/server/mcp.js', () => ({
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
            tool: mock((name, description, schema, handler) => {
                registeredTools[name] = handler;
            }),
            prompt: mock(() => { })
        };
        (sendCommandToFigma as any).mockClear();
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
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

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
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        // Register to get the handler
        registerDocumentTools(mockServer as any);

        // Execute
        const params = { pageId: "page-123" };
        const result = await registeredTools["get_page_info"](params);

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_page_info", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });

    it("get_nodes_info should call sendCommandToFigma with optional nodeIds", async () => {
        // Setup
        const mockResult = [{ nodeId: "node-1", document: { name: "Node 1" } }];
        (sendCommandToFigma as any).mockResolvedValue(mockResult);
        registerDocumentTools(mockServer as any);

        // Case 1: Specific nodeIds
        await registeredTools["get_nodes_info"]({ nodeIds: ["node-1"] });
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: ["node-1"] });

        // Case 2: No nodeIds
        await registeredTools["get_nodes_info"]({});
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: undefined });
    });

    it("join_channel should call joinChannel and then get_nodes_info for discovery", async () => {
        // Setup
        (sendCommandToFigma as any).mockImplementation((cmd) => {
            if (cmd === "get_nodes_info") {
                return Promise.resolve([{ nodeId: "scope-123", document: { name: "Scope Frame" } }]);
            }
            return Promise.resolve({});
        });
        registerDocumentTools(mockServer as any);

        // Execute
        const result = await registeredTools["join_channel"]({ channel: "test-channel" });

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", {});
        expect(result.content[0].text).toContain("Scope Frame");
        expect(result.content[0].text).toContain("scope-123");
    });
});
