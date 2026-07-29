import { describe, expect, it, mock } from "bun:test";
import { getPagesInfo, getNodesInfo } from "../../../../../figma_plugin/handlers/nodeReaders.js";
import { getComponents } from "../../../../../figma_plugin/handlers/componentHandlers.js";
import { getAnnotations } from "../../../../../figma_plugin/handlers/annotationHandlers.js";
import { deleteVariables, getVariables } from "../../../../../figma_plugin/handlers/variableHandlers.js";
import { createPageLoadCoordinator } from "../../../../../figma_plugin/utils/pageLoad.js";
import { pageCoverage } from "../../../tools/_result.js";

type Deferred = {
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: any) => void;
};

function deferred(): Deferred {
    let resolve!: () => void;
    let reject!: (error: any) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function makePage(
    id: string,
    loadAsync: () => Promise<void>,
    children: any[] = [],
) {
    const page: any = {
        id,
        name: id,
        type: "PAGE",
        children,
        loadAsync: mock(loadAsync),
        findAllWithCriteria: mock(() => []),
    };
    for (const child of children) child.parent = page;
    return page;
}

function installFigma(
    pages: any[],
    options: {
        extraNodes?: any[];
        variables?: any[];
        collections?: any[];
    } = {},
) {
    const root: any = {
        id: "doc-1",
        name: "Phase 10",
        type: "DOCUMENT",
        children: pages,
    };
    const byId = new Map<string, any>();
    const index = (node: any) => {
        byId.set(node.id, node);
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                child.parent = node;
                index(child);
            }
        }
    };
    for (const page of pages) {
        page.parent = root;
        index(page);
    }
    for (const node of options.extraNodes ?? []) index(node);

    const variables = options.variables ?? [];
    const collections = options.collections ?? [];
    (globalThis as any).figma = {
        root,
        getNodeByIdAsync: mock(async (id: string) => byId.get(id) ?? null),
        annotations: {
            getAnnotationCategoriesAsync: mock(async () => []),
        },
        getLocalPaintStylesAsync: mock(async () => []),
        getLocalTextStylesAsync: mock(async () => []),
        getLocalEffectStylesAsync: mock(async () => []),
        getLocalGridStylesAsync: mock(async () => []),
        variables: {
            getVariableByIdAsync: mock(async (id: string) =>
                variables.find((variable) => variable.id === id) ?? null
            ),
            getVariableCollectionByIdAsync: mock(async (id: string) =>
                collections.find((collection) => collection.id === id) ?? null
            ),
            getLocalVariablesAsync: mock(async () => variables),
            getLocalVariableCollectionsAsync: mock(async () => collections),
        },
    };
}

function variableFixture(id = "var-1") {
    return {
        id,
        name: "Primary",
        key: "key-1",
        resolvedType: "COLOR",
        variableCollectionId: "collection-1",
        valuesByMode: {},
        description: "",
        remote: false,
        scopes: ["ALL_FILLS"],
        remove: mock(() => { }),
    };
}

