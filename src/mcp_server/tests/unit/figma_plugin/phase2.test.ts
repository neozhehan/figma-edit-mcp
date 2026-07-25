import { describe, it, expect, beforeEach } from "bun:test";

const gateNodeMap = new Map<string, any>();
const gatePendingPromises = new Map<string | number, (msg: any) => void>();

let combineAsVariantsCalled = false;
let combineAsVariantsArgs: any[] = [];
let mockCombineAsVariantsThrow = false;
let mockVariantGroupPropertiesThrow = false;
let appendChildCalledOnParent = false;

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
    combineAsVariants: (nodes: any[], page: any) => {
        combineAsVariantsCalled = true;
        combineAsVariantsArgs = [nodes, page];
        if (mockCombineAsVariantsThrow) {
            throw new Error("Mock combineAsVariants error");
        }
        const set = {
            id: "comp-set-id",
            name: "Component Set",
            type: "COMPONENT_SET",
            children: nodes,
            get variantGroupProperties() {
                if (mockVariantGroupPropertiesThrow) {
                    throw new Error("Mock variant properties read error");
                }
                return {
                    "Size": { values: ["Small", "Medium"] }
                };
            },
            parent: page
        };
        return set;
    }
};

(globalThis as any).__html__ = "<html></html>";
(globalThis as any).figma = gateFigma;

// Import main module and handlers
const mainMod: any = await import("../../../../../figma_plugin/src/main.js?scope=phase2");
const pluginState = mainMod.getPluginState();
const gateOnMessage = gateFigma.ui.onmessage as (msg: any) => Promise<void> | void;

