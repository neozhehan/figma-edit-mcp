
import { jest } from '@jest/globals';

// Define mocks
jest.unstable_mockModule('../../../figma-client.js', () => ({
    sendCommandToFigma: jest.fn(),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

// Import modules
const { registerPrototypingTools } = await import('../../../tools/prototyping.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Prototyping Tools", () => {
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

    it("should register prototyping tools", () => {
        registerPrototypingTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["get_reactions"]).toBeDefined();
        expect(registeredTools["set_default_connector"]).toBeDefined();
        expect(registeredTools["create_connections"]).toBeDefined();
    });

    it("get_reactions should call sendCommandToFigma with correct params", async () => {
        registerPrototypingTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue([]);

        const params = { nodeIds: ["node-1"] };
        const result = await registeredTools["get_reactions"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_reactions", params);
        expect(result.content[0].text).toBe("[]");
        expect(result.followUp.prompt).toBe("reaction_to_connector_strategy");
    });

    it("set_default_connector should call sendCommandToFigma with correct params", async () => {
        registerPrototypingTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ success: true });

        const params = { connectorId: "conn-1" };
        const result = await registeredTools["set_default_connector"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_default_connector", params);
        expect(result.content[0].text).toContain('"success":true');
    });

    it("create_connections should call sendCommandToFigma with correct params", async () => {
        registerPrototypingTools(mockServer as any);
        (sendCommandToFigma as jest.Mock).mockResolvedValue({ count: 1 });

        const params = {
            connections: [{ startNodeId: "1", startNodeName: "A", endNodeId: "2", endNodeName: "B" }]
        };
        const result = await registeredTools["create_connections"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("create_connections", params);
        expect(result.content[0].text).toContain("Created 1 connections");
    });
});