describe("v2.3.3 Phase 10 — shared page coverage", () => {
    it("page_info returns successful pages plus structured errors for load failure, missing IDs, and non-page targets", async () => {
        const good = makePage("page-good", async () => { }, [
            { id: "frame-good", name: "Frame", type: "FRAME", children: [] },
        ]);
        const bad = makePage("page-bad", async () => {
            throw new Error("host page load failed");
        });
        const rectangle = { id: "rect-1", name: "Rectangle", type: "RECTANGLE" };
        installFigma([good, bad], { extraNodes: [rectangle] });

        const result = await getPagesInfo({
            pageIds: ["page-good", "page-bad", "missing", "rect-1"],
        });

        expect(result.pages.map((page: any) => page.pageId)).toEqual(["page-good"]);
        expect(result.missingPageIds).toEqual(["missing", "rect-1"]);
        expect(result.coverage.complete).toBe(false);
        expect(result.coverage.pageErrors.map((entry: any) => [entry.pageId, entry.error.code]))
            .toEqual([
                ["page-bad", "PAGE_LOAD_FAILED"],
                ["missing", "PAGE_NOT_FOUND"],
                ["rect-1", "TARGET_NOT_PAGE"],
            ]);
        expect(result.coverage.complete)
            .toBe(result.coverage.pageErrors.length === 0);
    });

    it("node_info, component_list, and variable_list isolate one failing page while preserving successful-page data", async () => {
        const variable = variableFixture();
        const component: any = {
            id: "component-good",
            name: "Button",
            type: "COMPONENT",
            key: "component-key",
            remote: false,
            children: [],
        };
        const consumer: any = {
            id: "consumer-good",
            name: "Consumer",
            type: "RECTANGLE",
            children: [],
            boundVariables: {
                fills: [{ type: "VARIABLE_ALIAS", id: variable.id }],
            },
        };
        const good = makePage("page-good", async () => { }, [component, consumer]);
        good.findAllWithCriteria = mock(() => [component]);
        const bad = makePage("page-bad", async () => {
            throw new Error("unavailable page");
        }, [{ id: "frame-bad", name: "Bad", type: "FRAME", children: [] }]);
        installFigma([good, bad], {
            variables: [variable],
            collections: [{ id: "collection-1", name: "Tokens" }],
        });

        const nodes = await getNodesInfo({
            nodeIds: ["component-good", "frame-bad"],
        });
        expect(nodes.nodes.map((node: any) => node.id)).toEqual(["component-good"]);
        expect(nodes.coverage).toMatchObject({
            complete: false,
            pageErrors: [{ pageId: "page-bad", error: { code: "PAGE_LOAD_FAILED" } }],
        });

        const components = await getComponents({ scope: "document" });
        expect(components.components.map((entry: any) => entry.id)).toEqual(["component-good"]);
        expect(components.coverage.pageErrors[0].error.code).toBe("PAGE_LOAD_FAILED");

        const listed = await getVariables({
            variableId: [variable.id],
            includeConsumers: "document",
        });
        expect(listed.variables[0].nodeConsumers.map((entry: any) => entry.nodeId))
            .toEqual(["consumer-good"]);
        expect(listed.coverage.pageErrors[0].error.code).toBe("PAGE_LOAD_FAILED");
    });

    it("single-page component, variable, and annotation commands throw structured codes directly", async () => {
        const failing = makePage("page-failing", async () => {
            throw new Error("load rejected");
        });
        const rectangle = { id: "rect-1", name: "Rectangle", type: "RECTANGLE" };
        const variable = variableFixture();
        installFigma([failing], {
            extraNodes: [rectangle],
            variables: [variable],
            collections: [{ id: "collection-1", name: "Tokens" }],
        });

        await expect(getComponents({
            scope: "page",
            pageId: "missing",
        })).rejects.toMatchObject({
            code: "PAGE_NOT_FOUND",
            details: { pageId: "missing" },
        });

        await expect(getVariables({
            variableId: [variable.id],
            includeConsumers: "page",
            pageId: "rect-1",
        })).rejects.toMatchObject({
            code: "TARGET_NOT_PAGE",
            details: { pageId: "rect-1", actualType: "RECTANGLE" },
        });

        await expect(getAnnotations({
            pageId: "page-failing",
            includeCategories: false,
        })).rejects.toMatchObject({
            code: "PAGE_LOAD_FAILED",
            details: { pageId: "page-failing" },
        });
    });

    it("a timed-out page is omitted while another page returns, and late settlement cannot authorize traversal", async () => {
        const late = deferred();
        let lateChildrenRead = 0;
        const good = makePage("page-good", async () => { }, []);
        const timedOut = makePage("page-timeout", () => late.promise, []);
        Object.defineProperty(timedOut, "children", {
            configurable: true,
            get() {
                lateChildrenRead++;
                return [];
            },
        });
        installFigma([good, timedOut]);
        lateChildrenRead = 0;

        const pageLoads = createPageLoadCoordinator(5);
        const result = await getPagesInfo(
            { pageIds: ["page-good", "page-timeout"] },
            pageLoads,
        );

        expect(result.pages.map((page: any) => page.pageId)).toEqual(["page-good"]);
        expect(result.coverage).toMatchObject({
            complete: false,
            pageErrors: [{
                pageId: "page-timeout",
                error: {
                    code: "PAGE_LOAD_TIMEOUT",
                    details: { pageId: "page-timeout", timeoutMs: 5 },
                },
            }],
        });
        expect(lateChildrenRead).toBe(0);

        late.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(lateChildrenRead).toBe(0);
        expect(result.coverage.pageErrors).toHaveLength(1);
        expect(result.coverage.complete).toBe(false);
    });

    it("the registered coverage schema enforces complete exactly when pageErrors is empty", () => {
        expect(pageCoverage.safeParse({
            complete: true,
            pageErrors: [],
        }).success).toBe(true);
        expect(pageCoverage.safeParse({
            complete: false,
            pageErrors: [{
                pageId: "page-1",
                error: { code: "PAGE_LOAD_FAILED", message: "failed" },
            }],
        }).success).toBe(true);
        expect(pageCoverage.safeParse({
            complete: false,
            pageErrors: [],
        }).success).toBe(false);
        expect(pageCoverage.safeParse({
            complete: true,
            pageErrors: [{
                pageId: "page-1",
                error: { code: "PAGE_LOAD_FAILED", message: "failed" },
            }],
        }).success).toBe(false);
    });
});

