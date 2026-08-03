import { beforeEach, describe, expect, it, mock } from "bun:test";

let trace: string[] = [];
let nodes = new Map<string, any>();
let created = new Map<string, any>();
let throwOn: { label: string; property: string } | null = null;
let importedComponent: any = null;
let flattenArgs: any[] = [];
let combineArgs: any[] = [];

function makeNode(label: string, type: string, extra: Record<string, any> = {}) {
    const state: Record<string, any> = {
        id: `${label}-id`,
        name: label,
        type,
        removed: false,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fills: [],
        strokes: [],
        children: [],
        resize(width: number, height: number) {
            trace.push(`configure:${label}.resize`);
            state.width = width;
            state.height = height;
        },
        appendChild(child: any) {
            trace.push(`configure:${label}.appendChild`);
            const oldParent = child.parent;
            const oldIndex = oldParent?.children?.indexOf(child) ?? -1;
            if (oldIndex >= 0) oldParent.children.splice(oldIndex, 1);
            state.children.push(child);
            child.parent = proxy;
        },
        insertChild(index: number, child: any) {
            trace.push(`configure:${label}.insertChild:${index}`);
            const oldParent = child.parent;
            const oldIndex = oldParent?.children?.indexOf(child) ?? -1;
            if (oldIndex >= 0) oldParent.children.splice(oldIndex, 1);
            state.children.splice(index, 0, child);
            child.parent = proxy;
        },
        remove() {
            trace.push(`cleanup:${label}`);
            state.removed = true;
        },
        ...extra,
    };
    const proxy = new Proxy(state, {
        set(target, property, value) {
            const key = String(property);
            trace.push(`configure:${label}.${key}`);
            if (throwOn?.label === label && throwOn.property === key) {
                throw new Error(`injected ${label}.${key} failure`);
            }
            target[key] = value;
            return true;
        },
    });
    created.set(label, proxy);
    return proxy;
}

function makeParent(id = "parent") {
    const parent: any = {
        id,
        name: "Verified Parent",
        type: "FRAME",
        children: [],
        appendChild(child: any) {
            trace.push(`place:${child.name}:append`);
            parent.children.push(child);
            child.parent = parent;
        },
        insertChild(index: number, child: any) {
            trace.push(`place:${child.name}:insert:${index}`);
            parent.children.splice(index, 0, child);
            child.parent = parent;
        },
    };
    nodes.set(id, parent);
    return parent;
}

function assertImmediate(createEvent: string, placementEvent: string) {
    const createIndex = trace.indexOf(createEvent);
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(trace[createIndex + 1]).toBe(placementEvent);
}

mock.module("../../../../../figma_plugin/utils/textUtils.js", () => ({
    setCharacters: mock(async (node: any, characters: string) => {
        trace.push("await:setCharacters");
        node.characters = characters;
        return { fontMutated: false };
    }),
}));

const {
    cloneNode,
    createFrame,
    createShape,
    createText,
} = await import("../../../../../figma_plugin/handlers/nodeCreators.js?phase8");
const { createNodeFromSvg } = await import("../../../../../figma_plugin/handlers/vectorHandlers.js?phase8");
const {
    createComponent,
    createComponentInstance,
    createComponentSet,
    manageComponentProperty,
    validateCreateComponentSetPlan,
} = await import("../../../../../figma_plugin/handlers/componentHandlers.js?phase8");
const { handleVariableRequest } = await import(
    "../../../../../figma_plugin/handlers/variableHandlers.js?phase8-name-assignment"
);
const { flattenNode } = await import("../../../../../figma_plugin/handlers/nodeModifiers.js?phase8");

function installFigma() {
    (globalThis as any).figma = {
        mixed: Symbol("mixed"),
        getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
        loadFontAsync: async () => {
            trace.push("await:loadFontAsync");
        },
        createRectangle: () => {
            trace.push("create:shape");
            return makeNode("Shape", "RECTANGLE");
        },
        createEllipse: () => {
            trace.push("create:ellipse");
            return makeNode("Ellipse", "ELLIPSE");
        },
        createPolygon: () => {
            trace.push("create:polygon");
            return makeNode("Polygon", "POLYGON");
        },
        createStar: () => {
            trace.push("create:star");
            return makeNode("Star", "STAR");
        },
        createFrame: () => {
            trace.push("create:frame");
            return makeNode("Frame", "FRAME", {
                layoutMode: "NONE",
                layoutWrap: "NO_WRAP",
                strokeWeight: 1,
            });
        },
        createText: () => {
            trace.push("create:text");
            return makeNode("Text", "TEXT", {
                characters: "",
                fontName: { family: "Inter", style: "Regular" },
                fontSize: 14,
            });
        },
        createNodeFromSvg: () => {
            trace.push("create:svg");
            return makeNode("SVG", "FRAME");
        },
        createComponent: () => {
            trace.push("create:component");
            return makeNode("Component", "COMPONENT");
        },
        importComponentByKeyAsync: async () => importedComponent,
        flatten: (...args: any[]) => {
            trace.push("mutate:flatten");
            flattenArgs = args;
            return { id: "flattened", name: "Flattened", type: "VECTOR" };
        },
        combineAsVariants: (...args: any[]) => {
            trace.push("mutate:combineAsVariants");
            combineArgs = args;
            return {
                id: "set-id",
                name: "Set",
                type: "COMPONENT_SET",
                children: args[0],
                parent: args[1],
                variantGroupProperties: {},
            };
        },
    };
}

beforeEach(() => {
    trace = [];
    nodes = new Map();
    created = new Map();
    throwOn = null;
    importedComponent = null;
    flattenArgs = [];
    combineArgs = [];
    installFigma();
});

describe("v2.3.3 Phase 8: creator name presence semantics", () => {
    it("rejects explicit empty names before any implicit creator runs", async () => {
        const parent = makeParent();

        await expect(createShape({
            type: "RECTANGLE",
            parentId: "parent",
            name: "",
        })).rejects.toThrow("create_shape: name must not be empty");
        await expect(createFrame({
            parentId: "parent",
            name: "",
        })).rejects.toThrow("create_frame: name must not be empty");
        await expect(createText({
            parentId: "parent",
            text: "Body copy",
            name: "",
        })).rejects.toThrow("create_text: name must not be empty");
        await expect(createNodeFromSvg({
            parentId: "parent",
            svg: "<svg/>",
            name: "",
        })).rejects.toThrow("create_svg: name must not be empty");

        expect(trace.filter((entry) => entry.startsWith("create:"))).toEqual([]);
        expect(parent.children).toEqual([]);
    });

    it("keeps existing defaults when names are omitted", async () => {
        makeParent();

        const omitted = await Promise.all([
            createShape({
                type: "RECTANGLE",
                parentId: "parent",
            }),
            createFrame({
                parentId: "parent",
            }),
            createText({
                parentId: "parent",
                text: "Body copy",
            }),
            createNodeFromSvg({
                parentId: "parent",
                svg: "<svg/>",
            }),
        ]);
        expect(omitted.map((result) => result.name)).toEqual([
            "Rectangle",
            "Frame",
            "Body copy",
            "SVG",
        ]);
    });

    it("accepts non-empty whitespace names without normalization", async () => {
        makeParent();

        const whitespace = await Promise.all([
            createShape({
                type: "RECTANGLE",
                parentId: "parent",
                name: " ",
            }),
            createFrame({
                parentId: "parent",
                name: " ",
            }),
            createText({
                parentId: "parent",
                text: "Body copy",
                name: " ",
            }),
            createNodeFromSvg({
                parentId: "parent",
                svg: "<svg/>",
                name: " ",
            }),
        ]);
        expect(whitespace.map((result) => result.name)).toEqual([" ", " ", " ", " "]);
    });
});

describe("v2.3.3 Phase 8: create_text font contract", () => {
    it("rejects unsupported fontWeight before implicit creation", async () => {
        makeParent();
        await expect(createText({
            parentId: "parent",
            text: "Body",
            fontWeight: 350,
        })).rejects.toThrow("Unsupported fontWeight 350");
        expect(trace).not.toContain("create:text");
    });

    it("applies a supported weight without echoing a fallback", async () => {
        makeParent();
        const result = await createText({
            parentId: "parent",
            text: "Bold body",
            fontWeight: 700,
            fontSize: 16,
        });
        expect(result.fontWeight).toBe(700);
        expect(result.fontSize).toBe(16);
        expect(created.get("Text").fontName).toEqual({
            family: "Inter",
            style: "Bold",
        });
    });

    it("routes font-load failure through creator cleanup instead of returning success", async () => {
        makeParent();
        (globalThis as any).figma.loadFontAsync = async () => {
            throw new Error("font load failed");
        };

        await expect(createText({
            parentId: "parent",
            text: "Body",
        })).rejects.toThrow("font load failed");
        expect(created.get("Text").removed).toBe(true);
        expect(trace).toContain("cleanup:Text");
    });

    it("routes fontSize configuration failure through creator cleanup instead of returning success", async () => {
        makeParent();
        throwOn = { label: "Text", property: "fontSize" };

        await expect(createText({
            parentId: "parent",
            text: "Body",
            fontSize: 16,
        })).rejects.toThrow("injected Text.fontSize failure");
        expect(created.get("Text").removed).toBe(true);
        expect(trace).toContain("cleanup:Text");
    });
});

