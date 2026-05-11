import { describe, it, expect, beforeEach, mock } from "bun:test";

// Define mocks
mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => {})
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
        expect(registeredTools["get_pages_info"]).toBeDefined();
    });

    it("should not register the design_strategy prompt", () => {
        registerDocumentTools(mockServer as any);
        const promptNames = (mockServer.prompt as any).mock.calls.map((call: any[]) => call[0]);
        expect(promptNames).not.toContain("design_strategy");
    });

    it("get_pages_info should call sendCommandToFigma with correct params", async () => {
        // Setup
        const mockResult = { pages: [{ id: "page-123", name: "My Page", children: [] }] };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        // Register to get the handler
        registerDocumentTools(mockServer as any);

        // Execute
        const params = { pageIds: ["page-123"] };
        const result = await registeredTools["get_pages_info"](params);

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_pages_info", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });

    it("get_nodes_info should call sendCommandToFigma with optional nodeIds", async () => {
        // Setup
        const mockResult = [{ nodeId: "node-1", document: { name: "Node 1" } }];
        (sendCommandToFigma as any).mockResolvedValue(mockResult);
        registerDocumentTools(mockServer as any);

        // Case 1: Specific nodeIds
        await registeredTools["get_nodes_info"]({ nodeIds: ["node-1"] });
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: ["node-1"], filter: undefined, properties: undefined, maxDepth: undefined });

        // Case 2: No nodeIds
        await registeredTools["get_nodes_info"]({});
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: undefined, filter: undefined, properties: undefined, maxDepth: undefined });
        
        // Case 3: With fields and filter
        await registeredTools["get_nodes_info"]({ nodeIds: ["node-1"], fields: ["fills", "componentProperties"], filter: { type: ["TEXT"] }, maxDepth: 2 });
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: ["node-1"], properties: ["fills", "componentProperties"], filter: { type: ["TEXT"] }, maxDepth: 2 });
    });

    it("join_channel should call joinChannel and then get_connect_payload for discovery", async () => {
        // Setup
        (sendCommandToFigma as any).mockImplementation((cmd) => {
            if (cmd === "get_connect_payload") {
                return Promise.resolve({ scopeRootId: "scope-123", readOnly: false });
            }
            return Promise.resolve({});
        });
        registerDocumentTools(mockServer as any);

        // Execute
        const result = await registeredTools["join_channel"]({ channel: "test-channel" });

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_connect_payload");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe("success");
        expect(parsed.scopeRootId).toBe("scope-123");
        expect(parsed.channel).toBe("test-channel");
    });

    it("get_document_info is completely rejected — tool not registered", () => {
        registerDocumentTools(mockServer as any);
        expect(registeredTools["get_document_info"]).toBeUndefined();
    });

    it("get_page_info is completely rejected — tool not registered", () => {
        registerDocumentTools(mockServer as any);
        expect(registeredTools["get_page_info"]).toBeUndefined();
    });

    it("get_pages_info with no arguments returns result without children or missingPageIds", async () => {
        const mockResult = {
            documentId: "0:0",
            documentName: "Doc",
            pageCount: 2,
            pages: [
                { pageId: "p1", pageName: "P1" },
                { pageId: "p2", pageName: "P2" },
            ],
        };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);
        registerDocumentTools(mockServer as any);

        const result = await registeredTools["get_pages_info"]({});
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.pages).toHaveLength(2);
        expect(parsed.missingPageIds).toBeUndefined();
        for (const p of parsed.pages) {
            expect(p.children).toBeUndefined();
        }
    });

    it("get_pages_info with pageIds returns children and missingPageIds", async () => {
        const mockResult = {
            documentId: "0:0",
            documentName: "Doc",
            pageCount: 3,
            pages: [
                { pageId: "p1", pageName: "P1", children: [{ id: "c1", name: "C1", type: "FRAME" }] },
            ],
            missingPageIds: ["bad-id"],
        };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);
        registerDocumentTools(mockServer as any);

        const result = await registeredTools["get_pages_info"]({ pageIds: ["p1", "bad-id"] });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.pages[0].children).toBeDefined();
        expect(parsed.missingPageIds).toEqual(["bad-id"]);
    });
});

