import { describe, expect, it, mock } from "bun:test";
import { getPagesInfo, getNodesInfo } from "../../../../../figma_plugin/handlers/nodeReaders.js";
import { getComponents } from "../../../../../figma_plugin/handlers/componentHandlers.js";
import { getAnnotations } from "../../../../../figma_plugin/handlers/annotationHandlers.js";
import { deleteVariables, getVariables } from "../../../../../figma_plugin/handlers/variableHandlers.js";
import { createPageLoadCoordinator } from "../../../../../figma_plugin/utils/pageLoad.js";
import { pageCoverage } from "../../../tools/_result.js";
const { toJsonSchemaCompat } = await import("@modelcontextprotocol/sdk/server/zod-json-schema-compat.js");

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
        // Change 8 (D5): every requested ID absent from `pages` is listed here,
        // including the one that failed to LOAD — the two lists used to disagree
        // about the same question, so a caller could not diff from either alone.
        expect(result.missingPageIds).toEqual(["page-bad", "missing", "rect-1"]);
        expect(result.coverage.complete).toBe(false);
        expect(result.coverage.pagesAttempted).toBe(4);
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
        // Change 8 (F1): the dropped node must be NAMED, with its page, or the
        // caller can see that a page failed but never which request it cost.
        expect(nodes.pageFailedNodes).toEqual([
            { nodeId: "frame-bad", pageId: "page-bad" },
        ]);
        expect(nodes.missingNodeIds).toBeUndefined();
        expect(nodes.coverage).toMatchObject({
            complete: false,
            pagesAttempted: 2,
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
        const failure = {
            pageId: "page-1",
            error: { code: "PAGE_LOAD_FAILED", message: "failed" },
        };
        expect(pageCoverage.safeParse({
            complete: true,
            pagesAttempted: 2,
            pageErrors: [],
        }).success).toBe(true);
        expect(pageCoverage.safeParse({
            complete: false,
            pagesAttempted: 2,
            pageErrors: [failure],
        }).success).toBe(true);
        expect(pageCoverage.safeParse({
            complete: false,
            pagesAttempted: 2,
            pageErrors: [],
        }).success).toBe(false);
        expect(pageCoverage.safeParse({
            complete: true,
            pagesAttempted: 2,
            pageErrors: [failure],
        }).success).toBe(false);
        // Change 8 (F4): pagesAttempted is required, so "nothing was scanned"
        // can never be mistaken for "everything scanned clean".
        expect(pageCoverage.safeParse({
            complete: true,
            pageErrors: [],
        }).success).toBe(false);
    });

    it("Change 8 (D1): the ADVERTISED JSON Schema carries the coverage invariant, not just the Zod parse", () => {
        const advertised: any = toJsonSchemaCompat(pageCoverage, { target: "draft-7" });
        const branches = advertised.anyOf ?? advertised.oneOf;
        expect(Array.isArray(branches), "coverage must advertise its two branches").toBe(true);
        expect(branches).toHaveLength(2);

        const completeBranch = branches.find((b: any) => b.properties.complete.const === true);
        const partialBranch = branches.find((b: any) => b.properties.complete.const === false);
        // The invariant is expressible in JSON Schema; a `.superRefine()` is not,
        // so the refinement form advertised only "a boolean and an array".
        expect(completeBranch.properties.pageErrors.maxItems).toBe(0);
        expect(partialBranch.properties.pageErrors.minItems).toBe(1);
        for (const branch of branches) {
            expect(branch.required).toContain("pagesAttempted");
        }
    });

    it("Change 8 (F4): pagesAttempted separates 'no page touched' from 'every page clean'", async () => {
        installFigma([
            makePage("page-1", async () => { }, []),
            makePage("page-2", async () => { }, []),
        ]);

        // page_info with no ids reads only names — it loads nothing.
        const untouched = await getPagesInfo({});
        expect(untouched.coverage).toEqual({
            complete: true,
            pagesAttempted: 0,
            pageErrors: [],
        });

        // The same `complete: true` after a real document scan is a different
        // claim, and pagesAttempted is what tells them apart.
        const scanned = await getComponents({ scope: "document" });
        expect(scanned.coverage).toEqual({
            complete: true,
            pagesAttempted: 2,
            pageErrors: [],
        });
    });

    it("Change 8 (F6): a PAGE that is not a direct child of the document root is refused", async () => {
        const detached = makePage("page-detached", async () => { }, []);
        const good = makePage("page-good", async () => { }, []);
        installFigma([good]);
        (detached as any).parent = { id: "not-the-root" };
        (figma as any).getNodeByIdAsync = mock(async (id: string) =>
            id === "page-detached" ? detached : (id === "page-good" ? good : null));

        const result = await getPagesInfo({ pageIds: ["page-detached"] });
        expect(result.pages).toEqual([]);
        expect(result.coverage.pageErrors[0].error.code).toBe("TARGET_NOT_PAGE");
        expect(result.coverage.pageErrors[0].error.details.actualType)
            .toContain("not a direct child of the document root");
    });

    it("Change 9 (C9-F2): an unreadable document root fails closed as structured page coverage", async () => {
        const detached = makePage("page-detached", async () => { }, []);
        (detached as any).parent = { id: "not-the-root" };
        (globalThis as any).figma = {
            getNodeByIdAsync: mock(async () => detached),
            get root() {
                throw new Error("root id unreadable");
            },
        };

        const pageLoads = createPageLoadCoordinator();
        const result = await pageLoads.resolve(detached.id);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.error.code).toBe("PAGE_LOAD_FAILED");
        expect(result.error.details).toMatchObject({
            pageId: detached.id,
        });
        expect(result.error.details.cause).toContain("document root");
        expect(detached.loadAsync).not.toHaveBeenCalled();
        expect(pageLoads.coverage()).toEqual({
            complete: false,
            pagesAttempted: 1,
            pageErrors: [{ pageId: detached.id, error: result.error }],
        });
    });

    it("Change 9 (C9-F2): an unreadable PAGE parent cannot escape without structured coverage", async () => {
        const page = makePage("page-hostile-parent", async () => { }, []);
        Object.defineProperty(page, "parent", {
            configurable: true,
            get() {
                throw new Error("parent id unreadable");
            },
        });
        (globalThis as any).figma = {
            root: { id: "doc-1" },
            getNodeByIdAsync: mock(async () => page),
        };

        const pageLoads = createPageLoadCoordinator();
        const result = await pageLoads.resolve(page.id);

        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("unreachable");
        expect(result.error.code).toBe("PAGE_LOAD_FAILED");
        expect(result.error.details).toMatchObject({
            pageId: page.id,
        });
        expect(result.error.details.cause).toContain("direct document parent");
        expect(page.loadAsync).not.toHaveBeenCalled();
        expect(pageLoads.coverage().complete).toBe(false);
        expect(pageLoads.coverage().pageErrors).toHaveLength(1);
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
                            // Change 8 (F2): loaded-then-unreadable is its own
                            // cause with its own recovery. PAGE_LOAD_FAILED told
                            // the agent to retry a page that had already loaded.
                            code: "PAGE_SCAN_FAILED",
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

describe("v2.3.3 Change 8 — Phase 10 review remediation", () => {
    it("F1: a node dropped because its page failed is named, with the page to correlate", async () => {
        const good = makePage("page-good", async () => { }, [
            { id: "keep", name: "Keep", type: "FRAME", children: [] },
        ]);
        const bad = makePage("page-bad", async () => {
            throw new Error("page unavailable");
        }, [{ id: "lost", name: "Lost", type: "FRAME", children: [] }]);
        installFigma([good, bad]);

        const result = await getNodesInfo({ nodeIds: ["keep", "lost", "ghost"] });

        expect(result.nodes.map((node: any) => node.id)).toEqual(["keep"]);
        // "ghost" does not exist; "lost" exists but could not be read. Those are
        // different answers and must not share a bucket.
        expect(result.missingNodeIds).toEqual(["ghost"]);
        expect(result.pageFailedNodes).toEqual([
            { nodeId: "lost", pageId: "page-bad" },
        ]);
        // The correlation the caller needs: pageFailedNodes[].pageId indexes
        // straight into coverage.pageErrors[].pageId.
        const failedPageIds = result.coverage.pageErrors.map((entry: any) => entry.pageId);
        for (const entry of result.pageFailedNodes) {
            expect(failedPageIds).toContain(entry.pageId);
        }
    });

    it("F2: a page that loads and then fails while being read reports PAGE_SCAN_FAILED, not PAGE_LOAD_FAILED", async () => {
        const scannable = makePage("page-ok", async () => { }, []);
        const unreadable = makePage("page-unreadable", async () => { }, []);
        unreadable.findAllWithCriteria = mock(() => {
            throw new Error("criteria query failed");
        });
        installFigma([scannable, unreadable]);

        const result = await getComponents({ scope: "document" });

        const failure = result.coverage.pageErrors[0];
        expect(failure.pageId).toBe("page-unreadable");
        expect(failure.error.code).toBe("PAGE_SCAN_FAILED");
        expect(failure.error.details.cause).toContain("criteria query failed");
        // The distinct recovery is the whole point of the distinct code: the
        // load-failure message says "retry", which is wrong here.
        expect(failure.error.message).toContain("read failure, not a load failure");
        expect(failure.error.message).not.toContain("too large or temporarily unavailable");
    });

    it("F8: a node-mode annotation traversal failure surfaces as PAGE_SCAN_FAILED", async () => {
        const target: any = { id: "target", name: "Target", type: "GROUP" };
        const page = makePage("page-1", async () => { }, [target]);
        installFigma([page]);
        Object.defineProperty(target, "children", {
            configurable: true,
            get() {
                throw new Error("subtree read failed");
            },
        });

        await expect(getAnnotations({
            nodeId: "target",
            includeCategories: false,
        })).rejects.toMatchObject({
            code: "PAGE_SCAN_FAILED",
            details: { pageId: "page-1" },
        });
    });

    it("F5: a DOCUMENT root omits descendantCount rather than walking isolated pages", async () => {
        const good = makePage("page-good", async () => { }, [
            { id: "child", name: "Child", type: "FRAME", children: [] },
        ]);
        installFigma([good]);
        const byIdOriginal = (figma as any).getNodeByIdAsync;
        (figma as any).getNodeByIdAsync = mock(async (id: string) =>
            id === "doc-1" ? figma.root : byIdOriginal(id));

        const result = await getNodesInfo({ nodeIds: ["doc-1"], maxDepth: 1 });
        const document = result.nodes[0];

        expect(document.type).toBe("DOCUMENT");
        // Counting the document's descendants means synchronously touching every
        // page's child tree, including any this command deliberately isolated.
        // Its PAGE children still carry their own counts.
        expect(document.descendantCount).toBeUndefined();
        expect(document.children[0].descendantCount).toBe(1);
    });

    it("Change 9 (C9-T1): a hostile thrown value cannot break getNodesInfo's outer catch", async () => {
        const hostile = new Proxy({}, {
            get: () => { throw new Error("hostile getter"); },
            ownKeys: () => { throw new Error("hostile enumeration"); },
        });
        const pageLoads = createPageLoadCoordinator();
        pageLoads.coverage = () => { throw hostile; };

        // An empty node list reaches the final coverage read directly. The
        // hostile value therefore enters getNodesInfo's OUTER catch — the line
        // Change 8 changed — rather than being swallowed by the inner per-node
        // catch as the previous test was.
        let caught: unknown;
        try {
            await getNodesInfo({ nodeIds: [] }, pageLoads);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBe(hostile);
    });

    it("C1: an in-use target is a coded refusal carrying its consumers, not a bare string", async () => {
        const variable = variableFixture();
        const consumer: any = {
            id: "consumer",
            name: "Consumer",
            type: "RECTANGLE",
            children: [],
            boundVariables: { fills: [{ type: "VARIABLE_ALIAS", id: variable.id }] },
        };
        installFigma([makePage("page-1", async () => { }, [consumer])], {
            variables: [variable],
            collections: [{ id: "collection-1", name: "Tokens" }],
        });

        let thrown: any;
        try {
            await deleteVariables({
                variableIds: [variable.id],
                variableNames: [variable.name],
            });
        } catch (error: any) {
            thrown = error;
        }

        expect(thrown.code).toBe("VARIABLE_IN_USE");
        expect(thrown.message).toContain("Operation Denied:");
        // Recovery must be readable off the error alone (D9's acceptance check).
        expect(thrown.message).toContain("node_info");
        expect(thrown.message).toContain("Nothing was deleted");
        expect(thrown.details.variablesInUse[variable.id].nodeConsumers[0].nodeId)
            .toBe("consumer");
        // C8-F9 (found live on zhfj): layer names are not unique, so a listing
        // that gives only names can name two different nodes identically and
        // leave the agent unable to address either. Every consumer line carries
        // its ID, and the variable line carries the variable ID.
        expect(thrown.message).toContain("(RECTANGLE, consumer)");
        expect(thrown.message).toContain(`(${variable.id})`);
        expect(variable.remove).not.toHaveBeenCalled();
    });

    it("D4: an apparently-empty collection still loads every page but does not walk them", async () => {
        const collection = {
            id: "collection-1",
            name: "Empty Tokens",
            remote: false,
            variableIds: [],
            remove: mock(() => { }),
        };
        const walked: string[] = [];
        const pages = ["page-1", "page-2"].map((id) => {
            const page = makePage(id, async () => { }, []);
            Object.defineProperty(page, "children", {
                configurable: true,
                get() {
                    walked.push(id);
                    return [];
                },
            });
            return page;
        });
        installFigma(pages, { collections: [collection] });
        walked.length = 0;

        const result = await deleteVariables({
            collectionId: collection.id,
            collectionName: collection.name,
        });

        expect(result.success).toBe(true);
        // The D14 fail-closed gate is unchanged — every page is still loaded,
        // so a load failure still aborts before remove() (proved above). What
        // is removed is an O(document) traversal that searches for members of
        // an empty set and can only ever find nothing.
        for (const page of pages) expect(page.loadAsync).toHaveBeenCalled();
        expect(walked).toEqual([]);
        expect(collection.remove).toHaveBeenCalledTimes(1);
    });
});