describe("v2.3.3 Phase 8: observable-boundary containment", () => {
    for (const shapeCase of [
        {
            type: "RECTANGLE",
            createEvent: "create:shape",
            label: "Shape",
            params: {},
        },
        {
            type: "ELLIPSE",
            createEvent: "create:ellipse",
            label: "Ellipse",
            params: { arcData: { startingAngle: 0, endingAngle: Math.PI, innerRadius: 0.2 } },
        },
        {
            type: "POLYGON",
            createEvent: "create:polygon",
            label: "Polygon",
            params: { pointCount: 5 },
        },
        {
            type: "STAR",
            createEvent: "create:star",
            label: "Star",
            params: { pointCount: 5, innerRadius: 0.4 },
        },
    ]) {
        it(`create_shape ${shapeCase.type} appends immediately after implicit creation`, async () => {
            makeParent();
            await createShape({
                type: shapeCase.type,
                parentId: "parent",
                x: 10,
                y: 20,
                ...shapeCase.params,
            });
            assertImmediate(shapeCase.createEvent, `place:${shapeCase.label}:append`);
            expect(created.get(shapeCase.label).removed).toBe(false);
        });
    }

    it("create_frame appends immediately after implicit creation", async () => {
        makeParent();
        await createFrame({ parentId: "parent", x: 10, y: 20 });
        assertImmediate("create:frame", "place:Frame:append");
        expect(created.get("Frame").removed).toBe(false);
    });

    it("create_text appends before either font-loading await or character assignment", async () => {
        makeParent();
        await createText({ parentId: "parent", text: "Contained" });
        assertImmediate("create:text", "place:Text:append");
        const placementIndex = trace.indexOf("place:Text:append");
        expect(placementIndex).toBeLessThan(trace.indexOf("await:loadFontAsync"));
        expect(placementIndex).toBeLessThan(trace.indexOf("await:setCharacters"));
        expect(created.get("Text").removed).toBe(false);
    });

    it("create_svg appends immediately after implicit creation", async () => {
        makeParent();
        await createNodeFromSvg({ parentId: "parent", svg: "<svg/>" });
        assertImmediate("create:svg", "place:SVG:append");
        expect(created.get("SVG").removed).toBe(false);
    });

    it("create_instance appends immediately and returns the resolved local component id", async () => {
        makeParent();
        const component = {
            id: "component-local",
            name: "Local Component",
            type: "COMPONENT",
            createInstance() {
                trace.push("create:instance");
                return makeNode("Instance", "INSTANCE");
            },
        };
        nodes.set(component.id, component);
        const result = await createComponentInstance({
            parentId: "parent",
            componentId: component.id,
        });
        assertImmediate("create:instance", "place:Instance:append");
        expect(result.componentId).toBe(component.id);
        expect(created.get("Instance").removed).toBe(false);
    });

    it("create_instance returns the resolved imported component id on the componentKey path", async () => {
        makeParent();
        importedComponent = {
            id: "component-remote",
            name: "Remote Component",
            type: "COMPONENT",
            createInstance() {
                trace.push("create:instance-key");
                return makeNode("Key Instance", "INSTANCE");
            },
        };
        const result = await createComponentInstance({
            parentId: "parent",
            componentKey: "remote-key",
        });
        assertImmediate("create:instance-key", "place:Key Instance:append");
        expect(result.componentId).toBe(importedComponent.id);
        expect(created.get("Key Instance").removed).toBe(false);
    });

    it("Q33: create_instance resolves its destination after the component import, not before it", async () => {
        // The import await is bounded by IMPORT_TIMEOUT_MS (15s) — the widest
        // yield in any creator. Resolving the parent before it left the whole
        // window between the verified destination read and the placement, so
        // the parent is now read last, with no await before the append.
        const parent = makeParent();
        (globalThis as any).figma.getNodeByIdAsync = async (id: string) => {
            trace.push(`await:resolveParent:${id}`);
            return nodes.get(id) ?? null;
        };
        (globalThis as any).figma.importComponentByKeyAsync = async () => {
            trace.push("await:importComponent");
            return importedComponent;
        };
        importedComponent = {
            id: "component-remote",
            name: "Remote Component",
            type: "COMPONENT",
            createInstance() {
                trace.push("create:instance-key");
                return makeNode("Key Instance", "INSTANCE");
            },
        };

        await createComponentInstance({ parentId: parent.id, componentKey: "remote-key" });

        const importIndex = trace.indexOf("await:importComponent");
        const parentIndex = trace.indexOf(`await:resolveParent:${parent.id}`);
        expect(importIndex).toBeGreaterThanOrEqual(0);
        expect(parentIndex).toBeGreaterThan(importIndex);
        // …and nothing awaits between that read and the placement.
        expect(trace.slice(parentIndex + 1).filter((entry) => entry.startsWith("await:"))).toEqual([]);
        assertImmediate("create:instance-key", "place:Key Instance:append");
    });

    it("create_component inserts at the source index immediately after implicit creation", async () => {
        const parent = makeParent();
        const source = makeNode("Source", "FRAME", {
            id: "source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [],
        });
        parent.children.push(source);
        nodes.set("source", source);
        await createComponent({ nodeId: "source" });
        assertImmediate("create:component", "place:Component:insert:0");
        expect(created.get("Component").removed).toBe(false);
    });

    it("create_component restores already-moved source children before cleanup on a later move failure", async () => {
        const parent = makeParent();
        const firstChild = { id: "first", name: "First", type: "RECTANGLE" } as any;
        const secondChild = { id: "second", name: "Second", type: "RECTANGLE" } as any;
        const source = makeNode("Source", "FRAME", {
            id: "source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [firstChild, secondChild],
        });
        firstChild.parent = source;
        secondChild.parent = source;
        parent.children.push(source);
        nodes.set("source", source);

        const component = makeNode("Component", "COMPONENT");
        let moveCount = 0;
        component.appendChild = (child: any) => {
            moveCount++;
            if (moveCount === 2) {
                throw new Error("injected second child move failure");
            }
            const oldParent = child.parent;
            const oldIndex = oldParent.children.indexOf(child);
            if (oldIndex >= 0) oldParent.children.splice(oldIndex, 1);
            child.parent = component;
            component.children.push(child);
        };
        (globalThis as any).figma.createComponent = () => {
            trace.push("create:component");
            return component;
        };

        await expect(createComponent({ nodeId: "source" })).rejects.toThrow(
            "injected second child move failure",
        );
        expect(firstChild.parent).toBe(source);
        expect(secondChild.parent).toBe(source);
        expect(source.children).toEqual([firstChild, secondChild]);
        expect(component.children).toEqual([]);
        expect(component.removed).toBe(true);
        expect(source.removed).toBe(false);
    });

    it("every creator reports the parent it placed the node into", async () => {
        // D11's guarantee is containment; a response that omits the destination
        // makes the caller re-read to confirm it. Live verification had to issue
        // a follow-up node_info for each of these, which is the gap this closes.
        const parent = makeParent();
        const component = {
            id: "component-local",
            name: "Local Component",
            type: "COMPONENT",
            createInstance: () => makeNode("Instance", "INSTANCE"),
        };
        nodes.set(component.id, component);
        const source = { id: "source", name: "Source", type: "RECTANGLE", parent, clone: () => makeNode("Clone", "RECTANGLE") };
        nodes.set("source", source);
        const componentSource = makeNode("Component Source", "FRAME", {
            id: "component-source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [],
        });
        parent.children.push(componentSource);
        nodes.set(componentSource.id, componentSource);
        const variantA = { id: "variant-a", name: "A", type: "COMPONENT" };
        const variantB = { id: "variant-b", name: "B", type: "COMPONENT" };

        const results: Array<[string, any]> = [
            ["create_shape", await createShape({ type: "RECTANGLE", parentId: "parent" })],
            ["create_frame", await createFrame({ parentId: "parent" })],
            ["create_text", await createText({ parentId: "parent", text: "t" })],
            ["create_svg", await createNodeFromSvg({ parentId: "parent", svg: "<svg/>" })],
            ["create_instance", await createComponentInstance({ parentId: "parent", componentId: component.id })],
            ["node_clone", await cloneNode({ nodeId: "source", nodeName: "Source" })],
            ["create_component", await createComponent({ nodeId: componentSource.id })],
            ["create_component_set", await createComponentSet({
                components: [
                    { node: variantA, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: variantB, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            })],
        ];
        expect(results.map(([creator]) => creator)).toEqual([
            "create_shape",
            "create_frame",
            "create_text",
            "create_svg",
            "create_instance",
            "node_clone",
            "create_component",
            "create_component_set",
        ]);
        for (const [creator, result] of results) {
            expect(result.parentId, `${creator} must report its parent`).toBe(parent.id);
        }
    });

    it("Q32: create_component discloses partial mutation when cleanup cannot restore the moved children", async () => {
        const parent = makeParent();
        const firstChild = { id: "first", name: "First", type: "RECTANGLE" } as any;
        const source = makeNode("Source", "FRAME", {
            id: "source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [firstChild],
            // Restoration is impossible: the source frame refuses the child back.
            insertChild: () => {
                throw new Error("source frame refuses the restore");
            },
        });
        firstChild.parent = source;
        parent.children.push(source);
        nodes.set("source", source);

        const component = makeNode("Component", "COMPONENT");
        component.appendChild = (child: any) => {
            child.parent = component;
            component.children.push(child);
        };
        (globalThis as any).figma.createComponent = () => {
            trace.push("create:component");
            return component;
        };
        // Fail after the children have already moved, leaving the source frame
        // in place so the restore path is genuinely attempted (and refused).
        source.remove = () => {
            throw new Error("injected source removal failure");
        };

        let thrown: any = null;
        try {
            await createComponent({ nodeId: "source" });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown).not.toBeNull();
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.whatChanged).toContain("could not be restored");
        expect(thrown.details?.before?.sourceFrameRemoved).toBe(false);
        expect(thrown.details?.before?.survivingComponentId).toBe(component.id);
        expect(thrown.details?.before?.movedChildIds).toEqual(["first"]);
        expect(thrown.message).toContain("Partial mutation");
        // The container that still owns user nodes is never deleted.
        expect(component.removed).toBe(false);
        expect(firstChild.parent).toBe(component);
    });

    it("Q32: a create_component failure whose cleanup fully succeeds stays a clean failure", async () => {
        const parent = makeParent();
        const source = makeNode("Source", "FRAME", {
            id: "source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [],
        });
        parent.children.push(source);
        nodes.set("source", source);
        throwOn = { label: "Component", property: "x" };

        let thrown: any = null;
        try {
            await createComponent({ nodeId: "source" });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown).not.toBeNull();
        expect(thrown.details).toBeUndefined();
        expect(thrown.message).toBe("injected Component.x failure");
        expect(created.get("Component").removed).toBe(true);
        expect(source.removed).toBe(false);
    });

    it("Q32: create_component preserves the primary error and discloses an artifact when cleanup throws", async () => {
        const parent = makeParent();
        const source = makeNode("Source", "FRAME", {
            id: "source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [],
        });
        parent.children.push(source);
        nodes.set("source", source);

        const component = makeNode("Component", "COMPONENT");
        component.remove = () => {
            throw new Error("injected component cleanup failure");
        };
        (globalThis as any).figma.createComponent = () => {
            trace.push("create:component");
            return component;
        };
        throwOn = { label: "Component", property: "x" };

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createComponent({ nodeId: "source" });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.message).toContain("injected Component.x failure");
        expect(thrown.message).not.toContain("injected component cleanup failure");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before).toEqual({
            sourceFrameId: "source",
            sourceFrameName: "Source",
            sourceFrameRemoved: false,
            survivingComponentId: component.id,
            survivingComponentParentState: "located",
            survivingComponentParentId: parent.id,
            verifiedParentId: parent.id,
            sourceFrameRemovalState: "live",
            restoredChildIds: [],
            movedChildIds: [],
            unknownParentChildIds: [],
            relocatedChildren: [],
            restorationFailures: [],
            componentChildCount: 0,
        });
        expect(component.removed).toBe(false);
        expect(component.parent).toBe(parent);
        expect(source.removed).toBe(false);
    });

    it("Q32: create_component treats an unreadable source removal state as partial and never removes the component", async () => {
        const parent = makeParent();
        const source = makeNode("Source", "FRAME", {
            id: "source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [],
        });
        Object.defineProperty(source, "removed", {
            configurable: true,
            get: () => {
                throw new Error("source removed getter refused");
            },
        });
        parent.children.push(source);
        nodes.set("source", source);
        throwOn = { label: "Component", property: "x" };

        let thrown: any = null;
        try {
            await createComponent({ nodeId: "source" });
        } catch (error: any) {
            thrown = error;
        }

        const component = created.get("Component");
        expect(thrown.message).toContain("injected Component.x failure");
        expect(thrown.message).not.toContain("removed getter refused");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before?.sourceFrameRemovalState).toBe("unknown");
        expect(thrown.details?.before?.sourceFrameRemoved).toBeNull();
        expect(thrown.details?.before?.componentChildCount).toBe(0);
        expect(component.removed).toBe(false);
        expect(component.parent).toBe(parent);
        expect(trace).not.toContain("cleanup:Component");
    });

    it("Q32: create_component discloses unreadable and relocated child states without unsafe cleanup", async () => {
        const parent = makeParent();
        const externalParent = { id: "external", name: "External", type: "FRAME", children: [] as any[] };
        let recoveryStarted = false;
        let unknownChildParent: any = null;
        const unknownChild: any = { id: "unknown-child", name: "Unknown", type: "RECTANGLE" };
        Object.defineProperty(unknownChild, "parent", {
            configurable: true,
            get: () => {
                if (recoveryStarted) throw new Error("child parent getter refused");
                return unknownChildParent;
            },
            set: (value) => {
                unknownChildParent = value;
            },
        });
        const relocatedChild: any = { id: "relocated-child", name: "Relocated", type: "RECTANGLE" };
        const source = makeNode("Source", "FRAME", {
            id: "source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [unknownChild, relocatedChild],
        });
        unknownChild.parent = source;
        relocatedChild.parent = source;
        parent.children.push(source);
        nodes.set("source", source);

        const component = makeNode("Component", "COMPONENT");
        source.remove = () => {
            const relocatedIndex = component.children.indexOf(relocatedChild);
            if (relocatedIndex >= 0) component.children.splice(relocatedIndex, 1);
            relocatedChild.parent = externalParent;
            externalParent.children.push(relocatedChild);
            recoveryStarted = true;
            throw new Error("injected source removal failure");
        };
        (globalThis as any).figma.createComponent = () => component;

        let thrown: any = null;
        try {
            await createComponent({ nodeId: "source" });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown.message).toContain("injected source removal failure");
        expect(thrown.message).not.toContain("child parent getter refused");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before?.sourceFrameRemovalState).toBe("live");
        expect(thrown.details?.before?.unknownParentChildIds).toEqual(["unknown-child"]);
        expect(thrown.details?.before?.relocatedChildren).toEqual([
            { childId: "relocated-child", currentParentId: externalParent.id },
        ]);
        expect(thrown.details?.before?.restoredChildIds).toEqual([]);
        expect(thrown.details?.before?.movedChildIds).toEqual([]);
        expect(component.removed).toBe(false);
        expect(component.children).toEqual([unknownChild]);
        expect(relocatedChild.parent).toBe(externalParent);
        expect(trace).not.toContain("cleanup:Component");
    });

    it("Q32: create_component continues later child restorations after an earlier restore fails", async () => {
        const parent = makeParent();
        const firstChild: any = { id: "first", name: "First", type: "RECTANGLE" };
        const secondChild: any = { id: "second", name: "Second", type: "RECTANGLE" };
        const thirdChild: any = { id: "third", name: "Third", type: "RECTANGLE" };
        const restoreAttempts: Array<{ childId: string; index: number }> = [];
        const source = makeNode("Source", "FRAME", {
            id: "source",
            parent,
            x: 5,
            y: 6,
            width: 120,
            height: 80,
            fills: [],
            strokes: [],
            strokeWeight: 1,
            strokeAlign: "INSIDE",
            strokeCap: "NONE",
            strokeJoin: "MITER",
            dashPattern: [],
            effects: [],
            layoutGrids: [],
            opacity: 1,
            blendMode: "PASS_THROUGH",
            isMask: false,
            cornerRadius: 0,
            layoutMode: "NONE",
            children: [firstChild, secondChild, thirdChild],
            insertChild: (index: number, child: any) => {
                restoreAttempts.push({ childId: child.id, index });
                if (child === firstChild) {
                    throw new Error("first child restore refused");
                }
                const oldParent = child.parent;
                const oldIndex = oldParent?.children?.indexOf(child) ?? -1;
                if (oldIndex >= 0) oldParent.children.splice(oldIndex, 1);
                source.children.splice(index, 0, child);
                child.parent = source;
            },
        });
        firstChild.parent = source;
        secondChild.parent = source;
        thirdChild.parent = source;
        parent.children.push(source);
        nodes.set("source", source);

        const component = makeNode("Component", "COMPONENT");
        let moveCount = 0;
        component.appendChild = (child: any) => {
            moveCount++;
            if (moveCount === 3) {
                // The final child remains on the source. Later recovery must
                // insert the second child before this untouched later sibling,
                // even though restoring the first child fails.
                throw new Error("injected third child move failure");
            }
            const oldParent = child.parent;
            const oldIndex = oldParent.children.indexOf(child);
            if (oldIndex >= 0) oldParent.children.splice(oldIndex, 1);
            child.parent = component;
            component.children.push(child);
        };
        (globalThis as any).figma.createComponent = () => component;

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createComponent({ nodeId: "source" });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.message).toContain("injected third child move failure");
        expect(thrown.message).not.toContain("first child restore refused");
        expect(restoreAttempts).toEqual([
            { childId: "first", index: 0 },
            { childId: "second", index: 0 },
        ]);
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before?.restoredChildIds).toEqual(["second", "third"]);
        expect(thrown.details?.before?.movedChildIds).toEqual(["first"]);
        expect(thrown.details?.before?.unknownParentChildIds).toEqual([]);
        expect(thrown.details?.before?.relocatedChildren).toEqual([]);
        expect(thrown.details?.before?.restorationFailures).toEqual([
            { childId: "first", attemptedIndex: 0 },
        ]);
        expect(component.removed).toBe(false);
        expect(component.children).toEqual([firstChild]);
        expect(source.children).toEqual([secondChild, thirdChild]);
        expect(trace).not.toContain("cleanup:Component");
    });

    it("node_clone appends immediately after clone()", async () => {
        const parent = makeParent();
        const source = {
            id: "source",
            name: "Source",
            type: "RECTANGLE",
            parent,
            clone() {
                trace.push("create:clone");
                return makeNode("Clone", "RECTANGLE");
            },
        };
        nodes.set("source", source);
        await cloneNode({ nodeId: "source", x: 1, y: 2 });
        assertImmediate("create:clone", "place:Clone:append");
        expect(created.get("Clone").removed).toBe(false);
    });

    it("a later configuration failure removes the contained but uncommitted artifact", async () => {
        makeParent();
        throwOn = { label: "Shape", property: "x" };
        await expect(
            createShape({ type: "RECTANGLE", parentId: "parent", x: 10 }),
        ).rejects.toThrow("injected Shape.x failure");
        assertImmediate("create:shape", "place:Shape:append");
        expect(trace.indexOf("cleanup:Shape")).toBeGreaterThan(trace.indexOf("place:Shape:append"));
        expect(created.get("Shape").removed).toBe(true);
    });

    // Cleanup was previously proven for `create_shape` alone. Every creator owns
    // the same guarded block, and `create_text` is the only one whose block spans
    // an `await` — the case where "cleanup runs on the failure path" is not
    // obvious from reading the synchronous code.
    for (const cleanupCase of [
        {
            name: "create_frame",
            label: "Frame",
            run: () => createFrame({ parentId: "parent", x: 10, y: 20 }),
            throwOn: { label: "Frame", property: "x" },
        },
        {
            name: "create_svg",
            label: "SVG",
            run: () => createNodeFromSvg({ parentId: "parent", svg: "<svg/>", name: "Named" }),
            throwOn: { label: "SVG", property: "name" },
        },
    ]) {
        it(`${cleanupCase.name} removes its uncommitted artifact on a later failure`, async () => {
            makeParent();
            throwOn = cleanupCase.throwOn;
            await expect(cleanupCase.run()).rejects.toThrow(
                `injected ${cleanupCase.throwOn.label}.${cleanupCase.throwOn.property} failure`,
            );
            expect(created.get(cleanupCase.label).removed).toBe(true);
        });
    }

    it("create_text removes its uncommitted node when the failure lands after the font awaits", async () => {
        makeParent();
        const { setCharacters } = await import("../../../../../figma_plugin/utils/textUtils.js");
        (setCharacters as any).mockImplementationOnce(async () => {
            trace.push("await:setCharacters");
            throw new Error("injected setCharacters failure");
        });

        await expect(
            createText({ parentId: "parent", text: "Contained" }),
        ).rejects.toThrow("injected setCharacters failure");

        // Placement happened first, the await failed afterwards, and cleanup
        // still ran — the guarantee that the guarded block survives an await.
        assertImmediate("create:text", "place:Text:append");
        expect(trace.indexOf("await:setCharacters")).toBeGreaterThan(trace.indexOf("place:Text:append"));
        expect(created.get("Text").removed).toBe(true);
    });

    it("create_instance removes its uncommitted instance on a later failure", async () => {
        makeParent();
        const component = {
            id: "component-local",
            name: "Local Component",
            type: "COMPONENT",
            createInstance() {
                trace.push("create:instance");
                return makeNode("Instance", "INSTANCE");
            },
        };
        nodes.set(component.id, component);
        throwOn = { label: "Instance", property: "x" };

        await expect(
            createComponentInstance({ parentId: "parent", componentId: component.id, x: 5 }),
        ).rejects.toThrow("injected Instance.x failure");
        expect(created.get("Instance").removed).toBe(true);
    });

    it("node_clone removes its uncommitted clone on a later failure", async () => {
        const parent = makeParent();
        const source = {
            id: "source",
            name: "Source",
            type: "RECTANGLE",
            parent,
            clone() {
                trace.push("create:clone");
                return makeNode("Clone", "RECTANGLE");
            },
        };
        nodes.set("source", source);
        throwOn = { label: "Clone", property: "x" };

        await expect(
            cloneNode({ nodeId: "source", nodeName: "Source", x: 1, y: 2 }),
        ).rejects.toThrow("injected Clone.x failure");
        expect(created.get("Clone").removed).toBe(true);
    });

    it("a failing cleanup reports itself but never replaces the original error", async () => {
        // Cleanup runs on the failure path, so a throwing remove() would mask the
        // cause the caller actually needs. The original error must survive.
        makeParent();
        throwOn = { label: "Shape", property: "x" };
        const consoleError = console.error;
        const logged: string[] = [];
        console.error = (...args: any[]) => { logged.push(String(args[0])); };
        try {
            await expect(
                createShape({ type: "RECTANGLE", parentId: "parent", x: 10 }),
            ).rejects.toThrow("injected Shape.x failure");
        } finally {
            console.error = consoleError;
        }
        expect(logged.some((entry) => entry.includes("create_shape"))).toBe(false);

        // Now make removal itself fail.
        trace = [];
        created = new Map();
        makeParent();
        const shape = makeNode("Shape", "RECTANGLE");
        shape.remove = () => { throw new Error("remove() refused"); };
        (globalThis as any).figma.createRectangle = () => {
            trace.push("create:shape");
            return shape;
        };
        throwOn = { label: "Shape", property: "x" };
        let thrown: any = null;
        console.error = (...args: any[]) => { logged.push(String(args[0])); };
        try {
            await createShape({ type: "RECTANGLE", parentId: "parent", x: 10 });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }
        expect(thrown.message).toContain("injected Shape.x failure");
        expect(thrown.message).not.toContain("remove() refused");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before).toEqual({
            survivingNodeId: shape.id,
            survivingNodeName: "Shape",
            survivingNodeType: "RECTANGLE",
            survivingParentState: "located",
            survivingParentId: "parent",
            verifiedParentId: "parent",
        });
        expect(logged.some((entry) => entry.includes("create_shape") && entry.includes("cleanup"))).toBe(true);
    });

    it("Q32: append failure plus a no-op cleanup reports the survivor's actual parent", async () => {
        const parent = makeParent();
        const implicitPage = { id: "page", name: "Page", type: "PAGE", children: [] as any[] };
        const shape = makeNode("Shape", "RECTANGLE", { parent: implicitPage });
        implicitPage.children.push(shape);
        shape.remove = () => {
            // Non-conforming/no-op cleanup: returning is not proof of removal.
        };
        parent.appendChild = () => {
            throw new Error("APPEND_FAILURE");
        };
        (globalThis as any).figma.createRectangle = () => {
            trace.push("create:shape");
            return shape;
        };

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createShape({ type: "RECTANGLE", parentId: parent.id });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.message).toContain("APPEND_FAILURE");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.whatChanged).toContain("survives");
        expect(thrown.details?.before).toEqual({
            survivingNodeId: shape.id,
            survivingNodeName: "Shape",
            survivingNodeType: "RECTANGLE",
            survivingParentState: "located",
            survivingParentId: implicitPage.id,
            verifiedParentId: parent.id,
        });
        expect(shape.removed).toBe(false);
        expect(shape.parent).toBe(implicitPage);
    });

    it("Q32: cleanup can prove a surviving creator artifact is detached", async () => {
        const parent = makeParent();
        const shape = makeNode("Shape", "RECTANGLE");
        shape.remove = () => {
            // The host detached the node but did not mark it removed. This is a
            // surviving artifact at a known detached location, not an
            // unreadable-parent state.
            shape.parent = null;
        };
        (globalThis as any).figma.createRectangle = () => {
            trace.push("create:shape");
            return shape;
        };
        throwOn = { label: "Shape", property: "x" };

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createShape({ type: "RECTANGLE", parentId: parent.id, x: 10 });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.whatChanged).toContain("detached/null");
        expect(thrown.details?.before).toEqual({
            survivingNodeId: shape.id,
            survivingNodeName: "Shape",
            survivingNodeType: "RECTANGLE",
            survivingParentState: "detached",
            survivingParentId: null,
            verifiedParentId: parent.id,
        });
        expect(shape.removed).toBe(false);
        expect(shape.parent).toBeNull();
    });

    it("Q32: throwing survivor getters cannot mask the creator's initiating error", async () => {
        makeParent();
        const shape = makeNode("Shape", "RECTANGLE");
        let recoveryStarted = false;
        let parentValue: any = null;
        for (const [property, value] of [
            ["id", "shape-id"],
            ["name", "Shape"],
            ["type", "RECTANGLE"],
        ] as const) {
            Object.defineProperty(shape, property, {
                configurable: true,
                get: () => {
                    if (recoveryStarted) throw new Error(`${property} getter refused`);
                    return value;
                },
            });
        }
        Object.defineProperty(shape, "removed", {
            configurable: true,
            get: () => {
                if (recoveryStarted) throw new Error("removed getter refused");
                return false;
            },
        });
        Object.defineProperty(shape, "parent", {
            configurable: true,
            get: () => {
                if (recoveryStarted) throw new Error("parent getter refused");
                return parentValue;
            },
            set: (value) => {
                parentValue = value;
            },
        });
        shape.remove = () => {
            recoveryStarted = true;
            // The post-remove `removed` read now throws. Recovery must treat
            // that as unconfirmed cleanup without replacing the primary error.
        };
        (globalThis as any).figma.createRectangle = () => {
            trace.push("create:shape");
            return shape;
        };
        throwOn = { label: "Shape", property: "x" };

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createShape({ type: "RECTANGLE", parentId: "parent", x: 10 });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.message).toContain("injected Shape.x failure");
        expect(thrown.message).not.toContain("getter refused");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before).toEqual({
            survivingNodeId: "unknown",
            survivingNodeName: "unknown",
            survivingNodeType: "unknown",
            survivingParentState: "unknown",
            survivingParentId: null,
            verifiedParentId: "parent",
        });
        expect(thrown.details?.whatChanged).toContain("unknown (the parent could not be read safely)");
        expect(thrown.details?.whatChanged).not.toContain("detached/null");
    });

    it("Q32: a hostile thrown Proxy cannot erase a post-mutation creator disclosure", async () => {
        const parent = makeParent();
        const shape = makeNode("Shape", "RECTANGLE");
        const hostile = new Proxy({}, {
            get: () => {
                throw new Error("hostile getter must not escape");
            },
            ownKeys: () => {
                throw new Error("hostile enumeration must not escape");
            },
        });
        Object.defineProperty(shape, "x", {
            configurable: true,
            get: () => 0,
            set: () => {
                throw hostile;
            },
        });
        shape.remove = () => {
            throw new Error("cleanup refused");
        };
        (globalThis as any).figma.createRectangle = () => {
            trace.push("create:shape");
            return shape;
        };

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createShape({
                type: "RECTANGLE",
                parentId: parent.id,
                x: 10,
            });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.code).toBe("UNKNOWN_ERROR");
        expect(thrown.message).toContain("Error executing command Partial mutation:");
        expect(thrown.message).not.toContain("hostile getter");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before).toEqual({
            survivingNodeId: shape.id,
            survivingNodeName: "Shape",
            survivingNodeType: "RECTANGLE",
            survivingParentState: "located",
            survivingParentId: parent.id,
            verifiedParentId: parent.id,
        });
    });

    const cleanupDisclosureCases: Array<{
        name: string;
        setup: () => {
            run: () => Promise<any>;
            survivor: any;
            primaryError: string;
            verifiedParentId: string;
        };
    }> = [
        {
            name: "create_shape",
            setup: () => {
                const parent = makeParent();
                const survivor = makeNode("Shape", "RECTANGLE");
                survivor.remove = () => { throw new Error("cleanup refused"); };
                (globalThis as any).figma.createRectangle = () => survivor;
                throwOn = { label: "Shape", property: "x" };
                return {
                    run: () => createShape({ type: "RECTANGLE", parentId: parent.id, x: 10 }),
                    survivor,
                    primaryError: "injected Shape.x failure",
                    verifiedParentId: parent.id,
                };
            },
        },
        {
            name: "create_frame",
            setup: () => {
                const parent = makeParent();
                const survivor = makeNode("Frame", "FRAME", {
                    layoutMode: "NONE",
                    layoutWrap: "NO_WRAP",
                    strokeWeight: 1,
                });
                survivor.remove = () => { throw new Error("cleanup refused"); };
                (globalThis as any).figma.createFrame = () => survivor;
                throwOn = { label: "Frame", property: "x" };
                return {
                    run: () => createFrame({ parentId: parent.id, x: 10 }),
                    survivor,
                    primaryError: "injected Frame.x failure",
                    verifiedParentId: parent.id,
                };
            },
        },
        {
            name: "create_text",
            setup: () => {
                const parent = makeParent();
                const survivor = makeNode("Text", "TEXT", {
                    characters: "",
                    fontName: { family: "Inter", style: "Regular" },
                    fontSize: 14,
                });
                survivor.remove = () => { throw new Error("cleanup refused"); };
                (globalThis as any).figma.createText = () => survivor;
                throwOn = { label: "Text", property: "x" };
                return {
                    run: () => createText({ parentId: parent.id, text: "Text", x: 10 }),
                    survivor,
                    primaryError: "injected Text.x failure",
                    verifiedParentId: parent.id,
                };
            },
        },
        {
            name: "create_svg",
            setup: () => {
                const parent = makeParent();
                const survivor = makeNode("SVG", "FRAME");
                survivor.remove = () => { throw new Error("cleanup refused"); };
                (globalThis as any).figma.createNodeFromSvg = () => survivor;
                throwOn = { label: "SVG", property: "x" };
                return {
                    run: () => createNodeFromSvg({ parentId: parent.id, svg: "<svg/>", x: 10 }),
                    survivor,
                    primaryError: "injected SVG.x failure",
                    verifiedParentId: parent.id,
                };
            },
        },
        {
            name: "create_instance",
            setup: () => {
                const parent = makeParent();
                const survivor = makeNode("Instance", "INSTANCE");
                survivor.remove = () => { throw new Error("cleanup refused"); };
                const component = {
                    id: "cleanup-component",
                    name: "Cleanup Component",
                    type: "COMPONENT",
                    createInstance: () => survivor,
                };
                nodes.set(component.id, component);
                throwOn = { label: "Instance", property: "x" };
                return {
                    run: () => createComponentInstance({
                        parentId: parent.id,
                        componentId: component.id,
                        x: 10,
                    }),
                    survivor,
                    primaryError: "injected Instance.x failure",
                    verifiedParentId: parent.id,
                };
            },
        },
        {
            name: "node_clone",
            setup: () => {
                const parent = makeParent();
                const survivor = makeNode("Clone", "RECTANGLE");
                survivor.remove = () => { throw new Error("cleanup refused"); };
                const source = {
                    id: "cleanup-source",
                    name: "Cleanup Source",
                    type: "RECTANGLE",
                    parent,
                    clone: () => survivor,
                };
                nodes.set(source.id, source);
                throwOn = { label: "Clone", property: "x" };
                return {
                    run: () => cloneNode({
                        nodeId: source.id,
                        nodeName: source.name,
                        x: 10,
                        y: 20,
                    }),
                    survivor,
                    primaryError: "injected Clone.x failure",
                    verifiedParentId: parent.id,
                };
            },
        },
    ];

    it("T78-04: cleanup-disclosure matrix independently inventories all six ordinary creators", () => {
        expect(cleanupDisclosureCases.map((entry) => entry.name)).toEqual([
            "create_shape",
            "create_frame",
            "create_text",
            "create_svg",
            "create_instance",
            "node_clone",
        ]);
    });

    for (const cleanupCase of cleanupDisclosureCases) {
        it(`T78-04: ${cleanupCase.name} discloses its survivor when configuration and cleanup both fail`, async () => {
            const { run, survivor, primaryError, verifiedParentId } = cleanupCase.setup();
            let thrown: any = null;
            const consoleError = console.error;
            console.error = () => {};
            try {
                await run();
            } catch (error: any) {
                thrown = error;
            } finally {
                console.error = consoleError;
            }

            expect(thrown.message).toContain(primaryError);
            expect(thrown.message).not.toContain("cleanup refused");
            expect(thrown.details?.partialMutation).toBe(true);
            expect(thrown.details?.before).toEqual({
                survivingNodeId: survivor.id,
                survivingNodeName: survivor.name,
                survivingNodeType: survivor.type,
                survivingParentState: "located",
                survivingParentId: verifiedParentId,
                verifiedParentId,
            });
            expect(survivor.removed).toBe(false);
            expect(survivor.parent?.id).toBe(verifiedParentId);
        });
    }

    it("node_flatten passes the captured parent and exact source index", async () => {
        const parent = makeParent();
        const before = { id: "before", name: "Before", type: "RECTANGLE", parent };
        const source = { id: "source", name: "Source", type: "RECTANGLE", parent };
        const after = { id: "after", name: "After", type: "RECTANGLE", parent };
        parent.children.push(before, source, after);
        nodes.set("source", source);
        await flattenNode({ nodeId: "source" });
        expect(flattenArgs[0]).toEqual([source]);
        expect(flattenArgs[1]).toBe(parent);
        expect(flattenArgs[2]).toBe(1);
    });

    it("create_component_set passes the verified explicit parent directly to combineAsVariants", async () => {
        const parent = makeParent();
        const a = { id: "a", name: "A", type: "COMPONENT" };
        const b = { id: "b", name: "B", type: "COMPONENT" };
        await createComponentSet({
            components: [
                { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
            ],
            properties: ["Size"],
            containingPage: { id: "page" },
            parent,
            componentSetName: "Set",
        });
        expect(combineArgs[0]).toEqual([a, b]);
        expect(combineArgs[1]).toBe(parent);
        expect(trace.filter((entry) => entry.includes(":append"))).toEqual([]);
    });

    it("create_component_set rejects an explicit empty set name before validation reads, member renames, or combine", async () => {
        const parent = makeParent();
        const emptyA: any = { id: "empty-a", name: "A", type: "COMPONENT" };
        const emptyB: any = { id: "empty-b", name: "B", type: "COMPONENT" };

        await expect(validateCreateComponentSetPlan({
            componentSetName: "",
        }, parent)).rejects.toThrow(
            "create_component_set: componentSetName must not be empty",
        );
        await expect(createComponentSet({
            components: [
                { node: emptyA, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                { node: emptyB, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
            ],
            properties: ["Size"],
            parent,
            componentSetName: "",
        })).rejects.toThrow(
            "create_component_set: componentSetName must not be empty",
        );

        expect(emptyA.name).toBe("A");
        expect(emptyB.name).toBe("B");
        expect(trace).not.toContain("mutate:combineAsVariants");
        expect(combineArgs).toEqual([]);
    });

    it("create_component_set keeps Figma's default when the set name is omitted and accepts whitespace", async () => {
        const parent = makeParent();

        const omittedA: any = { id: "omitted-a", name: "A", type: "COMPONENT" };
        const omittedB: any = { id: "omitted-b", name: "B", type: "COMPONENT" };
        const omittedNameResult = await createComponentSet({
            components: [
                { node: omittedA, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                { node: omittedB, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
            ],
            properties: ["Size"],
            parent,
        });

        expect(omittedNameResult.name).toBe("Set");
        expect(omittedNameResult.parentId).toBe(parent.id);

        const whitespaceA: any = { id: "whitespace-a", name: "A", type: "COMPONENT" };
        const whitespaceB: any = { id: "whitespace-b", name: "B", type: "COMPONENT" };
        const whitespaceNameResult = await createComponentSet({
            components: [
                { node: whitespaceA, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                { node: whitespaceB, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
            ],
            properties: ["Size"],
            parent,
            componentSetName: " ",
        });
        expect(whitespaceNameResult.name).toBe(" ");
        expect(whitespaceNameResult.parentId).toBe(parent.id);
    });

    it("create_component_set restores every original component name when combineAsVariants throws", async () => {
        // The handler renames members to variant names BEFORE combining, so a
        // failed combine would otherwise leave the user's components renamed
        // with no set to justify it.
        const parent = makeParent();
        const a: any = { id: "a", name: "A", type: "COMPONENT", removed: false };
        const b: any = { id: "b", name: "B", type: "COMPONENT", removed: false };
        (globalThis as any).figma.combineAsVariants = () => {
            throw new Error("injected combine failure");
        };

        let thrown: any = null;
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown.message).toBe("injected combine failure");
        expect(thrown.details).toBeUndefined();
        expect(a.name).toBe("A");
        expect(b.name).toBe("B");
    });

    it("Q32: unreadable component removal state forces partial disclosure even when names and placement restore", async () => {
        const parent = makeParent();
        const a: any = { id: "a", name: "A", type: "COMPONENT" };
        Object.defineProperty(a, "removed", {
            configurable: true,
            get: () => {
                throw new Error("removed getter refused");
            },
        });
        const b: any = { id: "b", name: "B", type: "COMPONENT", removed: false };
        (globalThis as any).figma.combineAsVariants = () => {
            throw new Error("injected combine failure");
        };

        let thrown: any = null;
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown.message).toContain("injected combine failure");
        expect(thrown.message).not.toContain("removed getter refused");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before?.removedComponents).toEqual([]);
        expect(thrown.details?.before?.unknownRemovalComponents).toEqual([
            {
                componentId: "a",
                originalName: "A",
                variantName: "Size=A",
            },
        ]);
        expect(thrown.details?.before?.restoredComponents).toHaveLength(2);
        expect(thrown.details?.before?.reparentedComponents).toEqual([]);
        expect(thrown.details?.before?.unverifiedPlacementComponents).toEqual([]);
        expect(a.name).toBe("A");
        expect(b.name).toBe("B");
    });

    it("Q32: failed combine retains variant names for members reparented into a surviving set", async () => {
        const parent = makeParent();
        const originalParent: any = {
            id: "original-parent",
            name: "Original Parent",
            type: "FRAME",
            children: [] as any[],
        };
        const a: any = { id: "a", name: "A", type: "COMPONENT", parent: originalParent, removed: false };
        const b: any = { id: "b", name: "B", type: "COMPONENT", parent: originalParent, removed: false };
        originalParent.children.push(a, b);
        const survivingSet: any = {
            id: "surviving-set",
            name: "Surviving Set",
            type: "COMPONENT_SET",
            parent,
            children: [a, b],
        };
        (globalThis as any).figma.combineAsVariants = () => {
            originalParent.children.length = 0;
            a.parent = survivingSet;
            b.parent = survivingSet;
            throw new Error("injected combine failure after reparenting");
        };

        let thrown: any = null;
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown.message).toContain("injected combine failure after reparenting");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.whatChanged).toContain("2 remain valid members of 1 surviving set");
        expect(thrown.details?.before?.restoredComponents).toEqual([]);
        expect(thrown.details?.before?.unrestoredComponents).toEqual([]);
        expect(thrown.details?.before?.removedComponents).toEqual([]);
        expect(thrown.details?.before?.reparentedComponents).toEqual([
            {
                componentId: "a",
                originalParentId: originalParent.id,
                currentParentId: survivingSet.id,
                currentParentName: survivingSet.name,
                currentParentType: survivingSet.type,
            },
            {
                componentId: "b",
                originalParentId: originalParent.id,
                currentParentId: survivingSet.id,
                currentParentName: survivingSet.name,
                currentParentType: survivingSet.type,
            },
        ]);
        expect(thrown.details?.before?.unverifiedPlacementComponents).toEqual([]);
        expect(thrown.details?.before?.survivingComponentSets).toEqual([
            {
                componentSetId: survivingSet.id,
                componentSetName: survivingSet.name,
                parentId: parent.id,
                memberIds: ["a", "b"],
            },
        ]);
        expect(thrown.details?.before?.retainedVariantComponents).toEqual([
            {
                componentId: "a",
                componentSetId: survivingSet.id,
                originalName: "A",
                variantName: "Size=A",
                observedNameBeforeConfirmation: "Size=A",
                currentName: "Size=A",
            },
            {
                componentId: "b",
                componentSetId: survivingSet.id,
                originalName: "B",
                variantName: "Size=B",
                observedNameBeforeConfirmation: "Size=B",
                currentName: "Size=B",
            },
        ]);
        expect(thrown.details?.before?.unconfirmedVariantComponents).toEqual([]);
        expect(a.name).toBe("Size=A");
        expect(b.name).toBe("Size=B");
        expect(a.parent).toBe(survivingSet);
        expect(b.parent).toBe(survivingSet);
    });

    it("Q32: unreadable changed-parent type never authorizes restoring pre-set names", async () => {
        const parent = makeParent();
        const originalParent: any = {
            id: "original-parent",
            name: "Original Parent",
            type: "FRAME",
            children: [] as any[],
        };
        const a: any = {
            id: "a",
            name: "A",
            type: "COMPONENT",
            parent: originalParent,
            removed: false,
        };
        const b: any = {
            id: "b",
            name: "B",
            type: "COMPONENT",
            parent: originalParent,
            removed: false,
        };
        originalParent.children.push(a, b);
        const survivingSet: any = {
            id: "surviving-set",
            name: "Surviving Set",
            parent,
            children: [a, b],
        };
        Object.defineProperty(survivingSet, "type", {
            configurable: true,
            get: () => {
                throw new Error("surviving set type getter refused");
            },
        });
        (globalThis as any).figma.combineAsVariants = () => {
            originalParent.children.length = 0;
            a.parent = survivingSet;
            b.parent = survivingSet;
            throw new Error("injected combine failure after reparenting");
        };

        let thrown: any = null;
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown.message).toContain("injected combine failure after reparenting");
        expect(thrown.message).not.toContain("type getter refused");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before?.restoredComponents).toEqual([]);
        expect(thrown.details?.before?.reparentedComponents).toEqual([
            {
                componentId: "a",
                originalParentId: originalParent.id,
                currentParentId: survivingSet.id,
                currentParentName: survivingSet.name,
                currentParentType: "unknown",
            },
            {
                componentId: "b",
                originalParentId: originalParent.id,
                currentParentId: survivingSet.id,
                currentParentName: survivingSet.name,
                currentParentType: "unknown",
            },
        ]);
        expect(thrown.details?.before?.unverifiedPlacementComponents).toEqual([
            {
                componentId: "a",
                originalParentId: originalParent.id,
            },
            {
                componentId: "b",
                originalParentId: originalParent.id,
            },
        ]);
        expect(thrown.details?.before?.survivingComponentSets).toEqual([]);
        expect(thrown.details?.before?.retainedVariantComponents).toEqual([]);
        expect(thrown.details?.before?.unconfirmedVariantComponents).toEqual([]);
        expect(a.name).toBe("Size=A");
        expect(b.name).toBe("Size=B");
        expect(a.parent).toBe(survivingSet);
        expect(b.parent).toBe(survivingSet);
    });

    it("Q32: surviving-set variant confirmation failure preserves the combine error and never restores the original name", async () => {
        const parent = makeParent();
        const originalParent: any = {
            id: "original-parent",
            name: "Original Parent",
            type: "FRAME",
            children: [] as any[],
        };
        let aName = "A";
        let confirmationPhase = false;
        const aNameWrites: string[] = [];
        const a: any = { id: "a", type: "COMPONENT", parent: originalParent, removed: false };
        Object.defineProperty(a, "name", {
            get: () => aName,
            set: (value: string) => {
                aNameWrites.push(value);
                if (confirmationPhase && value === "Size=A") {
                    throw new Error("variant confirmation refused");
                }
                aName = value;
            },
        });
        const b: any = { id: "b", name: "B", type: "COMPONENT", parent: originalParent, removed: false };
        originalParent.children.push(a, b);
        const survivingSet: any = {
            id: "surviving-set",
            name: "Surviving Set",
            type: "COMPONENT_SET",
            parent,
            children: [a, b],
        };
        (globalThis as any).figma.combineAsVariants = () => {
            originalParent.children.length = 0;
            a.parent = survivingSet;
            b.parent = survivingSet;
            aName = "Wrong";
            confirmationPhase = true;
            throw new Error("injected combine failure after reparenting");
        };

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.message).toContain("injected combine failure after reparenting");
        expect(thrown.message).not.toContain("variant confirmation refused");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before?.retainedVariantComponents).toEqual([
            {
                componentId: "b",
                componentSetId: survivingSet.id,
                originalName: "B",
                variantName: "Size=B",
                observedNameBeforeConfirmation: "Size=B",
                currentName: "Size=B",
            },
        ]);
        expect(thrown.details?.before?.unconfirmedVariantComponents).toEqual([
            {
                componentId: "a",
                componentSetId: survivingSet.id,
                originalName: "A",
                variantName: "Size=A",
                observedNameBeforeConfirmation: "Wrong",
                currentName: "Wrong",
            },
        ]);
        expect(thrown.details?.before?.restoredComponents).toEqual([]);
        expect(aNameWrites).toEqual(["Size=A", "Size=A"]);
        expect(aNameWrites).not.toContain("A");
        expect(a.name).toBe("Wrong");
        expect(b.name).toBe("Size=B");
        expect(a.parent).toBe(survivingSet);
        expect(b.parent).toBe(survivingSet);
    });

    it("Q32: create_component_set discloses removed members while restoring every later live name", async () => {
        const parent = makeParent();
        const a: any = { id: "a", name: "A", type: "COMPONENT", removed: false };
        const b: any = { id: "b", name: "B", type: "COMPONENT", removed: false };
        (globalThis as any).figma.combineAsVariants = () => {
            // The member disappears as part of the same failure — a removed node
            // rejects writes, so restoring it would throw and replace the cause.
            a.removed = true;
            Object.defineProperty(a, "name", {
                get: () => "Size=A",
                set: () => { throw new Error("cannot rename a removed node"); },
            });
            throw new Error("injected combine failure");
        };

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.message).toContain("injected combine failure");
        expect(thrown.message).not.toContain("cannot rename a removed node");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.whatChanged).toContain("1 component(s) were removed");
        expect(thrown.details?.before?.appliedComponents).toEqual([
            {
                componentId: "a",
                originalName: "A",
                variantName: "Size=A",
                observedNameBeforeRestore: "Size=A",
            },
            {
                componentId: "b",
                originalName: "B",
                variantName: "Size=B",
                observedNameBeforeRestore: "Size=B",
            },
        ]);
        expect(thrown.details?.before?.restoredComponents).toEqual([
            {
                componentId: "b",
                originalName: "B",
                variantName: "Size=B",
                observedNameBeforeRestore: "Size=B",
                currentName: "B",
            },
        ]);
        expect(thrown.details?.before?.unrestoredComponents).toEqual([]);
        expect(thrown.details?.before?.removedComponents).toEqual([
            {
                componentId: "a",
                originalName: "A",
                variantName: "Size=A",
            },
        ]);
        expect(a.removed).toBe(true);
        expect(b.name).toBe("B");
    });

    it("Q32: create_component_set preserves the combine error, restores later names, and discloses each unrestored name", async () => {
        const parent = makeParent();
        let aName = "A";
        const a: any = { id: "a", type: "COMPONENT", removed: false };
        Object.defineProperty(a, "name", {
            get: () => aName,
            set: (value: string) => {
                if (value === "A" && aName === "Size=A") {
                    throw new Error("injected restoration failure");
                }
                aName = value;
            },
        });
        const b: any = { id: "b", name: "B", type: "COMPONENT", removed: false };
        (globalThis as any).figma.combineAsVariants = () => {
            throw new Error("injected combine failure");
        };

        let thrown: any = null;
        const consoleError = console.error;
        console.error = () => {};
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            });
        } catch (error: any) {
            thrown = error;
        } finally {
            console.error = consoleError;
        }

        expect(thrown.message).toContain("injected combine failure");
        expect(thrown.message).not.toContain("injected restoration failure");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.whatChanged).toContain("2 component variant name(s) were applied");
        expect(thrown.details?.whatChanged).toContain("1 ordinary member name(s) were restored");
        expect(thrown.details?.whatChanged).toContain("1 could not be restored");
        expect(thrown.details?.before?.appliedComponents).toEqual([
            {
                componentId: "a",
                originalName: "A",
                variantName: "Size=A",
                observedNameBeforeRestore: "Size=A",
            },
            {
                componentId: "b",
                originalName: "B",
                variantName: "Size=B",
                observedNameBeforeRestore: "Size=B",
            },
        ]);
        expect(thrown.details?.before?.restoredComponents).toEqual([
            {
                componentId: "b",
                originalName: "B",
                variantName: "Size=B",
                observedNameBeforeRestore: "Size=B",
                currentName: "B",
            },
        ]);
        expect(thrown.details?.before?.unrestoredComponents).toEqual([
            {
                componentId: "a",
                originalName: "A",
                variantName: "Size=A",
                observedNameBeforeRestore: "Size=A",
                currentName: "Size=A",
            },
        ]);
        expect(thrown.details?.before?.removedComponents).toEqual([]);
        expect(a.name).toBe("Size=A");
        expect(b.name).toBe("B");
    });

    it("Q32: a post-combine failure discloses the set that already exists", async () => {
        const parent = makeParent();
        const a: any = { id: "a", name: "A", type: "COMPONENT" };
        const b: any = { id: "b", name: "B", type: "COMPONENT" };
        (globalThis as any).figma.combineAsVariants = (...args: any[]) => {
            const set: any = {
                id: "set-id",
                type: "COMPONENT_SET",
                children: args[0],
                parent: args[1],
                variantGroupProperties: {},
            };
            let storedName = "Set";
            let renameFailed = false;
            Object.defineProperty(set, "name", {
                get: () => {
                    if (renameFailed) throw new Error("injected evidence getter failure");
                    return storedName;
                },
                set: () => {
                    renameFailed = true;
                    throw new Error("injected set rename failure");
                },
            });
            return set;
        };

        let thrown: any = null;
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Renamed Set",
            });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown).not.toBeNull();
        expect(thrown.message).toContain("injected set rename failure");
        expect(thrown.message).not.toContain("injected evidence getter failure");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.whatChanged).toContain("already created");
        expect(thrown.details?.before?.componentSetId).toBe("set-id");
        expect(thrown.details?.before?.variantNames).toEqual(["Size=A", "Size=B"]);
        expect(thrown.details?.before?.originalComponentNames).toEqual(["A", "B"]);
        // The members keep their variant names — renaming them back would
        // corrupt the set that now exists (D5's no-transaction posture).
        expect(a.name).toBe("Size=A");
    });

    it("Q32: a set created under the wrong parent is a disclosed partial mutation", async () => {
        const parent = makeParent();
        const wrongParent = makeParent("wrong-parent");
        const a: any = { id: "a", name: "A", type: "COMPONENT" };
        const b: any = { id: "b", name: "B", type: "COMPONENT" };
        (globalThis as any).figma.combineAsVariants = (...args: any[]) => ({
            id: "misplaced-set",
            name: "Set",
            type: "COMPONENT_SET",
            children: args[0],
            parent: wrongParent,
            variantGroupProperties: {},
        });

        let thrown: any = null;
        try {
            await createComponentSet({
                components: [
                    { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                    { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
                ],
                properties: ["Size"],
                parent,
                componentSetName: "Set",
            });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown.message).toContain("wrong-parent");
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.before).toMatchObject({
            componentSetId: "misplaced-set",
            componentSetParentId: wrongParent.id,
            verifiedParentId: parent.id,
        });
    });

    it("post-combine optional projection failures return success with total warnings", async () => {
        const parent = makeParent();
        const a: any = { id: "a", name: "A", type: "COMPONENT" };
        const b: any = { id: "b", name: "B", type: "COMPONENT" };
        (globalThis as any).figma.combineAsVariants = () => {
            const set: any = {
                id: "set-id",
                name: "Set",
                type: "COMPONENT_SET",
                parent,
            };
            Object.defineProperty(set, "children", {
                get: () => { throw new Error("children getter failed"); },
            });
            Object.defineProperty(set, "variantGroupProperties", {
                get: () => { throw Object.create(null); },
            });
            return set;
        };

        const result = await createComponentSet({
            components: [
                { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
            ],
            properties: ["Size"],
            parent,
        });

        expect(result).toMatchObject({
            id: "set-id",
            name: "Set",
            parentId: parent.id,
        });
        expect(result.childCount).toBeUndefined();
        expect(result.variantProperties).toBeUndefined();
        expect(result.warning).toContain("Failed to read variant properties: Error executing command");
        expect(result.warning).toContain("Failed to read component-set child count: children getter failed");
    });
});

