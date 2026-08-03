/**
 * Change 29 — regressions for the defects found by live probing on channel
 * `gf32` (2026-08-02) during the adversarial review of Change 28 / Phase 14.
 *
 * Every case here pins a fact the live Figma host established, not a fact a
 * stub was told to report (CONTRIBUTING.md § Tests). The host evidence is named
 * in each block so a later reader can tell measurement from assumption, and
 * each test was red-proofed by reverting its production line.
 */
import { describe, expect, it, mock } from "bun:test";
import {
    normalizeExistingAnnotation,
    withAnnotationPropertyRecovery,
    setMultipleAnnotations,
} from "../../../../../figma_plugin/handlers/annotationHandlers.js";
import { deleteMultipleNodes, flattenNode } from "../../../../../figma_plugin/handlers/nodeModifiers.js";
import { deleteVariables } from "../../../../../figma_plugin/handlers/variableHandlers.js";
import { REFUSALS, formatFailedPageOperand } from "../../../../../figma_plugin/utils/errors.js";
import { parseNodeIdFromUrl } from "../../../../../figma_plugin/utils/scopeLink.js";

function installFigma(overrides: any = {}) {
    (globalThis as any).figma = {
        currentPage: { id: "page-1", name: "Page 1", type: "PAGE" },
        ui: { postMessage: mock(() => { }) },
        notify: mock(() => { }),
        annotations: {
            getAnnotationCategoryByIdAsync: mock(async () => null),
            getAnnotationCategoriesAsync: mock(async () => []),
        },
        ...overrides,
    };
}

/**
 * A node whose `annotations` getter behaves like the real host: it returns each
 * STORED annotation with both `label` and `labelMarkdown` populated, while the
 * setter refuses any entry carrying both. Both halves were observed live on
 * `gf32`: `annotation_list` returned `{label, labelMarkdown}` for a stored
 * annotation, and the next append failed with
 * `Property "annotations" failed validation: Only one of label or labelMarkdown
 * should be given. at index 0`.
 */
function annotatableNode(id: string, stored: any[] = []) {
    const node: any = {
        id,
        name: id,
        type: "RECTANGLE",
        _stored: [...stored],
        writes: [] as any[][],
    };
    Object.defineProperty(node, "annotations", {
        configurable: true,
        get() {
            return node._stored.map((entry: any) => ({
                ...entry,
                label: entry.labelMarkdown,
                labelMarkdown: entry.labelMarkdown,
            }));
        },
        set(next: any[]) {
            node.writes.push(next);
            next.forEach((entry: any, index: number) => {
                if (entry && entry.label !== undefined && entry.labelMarkdown !== undefined) {
                    throw new Error(
                        `Property "annotations" failed validation: Only one of label or labelMarkdown should be given. at index ${index}`
                    );
                }
            });
            node._stored = next.map((entry: any) => ({ ...entry }));
        },
    });
    return node;
}

