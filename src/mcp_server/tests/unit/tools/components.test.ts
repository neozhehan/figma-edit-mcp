import { describe, it, expect, beforeEach, mock } from "bun:test";
import { z } from "zod";

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
    let registeredSchemas: Record<string, any> = {};

    beforeEach(() => {
        registeredTools = {};
        registeredSchemas = {};
        mockServer = {
            tool: mock((name, description, schema, handler) => {
                registeredTools[name] = handler;
                registeredSchemas[name] = schema;
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

    it("should register swap_overrides_instances prompt with updated fields", () => {
        let registeredPrompts: Record<string, Function> = {};
        mockServer.prompt = mock((name, desc, handler) => {
            registeredPrompts[name] = handler;
        });

        registerComponentTools(mockServer as any);
        const promptHandler = registeredPrompts["swap_overrides_instances"];
        expect(promptHandler).toBeDefined();

        const result = promptHandler({});
        const text = result.messages[0].content.text;

        expect(text).toContain('properties: ["componentProperties", "characters", "overrides"]');
        expect(text).toContain('targetNodes: [');
        expect(text).toContain('{ nodeId: "target-id-1"');
        expect(text).not.toContain('targetNodeIds: [');
    });

    it("set_component_instance_property should call sendCommandToFigma with correct params (BOOLEAN true)", async () => {
        const mockResult = { id: "1:1", name: "Instance", type: "INSTANCE" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Instance",
            propertyName: "Show Icon",
            value: true
        };
        const result = await registeredTools["set_component_instance_property"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_component_instance_property", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });

    it("set_component_instance_property should forward BOOLEAN false value", async () => {
        const mockResult = { id: "1:1", name: "Instance", type: "INSTANCE" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Instance",
            propertyName: "Show Icon",
            value: false
        };
        await registeredTools["set_component_instance_property"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_component_instance_property", params);
    });

    it("set_component_instance_property should forward TEXT string value", async () => {
        const mockResult = { id: "1:1", name: "Instance", type: "INSTANCE" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Instance",
            propertyName: "Label",
            value: "Hello world"
        };
        await registeredTools["set_component_instance_property"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_component_instance_property", params);
    });

    it("set_component_instance_property should forward INSTANCE_SWAP component-key value", async () => {
        const mockResult = { id: "1:1", name: "Instance", type: "INSTANCE" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Instance",
            propertyName: "Icon",
            value: "abc123def456componentkey"
        };
        await registeredTools["set_component_instance_property"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_component_instance_property", params);
    });

    it("set_component_instance_property should forward VARIANT selection value", async () => {
        const mockResult = { id: "1:1", name: "Instance", type: "INSTANCE" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Instance",
            propertyName: "State",
            value: "Hover"
        };
        await registeredTools["set_component_instance_property"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_component_instance_property", params);
    });

    it("manage_component_property ADD should call sendCommandToFigma with correct params", async () => {
        const mockResult = { id: "1:1", name: "Component", action: "ADD" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Component",
            action: "ADD",
            propertyName: "New Prop",
            propertyType: "TEXT",
            defaultValue: "Default"
        };
        const result = await registeredTools["manage_component_property"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("manage_component_property", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });

    it("manage_component_property ADD without propertyType should throw error", async () => {
        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Component",
            action: "ADD",
            propertyName: "New Prop",
            // missing propertyType
            defaultValue: "Default"
        };
        const result = await registeredTools["manage_component_property"](params);

        expect(result.content[0].text).toContain("propertyType and defaultValue are required for ADD action");
    });

    it("manage_component_property ADD without defaultValue should throw error", async () => {
        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Component",
            action: "ADD",
            propertyName: "New Prop",
            propertyType: "TEXT",
            // missing defaultValue
        };
        const result = await registeredTools["manage_component_property"](params);

        expect(result.content[0].text).toContain("propertyType and defaultValue are required for ADD action");
    });

    it("manage_component_property schema rejects propertyType: 'VARIANT'", () => {
        registerComponentTools(mockServer as any);
        const schema = registeredSchemas["manage_component_property"];
        expect(schema).toBeDefined();

        const fullSchema = z.object(schema);
        const result = fullSchema.safeParse({
            nodeId: "1:1",
            nodeName: "Component",
            action: "ADD",
            propertyName: "New Variant",
            propertyType: "VARIANT",
            defaultValue: "Val"
        });

        expect(result.success).toBe(false);
        const issues = (result as any).error?.issues ?? [];
        const propertyTypeIssue = issues.find((i: any) => i.path.includes("propertyType"));
        expect(propertyTypeIssue).toBeDefined();
    });

    it("manage_component_property schema accepts BOOLEAN, TEXT, INSTANCE_SWAP propertyTypes", () => {
        registerComponentTools(mockServer as any);
        const schema = registeredSchemas["manage_component_property"];
        const fullSchema = z.object(schema);

        for (const propertyType of ["BOOLEAN", "TEXT", "INSTANCE_SWAP"] as const) {
            const result = fullSchema.safeParse({
                nodeId: "1:1",
                nodeName: "Component",
                action: "ADD",
                propertyName: "New Prop",
                propertyType,
                defaultValue: propertyType === "BOOLEAN" ? false : "value"
            });
            expect(result.success).toBe(true);
        }
    });

    it("manage_component_property EDIT should call sendCommandToFigma with correct params", async () => {
        const mockResult = { id: "1:1", name: "Component", action: "EDIT" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Component",
            action: "EDIT",
            propertyName: "Old Prop",
            newPropertyName: "Renamed Prop",
            newDefaultValue: "New Default",
            preferredValues: [{ type: "COMPONENT", key: "key1" }]
        };
        const result = await registeredTools["manage_component_property"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("manage_component_property", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });

    it("manage_component_property schema rejects preferredValues entries that are bare strings", () => {
        registerComponentTools(mockServer as any);
        const schema = registeredSchemas["manage_component_property"];
        const fullSchema = z.object(schema);

        const result = fullSchema.safeParse({
            nodeId: "1:1",
            nodeName: "Component",
            action: "EDIT",
            propertyName: "Slot",
            preferredValues: ["bare-key-1", "bare-key-2"]
        });

        expect(result.success).toBe(false);
        const issues = (result as any).error?.issues ?? [];
        const preferredValuesIssue = issues.find((i: any) => i.path.includes("preferredValues"));
        expect(preferredValuesIssue).toBeDefined();
    });

    it("manage_component_property schema accepts structured preferredValues with type+key", () => {
        registerComponentTools(mockServer as any);
        const schema = registeredSchemas["manage_component_property"];
        const fullSchema = z.object(schema);

        const result = fullSchema.safeParse({
            nodeId: "1:1",
            nodeName: "Component",
            action: "EDIT",
            propertyName: "Slot",
            preferredValues: [
                { type: "COMPONENT", key: "abc123" },
                { type: "COMPONENT_SET", key: "def456" }
            ]
        });

        expect(result.success).toBe(true);
    });

    it("manage_component_property DELETE should call sendCommandToFigma with correct params", async () => {
        const mockResult = { id: "1:1", name: "Component", action: "DELETE" };
        (sendCommandToFigma as any).mockResolvedValue(mockResult);

        registerComponentTools(mockServer as any);

        const params = {
            nodeId: "1:1",
            nodeName: "Component",
            action: "DELETE",
            propertyName: "Prop to Delete"
        };
        const result = await registeredTools["manage_component_property"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("manage_component_property", params);
        expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
    });
});
