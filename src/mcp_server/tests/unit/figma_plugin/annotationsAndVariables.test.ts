import { describe, it, expect, mock, beforeEach } from "bun:test";
import { getAnnotations } from "../../../../../figma_plugin/handlers/annotationHandlers.js";
import { getVariables, setBoundVariable } from "../../../../../figma_plugin/handlers/variableHandlers.js";

describe("getAnnotations Handler", () => {
    beforeEach(() => {
        (globalThis as any).figma = {
            annotations: {
                getAnnotationCategoriesAsync: mock(async () => [])
            },
            getNodeByIdAsync: mock(async (id: string) => {
                if (id === "page-1") return { id: "page-1", type: "PAGE", annotations: [], children: [], loadAsync: async () => { } };
                if (id === "rect-1") return { id: "rect-1", type: "RECTANGLE", annotations: [] };
                return null;
            }),
            currentPage: { id: "page-current", type: "PAGE", annotations: [], children: [] }
        };
    });

    it("throws when both pageId and nodeId are omitted", async () => {
        expect(getAnnotations({})).rejects.toThrow("Exactly one of pageId or nodeId is required");
    });

    it("throws when both pageId and nodeId are provided", async () => {
        expect(getAnnotations({ pageId: "page-1", nodeId: "rect-1" })).rejects.toThrow("Exactly one of pageId or nodeId is required");
    });

    it("throws when pageId is not found", async () => {
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => null);
        expect(getAnnotations({ pageId: "nonexistent" })).rejects.toMatchObject({
            code: "PAGE_NOT_FOUND",
            details: { pageId: "nonexistent" },
        });
    });

    it("throws when pageId does not resolve to a PAGE", async () => {
        const mockRect = { id: "rect-1", type: "RECTANGLE" };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockRect);
        expect(getAnnotations({ pageId: "rect-1" })).rejects.toMatchObject({
            code: "TARGET_NOT_PAGE",
            details: { pageId: "rect-1", actualType: "RECTANGLE" },
        });
    });

    it("returns annotations for a valid pageId", async () => {
        const mockPage = {
            id: "page-1",
            name: "Page",
            type: "PAGE",
            annotations: [{ labelMarkdown: "Page note" }],
            children: [],
            loadAsync: async () => { },
        };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockPage);
        const result = await getAnnotations({ pageId: "page-1", includeCategories: false });
        expect(result.annotatedNodes).toEqual([
            { nodeId: "page-1", name: "Page", annotations: [{ labelMarkdown: "Page note" }] }
        ]);
    });

    it("returns the same grouped ownership shape for a node and its descendants", async () => {
        const child = {
            id: "child-1",
            name: "Child",
            type: "RECTANGLE",
            annotations: [{ labelMarkdown: "Child note" }],
        };
        const root = {
            id: "frame-1",
            name: "Frame",
            type: "FRAME",
            annotations: [{ labelMarkdown: "Root note" }],
            children: [child],
        };
        (globalThis as any).figma.getNodeByIdAsync = mock(async (id: string) =>
            id === root.id ? root : id === child.id ? child : null
        );

        const result = await getAnnotations({ nodeId: root.id, includeCategories: false });

        expect(result).toEqual({
            annotatedNodes: [
                { nodeId: root.id, name: root.name, annotations: root.annotations },
                { nodeId: child.id, name: child.name, annotations: child.annotations },
            ],
            coverage: { complete: true, pagesAttempted: 0, pageErrors: [] },
        });
        expect(result.annotations).toBeUndefined();
    });
});

