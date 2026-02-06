import { describe, it, expect, beforeEach, mock } from "bun:test";

// Define mocks before imports
mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
}));

mock.module('@modelcontextprotocol/sdk/server/mcp.js', () => ({
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
            tool: mock((name, description, schema, handler) => {
                registeredTools[name] = handler;
            })
        };
        (sendCommandToFigma as any).mockClear();
    });

    it("should register creation tools", () => {
        registerCreationTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["create_rectangle"]).toBeDefined();
        expect(registeredTools["create_ellipse"]).toBeDefined();
        expect(registeredTools["create_polygon_star"]).toBeDefined();
    });

    it("create_rectangle should call sendCommandToFigma with correct params", async () => {
        // Setup
        const mockResult = { id: "rect-1", name: "Rectangle" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

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

    it("create_ellipse should call sendCommandToFigma with correct params", async () => {
        // Setup
        const mockResult = { id: "ellipse-1", name: "Ellipse" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        // Register
        registerCreationTools(mockServer as any);

        // Execute
        const params = {
            x: 10,
            y: 20,
            width: 100,
            height: 100,
            name: "Test Ellipse",
            arcData: { startingAngle: 0, endingAngle: 3.14, innerRadius: 0.5 }
        };
        const result = await registeredTools["create_ellipse"](params);

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("create_ellipse", expect.objectContaining({
            x: 10,
            y: 20,
            width: 100,
            height: 100,
            name: "Test Ellipse",
            arcData: { startingAngle: 0, endingAngle: 3.14, innerRadius: 0.5 }
        }));
        expect(result.content[0].text).toContain(JSON.stringify(mockResult, null, 2));
    });

    it("create_polygon_star should call sendCommandToFigma with correct params", async () => {
        // Setup
        const mockResult = { id: "star-1", name: "Star" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        // Register
        registerCreationTools(mockServer as any);

        // Execute
        const params = {
            x: 10,
            y: 20,
            width: 100,
            height: 100,
            name: "Test Star",
            pointCount: 5,
            innerRadius: 0.5
        };
        const result = await registeredTools["create_polygon_star"](params);

        // Verify
        expect(sendCommandToFigma).toHaveBeenCalledWith("create_polygon_star", expect.objectContaining({
            x: 10,
            y: 20,
            width: 100,
            height: 100,
            name: "Test Star",
            pointCount: 5,
            innerRadius: 0.5
        }));
        expect(result.content[0].text).toContain(JSON.stringify(mockResult, null, 2));
    });
});
