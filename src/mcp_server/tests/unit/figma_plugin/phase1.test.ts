import { describe, it, expect, beforeEach } from "bun:test";

const gateNodeMap = new Map<string, any>();
const gatePendingPromises = new Map<string | number, (msg: any) => void>();

let cloneCalled = false;
let setEffectsCalled = false;
let createNodeFromSvgCalled = false;
let createRectangleCalled = false;
let createFrameCalled = false;
let createTextCalled = false;
let createInstanceCalled = false;
let appendChildCalledOnParent = false;
let insertChildCalledOnParent = false;

const gateFigma = {
    showUI: () => { },
    ui: {
        onmessage: null as any,
        postMessage: (msg: any) => {
            const resolver = gatePendingPromises.get(msg.id);
            if (resolver) {
                resolver(msg);
                gatePendingPromises.delete(msg.id);
            }
        },
    },
    on: () => { },
    notify: () => { },
    closePlugin: () => { },
    clientStorage: { setAsync: async () => { } },
    getNodeByIdAsync: async (id: string) => gateNodeMap.get(id) || null,
    root: { id: "doc", name: "Doc", children: [] as any[] },
    mixed: Symbol("mixed"),
    loadFontAsync: async () => {},
    createRectangle: () => {
        createRectangleCalled = true;
        return { id: "rect-id", name: "Rectangle", type: "RECTANGLE", x: 0, y: 0, resize: () => {}, fills: [], strokes: [] };
    },
    createFrame: () => {
        createFrameCalled = true;
        return { id: "frame-id", name: "Frame", type: "FRAME", x: 0, y: 0, resize: () => {}, fills: [], strokes: [] };
    },
    createText: () => {
        createTextCalled = true;
        return { id: "text-id", name: "Text", type: "TEXT", x: 0, y: 0, fontName: { family: "Inter", style: "Regular" } };
    },
    createNodeFromSvg: () => {
        createNodeFromSvgCalled = true;
        return { id: "svg-id", name: "Svg", type: "FRAME" };
    },
    importComponentByKeyAsync: async (key: string) => {
        return {
            id: "remote-comp-id",
            name: "RemoteComponent",
            type: "COMPONENT",
            createInstance: () => {
                createInstanceCalled = true;
                return { id: "instance-id", name: "Instance", type: "INSTANCE", x: 0, y: 0 };
            }
        };
    }
};

(globalThis as any).__html__ = "<html></html>";
(globalThis as any).figma = gateFigma;

// Import main module and handlers
const mainMod: any = await import("../../../../../figma_plugin/src/main.js?scope=phase1");
const pluginState = mainMod.getPluginState();
const gateOnMessage = gateFigma.ui.onmessage as (msg: any) => Promise<void> | void;

