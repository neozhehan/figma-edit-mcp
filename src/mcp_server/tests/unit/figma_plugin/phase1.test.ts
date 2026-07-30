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
let createComponentCalled = false;
let appendChildCalledOnParent = false;
let insertChildCalledOnParent = false;
let connectorNameReadCount = 0;
const gateNodeLookups: string[] = [];

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
    getNodeByIdAsync: async (id: string) => {
        gateNodeLookups.push(id);
        return gateNodeMap.get(id) || null;
    },
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
    createComponent: () => {
        createComponentCalled = true;
        return { id: "component-id", name: "Component", type: "COMPONENT" };
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
        createComponentCalled = false;
        appendChildCalledOnParent = false;
        insertChildCalledOnParent = false;
        connectorNameReadCount = 0;
        gateNodeLookups.length = 0;
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
            expect(res.error.message).toContain("Read-Only Mode");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects when no scope is linked", async () => {
            setupEnvironment();
            pluginState.scopeRootId = null; // no scope linked
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("outside editable scope");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects when the target is outside scope", async () => {
            const { targetNode } = setupEnvironment();
            targetNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" }; // outside scope
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("outside editable scope");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects when nodeName mismatches", async () => {
            setupEnvironment();
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Wrong Name", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("nodeName does not match");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects for a locked target", async () => {
            const { targetNode } = setupEnvironment();
            targetNode.locked = true;
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is locked");
            expect(setEffectsCalled).toBe(false);
        });

        it("rejects for a target under a locked ancestor", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is locked");
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
            expect(res.error.message).toContain("Read-Only Mode");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when no scope is linked", async () => {
            setupEnvironment();
            pluginState.scopeRootId = null;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("Parent outside editable scope");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when parent is outside scope", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" };
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("Parent outside editable scope");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when parentNodeName mismatches", async () => {
            setupEnvironment();
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Wrong Name", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error.code).toBe("PARENT_NAME_MISMATCH");
            expect(res.error.message).toContain("does not match the parent's stored name");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when parentNodeName is omitted with PARENT_NAME_MISSING (Q22/P5-2 defense in depth)", async () => {
            setupEnvironment();
            const res = await sendCommand("create_svg", { parentId: "parent-id", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error.code).toBe("PARENT_NAME_MISSING");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("C9: present-empty parentNodeName is a MISMATCH, not MISSING (empty is a value, not omission)", async () => {
            setupEnvironment(); // parent is named "Parent Node"
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            // Red-proof of the truthiness bug: `if (!expectedParentName)` would
            // classify "" as MISSING; the nullish check makes it a real MISMATCH.
            expect(res.error.code).toBe("PARENT_NAME_MISMATCH");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("C9: an exactly empty-named parent is usable when parentNodeName is the same empty string", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.name = ""; // a parent legitimately named ""
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "", svg: "<svg></svg>" });
            expect(res.type).not.toBe("command-error"); // empty-but-exact name matches → proceeds
            expect(createNodeFromSvgCalled).toBe(true);
        });

        it("rejects under locked parent", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is locked");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects under locked ancestor", async () => {
            const { scopeRoot } = setupEnvironment();
            scopeRoot.locked = true;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is locked");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects under instance interior", async () => {
            const { parentNode, scopeRoot } = setupEnvironment();
            const instanceAnc: any = { id: "instance-anc", name: "Anc Instance", type: "INSTANCE", parent: scopeRoot };
            parentNode.parent = instanceAnc;
            gateNodeMap.set("instance-anc", instanceAnc);
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("inside a component instance");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("rejects when parent itself is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is a component instance and cannot be appended to directly");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("happy path succeeds on valid parent", async () => {
            setupEnvironment();
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-result");
            expect(createNodeFromSvgCalled).toBe(true);
        });
    });

    describe("create_component tests", () => {
        it("rejects a source frame inside an instance before createComponent() can create an orphan", async () => {
            const { targetNode, parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";

            const res = await sendCommand("create_component", {
                nodeId: targetNode.id,
                nodeName: targetNode.name,
            });

            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("inside a component instance");
            expect(res.error.message).toContain("cannot be converted to a component directly");
            expect(createComponentCalled).toBe(false);
            expect(insertChildCalledOnParent).toBe(false);
        });
    });

    describe("creator cleanup disclosure through the real dispatcher", () => {
        it("preserves append failure and transports survivor evidence when cleanup also fails", async () => {
            const { parentNode } = setupEnvironment();
            const implicitPage = {
                id: "page-id",
                name: "Page",
                type: "PAGE",
                children: [] as any[],
            };
            const survivor: any = {
                id: "survivor-id",
                name: "Rectangle",
                type: "RECTANGLE",
                removed: false,
                parent: implicitPage,
                remove: () => {
                    throw new Error("CLEANUP_FAILURE");
                },
            };
            implicitPage.children.push(survivor);
            parentNode.appendChild = () => {
                throw new Error("APPEND_FAILURE");
            };

            const originalCreateRectangle = (gateFigma as any).createRectangle;
            const originalConsoleError = console.error;
            let res: any;
            try {
                (gateFigma as any).createRectangle = () => {
                    createRectangleCalled = true;
                    return survivor;
                };
                console.error = () => {};
                res = await sendCommand("create_shape", {
                    type: "RECTANGLE",
                    parentId: parentNode.id,
                    parentNodeName: parentNode.name,
                });
            } finally {
                (gateFigma as any).createRectangle = originalCreateRectangle;
                console.error = originalConsoleError;
            }

            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("APPEND_FAILURE");
            expect(res.error.message).not.toContain("CLEANUP_FAILURE");
            expect(res.error.details?.partialMutation).toBe(true);
            expect(res.error.details?.before).toEqual({
                survivingNodeId: survivor.id,
                survivingNodeName: survivor.name,
                survivingNodeType: survivor.type,
                survivingParentState: "located",
                survivingParentId: implicitPage.id,
                verifiedParentId: parentNode.id,
            });
            expect(survivor.removed).toBe(false);
            expect(survivor.parent).toBe(implicitPage);
        });
    });

    describe("removed create_connection dispatcher surface", () => {
        function setupConnectorEnvironment(outsideScope = false) {
            const { scopeRoot, parentNode, targetNode, sourceNode } =
                setupEnvironment();
            const designPage: any = {
                id: "design-page",
                name: "Design Page",
                type: "PAGE",
                parent: { id: "document", type: "DOCUMENT" },
                children: [scopeRoot],
                appendChild: () => {},
            };
            scopeRoot.parent = designPage;
            gateNodeMap.set(designPage.id, designPage);

            const outsidePage: any = {
                id: "outside-page",
                name: "Outside Page",
                type: "PAGE",
                parent: { id: "document", type: "DOCUMENT" },
                children: [],
                appendChild: () => {},
            };
            const destination = outsideScope ? outsidePage : parentNode;
            const connector: any = {
                id: "connector-template",
                type: "CONNECTOR",
                parent: destination,
                text: {
                    fontName: { family: "Inter", style: "Regular" },
                },
                get name() {
                    connectorNameReadCount++;
                    return "Flow Connector";
                },
                clone: () => {
                    cloneCalled = true;
                    return {
                        id: "connector-clone",
                        name: "Flow Connector",
                        type: "CONNECTOR",
                        parent: designPage,
                        removed: false,
                        text: {
                            fontName: { family: "Inter", style: "Regular" },
                            characters: "",
                        },
                        remove() {
                            this.removed = true;
                            this.parent = null;
                        },
                    };
                },
            };
            destination.children?.push(connector);
            gateNodeMap.set(connector.id, connector);

            return { connector, targetNode, sourceNode };
        }

        function connectorParams(connectorName = "Flow Connector") {
            return {
                connectorId: "connector-template",
                connectorName,
                connections: [{
                    startNodeId: "target-id",
                    startNodeName: "Target Node",
                    endNodeId: "source-id",
                    endNodeName: "Source Node",
                }],
            };
        }

        it("rejects the removed command before inspecting an out-of-scope template", async () => {
            setupConnectorEnvironment(true);
            const res = await sendCommand(
                "create_connection",
                connectorParams(),
            );

            expect(res.type).toBe("command-error");
            expect(res.error.code).toBe("UNKNOWN_ERROR");
            expect(res.error.message).toContain("Unknown command: create_connection");
            expect(cloneCalled).toBe(false);
            expect(gateNodeLookups).not.toContain("connector-template");
            expect(connectorNameReadCount).toBe(0);
        });

        it("rejects the removed command without resolving a stale template name", async () => {
            setupConnectorEnvironment();
            const res = await sendCommand(
                "create_connection",
                connectorParams("Stale Connector Name"),
            );

            expect(res.type).toBe("command-error");
            expect(res.error.code).toBe("UNKNOWN_ERROR");
            expect(res.error.message).toContain("Unknown command: create_connection");
            expect(cloneCalled).toBe(false);
            expect(gateNodeLookups).not.toContain("connector-template");
            expect(connectorNameReadCount).toBe(0);
        });

        it("does not retain a hidden raw-command path", async () => {
            setupConnectorEnvironment();
            const res = await sendCommand(
                "create_connection",
                connectorParams(),
            );

            expect(res.type).toBe("command-error");
            expect(res.error.code).toBe("UNKNOWN_ERROR");
            expect(res.error.message).toContain("Unknown command: create_connection");
            expect(cloneCalled).toBe(false);
            expect(gateNodeLookups).not.toContain("connector-template");
            expect(connectorNameReadCount).toBe(0);
        });
    });

    describe("retained reaction_list dispatcher surface", () => {
        it("executes the moved reader and returns a non-CHANGE_TO reaction", async () => {
            const { targetNode } = setupEnvironment();
            const reaction = {
                trigger: { type: "ON_CLICK" },
                action: {
                    type: "NODE",
                    navigation: "NAVIGATE",
                    destinationId: "source-id",
                },
            };
            const prototypeChild = {
                id: "prototype-child",
                name: "Prototype Child",
                type: "FRAME",
                parent: targetNode,
                reactions: [reaction],
                children: [],
            };
            targetNode.reactions = [];
            targetNode.children = [prototypeChild];

            const res = await sendCommand("reaction_list", {
                nodeIds: ["target-id"],
            });

            expect(res.type).toBe("command-result");
            expect(res.result.nodesCount).toBe(1);
            expect(res.result.nodesWithReactions).toBe(1);
            expect(res.result.nodes).toHaveLength(1);
            expect(res.result.nodes[0]).toMatchObject({
                id: "prototype-child",
                name: "Prototype Child",
                depth: 1,
                path: "Scope Root > Parent Node > Target Node > Prototype Child",
                reactions: [reaction],
            });
        });
    });

    describe("node_clone tests", () => {
        it("rejects when node-edit permission is missing", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("Read-Only Mode");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when no scope is linked", async () => {
            setupEnvironment();
            pluginState.scopeRootId = null;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("outside editable scope");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when source is outside scope", async () => {
            const { sourceNode } = setupEnvironment();
            sourceNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" };
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("outside editable scope");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when nodeName mismatches", async () => {
            setupEnvironment();
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Wrong Name" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("nodeName does not match");
            expect(cloneCalled).toBe(false);
        });

        it("rejects locked source", async () => {
            const { sourceNode } = setupEnvironment();
            sourceNode.locked = true;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is locked");
            expect(cloneCalled).toBe(false);
        });

        it("rejects source with locked ancestor", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is locked");
            expect(cloneCalled).toBe(false);
        });

        it("rejects source inside instance", async () => {
            const { sourceNode, scopeRoot } = setupEnvironment();
            const instanceAnc: any = { id: "instance-anc", name: "Anc Instance", type: "INSTANCE", parent: scopeRoot };
            sourceNode.parent = instanceAnc;
            gateNodeMap.set("instance-anc", instanceAnc);
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("inside a component instance");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when source has no parent", async () => {
            const { scopeRoot } = setupEnvironment();
            delete scopeRoot.parent;
            const res = await sendCommand("node_clone", { nodeId: "scope-root", nodeName: "Scope Root" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("has no parent and cannot be cloned");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when parent cannot accept children", async () => {
            const { parentNode } = setupEnvironment();
            delete (parentNode as any).appendChild;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("cannot accept cloned children");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when parent is locked or under a locked ancestor", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is locked");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when parent is outside scope", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" };
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("outside editable scope");
            expect(cloneCalled).toBe(false);
        });

        it("rejects when cloning the scope root itself (G1 escape check)", async () => {
            setupEnvironment();
            // Try to clone "scope-root" itself. Its parent is "doc" which is outside scope.
            const res = await sendCommand("node_clone", { nodeId: "scope-root", nodeName: "Scope Root" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("Parent outside editable scope");
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
            expect(res.error.message).toContain("inside a component instance");
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
            expect(res.error.message).toContain("is a component instance and cannot be appended to directly");
            expect(createRectangleCalled).toBe(false);
        });

        it("create_frame rejects when parent is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_frame", { parentId: "parent-id", parentNodeName: "Parent Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is a component instance and cannot be appended to directly");
            expect(createFrameCalled).toBe(false);
        });

        it("create_text rejects when parent is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_text", { parentId: "parent-id", parentNodeName: "Parent Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is a component instance and cannot be appended to directly");
            expect(createTextCalled).toBe(false);
        });

        it("create_instance rejects when parent is an INSTANCE", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_instance", { parentId: "parent-id", parentNodeName: "Parent Node", componentId: "remote-comp-id" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is a component instance and cannot be appended to directly");
            expect(createInstanceCalled).toBe(false);
        });

        it("node_insert_child rejects when parent is an INSTANCE", async () => {
            const { parentNode, targetNode } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("node_insert_child", { parentId: "parent-id", parentNodeName: "Parent Node", childId: "target-id", childNodeName: "Target Node" });
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("is a component instance and cannot be inserted into directly");
            expect(appendChildCalledOnParent).toBe(false);
        });
    });
});
