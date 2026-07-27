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
} = await import("../../../../../figma_plugin/handlers/componentHandlers.js?phase8");
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

        const results = [
            await createShape({ type: "RECTANGLE", parentId: "parent" }),
            await createFrame({ parentId: "parent" }),
            await createText({ parentId: "parent", text: "t" }),
            await createNodeFromSvg({ parentId: "parent", svg: "<svg/>" }),
            await createComponentInstance({ parentId: "parent", componentId: component.id }),
            await cloneNode({ nodeId: "source", nodeName: "Source" }),
        ];
        for (const [index, result] of results.entries()) {
            expect((result as any).parentId, `creator #${index} must report its parent`).toBe(parent.id);
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
        console.error = (...args: any[]) => { logged.push(String(args[0])); };
        try {
            await expect(
                createShape({ type: "RECTANGLE", parentId: "parent", x: 10 }),
            ).rejects.toThrow("injected Shape.x failure");
        } finally {
            console.error = consoleError;
        }
        expect(logged.some((entry) => entry.includes("create_shape") && entry.includes("cleanup"))).toBe(true);
    });

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

    it("create_component_set restores every original component name when combineAsVariants throws", async () => {
        // The handler renames members to variant names BEFORE combining, so a
        // failed combine would otherwise leave the user's components renamed
        // with no set to justify it.
        const parent = makeParent();
        const a: any = { id: "a", name: "A", type: "COMPONENT" };
        const b: any = { id: "b", name: "B", type: "COMPONENT" };
        (globalThis as any).figma.combineAsVariants = () => {
            throw new Error("injected combine failure");
        };

        await expect(createComponentSet({
            components: [
                { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
            ],
            properties: ["Size"],
            parent,
            componentSetName: "Set",
        })).rejects.toThrow("injected combine failure");

        expect(a.name).toBe("A");
        expect(b.name).toBe("B");
    });

    it("create_component_set skips removed members when restoring names, so restoration cannot mask the cause", async () => {
        const parent = makeParent();
        const a: any = { id: "a", name: "A", type: "COMPONENT", removed: false };
        const b: any = { id: "b", name: "B", type: "COMPONENT" };
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

        await expect(createComponentSet({
            components: [
                { node: a, originalName: "A", variantName: "Size=A", propertyValues: ["A"] },
                { node: b, originalName: "B", variantName: "Size=B", propertyValues: ["B"] },
            ],
            properties: ["Size"],
            parent,
            componentSetName: "Set",
        })).rejects.toThrow("injected combine failure");

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
            Object.defineProperty(set, "name", {
                get: () => storedName,
                set: () => { throw new Error("injected set rename failure"); },
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
        expect(thrown.details?.partialMutation).toBe(true);
        expect(thrown.details?.whatChanged).toContain("already created");
        expect(thrown.details?.before?.componentSetId).toBe("set-id");
        expect(thrown.details?.before?.variantNames).toEqual(["Size=A", "Size=B"]);
        expect(thrown.details?.before?.originalComponentNames).toEqual(["A", "B"]);
        // The members keep their variant names — renaming them back would
        // corrupt the set that now exists (D5's no-transaction posture).
        expect(a.name).toBe("Size=A");
    });
});
