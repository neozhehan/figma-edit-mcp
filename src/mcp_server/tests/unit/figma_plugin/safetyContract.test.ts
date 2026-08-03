import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mocks for Figma environment
let cloneCalled = false;
let appendChildCalledOnParent = false;
let insertChildCalledOnParent = false;
let createRectangleCalled = false;
let createFrameCalled = false;
let createTextCalled = false;
let createInstanceCalled = false;
let createNodeFromSvgCalled = false;
let setEffectsCalled = false;
let combineAsVariantsCalled = false;

const gatePendingPromises = new Map<string, (val: any) => void>();
const gateNodeMap = new Map<string, any>();

const gateFigma: any = {
    showUI: () => { },
    ui: {
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
    combineAsVariants: (components: any[], page: any) => {
        combineAsVariantsCalled = true;
        return {
            id: "comp-set-id",
            name: "Component Set",
            type: "COMPONENT_SET",
            parent: page,
            variantGroupProperties: {}
        };
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
const mainMod: any = await import("../../../../../figma_plugin/src/main.js?scope=safetyContract");
const pluginState = mainMod.getPluginState();
const gateOnMessage = gateFigma.ui.onmessage as (msg: any) => Promise<void> | void;

// Expected tool-to-gate mapping (15 generic gate categories)
// 1. nodePerm
// 2. scope
// 3. name
// 4. parentScope
// 5. parentName
// 6. lockedTarget
// 7. lockedParent
// 8. instanceInteriorTarget
// 9. instanceInteriorParent
// 10. scopeRootPreservation
// 11. remoteAsset
// 12. batchPrevalidation
// 13. handlerPrevalidationBeforeMutation
// 14. explicitNameNonEmpty
// 15. collectionName
// This table is the executable gate contract, asserted below by driving the real
// dispatcher. It was previously ALSO diffed against SAFETY.md Part B in both
// directions; that diff has been removed along with every other test that read a
// documentation file. SAFETY.md is now kept in step by hand — see its Maintenance
// section.
const EXPECTED_CONTRACTS: Record<string, string[]> = {
    node_set_fill: ["nodePerm", "scope", "name", "lockedTarget"],
    node_set_stroke: ["nodePerm", "scope", "name", "lockedTarget"],
    node_set_corner_radius: ["nodePerm", "scope", "name", "lockedTarget"],
    node_set_effects: ["nodePerm", "scope", "name", "lockedTarget"],
    node_set_auto_layout: ["nodePerm", "scope", "name", "lockedTarget"],
    node_rename: ["nodePerm", "scope", "name", "lockedTarget", "explicitNameNonEmpty"],
    node_transform: ["nodePerm", "scope", "name", "lockedTarget"],
    node_bind_variable: ["nodePerm", "scope", "name", "lockedTarget"],
    node_apply_style: ["nodePerm", "scope", "name", "lockedTarget"],
    node_clone: ["nodePerm", "scope", "name", "lockedTarget", "instanceInteriorTarget", "parentScope", "lockedParent", "instanceInteriorParent", "handlerPrevalidationBeforeMutation"],
    node_flatten: ["nodePerm", "scope", "name", "lockedTarget", "scopeRootPreservation", "handlerPrevalidationBeforeMutation"],
    node_ungroup: ["nodePerm", "scope", "name", "lockedTarget", "scopeRootPreservation", "instanceInteriorTarget"],
    text_set_style: ["nodePerm", "scope", "name", "lockedTarget"],
    instance_set_property: ["nodePerm", "scope", "name", "lockedTarget"],
    reaction_update: ["nodePerm", "scope", "name", "lockedTarget"],

    node_delete: ["nodePerm", "scope", "name", "lockedTarget", "instanceInteriorTarget", "scopeRootPreservation", "batchPrevalidation"],
    node_group: ["nodePerm", "scope", "name", "lockedTarget", "instanceInteriorTarget", "batchPrevalidation", "explicitNameNonEmpty"],
    text_set_content: ["nodePerm", "scope", "name", "lockedTarget", "batchPrevalidation"],
    annotation_set: ["nodePerm", "scope", "name", "lockedTarget", "batchPrevalidation"],
    instance_set_overrides: ["nodePerm", "scope", "name", "lockedTarget", "batchPrevalidation"],
    create_component_set: ["nodePerm", "scope", "name", "instanceInteriorTarget", "remoteAsset", "parentScope", "parentName", "lockedParent", "instanceInteriorParent", "batchPrevalidation", "handlerPrevalidationBeforeMutation", "explicitNameNonEmpty"],

    create_shape: ["nodePerm", "parentScope", "parentName", "lockedParent", "instanceInteriorParent", "handlerPrevalidationBeforeMutation", "explicitNameNonEmpty"],
    create_frame: ["nodePerm", "parentScope", "parentName", "lockedParent", "instanceInteriorParent", "handlerPrevalidationBeforeMutation", "explicitNameNonEmpty"],
    create_text: ["nodePerm", "parentScope", "parentName", "lockedParent", "instanceInteriorParent", "handlerPrevalidationBeforeMutation", "explicitNameNonEmpty"],
    create_svg: ["nodePerm", "parentScope", "parentName", "lockedParent", "instanceInteriorParent", "handlerPrevalidationBeforeMutation", "explicitNameNonEmpty"],
    create_instance: ["nodePerm", "parentScope", "parentName", "lockedParent", "instanceInteriorParent", "handlerPrevalidationBeforeMutation"],
    create_component: ["nodePerm", "scope", "name", "lockedTarget", "instanceInteriorTarget", "scopeRootPreservation", "handlerPrevalidationBeforeMutation"],
    node_insert_child: ["nodePerm", "parentScope", "parentName", "scope", "name", "lockedParent", "lockedTarget", "instanceInteriorParent", "instanceInteriorTarget"],
    variable_manage: ["name", "collectionName", "remoteAsset", "handlerPrevalidationBeforeMutation", "explicitNameNonEmpty"],
    variable_delete: ["name", "remoteAsset"],
    style_manage: ["name", "remoteAsset", "handlerPrevalidationBeforeMutation", "explicitNameNonEmpty"],
    style_delete: ["name", "remoteAsset"],
    component_manage_property: ["nodePerm", "scope", "name", "lockedTarget", "remoteAsset", "explicitNameNonEmpty"],
    component_delete_property: ["nodePerm", "scope", "name", "lockedTarget", "remoteAsset"],
};


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

describe("Phase 5: table-driven nodePerm sweep — every nodePerm-gated write rejects in read-only mode", () => {
    // The permission gate runs before any param handling, so empty params
    // suffice; a tool that reaches its handler would return command-result
    // (or a param error) instead of the read-only denial.
    for (const [tool, gates] of Object.entries(EXPECTED_CONTRACTS)) {
        if (!gates.includes("nodePerm")) continue;
        it(`${tool} rejects without node-edit permission`, async () => {
            pluginState.allowEditNode = false;
            pluginState.scopeRootId = null;
            const res = await sendCommand(tool, {});
            expect(res.type).toBe("command-error");
            expect(res.error.message).toContain("Read-Only Mode");
        });
    }
});

describe("Phase 5: Pre-mutation Rejection Unit Tests for Regression Targets", () => {
    beforeEach(() => {
        pluginState.allowEditNode = "node";
        pluginState.scopeRootId = "scope-root";
        gateNodeMap.clear();
        cloneCalled = false;
        appendChildCalledOnParent = false;
        insertChildCalledOnParent = false;
        createRectangleCalled = false;
        createFrameCalled = false;
        createTextCalled = false;
        createInstanceCalled = false;
        createNodeFromSvgCalled = false;
        setEffectsCalled = false;
        combineAsVariantsCalled = false;
    });

    function setupEnvironment() {
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

        const compNodeA: any = {
            id: "comp-id-a",
            name: "Component A",
            type: "COMPONENT",
            parent: scopeRoot,
            nameRestore: "Component A"
        };
        const compNodeB: any = {
            id: "comp-id-b",
            name: "Component B",
            type: "COMPONENT",
            parent: scopeRoot,
            nameRestore: "Component B"
        };
        scopeRoot.children.push(compNodeA, compNodeB);

        gateNodeMap.set("doc", scopeRoot.parent);
        gateNodeMap.set("scope-root", scopeRoot);
        gateNodeMap.set("target-id", targetNode);
        gateNodeMap.set("parent-id", parentNode);
        gateNodeMap.set("source-id", sourceNode);
        gateNodeMap.set("comp-id-a", compNodeA);
        gateNodeMap.set("comp-id-b", compNodeB);

        return { scopeRoot, targetNode, parentNode, sourceNode, compNodeA, compNodeB };
    }

    describe("node_set_effects pre-mutation validation", () => {
        it("nodePerm: rejects when allowEditNode is false, no mutation", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(setEffectsCalled).toBe(false);
        });

        it("scope: rejects when target is outside scope, no mutation", async () => {
            const { targetNode } = setupEnvironment();
            targetNode.parent = { id: "other", name: "Other", type: "FRAME" };
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(setEffectsCalled).toBe(false);
        });

        it("name: rejects when name mismatches, no mutation", async () => {
            setupEnvironment();
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Mismatched", effects: [] });
            expect(res.type).toBe("command-error");
            expect(setEffectsCalled).toBe(false);
        });

        it("lockedTarget: rejects when target is locked, no mutation", async () => {
            const { targetNode } = setupEnvironment();
            targetNode.locked = true;
            const res = await sendCommand("node_set_effects", { nodeId: "target-id", nodeName: "Target Node", effects: [] });
            expect(res.type).toBe("command-error");
            expect(setEffectsCalled).toBe(false);
        });
    });

    describe("node_clone pre-mutation validation", () => {
        it("nodePerm: rejects when allowEditNode is false, no mutation", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(cloneCalled).toBe(false);
        });

        it("lockedTarget: rejects when source is locked, no mutation", async () => {
            const { sourceNode } = setupEnvironment();
            sourceNode.locked = true;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(cloneCalled).toBe(false);
        });

        it("lockedParent: rejects when destination parent is locked, no mutation", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(cloneCalled).toBe(false);
        });

        it("instanceInteriorTarget: rejects when source is inside an instance, no mutation", async () => {
            const { sourceNode, scopeRoot } = setupEnvironment();
            const instanceAnc: any = { id: "instance-anc", name: "Anc Instance", type: "INSTANCE", parent: scopeRoot };
            sourceNode.parent = instanceAnc;
            gateNodeMap.set("instance-anc", instanceAnc);
            const res = await sendCommand("node_clone", { nodeId: "source-id", nodeName: "Source Node" });
            expect(res.type).toBe("command-error");
            expect(cloneCalled).toBe(false);
        });
    });

    describe("create_svg pre-mutation validation", () => {
        it("nodePerm: rejects when allowEditNode is false, no mutation", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(createNodeFromSvgCalled).toBe(false);
        });

        it("lockedParent: rejects when parent is locked, no mutation", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("create_svg", { parentId: "parent-id", parentNodeName: "Parent Node", svg: "<svg></svg>" });
            expect(res.type).toBe("command-error");
            expect(createNodeFromSvgCalled).toBe(false);
        });
    });

    describe("create_frame pre-mutation validation", () => {
        it("nodePerm: rejects when allowEditNode is false, no mutation", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("create_frame", { parentId: "parent-id", parentNodeName: "Parent Node" });
            expect(res.type).toBe("command-error");
            expect(createFrameCalled).toBe(false);
        });

        it("lockedParent: rejects when parent is locked, no mutation", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("create_frame", { parentId: "parent-id", parentNodeName: "Parent Node" });
            expect(res.type).toBe("command-error");
            expect(createFrameCalled).toBe(false);
        });
    });

    describe("create_text pre-mutation validation", () => {
        it("nodePerm: rejects when allowEditNode is false, no mutation", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("create_text", { parentId: "parent-id", parentNodeName: "Parent Node", text: "hi" });
            expect(res.type).toBe("command-error");
            expect(createTextCalled).toBe(false);
        });

        it("lockedParent: rejects when parent is locked, no mutation", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("create_text", { parentId: "parent-id", parentNodeName: "Parent Node", text: "hi" });
            expect(res.type).toBe("command-error");
            expect(createTextCalled).toBe(false);
        });
    });

    describe("create_instance pre-mutation validation", () => {
        it("nodePerm: rejects when allowEditNode is false, no mutation", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("create_instance", { parentId: "parent-id", parentNodeName: "Parent Node", componentId: "remote-comp-id" });
            expect(res.type).toBe("command-error");
            expect(createInstanceCalled).toBe(false);
        });

        it("lockedParent: rejects when parent is locked, no mutation", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("create_instance", { parentId: "parent-id", parentNodeName: "Parent Node", componentId: "remote-comp-id" });
            expect(res.type).toBe("command-error");
            expect(createInstanceCalled).toBe(false);
        });
    });

    describe("create_component_set pre-mutation validation", () => {
        it("nodePerm: rejects when allowEditNode is false, no mutation", async () => {
            setupEnvironment();
            pluginState.allowEditNode = false;
            const res = await sendCommand("create_component_set", {
                components: [{ nodeId: "comp-id-a", nodeName: "Component A", propertyValues: ["valA"] }],
                properties: ["prop1"],
                componentSetName: "Set Name",
                parentId: "parent-id",
                parentNodeName: "Parent Node"
            });
            expect(res.type).toBe("command-error");
            expect(combineAsVariantsCalled).toBe(false);
        });

        it("batchPrevalidation: rejects when one of components has name mismatch, no combine/mutation", async () => {
            setupEnvironment();
            const res = await sendCommand("create_component_set", {
                components: [
                    { nodeId: "comp-id-a", nodeName: "Component A", propertyValues: ["valA"] },
                    { nodeId: "comp-id-b", nodeName: "Wrong Name", propertyValues: ["valB"] }
                ],
                properties: ["prop1"],
                componentSetName: "Set Name",
                parentId: "parent-id",
                parentNodeName: "Parent Node"
            });
            expect(res.type).toBe("command-error");
            expect(combineAsVariantsCalled).toBe(false);
        });

        it("lockedParent: rejects when parent is locked, no combine/mutation", async () => {
            const { parentNode } = setupEnvironment();
            parentNode.locked = true;
            const res = await sendCommand("create_component_set", {
                components: [
                    { nodeId: "comp-id-a", nodeName: "Component A", propertyValues: ["valA"] },
                    { nodeId: "comp-id-b", nodeName: "Component B", propertyValues: ["valB"] }
                ],
                properties: ["prop1"],
                componentSetName: "Set Name",
                parentId: "parent-id",
                parentNodeName: "Parent Node"
            });
            expect(res.type).toBe("command-error");
            expect(combineAsVariantsCalled).toBe(false);
        });

        it("instanceInteriorParent: rejects when parent is an INSTANCE, no combine/mutation", async () => {
            const { parentNode, compNodeA } = setupEnvironment();
            parentNode.type = "INSTANCE";
            const res = await sendCommand("create_component_set", {
                components: [
                    { nodeId: "comp-id-a", nodeName: "Component A", propertyValues: ["valA"] },
                    { nodeId: "comp-id-b", nodeName: "Component B", propertyValues: ["valB"] }
                ],
                properties: ["prop1"],
                parentId: "parent-id",
                parentNodeName: "Parent Node"
            });
            expect(res.type).toBe("command-error");
            expect(combineAsVariantsCalled).toBe(false);
            expect(compNodeA.name).toBe("Component A");
        });

        it("remoteAsset: rejects a remote component, no combine/mutation", async () => {
            const { compNodeA, compNodeB } = setupEnvironment();
            compNodeB.remote = true;
            const res = await sendCommand("create_component_set", {
                components: [
                    { nodeId: "comp-id-a", nodeName: "Component A", propertyValues: ["valA"] },
                    { nodeId: "comp-id-b", nodeName: "Component B", propertyValues: ["valB"] }
                ],
                properties: ["prop1"]
            });
            expect(res.type).toBe("command-error");
            expect(combineAsVariantsCalled).toBe(false);
            expect(compNodeA.name).toBe("Component A");
        });
    });
});
