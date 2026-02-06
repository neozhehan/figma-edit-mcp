import { describe, it, expect, beforeEach, mock } from "bun:test";

// Define mocks
mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
}));

mock.module('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

mock.module('../../../utils.js', () => ({
    normalizeNodeId: mock((id) => id),
}));

// Import modules
const { registerVariablesTools } = await import('../../../tools/variables.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Variables Tools", () => {
    let mockServer: any;
    let registeredTools: Record<string, Function> = {};

    beforeEach(() => {
        registeredTools = {};
        mockServer = {
            tool: mock((name, description, schema, handler) => {
                registeredTools[name] = handler;
            })
        };
        (sendCommandToFigma as any).mockClear();
    });

    it("should register variables tools", () => {
        registerVariablesTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["get_variables"]).toBeDefined();
        expect(registeredTools["get_node_variables"]).toBeDefined();
        expect(registeredTools["set_bound_variable"]).toBeDefined();
        expect(registeredTools["manage_variables"]).toBeDefined();
    });

    it("get_variables should call sendCommandToFigma with correct params", async () => {
        registerVariablesTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue([]);

        const params = { variableId: "var-1" };
        const result = await registeredTools["get_variables"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_variables", params);
        expect(result.content[0].text).toBe("[]");
    });

    it("get_node_variables should call sendCommandToFigma with correct params", async () => {
        registerVariablesTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({});

        const params = { nodeId: "node-1" };
        const result = await registeredTools["get_node_variables"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_node_variables", params);
        expect(result.content[0].text).toBe("{}");
    });

    it("set_bound_variable should call sendCommandToFigma with correct params", async () => {
        registerVariablesTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ success: true });

        const params = { nodeId: "node-1", nodeName: "Node", field: "fills", variableId: "var-1" };
        const result = await registeredTools["set_bound_variable"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_bound_variable", params);
        expect(result.content[0].text).toContain('"success": true');
    });

    it("manage_variables should call sendCommandToFigma with correct params", async () => {
        registerVariablesTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ id: "var-new" });

        const params = { action: "CREATE_VARIABLE", name: "New Var", collectionId: "col-1", type: "STRING", value: "Hello" };
        const result = await registeredTools["manage_variables"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("manage_variables", params);
        expect(result.content[0].text).toContain('"id": "var-new"');
    });
});
