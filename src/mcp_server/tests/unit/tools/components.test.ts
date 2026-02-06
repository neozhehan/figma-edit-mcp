import { describe, it, expect, beforeEach, mock } from "bun:test";

// Define mocks
mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    getInstanceOverridesResult: {},
    setInstanceOverridesResult: {}
}));

mock.module('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

mock.module('../../../utils.js', () => ({
    normalizeNodeId: mock((id) => id)
}));

// Import modules dynamically
const { registerComponentTools } = await import('../../../tools/components.js');
// Re-import the mocked module to get the mock function reference
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Component Tools", () => {
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
        // Reset mock implementation for each test
        (sendCommandToFigma as any).mockClear();
    });

    it("should register component tools", () => {
        registerComponentTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["get_components"]).toBeDefined();
    });

    it("get_components should call sendCommandToFigma with correct params", async () => {
        const mockResult = { count: 2, components: [] };
        // Setup mock return value
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = { filter: "local", scope: "document" };
        const result = await registeredTools["get_components"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_components", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });

    it("create_component_set should call sendCommandToFigma with correct params", async () => {
        const mockResult = { id: "set_123", name: "Button", type: "COMPONENT_SET" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            components: [
                { nodeId: "1:1", nodeName: "Btn 1", propertyValues: ["Small"] },
                { nodeId: "1:2", nodeName: "Btn 2", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            componentSetName: "Button"
        };
        const result = await registeredTools["create_component_set"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("create_component_set", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });
});
