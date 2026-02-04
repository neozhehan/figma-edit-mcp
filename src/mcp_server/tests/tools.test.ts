import { registerTools } from "../tools.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sendCommandToFigma } from "../figma-client.js";

jest.mock("../figma-client.js");
jest.mock("@modelcontextprotocol/sdk/server/mcp.js");

describe("Tools", () => {
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

    it("should register tools", () => {
        registerTools(mockServer as unknown as McpServer);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["get_document_info"]).toBeDefined();
        expect(registeredTools["get_page_info"]).toBeDefined();
    });

    it("get_document_info should call sendCommandToFigma and return result", async () => {
        registerTools(mockServer as unknown as McpServer);

        const mockResult = { id: "doc-123", name: "My Doc" };
        (sendCommandToFigma as jest.Mock).mockResolvedValue(mockResult);

        const result = await registeredTools["get_document_info"]({});

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_document_info");
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });

    it("create_rectangle should call sendCommandToFigma with correct params", async () => {
        registerTools(mockServer as unknown as McpServer);

        const mockResult = { id: "rect-1", name: "Rectangle" };
        (sendCommandToFigma as jest.Mock).mockResolvedValue(mockResult);

        const params = { x: 10, y: 20, width: 100, height: 100, name: "Test Rect" };
        const result = await registeredTools["create_rectangle"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("create_rectangle", expect.objectContaining({
            x: 10, y: 20, width: 100, height: 100, name: "Test Rect"
        }));
        expect(result.content[0].text).toContain("Created rectangle");
    });
});