describe("getVariables Handler", () => {
    beforeEach(() => {
        (globalThis as any).figma = {
            getLocalPaintStylesAsync: mock(async () => []),
            getLocalTextStylesAsync: mock(async () => []),
            getLocalEffectStylesAsync: mock(async () => []),
            getLocalGridStylesAsync: mock(async () => []),
            variables: {
                getLocalVariableCollectionsAsync: mock(async () => []),
                getLocalVariablesAsync: mock(async () => []),
                getVariableByIdAsync: mock(async (id: string) => {
                    if (id === "v-1") {
                        return { id: "v-1", name: "v1", variableCollectionId: "col-1", valuesByMode: {} };
                    }
                    return null;
                }),
                getVariableCollectionByIdAsync: mock(async () => null)
            },
            getNodeByIdAsync: mock(async (id: string) => {
                if (id === "page-1") return { id: "page-1", type: "PAGE", children: [], loadAsync: async () => { } };
                return null;
            }),
            currentPage: { id: "page-current", type: "PAGE" }
        };
    });

    it("throws when includeConsumers is 'page' and pageId is missing", async () => {
        expect(getVariables({ variableId: ["v-1"], includeConsumers: "page" })).rejects.toThrow("pageId is required when includeConsumers is 'page'");
    });

    it("throws when includeConsumers is 'page' and pageId is not found", async () => {
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => null);
        expect(getVariables({ variableId: ["v-1"], includeConsumers: "page", pageId: "nonexistent" })).rejects.toMatchObject({
            code: "PAGE_NOT_FOUND",
            details: { pageId: "nonexistent" },
        });
    });

    it("throws when includeConsumers is 'page' and pageId does not resolve to a PAGE", async () => {
        const mockRect = { id: "rect-1", type: "RECTANGLE" };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockRect);
        expect(getVariables({ variableId: ["v-1"], includeConsumers: "page", pageId: "rect-1" })).rejects.toMatchObject({
            code: "TARGET_NOT_PAGE",
            details: { pageId: "rect-1", actualType: "RECTANGLE" },
        });
    });

    it("lookup mode returns an object keyed by `variables` (not a bare array), omitting missingIds when all resolve", async () => {
        const result: any = await getVariables({ variableId: ["v-1"] });
        expect(Array.isArray(result)).toBe(false);
        expect(result.variables).toHaveLength(1);
        expect(result.variables[0].id).toBe("v-1");
        expect(result).not.toHaveProperty("missingIds");
    });

    it("lookup mode reports unresolved ids in `missingIds`", async () => {
        const result: any = await getVariables({ variableId: ["v-1", "ghost-1", "ghost-2"] });
        expect(result.variables.map((v: any) => v.id)).toEqual(["v-1"]);
        expect(result.missingIds).toEqual(["ghost-1", "ghost-2"]);
    });

    it("list-all mode still returns an object with collections + variables", async () => {
        const result: any = await getVariables({});
        expect(Array.isArray(result)).toBe(false);
        expect(result).toHaveProperty("collections");
        expect(result).toHaveProperty("variables");
    });
});