/**
 * F78-21 plugin-side defense in depth (AS1): the server is not the trust
 * boundary, so a client that bypasses the schema must still fail closed before
 * any mutation. `node_rename` and `node_group` assign a user-visible name and
 * were live-confirmed (channel a7ps, 2026-07-27) to silently substitute a Figma
 * default for an explicit "" while reporting success.
 */
describe("v2.3.3 F78-21: name-assignment tools refuse an exact-empty name", () => {
    it("node_rename refuses \"\" before touching the node, and preserves whitespace", async () => {
        const target = makeNode("Target", "RECTANGLE");
        nodes.set("target", target);
        const { setNodeName } = await import(
            "../../../../../figma_plugin/handlers/nodeModifiers.js?f7821-rename"
        );

        let refusal: any = null;
        try {
            await setNodeName({ nodeId: "target", name: "" });
        } catch (error) {
            refusal = error;
        }
        expect(refusal?.message).toContain("node_rename: name must not be empty");
        expect(refusal?.message).toContain("Supply a non-empty name");
        expect(refusal?.message).not.toContain("Omit name");
        expect(target.name, "the node must not be renamed").toBe("Target");

        const renamed = await setNodeName({ nodeId: "target", name: "  " });
        expect(renamed.name).toBe("  ");
        expect(renamed.oldName).toBe("Target");
    });

    it("node_group refuses \"\" before the group is created", async () => {
        const parent = makeParent();
        const first = makeNode("First", "RECTANGLE", { parent });
        const second = makeNode("Second", "RECTANGLE", { parent });
        parent.children.push(first, second);
        nodes.set("first", first);
        nodes.set("second", second);
        let groupCalls = 0;
        (globalThis as any).figma.group = (...args: any[]) => {
            groupCalls++;
            return { id: "group-id", name: "Group", children: args[0] };
        };

        const { groupNodes } = await import(
            "../../../../../figma_plugin/handlers/nodeModifiers.js?f7821-group"
        );
        await expect(
            groupNodes({ nodes: [{ nodeId: "first" }, { nodeId: "second" }], name: "" }),
        ).rejects.toThrow(
            "node_group: name must not be empty. Omit name to use Figma's default group name",
        );
        expect(groupCalls, "no group may be created for a refused name").toBe(0);
    });

    it("node_group still accepts omission, whitespace, and an ordinary supplied name", async () => {
        const parent = makeParent();
        const first = makeNode("First", "RECTANGLE", { parent });
        const second = makeNode("Second", "RECTANGLE", { parent });
        parent.children.push(first, second);
        nodes.set("first", first);
        nodes.set("second", second);
        const created: any = { id: "group-id", name: "Group", children: [] };
        (globalThis as any).figma.group = () => created;

        const { groupNodes } = await import(
            "../../../../../figma_plugin/handlers/nodeModifiers.js?f7821-group-ok"
        );
        const omitted = await groupNodes({ nodes: [{ nodeId: "first" }, { nodeId: "second" }] });
        expect(omitted.name, "omission keeps Figma's default").toBe("Group");

        created.name = "Group";
        const whitespace = await groupNodes({
            nodes: [{ nodeId: "first" }, { nodeId: "second" }],
            name: " ",
        });
        expect(whitespace.name).toBe(" ");

        created.name = "Group";
        const named = await groupNodes({
            nodes: [{ nodeId: "first" }, { nodeId: "second" }],
            name: "Named",
        });
        expect(named.name).toBe("Named");
    });
});