describe("Change 29 — annotation_set can append more than once per node", () => {
    it("appends a second annotation to a node that already has one", async () => {
        const node = annotatableNode("node-1", [{ labelMarkdown: "first" }]);
        installFigma({ getNodeByIdAsync: mock(async () => node) });

        const result: any = await setMultipleAnnotations({
            annotations: [{ nodeId: "node-1", nodeName: "node-1", labelMarkdown: "second" }],
        });

        expect(result.status).toBe("success");
        expect(result.results[0].beforeCount).toBe(1);
        expect(result.results[0].afterCount).toBe(2);
        // The pre-existing entry must go back with exactly one label field —
        // it is the entry the host rejected, not the one being appended.
        const written = node.writes[node.writes.length - 1];
        expect(written).toHaveLength(2);
        expect("label" in written[0]).toBe(false);
        expect(written[0].labelMarkdown).toBe("first");
        expect(written[1].labelMarkdown).toBe("second");
    });

    it("keeps appending past the second annotation and preserves each stored payload", async () => {
        const node = annotatableNode("node-1", [
            { labelMarkdown: "first", properties: [{ type: "width" }] },
            { labelMarkdown: "second", categoryId: "cat-1" },
        ]);
        installFigma({ getNodeByIdAsync: mock(async () => node) });

        const result: any = await setMultipleAnnotations({
            annotations: [{ nodeId: "node-1", nodeName: "node-1", labelMarkdown: "third" }],
        });

        expect(result.status).toBe("success");
        expect(result.results[0].afterCount).toBe(3);
        const written = node.writes[node.writes.length - 1];
        // Round-tripping must not silently drop data we do not model.
        expect(written[0].properties).toEqual([{ type: "width" }]);
        expect(written[1].categoryId).toBe("cat-1");
    });

    it("normalizeExistingAnnotation drops only the derived label and leaves other shapes alone", () => {
        expect(normalizeExistingAnnotation({ label: "x", labelMarkdown: "x", categoryId: "c" }))
            .toEqual({ labelMarkdown: "x", categoryId: "c" });
        // Label-only annotations are a legitimate stored shape and must survive.
        expect(normalizeExistingAnnotation({ label: "x" })).toEqual({ label: "x" });
        expect(normalizeExistingAnnotation({ labelMarkdown: "x" })).toEqual({ labelMarkdown: "x" });
        expect(normalizeExistingAnnotation({ label: "x", labelMarkdown: undefined }))
            .toEqual({ label: "x", labelMarkdown: undefined });
        expect(normalizeExistingAnnotation(null)).toBeNull();
        expect(normalizeExistingAnnotation("raw")).toBe("raw");
    });
});

describe("Change 29 — node-type-gated annotation properties are actionable", () => {
    it("attaches recovery to the host's invalid-property rejection", () => {
        const raw = 'in set_annotations: Invalid property "fontSize" for a RECTANGLE node';
        const enriched = withAnnotationPropertyRecovery(raw);
        expect(enriched).toContain(raw);
        expect(enriched).toContain("node type");
        expect(enriched).toContain("'properties'");
        expect(enriched).toContain("resend only the non-success rows");
    });

    it("leaves unrelated failures and non-strings untouched", () => {
        expect(withAnnotationPropertyRecovery("Node not found: 1:2")).toBe("Node not found: 1:2");
        expect(withAnnotationPropertyRecovery(undefined as any)).toBeUndefined();
    });

    it("surfaces the recovery on the failing row and skips the rest of the batch", async () => {
        const node: any = {
            id: "node-1",
            name: "node-1",
            type: "RECTANGLE",
            _stored: [],
        };
        Object.defineProperty(node, "annotations", {
            configurable: true,
            get() { return node._stored; },
            set() {
                // The live host's wording, measured on `gf32`.
                throw new Error('in set_annotations: Invalid property "fontSize" for a RECTANGLE node');
            },
        });
        installFigma({ getNodeByIdAsync: mock(async () => node) });

        const result: any = await setMultipleAnnotations({
            annotations: [
                { nodeId: "node-1", nodeName: "node-1", labelMarkdown: "a", properties: [{ type: "fontSize" }] },
                { nodeId: "node-1", nodeName: "node-1", labelMarkdown: "b" },
            ],
        });

        expect(result.status).toBe("failed");
        expect(result.results[0].status).toBe("failed");
        expect(result.results[0].error).toContain("drop that entry from 'properties'");
        expect(result.results[1].status).toBe("skipped");
    });
});

