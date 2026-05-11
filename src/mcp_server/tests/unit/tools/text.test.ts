import { describe, it, expect, beforeEach, mock } from "bun:test";

// Define mocks
mock.module('../../../figma-client.js', () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
}));

mock.module('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class { },
}));

mock.module('../../../utils.js', () => ({
    normalizeNodeId: mock((id) => id.replace('-', ':'))
}));

// Import modules
const { registerTextTools } = await import('../../../tools/text.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Text Tools", () => {
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

    it("should register text tools", () => {
        registerTextTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["create_text"]).toBeDefined();
        expect(registeredTools["set_multiple_text_contents"]).toBeDefined();
    });

    it("create_text should call sendCommandToFigma with correct params", async () => {
        registerTextTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Text Node", id: "text-1" });

        const params = { x: 10, y: 10, text: "Hello", fontSize: 16 };
        const result = await registeredTools["create_text"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("create_text", expect.objectContaining({
            x: 10,
            y: 10,
            text: "Hello",
            fontSize: 16
        }));
        expect(result.content[0].text).toContain('Created text "Text Node" with ID: text-1');
    });

    it("set_multiple_text_contents should call sendCommandToFigma with correct params", async () => {
        registerTextTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({
            success: true,
            replacementsApplied: 1,
            completedInChunks: 1
        });

        const params = {
            nodeId: "parent-1",
            text: [{ nodeId: "text-1", nodeName: "Text", text: "New Text" }]
        };
        const result = await registeredTools["set_multiple_text_contents"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_multiple_text_contents", {
            nodeId: "parent:1",
            text: [{ nodeId: "text:1", nodeName: "Text", text: "New Text" }]
        });
        expect(result.content[0].text).toContain("Starting text replacement");
    });

    it("set_text_style should call sendCommandToFigma with correct params", async () => {
        registerTextTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ id: "123:456" });

        const params = { nodeId: "123-456", fontSize: 24, fontFamily: "Inter", fontStyle: "Bold" };
        const result = await registeredTools["set_text_style"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_text_style", expect.objectContaining({
            nodeId: "123:456",
            fontSize: 24,
            fontFamily: "Inter",
            fontStyle: "Bold"
        }));
        expect(result.content[0].text).toBeDefined();
    });

    it("should register text_replacement_strategy prompt with updated fields", () => {
        let registeredPrompts: Record<string, Function> = {};
        mockServer.prompt = mock((name, desc, handler) => {
            registeredPrompts[name] = handler;
        });

        registerTextTools(mockServer as any);
        const promptHandler = registeredPrompts["text_replacement_strategy"];
        expect(promptHandler).toBeDefined();

        const result = promptHandler({});
        const text = result.messages[0].content.text;

        expect(text).toContain('filter: { type: ["TEXT"] }');
        expect(text).not.toContain('scan_text_nodes');
    });
});