describe("Phase 2: create_component_set Two-Phase Prevalidation and Atomicity", () => {
    beforeEach(() => {
        pluginState.allowEditNode = "node";
        pluginState.scopeRootId = "scope-root";
        gateNodeMap.clear();
        combineAsVariantsCalled = false;
        combineAsVariantsArgs = [];
        mockCombineAsVariantsThrow = false;
        mockVariantGroupPropertiesThrow = false;
        appendChildCalledOnParent = false;
    });

    function setupEnvironment() {
        const page: any = {
            id: "page-id",
            name: "Page",
            type: "PAGE",
            parent: { id: "doc", name: "Doc", type: "DOCUMENT" }
        };

        const scopeRoot: any = {
            id: "scope-root",
            name: "Scope Root",
            type: "FRAME",
            parent: page,
            children: []
        };
        page.children = [scopeRoot];

        const comp1: any = {
            id: "comp-1",
            name: "Button",
            type: "COMPONENT",
            parent: scopeRoot
        };
        const comp2: any = {
            id: "comp-2",
            name: "Button",
            type: "COMPONENT",
            parent: scopeRoot
        };
        scopeRoot.children.push(comp1, comp2);

        const parentNode: any = {
            id: "parent-id",
            name: "Parent Node",
            type: "FRAME",
            parent: scopeRoot,
            appendChild: (child: any) => {
                appendChildCalledOnParent = true;
                child.parent = parentNode;
            },
            children: []
        };
        scopeRoot.children.push(parentNode);

        gateNodeMap.set("doc", page.parent);
        gateNodeMap.set("page-id", page);
        gateNodeMap.set("scope-root", scopeRoot);
        gateNodeMap.set("comp-1", comp1);
        gateNodeMap.set("comp-2", comp2);
        gateNodeMap.set("parent-id", parentNode);

        return { page, scopeRoot, comp1, comp2, parentNode };
    }

    // injectParent defaults ON for the existing tests, but is opt-OUT so the
    // omission tests (P5-2) can exercise the plugin's missing-parent branch
    // instead of it being masked by the helper's defaults.
    async function sendCommand(params: any, opts: { injectParent?: boolean } = {}) {
        const injectParent = opts.injectParent !== false;
        const mergedParams = { ...params };
        if (injectParent && !("parentId" in mergedParams)) mergedParams.parentId = "parent-id";
        if (injectParent && !("parentNodeName" in mergedParams)) mergedParams.parentNodeName = "Parent Node";
        const msg = {
            type: "execute-command",
            command: "create_component_set",
            id: Math.random().toString(),
            params: mergedParams
        };
        const resultPromise = new Promise<any>((resolve) => {
            gatePendingPromises.set(msg.id, resolve);
        });
        await gateOnMessage!(msg);
        return await resultPromise;
    }

    it("rejects when components is empty", async () => {
        setupEnvironment();
        const res = await sendCommand({
            components: [],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("components must be a non-empty array");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("rejects when properties is empty", async () => {
        setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: [] }
            ],
            properties: []
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("properties must be a non-empty array");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("rejects duplicate property names", async () => {
        setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["A", "B"] }
            ],
            properties: ["Size", "Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Duplicate property name found");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("rejects empty property names", async () => {
        setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["A"] }
            ],
            properties: [""]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Property names must be non-empty strings");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("wrong type in component #2 leaves component #1 name unchanged and does not call combineAsVariants", async () => {
        const { comp1, comp2 } = setupEnvironment();
        comp2.type = "FRAME"; // wrong type
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("must be a COMPONENT, got FRAME");
        expect(comp1.name).toBe("Button"); // unchanged
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("mismatched nodeName in component #2 leaves component #1 name unchanged and does not call combineAsVariants", async () => {
        const { comp1 } = setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Wrong Name", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("nodeName does not match name of nodeId");
        expect(comp1.name).toBe("Button"); // unchanged
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("out-of-scope component #2 leaves component #1 name unchanged and does not call combineAsVariants", async () => {
        const { comp1, comp2 } = setupEnvironment();
        comp2.parent = { id: "other-root", name: "Other Root", type: "FRAME" }; // out of scope
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("outside editable scope");
        expect(comp1.name).toBe("Button"); // unchanged
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("duplicate variant values leave all names unchanged and do not call combineAsVariants", async () => {
        const { comp1, comp2 } = setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Small"] } // duplicate
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Duplicate variant combination");
        expect(comp1.name).toBe("Button"); // unchanged
        expect(comp2.name).toBe("Button"); // unchanged
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("duplicate component ID rejects before any rename and before combineAsVariants", async () => {
        const { comp1 } = setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Large"] } // duplicate ID
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("is listed more than once in components");
        expect(comp1.name).toBe("Button"); // unchanged
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("empty property values and values containing = or , reject before any rename", async () => {
        const { comp1, comp2 } = setupEnvironment();
        const res1 = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: [""] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res1.type).toBe("command-error");
        expect(res1.error.message).toContain("must be non-empty and must not contain '=' or ','");

        const res2 = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["A=B"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res2.type).toBe("command-error");
        expect(res2.error.message).toContain("must be non-empty and must not contain '=' or ','");

        const res3 = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["A,B"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res3.type).toBe("command-error");
        expect(res3.error.message).toContain("must be non-empty and must not contain '=' or ','");

        expect(comp1.name).toBe("Button"); // unchanged
        expect(comp2.name).toBe("Button"); // unchanged
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("a component already inside a COMPONENT_SET rejects before any rename", async () => {
        const { comp1, comp2, scopeRoot } = setupEnvironment();
        const existingSet: any = { id: "set-parent", name: "Existing Set", type: "COMPONENT_SET", parent: scopeRoot };
        comp2.parent = existingSet;
        gateNodeMap.set("set-parent", existingSet);
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("is already a variant in component set");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("variantGroupProperties getter throw after successful combine returns success with a warning", async () => {
        setupEnvironment();
        mockVariantGroupPropertiesThrow = true;
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            componentSetName: "My Button Set"
        });
        expect(res.type).toBe("command-result");
        expect(res.result.warning).toContain("Failed to read variant properties");
        expect(res.result.variantProperties).toBeUndefined();
        expect(combineAsVariantsCalled).toBe(true);
    });

    it("wrong propertyValues count leaves all names unchanged and does not call combineAsVariants", async () => {
        const { comp1, comp2 } = setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small", "Red"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] } // count mismatch
            ],
            properties: ["Size", "Color"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Property values count mismatch");
        expect(comp1.name).toBe("Button");
        expect(comp2.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("locked component or locked component ancestor leaves all names unchanged", async () => {
        const { comp1, comp2 } = setupEnvironment();
        comp2.locked = true;
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("is locked");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("instance-interior component leaves all names unchanged", async () => {
        const { comp1, comp2, scopeRoot } = setupEnvironment();
        const instanceAnc: any = { id: "instance-anc", name: "Anc Instance", type: "INSTANCE", parent: scopeRoot };
        comp2.parent = instanceAnc;
        gateNodeMap.set("instance-anc", instanceAnc);
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("inside a component instance");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("remote component leaves all names unchanged", async () => {
        const { comp1, comp2 } = setupEnvironment();
        comp2.remote = true;
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("is a remote shared-library component");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("locked parent or locked parent ancestor leaves all names unchanged and does not call combineAsVariants", async () => {
        const { comp1, comp2, parentNode } = setupEnvironment();
        parentNode.locked = true;
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: "Parent Node"
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("is locked");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("parent inside an instance interior leaves all names unchanged and does not call combineAsVariants", async () => {
        const { comp1, parentNode, scopeRoot } = setupEnvironment();
        const instanceAnc: any = { id: "instance-anc", name: "Anc Instance", type: "INSTANCE", parent: scopeRoot };
        parentNode.parent = instanceAnc;
        gateNodeMap.set("instance-anc", instanceAnc);
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: "Parent Node"
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("inside a component instance");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("parent that is an INSTANCE leaves all names unchanged and does not call combineAsVariants", async () => {
        const { comp1, parentNode } = setupEnvironment();
        parentNode.type = "INSTANCE";
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: "Parent Node"
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("is a component instance and cannot be appended to directly");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("parent outside scope or mismatched parentNodeName leaves all names unchanged and does not call combineAsVariants", async () => {
        const { comp1, parentNode, scopeRoot } = setupEnvironment();
        parentNode.parent = { id: "other-root", name: "Other Root", type: "FRAME" }; // outside scope
        const res1 = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: "Parent Node"
        });
        expect(res1.type).toBe("command-error");
        expect(res1.error.message).toContain("Parent outside editable scope");

        parentNode.parent = scopeRoot; // back in scope
        const res2 = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: "Wrong Name"
        });
        expect(res2.type).toBe("command-error");
        expect(res2.error.code).toBe("PARENT_NAME_MISMATCH");
        expect(res2.error.message).toContain("does not match the parent's stored name");

        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("omitted parentNodeName fails closed with PARENT_NAME_MISSING (Q22/P5-2 defense in depth)", async () => {
        const { comp1, comp2 } = setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id"
            // parentNodeName omitted
        }, { injectParent: false });
        expect(res.type).toBe("command-error");
        expect(res.error.code).toBe("PARENT_NAME_MISSING");
        expect(comp1.name).toBe("Button");
        expect(comp2.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("C9: present-empty parentNodeName is a MISMATCH, not MISSING (empty is a value, not omission)", async () => {
        const { comp1 } = setupEnvironment(); // parent is named "Parent Node"
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: ""
        }, { injectParent: false });
        expect(res.type).toBe("command-error");
        // Red-proof of the truthiness bug: `if (!params.parentNodeName)` would
        // classify "" as MISSING; the nullish check makes it a real MISMATCH.
        expect(res.error.code).toBe("PARENT_NAME_MISMATCH");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("C9: an exactly empty-named parent is usable when parentNodeName is the same empty string", async () => {
        const { parentNode } = setupEnvironment();
        parentNode.name = ""; // a parent legitimately named ""
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: ""
        }, { injectParent: false });
        expect(res.type).toBe("command-result"); // empty-but-exact name matches → proceeds
        expect(combineAsVariantsCalled).toBe(true);
    });

    it("omitted parentId fails closed with a parentId-specific message (Q22/P5-1)", async () => {
        const { comp1, comp2 } = setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentNodeName: "Parent Node"
            // parentId omitted
        }, { injectParent: false });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("parentId is missing");
        // R7: the missing-parentId error matches its corrected schema — it names
        // node_info and describes an "appendable parent container", not a bare
        // "parent container".
        expect(res.error.message).toContain("node_info");
        expect(res.error.message).toContain("appendable parent container");
        expect(comp1.name).toBe("Button");
        expect(comp2.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("nonexistent parent rejects before any rename and before combineAsVariants", async () => {
        const { comp1, comp2 } = setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "missing-parent",
            parentNodeName: "Ghost"
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Node missing-parent not found");
        expect(comp1.name).toBe("Button");
        expect(comp2.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("parent without appendChild leaves all names unchanged and does not call combineAsVariants", async () => {
        const { comp1, parentNode } = setupEnvironment();
        delete (parentNode as any).appendChild;
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: "Parent Node"
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("cannot contain a component set");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("parent equal to an input component rejects before any rename and before combineAsVariants", async () => {
        const { comp1, comp2 } = setupEnvironment();
        comp1.appendChild = () => {};
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "comp-1",
            parentNodeName: "Button"
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("is one of the components being combined");
        expect(comp1.name).toBe("Button");
        expect(comp2.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("parent descendant of an input component rejects before any rename and before combineAsVariants", async () => {
        const { comp1, comp2, parentNode } = setupEnvironment();
        parentNode.parent = comp1; // parentNode is descendant of comp1
        comp1.children = [parentNode];
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            parentId: "parent-id",
            parentNodeName: "Parent Node"
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("is one of the components being combined (or is inside one)");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("cross-page components reject before any rename, retained as defense-in-depth", async () => {
        const { comp1, comp2, page } = setupEnvironment();
        
        const mockScopeRoot: any = {
            id: "mock-scope-root",
            name: "Mock Scope Root",
            type: "FRAME",
            parent: gateNodeMap.get("doc")
        };
        pluginState.scopeRootId = "mock-scope-root";
        gateNodeMap.set("mock-scope-root", mockScopeRoot);

        page.parent = mockScopeRoot;

        const page2: any = {
            id: "page-2",
            name: "Page 2",
            type: "PAGE",
            parent: mockScopeRoot,
            children: [comp2]
        };
        comp2.parent = page2;
        gateNodeMap.set("page-2", page2);

        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("all components must be on the same page");
        expect(comp1.name).toBe("Button");
        expect(combineAsVariantsCalled).toBe(false);
    });

    it("happy path renames variants, calls combineAsVariants, renames the component set, reparents when requested, and returns the expected COMPONENT_SET result", async () => {
        const { comp1, comp2, parentNode } = setupEnvironment();
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            componentSetName: "My Button Set",
            parentId: "parent-id",
            parentNodeName: "Parent Node"
        });
        expect(res.type).toBe("command-result");
        expect(res.result.type).toBe("COMPONENT_SET");
        expect(res.result.name).toBe("My Button Set");
        expect(comp1.name).toBe("Size=Small");
        expect(comp2.name).toBe("Size=Large");
        expect(combineAsVariantsCalled).toBe(true);
        expect(appendChildCalledOnParent).toBe(true);
    });

    it("simulated combineAsVariants throw restores original component names", async () => {
        const { comp1, comp2 } = setupEnvironment();
        mockCombineAsVariantsThrow = true;
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Mock combineAsVariants error");
        expect(comp1.name).toBe("Button"); // restored
        expect(comp2.name).toBe("Button"); // restored
        expect(combineAsVariantsCalled).toBe(true);
    });

    it("residual post-combine reparent failure surfaces as an error without restoring variant names (D5)", async () => {
        const { comp1, comp2, parentNode } = setupEnvironment();
        // Passes the "appendChild" in parent precheck, then fails at placement —
        // simulates the R1 TOCTOU residual. The set exists, so names must NOT
        // be rolled back and the set stays at the combine location.
        parentNode.appendChild = () => {
            throw new Error("Mock TOCTOU appendChild error");
        };
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"],
            componentSetName: "My Button Set",
            parentId: "parent-id",
            parentNodeName: "Parent Node"
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Mock TOCTOU appendChild error");
        expect(combineAsVariantsCalled).toBe(true);
        expect(comp1.name).toBe("Size=Small"); // variant names retained
        expect(comp2.name).toBe("Size=Large");
    });

    it("simulated mid-loop rename throw restores original component names", async () => {
        const { comp1, comp2 } = setupEnvironment();
        Object.defineProperty(comp2, "name", {
            get: () => "Button",
            set: () => {
                throw new Error("Mock rename error");
            }
        });
        const res = await sendCommand({
            components: [
                { nodeId: "comp-1", nodeName: "Button", propertyValues: ["Small"] },
                { nodeId: "comp-2", nodeName: "Button", propertyValues: ["Large"] }
            ],
            properties: ["Size"]
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Mock rename error");
        expect(comp1.name).toBe("Button"); // restored
        expect(combineAsVariantsCalled).toBe(false);
    });
});