describe("v2.3.3 Change 3: variable name-assignment plugin backstops", () => {
    it("CREATE_COLLECTION modeName rejects exact-empty before creation, while omission and whitespace remain distinct", async () => {
        let createCalls = 0;
        const renamedModes: string[] = [];
        (globalThis as any).figma.variables = {
            createVariableCollection: (name: string) => {
                createCalls++;
                const collection: any = {
                    id: `collection-${createCalls}`,
                    name,
                    key: `key-${createCalls}`,
                    defaultModeId: `mode-${createCalls}`,
                    modes: [{
                        modeId: `mode-${createCalls}`,
                        name: "Mode 1",
                    }],
                    renameMode(_modeId: string, newName: string) {
                        renamedModes.push(newName);
                        collection.modes[0].name = newName;
                    },
                };
                return collection;
            },
        };

        let refusal: any = null;
        try {
            await handleVariableRequest({
                action: "CREATE_COLLECTION",
                name: "Empty Mode",
                modeName: "",
            });
        } catch (error) {
            refusal = error;
        }
        expect(refusal?.message).toContain(
            "variable_manage CREATE_COLLECTION: modeName must not be empty",
        );
        expect(refusal?.message).toContain(
            "Omit modeName to keep the collection's default mode name",
        );
        expect(createCalls, "empty modeName must not create a collection").toBe(0);

        const omitted = await handleVariableRequest({
            action: "CREATE_COLLECTION",
            name: "Omitted Mode",
        });
        expect(omitted.modes[0].name).toBe("Mode 1");
        expect(renamedModes).toEqual([]);

        const whitespace = await handleVariableRequest({
            action: "CREATE_COLLECTION",
            name: "Whitespace Mode",
            modeName: " ",
        });
        expect(whitespace.modes[0].name).toBe(" ");
        expect(renamedModes).toEqual([" "]);
        expect(createCalls).toBe(2);
    });

    it("UPDATE_VARIABLE refuses exact-empty before a name write, while omission and whitespace remain valid", async () => {
        let currentName = "Variable";
        let nameWrites = 0;
        let lookupCalls = 0;
        const variable: any = {
            id: "variable-id",
            key: "variable-key",
            resolvedType: "STRING",
            description: "Before",
            scopes: ["ALL_SCOPES"],
            remote: false,
            variableCollectionId: "collection-id",
        };
        Object.defineProperty(variable, "name", {
            configurable: true,
            get: () => currentName,
            set: (value: string) => {
                nameWrites++;
                currentName = value;
            },
        });
        (globalThis as any).figma.variables = {
            getVariableByIdAsync: async () => {
                lookupCalls++;
                return variable;
            },
        };

        let refusal: any = null;
        try {
            await handleVariableRequest({
                action: "UPDATE_VARIABLE",
                variableId: variable.id,
                currentVariableName: "Variable",
                name: "",
            });
        } catch (error) {
            refusal = error;
        }
        expect(refusal?.message).toContain(
            "variable_manage UPDATE_VARIABLE: name must not be empty",
        );
        expect(refusal?.message).toContain(
            "Omit name to leave the variable's name unchanged",
        );
        expect(currentName).toBe("Variable");
        expect(nameWrites).toBe(0);
        expect(lookupCalls, "empty update must fail before variable lookup").toBe(0);

        const omitted = await handleVariableRequest({
            action: "UPDATE_VARIABLE",
            variableId: variable.id,
            currentVariableName: "Variable",
            description: "After",
        });
        expect(omitted.name).toBe("Variable");
        expect(variable.description).toBe("After");
        expect(nameWrites).toBe(0);
        expect(lookupCalls).toBe(1);

        const whitespace = await handleVariableRequest({
            action: "UPDATE_VARIABLE",
            variableId: variable.id,
            currentVariableName: "Variable",
            name: " ",
        });
        expect(whitespace.name).toBe(" ");
        expect(currentName).toBe(" ");
        expect(nameWrites).toBe(1);
        expect(lookupCalls).toBe(2);
    });
});

