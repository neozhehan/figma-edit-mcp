import { describe, it, expect, mock, beforeEach } from "bun:test";
import { getAnnotations } from "../../../../../figma_plugin/handlers/annotationHandlers.js";
import { getVariables } from "../../../../../figma_plugin/handlers/variableHandlers.js";

describe("getAnnotations Handler", () => {
    beforeEach(() => {
        (globalThis as any).figma = {
            annotations: {
                getAnnotationCategoriesAsync: mock(async () => [])
            },
            getNodeByIdAsync: mock(async (id: string) => {
                if (id === "page-1") return { id: "page-1", type: "PAGE", annotations: [], children: [] };
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
        expect(getAnnotations({ pageId: "nonexistent" })).rejects.toThrow("pageId with ID nonexistent not found");
    });

    it("throws when pageId does not resolve to a PAGE", async () => {
        const mockRect = { id: "rect-1", type: "RECTANGLE" };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockRect);
        expect(getAnnotations({ pageId: "rect-1" })).rejects.toThrow("pageId does not resolve to a PAGE");
    });

    it("returns annotations for a valid pageId", async () => {
        const mockPage = {
            id: "page-1",
            type: "PAGE",
            annotations: [{ label: { type: "MARKDOWN", content: "Page note" } }],
            children: []
        };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockPage);
        const result = await getAnnotations({ pageId: "page-1", includeCategories: false });
        expect(result.annotatedNodes).toEqual([
            { nodeId: "page-1", name: undefined, annotations: [{ label: { type: "MARKDOWN", content: "Page note" } }] }
        ]);
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
                if (id === "page-1") return { id: "page-1", type: "PAGE" };
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
        expect(getVariables({ variableId: ["v-1"], includeConsumers: "page", pageId: "nonexistent" })).rejects.toThrow("pageId with ID nonexistent not found");
    });

    it("throws when includeConsumers is 'page' and pageId does not resolve to a PAGE", async () => {
        const mockRect = { id: "rect-1", type: "RECTANGLE" };
        (globalThis as any).figma.getNodeByIdAsync = mock(async () => mockRect);
        expect(getVariables({ variableId: ["v-1"], includeConsumers: "page", pageId: "rect-1" })).rejects.toThrow("pageId does not resolve to a PAGE");
    });
});