describe("v2.3.3 Phase 10 — destructive scan protection", () => {
    async function expectIncompleteDeletion(
        mode: "variable" | "collection" | "empty_collection",
    ) {
        const variable = variableFixture();
        const collection = {
            id: "collection-1",
            name: "Tokens",
            remote: false,
            variableIds: mode === "empty_collection" ? [] : [variable.id],
            remove: mock(() => { }),
        };
        const good = makePage("page-good", async () => { }, []);
        const bad = makePage("page-bad", async () => {
            throw new Error("cannot scan page");
        }, []);
        installFigma([good, bad], {
            variables: mode === "empty_collection" ? [] : [variable],
            collections: [collection],
        });

        const operation = mode === "variable"
            ? deleteVariables({
                variableIds: [variable.id],
                variableNames: [variable.name],
            })
            : deleteVariables({
                collectionId: collection.id,
                collectionName: collection.name,
            });

        await expect(operation).rejects.toMatchObject({
            code: "DOCUMENT_SCAN_INCOMPLETE",
            details: {
                coverage: {
                    complete: false,
                    pageErrors: [{
                        pageId: "page-bad",
                        error: { code: "PAGE_LOAD_FAILED" },
                    }],
                },
            },
        });
        expect(variable.remove).not.toHaveBeenCalled();
        expect(collection.remove).not.toHaveBeenCalled();
    }

    it("variable, collection, and apparently-empty collection deletion all refuse before remove on incomplete coverage", async () => {
        await expectIncompleteDeletion("variable");
        await expectIncompleteDeletion("collection");
        await expectIncompleteDeletion("empty_collection");
    });

    it("a post-load traversal failure is incomplete coverage and cannot reach remove", async () => {
        const variable = variableFixture();
        const page = makePage("page-scan-fails", async () => { }, []);
        installFigma([page], {
            variables: [variable],
            collections: [{ id: "collection-1", name: "Tokens" }],
        });
        Object.defineProperty(page, "children", {
            configurable: true,
            get() {
                throw new Error("dynamic page traversal failed");
            },
        });

        await expect(deleteVariables({
            variableIds: [variable.id],
            variableNames: [variable.name],
        })).rejects.toMatchObject({
            code: "DOCUMENT_SCAN_INCOMPLETE",
            details: {
                coverage: {
                    pageErrors: [{
                        pageId: "page-scan-fails",
                        error: {
                            code: "PAGE_LOAD_FAILED",
                            details: { cause: "dynamic page traversal failed" },
                        },
                    }],
                },
            },
        });
        expect(variable.remove).not.toHaveBeenCalled();
    });

    it("a timed-out scan cannot enable a later collection removal when loadAsync settles late", async () => {
        const late = deferred();
        const collection = {
            id: "collection-1",
            name: "Empty Tokens",
            remote: false,
            variableIds: [],
            remove: mock(() => { }),
        };
        const timedOut = makePage("page-timeout", () => late.promise, []);
        installFigma([timedOut], { collections: [collection] });

        const pageLoads = createPageLoadCoordinator(5);
        await expect(deleteVariables({
            collectionId: collection.id,
            collectionName: collection.name,
        }, pageLoads)).rejects.toMatchObject({
            code: "DOCUMENT_SCAN_INCOMPLETE",
            details: {
                coverage: {
                    pageErrors: [{
                        pageId: "page-timeout",
                        error: { code: "PAGE_LOAD_TIMEOUT" },
                    }],
                },
            },
        });
        expect(collection.remove).not.toHaveBeenCalled();

        late.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(collection.remove).not.toHaveBeenCalled();
    });

    it("an apparently-empty collection is removable only after every page scans successfully", async () => {
        const collection = {
            id: "collection-1",
            name: "Empty Tokens",
            remote: false,
            variableIds: [],
            remove: mock(() => { }),
        };
        installFigma([
            makePage("page-1", async () => { }, []),
            makePage("page-2", async () => { }, []),
        ], { collections: [collection] });

        const result = await deleteVariables({
            collectionId: collection.id,
            collectionName: collection.name,
        });

        expect(result).toEqual({
            success: true,
            deleted: [],
            deletedCollection: collection.id,
        });
        expect(collection.remove).toHaveBeenCalledTimes(1);
    });
});