describe("Change 29 — variable_delete loads pages one at a time", () => {
    function scanFixture() {
        let concurrent = 0;
        let peak = 0;
        const order: string[] = [];
        const makePage = (id: string) => {
            const page: any = {
                id,
                name: id,
                type: "PAGE",
                children: [],
                findAllWithCriteria: mock(() => []),
                loadAsync: mock(async () => {
                    order.push(id);
                    concurrent += 1;
                    peak = Math.max(peak, concurrent);
                    await new Promise((resolve) => setTimeout(resolve, 5));
                    concurrent -= 1;
                }),
            };
            return page;
        };
        const pages = ["page-a", "page-b", "page-c"].map(makePage);
        const collection = {
            id: "collection-1",
            name: "Empty",
            remote: false,
            variableIds: [],
            remove: mock(() => { }),
        };
        (globalThis as any).figma = {
            root: { id: "doc", type: "DOCUMENT", children: pages },
            getNodeByIdAsync: mock(async () => null),
            getLocalPaintStylesAsync: mock(async () => []),
            getLocalTextStylesAsync: mock(async () => []),
            getLocalEffectStylesAsync: mock(async () => []),
            getLocalGridStylesAsync: mock(async () => []),
            variables: {
                getVariableByIdAsync: mock(async () => null),
                getVariableCollectionByIdAsync: mock(async () => collection),
                getLocalVariablesAsync: mock(async () => []),
                getLocalVariableCollectionsAsync: mock(async () => [collection]),
            },
        };
        return { collection, peak: () => peak, order };
    }

    it("never has two page loads in flight at once", async () => {
        // Live on `gf32`: the concurrent fan-out refused DOCUMENT_SCAN_INCOMPLETE
        // twice in a row on a document whose three pages all read cleanly
        // through the sequential surfaces, then succeeded on the third try.
        const fixture = scanFixture();
        await deleteVariables({ collectionId: "collection-1", collectionName: "Empty" });
        expect(fixture.peak()).toBe(1);
        expect(fixture.order).toEqual(["page-a", "page-b", "page-c"]);
    });
});

describe("Change 29 — DOCUMENT_SCAN_INCOMPLETE names the failing pages", () => {
    it("puts the page IDs in the message, not only in details", () => {
        const refusal = REFUSALS.DOCUMENT_SCAN_INCOMPLETE([
            { pageId: "1:2", error: { code: "PAGE_LOAD_FAILED", message: "x" } },
            { pageId: "1:3", error: { code: "PAGE_LOAD_TIMEOUT", message: "y" } },
        ]);
        expect(refusal.message).toContain('"1:2"');
        expect(refusal.message).toContain('"1:3"');
        expect(refusal.message).toContain("Nothing was deleted");
        expect(refusal.message).toContain("Retry the same call");
        expect((refusal as any).details.coverage.pageErrors).toHaveLength(2);
    });

    it("degrades safely rather than throwing on absent or hostile operands", () => {
        expect(formatFailedPageOperand(undefined)).toBe("one or more pages");
        expect(formatFailedPageOperand([])).toBe("one or more pages");
        const hostile: any = [{ get pageId() { throw new Error("boom"); } }];
        expect(() => REFUSALS.DOCUMENT_SCAN_INCOMPLETE(hostile)).not.toThrow();
        expect(formatFailedPageOperand(hostile)).toBe("1 page(s)");
    });
});

describe("Change 29 — node_delete rows for an already-removed target", () => {
    it("tells the caller the deletion already holds and not to retry", async () => {
        // The ordinary way to reach this live: one batch naming an ancestor and
        // one of its descendants. Removing the ancestor removes the descendant,
        // whose own row then fails. Observed on `gf32`.
        const removed = new Set<string>();
        const parent: any = { id: "1:1", name: "parent", type: "FRAME" };
        parent.remove = () => { removed.add("1:1"); removed.add("1:2"); };
        const child: any = { id: "1:2", name: "child", type: "RECTANGLE" };
        child.remove = () => {
            if (removed.has("1:2")) throw new Error('in get_name: The node with id "1:2" does not exist');
            removed.add("1:2");
        };
        (globalThis as any).figma = {
            getNodeByIdAsync: mock(async (id: string) => (id === "1:1" ? parent : child)),
            ui: { postMessage: mock(() => { }) },
        };

        const result: any = await deleteMultipleNodes({ nodeIds: ["1:1", "1:2"] });

        expect(result.status).toBe("partial_success");
        expect(result.success).toBe(false);
        expect(result.results.map((row: any) => row.nodeId)).toEqual(["1:1", "1:2"]);
        const failed = result.results[1];
        expect(failed.status).toBe("failed");
        expect(failed.error).toContain("already in effect");
        expect(failed.error).toContain("Do NOT retry this row");
        expect(failed.error).toContain("missingNodeIds");
    });

    it("gives the same recovery when the node is already gone at lookup time", async () => {
        (globalThis as any).figma = {
            getNodeByIdAsync: mock(async () => null),
            ui: { postMessage: mock(() => { }) },
        };
        const result: any = await deleteMultipleNodes({ nodeIds: ["9:9"] });
        expect(result.status).toBe("failed");
        expect(result.results[0].error).toContain("Do NOT retry this row");
    });
});

