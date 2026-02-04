
import { jest } from '@jest/globals';

// Define mocks
jest.unstable_mockModule('../../../figma-client.js', () => ({
    sendCommandToFigma: jest.fn(),
    getInstanceOverridesResult: jest.fn(),
    setInstanceOverridesResult: jest.fn(),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

jest.unstable_mockModule('../../../utils.js', () => ({
    normalizeNodeId: jest.fn((id: string) => id),
}));

// Import modules
const { registerComponentTools } = await import('../../../tools/components.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Component Tools", () => {
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

    it("should register component tools", () => {
        registerComponentTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["get_local_components"]).toBeDefined();
        expect(registeredTools["create_component"]).toBeDefined();
        expect(registeredTools["create_component_instance"]).toBeDefined();
        expect(registeredTools["get_instance_overrides"]).toBeDefined();
        expect(registeredTools["set_instance_overrides"]).toBeDefined();
    });

    it("get_local_components should call sendCommandToFigma", async () => {
        registerComponentTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue([]);

        const result = await registeredTools["get_local_components"]({});

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_local_components");
        expect(result.content[0].text).toBe("[]");
    });

    it("create_component should call sendCommandToFigma with correct params", async () => {
        registerComponentTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ id: "comp-1" });

        const params = { nodeId: "node-1", nodeName: "Frame" };
        const result = await registeredTools["create_component"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("create_component", params);
        expect(result.content[0].text).toContain('"id": "comp-1"');
    });

    it("create_component_instance should call sendCommandToFigma with correct params", async () => {
        registerComponentTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ id: "inst-1" });

        const params = { componentKey: "key-1", x: 10, y: 10 };
        const result = await registeredTools["create_component_instance"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("create_component_instance", params);
        expect(result.content[0].text).toContain('"id":"inst-1"');
    });

    it("get_instance_overrides should call sendCommandToFigma with correct params", async () => {
        registerComponentTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ success: true, message: "Got it" });

        const params = { nodeId: "inst-1" };
        const result = await registeredTools["get_instance_overrides"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_instance_overrides", { instanceNodeId: "inst-1" });
        expect(result.content[0].text).toContain("Successfully got instance overrides");
    });

    it("set_instance_overrides should call sendCommandToFigma with correct params", async () => {
        registerComponentTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ success: true, totalCount: 1, results: [{ success: true }] });

        const params = { sourceInstanceId: "source-1", targetNodes: [{ nodeId: "target-1", nodeName: "Target" }] };
        const result = await registeredTools["set_instance_overrides"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_instance_overrides", params);
        expect(result.content[0].text).toContain("Successfully applied 1 overrides");
    });
});