// =============================================================================
// setBoundVariable — schema↔handler contract (node_bind_variable).
//
// REGRESSION: the MCP tool (src/mcp_server/tools/node.ts) sends two MAPS,
// `bindVariables: { property → variableId|null }` and
// `explicitVariableModes: { collectionId → modeId }`, forwarded untransformed.
// The handler previously destructured a flat `{ field, variableId, collectionId,
// modeId }` it never received, so EVERY real MCP call fell through to
// "Must provide either (field + variableId) or (collectionId + modeId)" — the
// tool was 100% non-functional through MCP. These tests drive the exact map
// shape the tool emits so the drift cannot recur.
// =============================================================================
describe("setBoundVariable Handler (node_bind_variable MCP shape)", () => {
    let mockNode: any;
    let setBoundVariableForPaint: any;

    beforeEach(() => {
        setBoundVariableForPaint = mock((paint: any, _field: string, variable: any) => ({
            ...paint,
            boundVariables: { color: variable ? { id: variable.id } : undefined },
        }));
        mockNode = {
            id: "rect-1",
            name: "Rect",
            type: "RECTANGLE",
            fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
            strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
            setBoundVariable: mock(() => { }),
            setExplicitVariableModeForCollection: mock(async () => { }),
        };
        (globalThis as any).figma = {
            mixed: Symbol("figma.mixed"),
            getNodeByIdAsync: mock(async (id: string) => (id === "rect-1" ? mockNode : null)),
            variables: {
                getVariableByIdAsync: mock(async (id: string) =>
                    id === "v-color" ? { id: "v-color", name: "Brand/Primary", resolvedType: "COLOR" } : null),
                getVariableCollectionByIdAsync: mock(async (id: string) =>
                    id === "col-1" ? { id: "col-1", name: "Theme" } : null),
                setBoundVariableForPaint,
            },
        };
    });

    // Capture the thrown message so we can assert the EXACT string. A plain
    // `.rejects.toThrow(substring)` passes even if the §1 guard message were
    // double-wrapped with a "Failed to set bound variable for…" prefix — this
    // helper makes that wrapping a test failure (F1/F2 regression guard).
    async function caughtMessage(fn: () => Promise<unknown>): Promise<string> {
        try {
            await fn();
        } catch (e: any) {
            return e?.message ?? String(e);
        }
        throw new Error("expected the call to throw, but it resolved");
    }

    it("binds a COLOR variable to fills via the bindVariables map (the real MCP shape)", async () => {
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { fills: "v-color" },
        });
        expect(result.success).toBe(true);
        expect(result.name).toBe("Rect");
        expect(result.message).toContain("Bound fills to variable Brand/Primary");
        expect(setBoundVariableForPaint).toHaveBeenCalledTimes(1);
        // The node's fills were reassigned with the bound paint.
        expect(mockNode.fills[0].boundVariables.color).toEqual({ id: "v-color" });
    });

    it("binds a standard (non-paint) property via node.setBoundVariable", async () => {
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { opacity: "v-color" },
        });
        expect(result.success).toBe(true);
        expect(mockNode.setBoundVariable).toHaveBeenCalledTimes(1);
        expect(mockNode.setBoundVariable.mock.calls[0][0]).toBe("opacity");
        expect(result.message).toContain("Bound opacity to variable Brand/Primary");
    });

    it("applies multiple bindings (fills + strokes) in a single call", async () => {
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { fills: "v-color", strokes: "v-color" },
        });
        expect(result.message).toContain("fills");
        expect(result.message).toContain("strokes");
        expect(setBoundVariableForPaint).toHaveBeenCalledTimes(2);
    });

    it("unbinds a property when the map value is null (no variable lookup)", async () => {
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { fills: null },
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain("Unbound variable from fills");
        expect((globalThis as any).figma.variables.getVariableByIdAsync).not.toHaveBeenCalled();
    });

    it("sets explicit variable modes, passing the resolved collection NODE (not the id) to the API", async () => {
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            explicitVariableModes: { "col-1": "1:3" },
        });
        expect(result.success).toBe(true);
        // The Plugin API requires the collection node, not the id string.
        expect(mockNode.setExplicitVariableModeForCollection).toHaveBeenCalledWith(
            { id: "col-1", name: "Theme" },
            "1:3",
        );
        expect(result.message).toContain("Set mode 1:3 for collection col-1");
    });

    it("throws when the collection id for an explicit mode does not resolve", async () => {
        await expect(
            setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", explicitVariableModes: { "ghost-col": "1:3" } })
        ).rejects.toThrow("Collection ghost-col not found");
    });

    it("throws a clear error when neither map is provided (no longer the flat-shape message)", async () => {
        let err: any;
        try {
            await setBoundVariable({ nodeId: "rect-1", nodeName: "Rect" });
        } catch (e) {
            err = e;
        }
        expect(err).toBeDefined();
        expect(err.message).toContain("Must provide bindVariables");
        expect(err.message).not.toContain("field + variableId");
    });

    it("throws when a referenced variable id does not resolve", async () => {
        await expect(
            setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { fills: "ghost" } })
        ).rejects.toThrow("Variable ghost not found");
    });

    it("throws when fills has no SOLID paint to bind, leaving fills unmutated", async () => {
        mockNode.fills = [{ type: "GRADIENT_LINEAR" }];
        const msg = await caughtMessage(() =>
            setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { fills: "v-color" } })
        );
        // Exact match — the guard string must surface verbatim, NOT wrapped in
        // "Failed to set bound variable for fills: …" (F1).
        expect(msg).toBe("node_bind_variable: 'Rect' has a non-solid fills (image/gradient) and no SOLID paint to bind a color token to. Set a solid fill first, or unbind the existing paint.");
        // Ensure fills wasn't mutated
        expect(mockNode.fills).toEqual([{ type: "GRADIENT_LINEAR" }]);
    });

    it("auto-creates a SOLID paint when fills is empty and binding a COLOR variable", async () => {
        mockNode.fills = [];
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { fills: "v-color" },
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain("Bound fills to variable Brand/Primary (created solid paint)");
        expect(setBoundVariableForPaint).toHaveBeenCalledTimes(1);
        expect(setBoundVariableForPaint.mock.calls[0][0]).toEqual({ type: "SOLID", color: { r: 0, g: 0, b: 0 } });
        // The newly created paint is assigned to fills
        expect(mockNode.fills[0].boundVariables.color).toEqual({ id: "v-color" });
    });

    it("throws when node lacks the field (e.g. GROUP) before attempting clone", async () => {
        const groupNode = {
            id: "group-1", name: "Group", type: "GROUP",
            setBoundVariable: mock(() => { }),
            setExplicitVariableModeForCollection: mock(async () => { }),
        };
        (globalThis as any).figma.getNodeByIdAsync = mock(async (id: string) => (id === "group-1" ? groupNode : mockNode));
        const msg = await caughtMessage(() =>
            setBoundVariable({ nodeId: "group-1", nodeName: "Group", bindVariables: { fills: "v-color" } })
        );
        expect(msg).toBe("node_bind_variable: 'Group' (type GROUP) has no 'fills' property to bind.");
    });

    it("throws when field is figma.mixed before attempting clone", async () => {
        mockNode.fills = (globalThis as any).figma.mixed;
        const msg = await caughtMessage(() =>
            setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { fills: "v-color" } })
        );
        expect(msg).toBe("node_bind_variable: 'fills' on 'Rect' is mixed (multiple values); bind on a node with a single fills value.");
    });

    it("throws when variable is not COLOR type before any paint mutation", async () => {
        (globalThis as any).figma.variables.getVariableByIdAsync = mock(async (id: string) =>
            id === "v-float" ? { id: "v-float", name: "Padding", resolvedType: "FLOAT" } : null
        );
        const msg = await caughtMessage(() =>
            setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { fills: "v-float" } })
        );
        expect(msg).toBe("node_bind_variable: cannot bind a non-color variable ('Padding', FLOAT) to fills; fills requires a COLOR variable.");
        expect(setBoundVariableForPaint).not.toHaveBeenCalled();
    });

    it("binds to ALL SOLID paints if multiple exist (Finding 5)", async () => {
        mockNode.fills = [
            { type: "SOLID", color: { r: 1, g: 1, b: 1 } },
            { type: "GRADIENT_LINEAR" },
            { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
        ];
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { fills: "v-color" },
        });
        expect(result.success).toBe(true);
        expect(setBoundVariableForPaint).toHaveBeenCalledTimes(2);
        // Both solids should be bound
        expect(mockNode.fills[0].boundVariables.color).toEqual({ id: "v-color" });
        expect(mockNode.fills[2].boundVariables.color).toEqual({ id: "v-color" });
        // The gradient should be left alone
        expect(mockNode.fills[1].type).toEqual("GRADIENT_LINEAR");
        expect(mockNode.fills[1].boundVariables).toBeUndefined();
    });

    it("returns 'nothing to unbind' when unbinding on an empty or non-solid fills", async () => {
        mockNode.fills = [];
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { fills: null },
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain("nothing to unbind in fills");

        mockNode.fills = [{ type: "GRADIENT_LINEAR" }];
        const result2: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { fills: null },
        });
        expect(result2.success).toBe(true);
        expect(result2.message).toContain("nothing to unbind in fills");
    });

    it("unbinds a bound SOLID paint via the modified loop (variableId null, F4)", async () => {
        mockNode.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, boundVariables: { color: { id: "v-color" } } }];
        const result: any = await setBoundVariable({
            nodeId: "rect-1",
            nodeName: "Rect",
            bindVariables: { fills: null },
        });
        expect(result.success).toBe(true);
        expect(result.message).toContain("Unbound variable from fills");
        // setBoundVariableForPaint is invoked with a null variable to clear the binding
        expect(setBoundVariableForPaint).toHaveBeenCalledTimes(1);
        expect(setBoundVariableForPaint.mock.calls[0][2]).toBeNull();
        expect(mockNode.fills[0].boundVariables.color).toBeUndefined();
    });

    it("throws the case-1 error (auto-layout OFF) when binding padding to a frame with layoutMode NONE", async () => {
        mockNode.layoutMode = "NONE";
        const msg = await caughtMessage(() =>
            setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { paddingLeft: "v-color" } })
        );
        // Exact match — fixable case directs the LLM to turn auto-layout on.
        expect(msg).toBe("node_bind_variable: cannot bind 'paddingLeft' on 'Rect' — auto-layout is off (layoutMode is NONE). Turn it on first with node_set_auto_layout (layoutMode HORIZONTAL or VERTICAL), then bind 'paddingLeft'.");
        expect(mockNode.setBoundVariable).not.toHaveBeenCalled();
    });

    it("throws the case-2 error (node type can't have auto-layout) when the node has no layoutMode property", async () => {
        // beforeEach builds a RECTANGLE with no layoutMode — the `!('layoutMode' in node)` branch.
        expect("layoutMode" in mockNode).toBe(false);
        const msg = await caughtMessage(() =>
            setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { paddingLeft: "v-color" } })
        );
        // Exact match — category error tells the LLM to use an auto-layout frame, NOT to set auto-layout here.
        expect(msg).toBe("node_bind_variable: cannot bind 'paddingLeft' on 'Rect' — 'paddingLeft' is an auto-layout property that only exists on auto-layout frames, and a RECTANGLE cannot have auto-layout. Bind 'paddingLeft' on an auto-layout frame instead.");
        expect(mockNode.setBoundVariable).not.toHaveBeenCalled();
    });

    it("succeeds when binding padding to an autolayout frame", async () => {
        mockNode.layoutMode = "HORIZONTAL";
        const result: any = await setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { paddingLeft: "v-color" } });
        expect(result.success).toBe(true);
        expect(mockNode.setBoundVariable).toHaveBeenCalledWith("paddingLeft", { id: "v-color", name: "Brand/Primary", resolvedType: "COLOR" });
    });

    it("does not precheck non-padding scalar fields", async () => {
        mockNode.layoutMode = "NONE";
        const result: any = await setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { cornerRadius: "v-color" } });
        expect(result.success).toBe(true);
        expect(mockNode.setBoundVariable).toHaveBeenCalledWith("cornerRadius", { id: "v-color", name: "Brand/Primary", resolvedType: "COLOR" });
    });

    it("surfaces an actionable detail when the underlying bind throws a message-less error (never the literal 'undefined')", async () => {
        // Figma can throw error-like objects whose `.message` is undefined; the
        // handler must not print "undefined" — it should fall back to name/etc.
        (globalThis as any).figma.variables.setBoundVariableForPaint = mock(() => {
            throw { name: "FigmaInternalError" };
        });
        let err: any;
        try {
            await setBoundVariable({ nodeId: "rect-1", nodeName: "Rect", bindVariables: { fills: "v-color" } });
        } catch (e) {
            err = e;
        }
        expect(err).toBeDefined();
        expect(err.message).toContain("Failed to set bound variable for fills");
        expect(err.message).toContain("FigmaInternalError");
        expect(err.message).not.toContain("undefined");
    });
});