describe("Change 29 — scope links resolve in both node-id spellings", () => {
    // The Phase 14 manual probe measured this against the real plugin UI: the
    // percent-encoded form reported "Node not found in current document" while
    // the dash form validated, because the sandbox has no `URL` and the regex
    // fallback never decoded. Both must now yield the same node ID.
    const dash = "https://www.figma.com/design/abc/MCP-Test?node-id=1-2&t=xyz";
    const encoded = "https://www.figma.com/design/abc/MCP-Test?node-id=1%3A2&t=xyz";

    it("resolves the percent-encoded and dash spellings to the same ID", () => {
        expect(parseNodeIdFromUrl(dash)).toBe("1:2");
        expect(parseNodeIdFromUrl(encoded)).toBe("1:2");
    });

    it("handles the already-colon form and stops at the parameter boundary", () => {
        expect(parseNodeIdFromUrl("https://x/?node-id=1:2")).toBe("1:2");
        expect(parseNodeIdFromUrl("https://x/?node-id=1-2#frag")).toBe("1:2");
        expect(parseNodeIdFromUrl("https://x/?other=1&node-id=10-20&t=1")).toBe("10:20");
    });

    it("falls back to the raw value on a malformed escape instead of throwing", () => {
        expect(() => parseNodeIdFromUrl("https://x/?node-id=1%zz2")).not.toThrow();
        expect(parseNodeIdFromUrl("https://x/?node-id=1%zz2")).toBe("1%zz2");
    });

    it("returns null for links with no node-id and for non-strings", () => {
        expect(parseNodeIdFromUrl("https://www.figma.com/design/abc/MCP-Test")).toBeNull();
        expect(parseNodeIdFromUrl(undefined)).toBeNull();
        expect(parseNodeIdFromUrl(null)).toBeNull();
    });
});

describe("Change 29 — node_flatten reports its destination", () => {
    it("returns the parent it placed the vector into", async () => {
        const parent: any = { id: "1:1", name: "Holder", type: "FRAME", children: [] as any[] };
        const source: any = { id: "1:2", name: "Star", type: "STAR", parent };
        parent.children.push(source);
        parent.insertChild = mock(() => { });
        const flattened: any = { id: "1:3", name: "Star", type: "VECTOR", parent };
        (globalThis as any).figma = {
            getNodeByIdAsync: mock(async () => source),
            flatten: mock(() => flattened),
        };

        const result: any = await flattenNode({ nodeId: "1:2", nodeName: "Star" });
        expect(result.parentId).toBe("1:1");
    });

    it("reports a detached result as null rather than omitting the field", async () => {
        const parent: any = { id: "1:1", name: "Holder", type: "FRAME", children: [] as any[] };
        const source: any = { id: "1:2", name: "Star", type: "STAR", parent };
        parent.children.push(source);
        parent.insertChild = mock(() => { });
        (globalThis as any).figma = {
            getNodeByIdAsync: mock(async () => source),
            flatten: mock(() => ({ id: "1:3", name: "Star", type: "VECTOR", parent: null })),
        };
        const result: any = await flattenNode({ nodeId: "1:2", nodeName: "Star" });
        expect(result.parentId).toBeNull();
    });
});
