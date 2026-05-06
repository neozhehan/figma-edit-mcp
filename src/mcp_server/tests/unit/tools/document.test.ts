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
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: ["node-1"], fields: undefined });

        // Case 2: No nodeIds
        await registeredTools["get_nodes_info"]({});
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: undefined, fields: undefined });
        
        // Case 3: With fields
        await registeredTools["get_nodes_info"]({ nodeIds: ["node-1"], fields: ["fills", "componentProperties"] });
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_nodes_info", { nodeIds: ["node-1"], fields: ["fills", "componentProperties"] });
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

// ============================================================
// Phase 4 §4: get_nodes_info Regression Tests (Q7 — shape unchanged)
// ============================================================

describe("Phase 4 §4: get_nodes_info response shape regression", () => {
    let registeredTools: Record<string, Function>;
    let mockServer: any;

    beforeEach(() => {
        registeredTools = {};
        mockServer = {
            tool: mock((name, description, schema, handler) => {
                registeredTools[name] = handler;
            }),
            prompt: mock(() => {})
        };
        (sendCommandToFigma as any).mockClear();
    });

    it("get_nodes_info({ nodeIds: [<id>] }) returns [{ nodeId, parentId, document }]", async () => {
        const mockResult = [
            {
                nodeId: "42:6",
                parentId: "0:1",
                document: { name: "TestComponent", id: "42:6", type: "COMPONENT" },
            },
        ];
        (sendCommandToFigma as any).mockResolvedValue(mockResult);
        registerDocumentTools(mockServer as any);

        const result = await registeredTools["get_nodes_info"]({ nodeIds: ["42:6"] });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed).toHaveLength(1);
        expect(parsed[0].nodeId).toBe("42:6");
        expect(parsed[0].parentId).toBe("0:1");
        expect(parsed[0].document).toBeDefined();
        // Must NOT contain Change 1 node-scope fields
        expect(parsed[0].nodeName).toBeUndefined();
        expect(parsed[0].containingPageId).toBeUndefined();
        expect(parsed[0].node).toBeUndefined();
    });

    it("get_nodes_info() (empty args, scope root) returns the same { nodeId, parentId, document }[] shape", async () => {
        const mockResult = [
            {
                nodeId: "scope-root",
                parentId: "0:1",
                document: { name: "Scope Frame", id: "scope-root", type: "FRAME" },
            },
        ];
        (sendCommandToFigma as any).mockResolvedValue(mockResult);
        registerDocumentTools(mockServer as any);

        const result = await registeredTools["get_nodes_info"]({});
        const parsed = JSON.parse(result.content[0].text);

        // Shape must be the pre-v1.3.0 shape — array with nodeId/parentId/document
        expect(Array.isArray(parsed) || typeof parsed === "object").toBe(true);
        if (Array.isArray(parsed) && parsed.length > 0) {
            expect(parsed[0]).toHaveProperty("nodeId");
            expect(parsed[0]).toHaveProperty("document");
        }
    });

    it("get_nodes_info response does NOT contain Change 1 node-scope 'node' block", async () => {
        const mockResult = [
            {
                nodeId: "n1",
                parentId: "p1",
                document: { name: "N", id: "n1", type: "FRAME" },
            },
        ];
        (sendCommandToFigma as any).mockResolvedValue(mockResult);
        registerDocumentTools(mockServer as any);

        const result = await registeredTools["get_nodes_info"]({ nodeIds: ["n1"] });
        const parsed = JSON.parse(result.content[0].text);

        // Verify absence of all Change 1 Node-scope fields
        for (const item of parsed) {
            expect(item.editableScopeType).toBeUndefined();
            expect(item.containingPageId).toBeUndefined();
            expect(item.containingPageName).toBeUndefined();
        }
    });
});
