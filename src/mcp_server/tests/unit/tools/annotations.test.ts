import { describe, it, expect, beforeEach, mock } from "bun:test";

// Define mocks
mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
}));

mock.module('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

// Import modules
const { registerAnnotationTools } = await import('../../../tools/annotations.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Annotation Tools", () => {
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

    it("should register annotation tools", () => {
        registerAnnotationTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["get_annotations"]).toBeDefined();
        expect(registeredTools["set_multiple_annotations"]).toBeDefined();
    });

    it("get_annotations should call sendCommandToFigma with correct params", async () => {
        registerAnnotationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ categories: [] });

        const params = { nodeId: "node-1", includeCategories: true };
        const result = await registeredTools["get_annotations"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("get_annotations", params);
        expect(result.content[0].text).toContain('"categories":[]');
    });

    it("set_multiple_annotations should call sendCommandToFigma with correct params", async () => {
        registerAnnotationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({
            success: true,
            annotationsApplied: 1,
            completedInChunks: 1
        });

        const params = {
            nodeId: "parent-1",
            annotations: [{ nodeId: "note-1", nodeName: "Annotation", labelMarkdown: "Note" }]
        };
        const result = await registeredTools["set_multiple_annotations"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_multiple_annotations", params);
        expect(result.content[1].text).toContain("Annotation process completed");
    });
});