describe("v2.3.3 Change 3: component-property name-assignment plugin backstops", () => {
    function installComponentPropertyFixture(initialName?: string) {
        let serial = 0;
        let addCalls = 0;
        let editCalls = 0;
        let lookupCalls = 0;
        const definitions: Record<string, any> = {};
        if (initialName !== undefined) {
            definitions[`${initialName}#existing`] = {
                type: "TEXT",
                defaultValue: "Before",
            };
        }
        const component: any = {
            id: "component-id",
            name: "Component",
            type: "COMPONENT",
            parent: null,
            componentPropertyDefinitions: definitions,
            addComponentProperty(
                propertyName: string,
                propertyType: string,
                defaultValue: unknown,
            ) {
                addCalls++;
                serial++;
                definitions[`${propertyName}#added-${serial}`] = {
                    type: propertyType,
                    defaultValue,
                };
            },
            editComponentProperty(qualifiedName: string, options: any) {
                editCalls++;
                const existing = definitions[qualifiedName];
                if (!existing) throw new Error(`missing ${qualifiedName}`);
                if (options.defaultValue !== undefined) {
                    existing.defaultValue = options.defaultValue;
                }
                if (options.name !== undefined) {
                    delete definitions[qualifiedName];
                    definitions[`${options.name}#existing`] = existing;
                }
            },
        };
        nodes.set(component.id, component);
        (globalThis as any).figma.getNodeByIdAsync = async (id: string) => {
            lookupCalls++;
            return nodes.get(id) ?? null;
        };
        return {
            component,
            definitions,
            addCalls: () => addCalls,
            editCalls: () => editCalls,
            lookupCalls: () => lookupCalls,
        };
    }

    it("ADD propertyName rejects exact-empty before addComponentProperty, while whitespace and an ordinary name pass through", async () => {
        const fixture = installComponentPropertyFixture();

        let refusal: any = null;
        try {
            await manageComponentProperty({
                nodeId: fixture.component.id,
                action: "ADD",
                propertyName: "",
                propertyType: "TEXT",
                defaultValue: "Default",
            });
        } catch (error) {
            refusal = error;
        }
        expect(refusal?.message).toContain(
            "component_manage_property ADD: propertyName must not be empty",
        );
        expect(refusal?.message).toContain("Supply a non-empty propertyName");
        expect(refusal?.message).not.toContain("Omit propertyName");
        expect(fixture.addCalls()).toBe(0);
        expect(
            fixture.lookupCalls(),
            "empty ADD propertyName must fail before node lookup",
        ).toBe(0);
        expect(fixture.definitions).toEqual({});

        const whitespace = await manageComponentProperty({
            nodeId: fixture.component.id,
            action: "ADD",
            propertyName: " ",
            propertyType: "TEXT",
            defaultValue: "Whitespace",
        });
        expect(whitespace.propertyName).toBe(" ");
        expect(fixture.addCalls()).toBe(1);
        expect(fixture.lookupCalls()).toBe(1);
        expect(Object.keys(fixture.definitions)).toContain(" #added-1");

        const ordinary = await manageComponentProperty({
            nodeId: fixture.component.id,
            action: "ADD",
            propertyName: "Label",
            propertyType: "TEXT",
            defaultValue: "Ordinary",
        });
        expect(ordinary.propertyName).toBe("Label");
        expect(fixture.addCalls()).toBe(2);
        expect(fixture.lookupCalls()).toBe(2);
        expect(Object.keys(fixture.definitions)).toContain("Label#added-2");
    });

    it("EDIT newPropertyName rejects exact-empty before editComponentProperty, while omission and whitespace remain valid", async () => {
        const fixture = installComponentPropertyFixture("Existing");
        const before = structuredClone(fixture.definitions);

        let refusal: any = null;
        try {
            await manageComponentProperty({
                nodeId: fixture.component.id,
                action: "EDIT",
                propertyName: "Existing",
                newPropertyName: "",
            });
        } catch (error) {
            refusal = error;
        }
        expect(refusal?.message).toContain(
            "component_manage_property EDIT: newPropertyName must not be empty",
        );
        expect(refusal?.message).toContain(
            "Omit newPropertyName to leave the component property's name unchanged",
        );
        expect(fixture.editCalls()).toBe(0);
        expect(
            fixture.lookupCalls(),
            "empty newPropertyName must fail before node lookup",
        ).toBe(0);
        expect(fixture.definitions).toEqual(before);

        const omitted = await manageComponentProperty({
            nodeId: fixture.component.id,
            action: "EDIT",
            propertyName: "Existing",
            newDefaultValue: "After",
        });
        expect(omitted.propertyName).toBe("Existing");
        expect(fixture.definitions["Existing#existing"].defaultValue).toBe("After");
        expect(fixture.editCalls()).toBe(1);
        expect(fixture.lookupCalls()).toBe(1);

        const whitespace = await manageComponentProperty({
            nodeId: fixture.component.id,
            action: "EDIT",
            propertyName: "Existing",
            newPropertyName: " ",
        });
        expect(whitespace.propertyName).toBe(" ");
        expect(Object.keys(fixture.definitions)).toEqual([" #existing"]);
        expect(fixture.editCalls()).toBe(2);
        expect(fixture.lookupCalls()).toBe(2);
    });

    it("EDIT treats an exact-empty propertyName as a lookup value rather than omission", async () => {
        const fixture = installComponentPropertyFixture("");

        const result = await manageComponentProperty({
            nodeId: fixture.component.id,
            action: "EDIT",
            propertyName: "",
            newDefaultValue: "After",
        });

        expect(result.propertyName).toBe("");
        expect(fixture.definitions["#existing"]).toEqual({
            type: "TEXT",
            defaultValue: "After",
        });
        expect(fixture.editCalls()).toBe(1);
        expect(fixture.lookupCalls()).toBe(1);
    });
});
