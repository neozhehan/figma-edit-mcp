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
const { registerModificationTools } = await import('../../../tools/modification.js');
const { sendCommandToFigma } = await import('../../../figma-client.js');

describe("Modification Tools", () => {
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

    it("should register modification tools", () => {
        registerModificationTools(mockServer as any);
        expect(mockServer.tool).toHaveBeenCalled();
        expect(registeredTools["move_node"]).toBeDefined();
        expect(registeredTools["resize_node"]).toBeDefined();
        expect(registeredTools["set_node_name"]).toBeDefined();
        expect(registeredTools["delete_multiple_nodes"]).toBeDefined();
        expect(registeredTools["clone_node"]).toBeDefined();
        expect(registeredTools["set_selections"]).toBeDefined();
    });

    it("move_node should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = { nodeId: "node-1", nodeName: "Test Node", x: 50, y: 50 };
        const result = await registeredTools["move_node"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("move_node", params);
        expect(result.content[0].text).toContain('Moved node "Test Node" to position (50, 50)');
    });

    it("resize_node should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Test Node" });

        const params = { nodeId: "node-1", nodeName: "Test Node", width: 200, height: 100 };
        const result = await registeredTools["resize_node"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("resize_node", params);
        expect(result.content[0].text).toContain('Resized node "Test Node"');
    });

    it("set_node_name should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "New Name", oldName: "Old Name" });

        const params = { nodeId: "node-1", nodeName: "Old Name", name: "New Name" };
        const result = await registeredTools["set_node_name"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_node_name", params);
        expect(result.content[0].text).toContain('Renamed node from "Old Name" to "New Name"');
    });

    it("delete_multiple_nodes should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ deletedCount: 2 });

        const params = { nodes: [{ nodeId: "1", nodeName: "A" }, { nodeId: "2", nodeName: "B" }] };
        const result = await registeredTools["delete_multiple_nodes"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("delete_multiple_nodes", params);
        expect(result.content[0].text).toContain('{"deletedCount":2}');
    });

    it("clone_node should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ name: "Cloned Node", id: "node-new" });

        const params = { nodeId: "node-1", nodeName: "Test Node" };
        const result = await registeredTools["clone_node"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("clone_node", params);
        expect(result.content[0].text).toContain('Cloned node "Cloned Node" with new ID: node-new');
    });

    it("set_selections should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ count: 1, selectedNodes: [{ id: "node-1", name: "Test Node" }] });

        const params = { nodeIds: ["node-1"] };
        const result = await registeredTools["set_selections"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("set_selections", params);
        expect(result.content[0].text).toContain('Selected 1 nodes: "Test Node" (node-1)');
    });

    it("group_nodes should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ id: "group-1", name: "New Group", childCount: 2 });

        const params = {
            nodes: [{ nodeId: "1", nodeName: "A" }, { nodeId: "2", nodeName: "B" }],
            name: "New Group"
        };
        const result = await registeredTools["group_nodes"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("group_nodes", params);
        expect(result.content[0].text).toContain('Grouped 2 nodes into new group "New Group" (ID: group-1)');
    });

    it("ungroup_nodes should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ ungroupedChildren: [{ id: "1", name: "A" }, { id: "2", name: "B" }], parentId: "parent-1" });

        const params = { nodeId: "group-1", nodeName: "Group" };
        const result = await registeredTools["ungroup_nodes"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("ungroup_nodes", params);
        expect(result.content[0].text).toContain('Ungrouped node. Children: "A" (1), "B" (2)');
    });

    it("flatten_node should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ id: "flat-1", name: "Vector", type: "VECTOR" });

        const params = { nodeId: "node-1", nodeName: "Node" };
        const result = await registeredTools["flatten_node"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("flatten_node", params);
        expect(result.content[0].text).toContain('Flattened node to specific vector/shape (ID: flat-1)');
    });

    it("insert_child should call sendCommandToFigma with correct params", async () => {
        registerModificationTools(mockServer as any);
        (sendCommandToFigma as any).mockResolvedValue({ childId: "child-1", newParentId: "parent-1", index: 0 });

        const params = {
            parentId: "parent-1",
            parentNodeName: "Parent",
            childId: "child-1",
            childNodeName: "Child",
            index: 0
        };
        const result = await registeredTools["insert_child"](params);

        expect(sendCommandToFigma).toHaveBeenCalledWith("insert_child", params);
        expect(result.content[0].text).toContain('Inserted child child-1 into parent parent-1 at index 0');
    });
});