describe("Phase 1: Dispatcher Guard Parity & Parent-Is-Instance Closure", () => {
    beforeEach(() => {
        pluginState.allowEditNode = "node";
        pluginState.scopeRootId = "scope-root";
        gateNodeMap.clear();
        cloneCalled = false;
        setEffectsCalled = false;
        createNodeFromSvgCalled = false;
        createRectangleCalled = false;
        createFrameCalled = false;
        createTextCalled = false;
        createInstanceCalled = false;
        appendChildCalledOnParent = false;
        insertChildCalledOnParent = false;
    });

    function setupEnvironment() {
        // scope-root node
        const scopeRoot: any = {
            id: "scope-root",
            name: "Scope Root",
            type: "FRAME",
            appendChild: (child: any) => {
                appendChildCalledOnParent = true;
            },
            insertChild: (index: number, child: any) => {
                insertChildCalledOnParent = true;
            },
            children: []
        };
        scopeRoot.parent = { id: "doc", name: "Doc", type: "FRAME", appendChild: (child: any) => {} };

        const parentNode: any = {
            id: "parent-id",
            name: "Parent Node",
            type: "FRAME",
            parent: scopeRoot,
            appendChild: (child: any) => {
                appendChildCalledOnParent = true;
            },
            insertChild: (index: number, child: any) => {
                insertChildCalledOnParent = true;
            },
            children: []
        };
        scopeRoot.children.push(parentNode);

        const targetNode: any = {
            id: "target-id",
            name: "Target Node",
            type: "FRAME",
            parent: parentNode,
            effects: [],
            set effects(val: any) {
                setEffectsCalled = true;
            }
        };
        parentNode.children.push(targetNode);

        const sourceNode: any = {
            id: "source-id",
            name: "Source Node",
            type: "FRAME",
            parent: parentNode,
            clone: () => {
                cloneCalled = true;
                return { id: "clone-id", name: "Source Node (Clone)", type: "FRAME", x: 0, y: 0 };
            }
        };
        parentNode.children.push(sourceNode);

        gateNodeMap.set("doc", scopeRoot.parent);
        gateNodeMap.set("scope-root", scopeRoot);
        gateNodeMap.set("target-id", targetNode);
        gateNodeMap.set("parent-id", parentNode);
        gateNodeMap.set("source-id", sourceNode);

        return { scopeRoot, targetNode, parentNode, sourceNode };
    }

    async function sendCommand(command: string, params: any) {
        const msg = {
            type: "execute-command",
            command,
            id: Math.random().toString(),
            params
        };
        const resultPromise = new Promise<any>((resolve) => {
            gatePendingPromises.set(msg.id, resolve);
        });
        await gateOnMessage!(msg);
        return await resultPromise;
    }

    describe("node_set_effects tests", () => {
        it("rejects when node-edit permission is missing", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false; // missing permission
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("Read-Only Mode");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects when no scope is linked", async () => {
            setupEnvironment();
            pluginState.scopeRootId = null; // no scope linked
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("outside editable scope");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects when the target is outside scope", async () => {
            const { targetNode } = setupEnvironment();
            targetNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" }; // outside scope
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("outside editable scope");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects when nodeName mismatches", async () => {
            setupEnvironment();
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Wrong Name", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("nodeName does not match");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects for a locked target", async () => {
            const { targetNode } = setupEnvironment();
            targetNode.locked = true;
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is locked");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects for a target under a locked ancestor", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is locked");
            expect(setEffectsCalled).toBe(false);
        });

        it("happy path succeeds on unlocked in-scope target", async () => {
            setupEnvironment();
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-result");
            expect(setEffectsCalled).toBe(true);
        });
    });

    describe("create_svg tests", () => {
        it("rejects when node-edit permission is missing", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("Read-Only Mode");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when no scope is linked", async () => {
            setupEnvironment();
            pluginState.scopeRootId = null;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("Parent outside editable scope");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when parent is outside scope", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" };
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("Parent outside editable scope");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when parentNodeName mismatches", async () => {
            setupEnvironment();
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Wrong Name", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("parentNodeName does not match");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects under locked parent", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is locked");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects under locked ancestor", async () => {
            const { scopeRoot } = setupEnvironment();
            scopeRoot.locked = true;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is locked");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects under instance interior", async () => {
            const { parentNode, scopeRoot } = setupEnvironment();
            const instanceAnc: any = { id: "instance-anc", name: "Anc Instance", type: "INSTANCE", parent: scopeRoot };
            parentNode.parent = instanceAnc;
            gateNodeMap.set("instance-anc", instanceAnc);
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("inside a component instance");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when parent itself is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is a component instance and cannot be appended to directly");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("happy path succeeds on valid parent", async () => {
            setupEnvironment();
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-result");
            expect(createNodeFromSvgCalled).toBe(true);
        });
    });

    describe("node_clone tests", () => {
        it("rejects when node-edit permission is missing", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("Read-Only Mode");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when no scope is linked", async () => {
            setupEnvironment();
            pluginState.scopeRootId = null;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("outside editable scope");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when source is outside scope", async () => {
            const { sourceNode } = setupEnvironment();
            sourceNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" };
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("outside editable scope");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when nodeName mismatches", async () => {
            setupEnvironment();
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Wrong Name" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("nodeName does not match");
            expect(cloneCalled).toBe(false);
        });

        it("rejects locked source", async () => {
            const { sourceNode } = setupEnvironment();
            sourceNode.locked = true;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is locked");
            expect(cloneCalled).toBe(false);
        });

        it("rejects source with locked ancestor", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is locked");
            expect(cloneCalled).toBe(false);
        });

        it("rejects source inside instance", async () => {
            const { sourceNode, scopeRoot } = setupEnvironment();
            const instanceAnc: any = { id: "instance-anc", name: "Anc Instance", type: "INSTANCE", parent: scopeRoot };
            sourceNode.parent = instanceAnc;
            gateNodeMap.set("instance-anc", instanceAnc);
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("inside a component instance");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when source has no parent", async () => {
            const { scopeRoot } = setupEnvironment();
            delete scopeRoot.parent;
            const res = await sendCommand("node_clone", { nodeId: "scope-root", nodeName: "Scope Root" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("has no parent and cannot be cloned");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when parent cannot accept children", async () => {
            const { parentNode } = setupEnvironment();
            delete (parentNode as any).appendChild;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("cannot accept cloned children");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when parent is locked or under a locked ancestor", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is locked");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when parent is outside scope", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" };
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("outside editable scope");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when cloning the scope root itself (G1 escape check)", async () => {
            setupEnvironment();
            // Try to clone "scope-root" itself. Its parent is "doc" which is outside scope.
            const res = await sendCommand("node_clone", { nodeId: "scope-root", nodeName: "Scope Root" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("Parent outside editable scope");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when parent is an INSTANCE or inside an instance interior", async () => {
            const { sourceNode, scopeRoot } = setupEnvironment();
            const instanceParent: any = {
                id: "parent-id",
                name: "Parent Node",
                type: "INSTANCE",
                parent: scopeRoot,
                appendChild: (child: any) => {
                    appendChildCalledOnParent = true;
                },
                children: [sourceNode]
            };
            sourceNode.parent = instanceParent;
            gateNodeMap.set("parent-id", instanceParent);
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("inside a component instance");
            expect(cloneCalled).toBe(false);
        });

        it("happy path succeeds for unlocked in-scope source and parent", async () => {
            setupEnvironment();
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-result");
            expect(cloneCalled).toBe(true);
        });
    });

    describe("Parent-is-instance regressions for other tools", () => {
        it("create_shape rejects when parent is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_shape", { parentId: "parent-id", parentNodeName: "Parent Node", type: "RECTANGLE" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is a component instance and cannot be appended to directly");
            expect(createRectangleCalled).toBe(false);
        });

        it("create_frame rejects when parent is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_frame", { parentId: "parent-id", parentNodeName: "Parent Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is a component instance and cannot be appended to directly");
            expect(createFrameCalled).toBe(false);
        });

        it("create_text rejects when parent is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_text", { parentId: "parent-id", parentNodeName: "Parent Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is a component instance and cannot be appended to directly");
            expect(createTextCalled).toBe(false);
        });

        it("create_instance rejects when parent is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_instance", { parentId: "parent-id", parentNodeName: "Parent Node", componentId: "remote-comp-id" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is a component instance and cannot be appended to directly");
            expect(createInstanceCalled).toBe(false);
        });

        it("node_insert_child rejects when parent is an INSTANCE", async () => {
            const { parentNode, targetNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("node_insert_child", { parentId: "parent-id", parentNodeName: "Parent Node", childId: "target-id", childNodeName: "Target Node" });
            expect(res.type).toBe("command-error");
            expect(res.error).toContain("is a component instance and cannot be inserted into directly");
            expect(appendChildCalledOnParent).toBe(false);
        });
    });
});