describe("handleVariableRequest Handler (CREATE_VARIABLE / UPDATE_VARIABLE scopes)", () => {
    let mockCollection: any;
    let mockVariable: any;
    let handleVariableRequest: any;

    beforeEach(async () => {
        mockCollection = {
            id: "col-1",
            name: "My Collection",
            defaultModeId: "mode-1",
            modes: [{ modeId: "mode-1", name: "Mode 1" }],
        };
        mockVariable = {
            id: "v-1",
            name: "My Variable",
            key: "key-1",
            resolvedType: "FLOAT",
            variableCollectionId: "col-1",
            scopes: ["ALL_SCOPES"],
            setValueForMode: mock(() => {}),
        };
        (globalThis as any).figma = {
            variables: {
                getVariableCollectionByIdAsync: mock(async () => mockCollection),
                getVariableByIdAsync: mock(async () => mockVariable),
                createVariable: mock(() => mockVariable),
            }
        };
        const module = await import("../../../../../figma_plugin/handlers/variableHandlers.js");
        handleVariableRequest = module.handleVariableRequest;
    });

    it("CREATE_VARIABLE sets scopes when provided", async () => {
        await handleVariableRequest({
            action: "CREATE_VARIABLE",
            collectionId: "col-1",
            collectionName: "My Collection",
            name: "Var1",
            type: "FLOAT",
            scopes: ["TEXT_CONTENT", "CORNER_RADIUS"]
        });
        expect(mockVariable.scopes).toEqual(["TEXT_CONTENT", "CORNER_RADIUS"]);
    });

    it("CREATE_VARIABLE without scopes is rejected", async () => {
        await expect(handleVariableRequest({
            action: "CREATE_VARIABLE",
            collectionId: "col-1",
            collectionName: "My Collection",
            name: "Var2",
            type: "FLOAT",
        })).rejects.toThrow("scopes is missing for CREATE_VARIABLE");
    });

    it("UPDATE_VARIABLE updates scopes when provided", async () => {
        await handleVariableRequest({
            action: "UPDATE_VARIABLE",
            variableId: "v-1",
            currentVariableName: "My Variable",
            scopes: ["WIDTH_HEIGHT"]
        });
        expect(mockVariable.scopes).toEqual(["WIDTH_HEIGHT"]);
    });

    it("UPDATE_VARIABLE without scopes leaves existing scopes untouched", async () => {
        await handleVariableRequest({
            action: "UPDATE_VARIABLE",
            variableId: "v-1",
            currentVariableName: "My Variable",
            name: "Renamed"
        });
        expect(mockVariable.scopes).toEqual(["ALL_SCOPES"]); // Remains unchanged
    });

    it("CREATE_VARIABLE rolls back the freshly-created variable when scope assignment throws", async () => {
        // A type-incompatible scope makes Figma's scopes setter throw AFTER createVariable;
        // the handler must remove the orphaned variable and rethrow (no leak).
        const removeSpy = mock(() => {});
        const throwingVar: any = {
            id: "v-bad", name: "Bad", key: "k-bad", resolvedType: "FLOAT",
            set scopes(_v: any) { throw new Error("in set_scopes: Invalid scope for this variable type"); },
            setValueForMode: mock(() => {}),
            remove: removeSpy,
        };
        (globalThis as any).figma.variables.createVariable = mock(() => throwingVar);

        await expect(handleVariableRequest({
            action: "CREATE_VARIABLE",
            collectionId: "col-1",
            collectionName: "My Collection",
            name: "Bad",
            type: "FLOAT",
            scopes: ["ALL_FILLS"],
        })).rejects.toThrow(/Invalid scope/);

        expect(removeSpy).toHaveBeenCalled();
    });
});
