import { describe, it, expect, beforeEach, mock } from "bun:test";

/**
 * Phase 5–6 remediation coverage (Q22–Q26 + ratifications), the tests the
 * Phase-5-&-6 review found missing (P6-7) plus the mechanisms the resolutions
 * introduced:
 *   - schema-boundary `.min(1)` and duplicate-target rejection (Q23 Layer 1);
 *   - the shared batch-status invariant across all four aggregators (D7 / rat 4);
 *   - the Q24 `setCharacters` fallback-report mechanism (before-value source);
 *   - the P6-1 `getMainComponentAsync` read.
 */

// ---------------------------------------------------------------------------
// Part A — schema boundary (registered input schemas)
// ---------------------------------------------------------------------------
import { registerAllTools } from "../../../tools/index.js";

const INPUTS: Record<string, any> = {};
const OUTPUTS: Record<string, any> = {};
const captureServer: any = {
    registerTool: (name: string, config: any) => { INPUTS[name] = config?.inputSchema; OUTPUTS[name] = config?.outputSchema; },
    tool: () => {}, prompt: () => {}, registerPrompt: () => {},
    registerResource: () => {}, resource: () => {},
};
registerAllTools(captureServer);

describe("Q23/Q7: batch input schemas reject [] and duplicates at the boundary", () => {
    const empty: Record<string, any> = {
        node_delete: { nodes: [] },
        text_set_content: { text: [] },
        instance_set_overrides: { sourceInstanceId: "s", targetNodes: [] },
        annotation_set: { annotations: [] },
    };
    for (const [tool, payload] of Object.entries(empty)) {
        it(`${tool} rejects an empty batch (.min(1))`, () => {
            expect(INPUTS[tool].safeParse(payload).success).toBe(false);
        });
    }

    const dupCases: Array<[string, any]> = [
        ["node_delete", { nodes: [{ nodeId: "1:2", nodeName: "A" }, { nodeId: "1:2", nodeName: "A" }] }],
        // normalized spelling: 1-2 and 1:2 are the same node
        ["node_delete", { nodes: [{ nodeId: "1:2", nodeName: "A" }, { nodeId: "1-2", nodeName: "A" }] }],
        ["text_set_content", { text: [{ nodeId: "1:2", nodeName: "A", characters: "x" }, { nodeId: "1-2", nodeName: "A", characters: "y" }] }],
        ["instance_set_overrides", { sourceInstanceId: "s", targetNodes: [{ nodeId: "1:2", nodeName: "A" }, { nodeId: "1-2", nodeName: "A" }] }],
    ];
    for (const [tool, payload] of dupCases) {
        it(`${tool} rejects a duplicate target (${JSON.stringify(payload).slice(0, 40)}…)`, () => {
            const res = INPUTS[tool].safeParse(payload);
            expect(res.success).toBe(false);
            expect(JSON.stringify(res.error.issues)).toContain("Duplicate target");
        });
    }

    it("node_delete accepts a valid distinct batch", () => {
        expect(INPUTS["node_delete"].safeParse({ nodes: [{ nodeId: "1:2", nodeName: "A" }, { nodeId: "1:3", nodeName: "B" }] }).success).toBe(true);
    });

    it("annotation_set allows a repeated node (batches may legitimately repeat)", () => {
        // Current (pre-Phase-7) annotation item shape requires categoryId.
        const res = INPUTS["annotation_set"].safeParse({
            annotations: [{ nodeId: "1:2", nodeName: "A", categoryId: "c" }, { nodeId: "1:2", nodeName: "A", categoryId: "c" }],
        });
        expect(res.success).toBe(true);
    });
});

describe("P5-4: parent-name fields carry the D5 description form", () => {
    for (const tool of ["create_shape", "create_frame", "create_text", "create_svg", "create_instance", "create_component_set"]) {
        it(`${tool}.parentNodeName says 'passed back verbatim from node_info'`, () => {
            const desc = INPUTS[tool].shape.parentNodeName.description as string;
            expect(desc).toContain("passed back verbatim from node_info");
        });
    }
});

// ---------------------------------------------------------------------------
// Part B — Q24 setCharacters fallback report. Imported with a cache-busting
// query so bun's cross-file `mock.module` of textUtils (createText.test) cannot
// replace the real implementation under test here.
// ---------------------------------------------------------------------------
const realTextUtils: any = await import("../../../../../figma_plugin/utils/textUtils.js?realimpl");
const setCharacters = realTextUtils.setCharacters;
const errorUtils: any = await import("../../../../../figma_plugin/utils/errors.js?phase6-actionable-errors");
const describeError = errorUtils.describeError;

// The text handler's module-level `setCharacters` is globally replaced by bun's
// `mock.module` in other test files and cannot be un-mocked per-file, so the
// handler exposes a `deps.setCharacters` injection seam. The fault-path tests
// below inject a controlled implementation to drive font-mutation-then-failure
// deterministically. Part B (above) proves the REAL setCharacters report logic
// via a ?realimpl import that bypasses the mock. `mock` is imported so the file
// remains valid even though the injection seam replaces the re-mock machinery.
void mock;

describe("Q25: describeError always returns a non-blank reason", () => {
    const cases: Array<[string, unknown, string]> = [
        ["empty string", "", "Error executing command"],
        ["whitespace string", " \t ", "Error executing command"],
        ["empty Error.message", new Error(""), "Error executing command"],
        ["whitespace Error.message", new Error(" \t "), "Error executing command"],
        ["raw string", "raw batch failure", "raw batch failure"],
        ["null", null, "Error executing command"],
        ["undefined", undefined, "Error executing command"],
        ["null-prototype object", Object.create(null), "Error executing command"],
        ["throwing toString", { toString: () => { throw new Error("renderer failed"); } }, "Error executing command"],
        ["non-string toString", { toString: () => null }, "Error executing command"],
    ];

    for (const [label, thrown, expected] of cases) {
        it(`normalizes ${label}`, () => {
            const message = describeError(thrown);
            expect(message).toBe(expected);
            expect(message.trim().length).toBeGreaterThan(0);
        });
    }
});

function fontNode(fontName: any, opts: { charThrows?: boolean } = {}) {
    let chars = "old";
    return {
        fontName,
        get characters() { return chars; },
        set characters(v: string) { if (opts.charThrows) throw new Error("char set failed"); chars = v; },
    };
}

describe("Q24: setCharacters reports fontMutated + beforeFont only when the font actually changed", () => {
    it("sets fontMutated + beforeFont when the primary font load throws (fallback path)", async () => {
        (globalThis as any).figma = {
            mixed: Symbol("mixed"),
            loadFontAsync: async (f: any) => { if (f.family === "Primary") throw new Error("font unavailable"); },
        };
        const node = fontNode({ family: "Primary", style: "Regular" });
        const report: any = {};
        const ok = await setCharacters(node, "new", undefined, report);
        expect(ok).toBe(true);
        expect(report.fontMutated).toBe(true);
        expect(report.beforeFont).toEqual({ family: "Primary", style: "Regular" });
    });

    it("sets fontMutated for a mixed-font node normalized before assignment (C2)", async () => {
        const mixed = Symbol("mixed");
        (globalThis as any).figma = { mixed, loadFontAsync: async () => {} };
        let chars = "abc";
        const node: any = {
            fontName: mixed,
            getRangeFontName: () => ({ family: "First", style: "Regular" }),
            getStyledTextSegments: () => [{ start: 0, end: 3, fontName: { family: "First", style: "Regular" } }],
            get characters() { return chars; },
            set characters(v: string) { chars = v; },
        };
        const report: any = {};
        await setCharacters(node, "new", undefined, report);
        expect(report.fontMutated).toBe(true);
        // before-font is a complete diagnostic snapshot of the segment map, not null.
        expect(report.beforeFont.mixed).toBe(true);
        expect(report.beforeFont.segments).toEqual([{ start: 0, end: 3, fontName: { family: "First", style: "Regular" } }]);
    });

    it("does NOT set fontMutated when the primary font loads fine (clean path)", async () => {
        (globalThis as any).figma = { mixed: Symbol("mixed"), loadFontAsync: async () => {} };
        const node = fontNode({ family: "Inter", style: "Regular" });
        const report: any = {};
        await setCharacters(node, "new", undefined, report);
        expect(report.fontMutated).toBeUndefined();
        // beforeFont is still captured (pre-mutation snapshot) even on the clean path.
        expect(report.beforeFont).toEqual({ family: "Inter", style: "Regular" });
    });
});

// ---------------------------------------------------------------------------
// Part C — shared batch-status invariant + P6-1. Uses the real aggregators.
// ---------------------------------------------------------------------------
const nodeMap = new Map<string, any>();
function installRemedFigma() {
    (globalThis as any).figma = {
        notify: () => {}, mixed: Symbol("mixed"),
        ui: { postMessage: () => {} },
        getNodeByIdAsync: async (id: string) => nodeMap.get(id) || null,
        getAnnotationCategoryByIdAsync: async () => ({ id: "c" }),
        loadFontAsync: async () => {},
    };
}
installRemedFigma();
const { setInstanceOverrides, checkTargetPredicates } = await import("../../../../../figma_plugin/handlers/componentHandlers.js?remed");
const { deleteMultipleNodes } = await import("../../../../../figma_plugin/handlers/nodeModifiers.js?remed");
const { setMultipleAnnotations } = await import("../../../../../figma_plugin/handlers/annotationHandlers.js?remed");
const { setMultipleTextContents } = await import("../../../../../figma_plugin/handlers/textHandlers.js?remed");

// A controlled setCharacters for injection: reports a font mutation with a
// before-font, then reports character-assignment failure (returns false). Used
// to drive the handler's Q24 disclosure deterministically without depending on
// the globally-mocked module-level setCharacters.
function mutatingThenFailingSetChars(beforeFont: any) {
    return async (_node: any, _chars: any, _opts: any, report: any) => {
        if (report) { report.beforeFont = beforeFont; report.fontMutated = true; }
        return false; // character assignment failed after the font was mutated
    };
}
// Reports NO font mutation, then fails — a clean failure that must carry no flag.
const cleanFailingSetChars = async (_n: any, _c: any, _o: any, report: any) => {
    if (report) report.beforeFont = { family: "Inter", style: "Regular" };
    return false;
};

describe("Q25: instance predicate diagnostics tolerate non-Error throws", () => {
    it("turns a null lock-read failure into a non-blank drift reason", () => {
        const target: any = { id: "i-lock", name: "I", type: "INSTANCE", parent: null };
        Object.defineProperty(target, "locked", {
            get: () => { throw null; },
        });

        const reason = checkTargetPredicates(target, target.id, target.name);
        expect(reason).toContain("Error executing command");
        expect(reason?.trim().length).toBeGreaterThan(0);
    });
});

describe("D7/ratification 4: success === (status === 'success') across aggregators", () => {
    // Part B reassigns globalThis.figma per test; restore this block's figma.
    beforeEach(() => installRemedFigma());

    it("holds for delete across success / partial / all-failed", async () => {
        nodeMap.clear();
        nodeMap.set("d1", { id: "d1", name: "A", type: "FRAME", remove: () => {} });
        nodeMap.set("d2", { id: "d2", name: "B", type: "FRAME", remove: () => { throw new Error("locked"); } });

        const allOk = await deleteMultipleNodes({ nodeIds: ["d1"] });
        expect(allOk.status).toBe("success");
        expect(allOk.success).toBe(allOk.status === "success");

        const partial = await deleteMultipleNodes({ nodeIds: ["d1", "d2"] });
        expect(partial.status).toBe("partial_success");
        expect(partial.success).toBe(partial.status === "success");

        const allFail = await deleteMultipleNodes({ nodeIds: ["d2"] });
        expect(allFail.status).toBe("failed");
        expect(allFail.success).toBe(allFail.status === "success");
    });

    it("holds for instance overrides, and reads the main component via getMainComponentAsync (P6-1)", async () => {
        let syncRead = false;
        const mkInstance = (id: string, swapThrows = false) => ({
            id, name: id,
            get mainComponent() { syncRead = true; throw new Error("dynamic-page: use getMainComponentAsync"); },
            getMainComponentAsync: async () => ({ id: "orig-" + id }),
            swapComponent: () => { if (swapThrows) throw new Error("swap fail"); },
        });
        const source = { sourceInstance: { id: "s" }, mainComponent: { id: "new" }, overrides: [] };

        const ok = await setInstanceOverrides([mkInstance("i1")], source);
        expect(ok.status).toBe("success");
        expect(ok.success).toBe(true);
        expect(syncRead).toBe(false); // never touched the throwing sync getter

        const partial = await setInstanceOverrides([mkInstance("i1"), mkInstance("i2", true)], source);
        expect(partial.status).toBe("partial_success");
        expect(partial.success).toBe(false);
        // Q25: rows use nodeId + (on failure) error, not instanceId/message.
        expect(partial.results[1].nodeId).toBe("i2");
        expect(typeof partial.results[1].error).toBe("string");

        const allFail = await setInstanceOverrides([mkInstance("i1", true)], source);
        expect(allFail.status).toBe("failed");
        expect(allFail.success).toBe(false);
    });

    it("holds for annotations (success path)", async () => {
        nodeMap.clear();
        nodeMap.set("a1", { id: "a1", name: "A", type: "FRAME" });
        (globalThis as any).figma.getAnnotationCategoryByIdAsync = async () => ({ id: "c" });
        const okNode: any = nodeMap.get("a1");
        Object.defineProperty(okNode, "annotations", { get: () => [], set: () => {}, configurable: true });

        const res = await setMultipleAnnotations({ annotations: [{ nodeId: "a1", nodeName: "A", labelMarkdown: "x" }] });
        expect(res.success).toBe(res.status === "success");
    });

    it("holds for annotations across all-failed + skipped (R4: annotation was previously success-only)", async () => {
        nodeMap.clear();
        // No node registered → the first annotation fails "Node not found", the
        // second is skipped by the stop-on-first handler.
        const res = await setMultipleAnnotations({ annotations: [
            { nodeId: "gone-1", nodeName: "A", labelMarkdown: "x" },
            { nodeId: "gone-2", nodeName: "B", labelMarkdown: "y" },
        ] });
        expect(res.status).toBe("failed"); // zero succeeded
        expect(res.success).toBe(false);
        expect(res.success).toBe(res.status === "success"); // invariant holds
        expect(res.results).toHaveLength(2);               // one ordered row per input
        expect(res.results[0].status).toBe("failed");
        expect(res.results[0].error).toContain("not found");
        expect(res.results[1].status).toBe("skipped");
    });

    it("holds for text across success / partial / all-failed (C8: text was previously absent)", async () => {
        installRemedFigma();
        nodeMap.clear();
        const mk = (id: string, throws = false) => {
            let chars = "old";
            return {
                id, name: id, type: "TEXT", fontName: { family: "Inter", style: "Regular" },
                get characters() { return chars; },
                set characters(v: string) { if (throws) throw new Error("locked"); chars = v; },
            };
        };
        nodeMap.set("t-ok", mk("t-ok"));
        nodeMap.set("t-bad", mk("t-bad", true));

        const allOk = await setMultipleTextContents({ text: [{ nodeId: "t-ok", characters: "x" }] });
        expect(allOk.status).toBe("success");
        expect(allOk.success).toBe(true);

        const partial = await setMultipleTextContents({ text: [{ nodeId: "t-ok", characters: "x" }, { nodeId: "t-bad", characters: "y" }] });
        expect(partial.status).toBe("partial_success");
        expect(partial.success).toBe(false);

        const allFail = await setMultipleTextContents({ text: [{ nodeId: "t-bad", characters: "y" }] });
        expect(allFail.status).toBe("failed");
        expect(allFail.success).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Part D — deterministic fault paths the green suite previously did not drive
// (C1, C2, C3, C4, C5). Text disclosure uses the handler's setCharacters
// injection seam; instance/delete paths use the real handlers directly.
// ---------------------------------------------------------------------------
describe("C1/C2: text partial-mutation disclosure on the real handler fault path", () => {
    beforeEach(() => installRemedFigma());

    it("C1: font-mutation-then-assignment-failure discloses partialMutation + before:{fontName}", async () => {
        nodeMap.clear();
        nodeMap.set("t1", { id: "t1", name: "A", type: "TEXT", fontName: { family: "Primary", style: "Regular" }, characters: "old" });

        // Injected setCharacters mutates the font (reports it) then fails the
        // character assignment — the exact C1 path where the handler's catch must
        // read the loop-scoped report even though the await threw.
        const res = await setMultipleTextContents(
            { text: [{ nodeId: "t1", characters: "new" }] },
            { setCharacters: mutatingThenFailingSetChars({ family: "Primary", style: "Regular" }) as any }
        );
        expect(res.status).toBe("failed");
        const row = res.results[0];
        expect(row.partialMutation).toBe(true);
        expect(row.whatChanged).toContain("font");
        expect(row.before).toEqual({ fontName: { family: "Primary", style: "Regular" } });
    });

    it("clean failure (char assignment fails, no font mutation) carries no flag", async () => {
        nodeMap.clear();
        nodeMap.set("t1", { id: "t1", name: "A", type: "TEXT", fontName: { family: "Inter", style: "Regular" }, characters: "old" });

        const res = await setMultipleTextContents(
            { text: [{ nodeId: "t1", characters: "new" }] },
            { setCharacters: cleanFailingSetChars as any }
        );
        expect(res.status).toBe("failed");
        expect(res.results[0].partialMutation).toBeUndefined();
        expect(res.results[0].before).toBeUndefined();
    });

    it("node-gone clean failure carries no flag", async () => {
        nodeMap.clear();
        (globalThis as any).figma.loadFontAsync = async () => {};
        const res = await setMultipleTextContents({ text: [
            { nodeId: "missing", characters: "x" },
        ] });
        expect(res.results[0].status).toBe("failed");
        expect(res.results[0].error).toContain("not found");
        expect(res.results[0].partialMutation).toBeUndefined();
        expect(res.results[0].before).toBeUndefined();
    });

    it("not-TEXT clean failure carries no flag — the not-TEXT branch actually executes (R4)", async () => {
        nodeMap.clear();
        (globalThis as any).figma.loadFontAsync = async () => {};
        // R4: the not-TEXT node is the FIRST (only) item, so the stop-on-first
        // handler runs its not-TEXT branch instead of skipping it — the earlier
        // test put a missing node first and never reached this branch.
        nodeMap.set("frame", { id: "frame", name: "F", type: "FRAME" });
        const res = await setMultipleTextContents({ text: [
            { nodeId: "frame", characters: "y" },
        ] });
        expect(res.results[0].status).toBe("failed");
        expect(res.results[0].error).toContain("not a text node");
        expect(res.results[0].partialMutation).toBeUndefined();
        expect(res.results[0].before).toBeUndefined();
    });
});

describe("C3: progress delivery is best-effort and cannot corrupt the envelope", () => {
    beforeEach(() => installRemedFigma());

    const hostileProgressError = () => new Proxy({}, {
        get: () => { throw new Error("hostile progress error getter"); },
    });

    it("a hostile postMessage failure after a text success does not fabricate a second row", async () => {
        nodeMap.clear();
        (globalThis as any).figma.loadFontAsync = async () => {};
        (globalThis as any).figma.ui = { postMessage: () => { throw hostileProgressError(); } };
        let chars = "old";
        nodeMap.set("t1", {
            id: "t1", name: "A", type: "TEXT", fontName: { family: "Inter", style: "Regular" },
            get characters() { return chars; },
            set characters(v: string) { chars = v; },
        });

        const res = await setMultipleTextContents({ text: [{ nodeId: "t1", characters: "new" }] });
        expect(res.status).toBe("success");
        expect(res.requestedCount).toBe(1);
        expect(res.succeededCount).toBe(1);
        expect(res.failedCount).toBe(0);
        expect(res.results).toHaveLength(1); // exactly one row per input
    });

    it("a hostile postMessage failure during delete still returns the D7 envelope", async () => {
        nodeMap.clear();
        (globalThis as any).figma.ui = { postMessage: () => { throw hostileProgressError(); } };
        let removed = false;
        nodeMap.set("d1", { id: "d1", name: "A", type: "FRAME", remove: () => { removed = true; } });

        const res = await deleteMultipleNodes({ nodeIds: ["d1"] });
        expect(removed).toBe(true);
        expect(res.status).toBe("success"); // envelope survives the progress failure
        expect(res.succeededCount).toBe(1);
    });

    it("a notify failure after an instance swap cannot erase the D7 envelope", async () => {
        let swaps = 0;
        (globalThis as any).figma.notify = () => { throw new Error("notify failed"); };
        const target = {
            id: "i-notify", name: "I",
            getMainComponentAsync: async () => ({ id: "main-before" }),
            swapComponent: () => { swaps++; },
        };
        const source = {
            sourceInstance: { id: "src" },
            mainComponent: { id: "main-after" },
            overrides: [],
        };

        const res = await setInstanceOverrides([target], source);

        expect(swaps).toBe(1);
        expect(res.status).toBe("success");
        expect(res.success).toBe(true);
        expect(res.requestedCount).toBe(1);
        expect(res.succeededCount).toBe(1);
        expect(res.failedCount).toBe(0);
        expect(res.skippedCount).toBe(0);
        expect(res.results).toHaveLength(1);
        expect(res.results[0].status).toBe("success");
    });
});

// R3 (closure audit): the registered `results` schemas encode the required Q25
// row vocabulary (nodeId + status) instead of `z.array(z.any())`. This couples
// real plugin-handler rows to the registered schema so omission of those keys is
// caught at the server boundary. Per Rev 43, the wrapped schema remains loose:
// top-level envelope exactness and absence of legacy counts are asserted against
// current handler output here, not enforced as an exact schema allowlist.
describe("R3: real batch handler output validates against the registered output schema", () => {
    beforeEach(() => installRemedFigma());

    const legacyByTool: Record<string, string[]> = {
        node_delete: ["nodesDeleted", "nodesFailed", "totalNodes"],
        text_set_content: ["replacementsApplied", "totalReplacements"],
        annotation_set: ["annotationsApplied", "totalAnnotations"],
        instance_set_overrides: ["totalCount"],
    };

    function assertConforms(tool: string, result: any) {
        // Every row carries the Q25 vocabulary keys.
        for (const row of result.results || []) {
            expect(typeof row.nodeId, `${tool} row.nodeId`).toBe("string");
            expect(["success", "failed", "skipped"], `${tool} row.status`).toContain(row.status);
        }
        // No legacy count vocabulary at the top level.
        for (const gone of legacyByTool[tool]) {
            expect(result[gone], `${tool} must not surface legacy ${gone}`).toBeUndefined();
        }
        // The REGISTERED wrapped schema accepts the real handler output.
        expect(OUTPUTS[tool].safeParse(result).success, `${tool} output validates`).toBe(true);
    }

    it("node_delete real output conforms and validates", async () => {
        nodeMap.clear();
        nodeMap.set("d1", { id: "d1", name: "A", type: "FRAME", remove: () => {} });
        assertConforms("node_delete", await deleteMultipleNodes({ nodeIds: ["d1"] }));
    });

    it("text_set_content real output conforms and validates", async () => {
        nodeMap.clear();
        let chars = "old";
        nodeMap.set("t1", {
            id: "t1", name: "t1", type: "TEXT", fontName: { family: "Inter", style: "Regular" },
            get characters() { return chars; }, set characters(v: string) { chars = v; },
        });
        assertConforms("text_set_content", await setMultipleTextContents({ text: [{ nodeId: "t1", characters: "new" }] }));
    });

    it("instance_set_overrides real output conforms and validates", async () => {
        const instance = {
            id: "i1", name: "i1",
            getMainComponentAsync: async () => ({ id: "orig" }),
            swapComponent: () => {},
        };
        const source = { sourceInstance: { id: "s" }, mainComponent: { id: "new" }, overrides: [] };
        assertConforms("instance_set_overrides", await setInstanceOverrides([instance], source));
    });

    it("annotation_set real output conforms and validates", async () => {
        nodeMap.clear();
        const node: any = { id: "a1", name: "A", type: "FRAME" };
        Object.defineProperty(node, "annotations", { get: () => [], set: () => {}, configurable: true });
        nodeMap.set("a1", node);
        assertConforms("annotation_set", await setMultipleAnnotations({ annotations: [{ nodeId: "a1", nodeName: "A", labelMarkdown: "x" }] }));
    });

    it("the encoded schema REJECTS a reintroduced legacy instance row (nodeId/status dropped)", () => {
        // A row keyed on the pre-Q25 instance vocabulary is now a validation
        // failure at the boundary — the drift the audit found undetectable.
        const legacyRow = {
            success: true, status: "success", requestedCount: 1, succeededCount: 1, failedCount: 0, skippedCount: 0,
            results: [{ instanceId: "i1", message: "ok" }],
        };
        expect(OUTPUTS["instance_set_overrides"].safeParse(legacyRow).success).toBe(false);
    });

    it("the encoded schema REJECTS a row missing status for every batch tool", () => {
        for (const tool of ["node_delete", "text_set_content", "annotation_set", "instance_set_overrides"]) {
            const drifted = {
                success: true, status: "success", requestedCount: 1, succeededCount: 1, failedCount: 0, skippedCount: 0,
                results: [{ nodeId: "1:2" }], // no `status`
            };
            expect(OUTPUTS[tool].safeParse(drifted).success, `${tool} rejects a row missing status`).toBe(false);
        }
    });

    // Q25 requires every failed/skipped row to retain a non-empty actionable
    // reason. JavaScript permits throwing any value, and Figma API failures are
    // outside our control, so batch catches must not assume `error.message`.
    const thrownCases: Array<[string, () => unknown, string]> = [
        ["empty Error", () => new Error(""), "Error"],
        ["raw string", () => "raw batch failure", "raw batch failure"],
        ["null", () => null, "Error executing command"],
    ];

    function assertActionableFailure(tool: string, result: any, expectedText: string) {
        expect(result.status).toBe("failed");
        expect(result.results).toHaveLength(1);
        const error = result.results[0].error;
        expect(typeof error).toBe("string");
        expect(error.trim().length).toBeGreaterThan(0);
        expect(error).toContain(expectedText);
        assertConforms(tool, result);
    }

    for (const [label, makeThrown, expectedText] of thrownCases) {
        it(`node_delete normalizes ${label} into a schema-valid actionable row`, async () => {
            nodeMap.clear();
            nodeMap.set("d-throw", {
                id: "d-throw", name: "D", type: "FRAME",
                remove: () => { throw makeThrown(); },
            });
            const result = await deleteMultipleNodes({ nodeIds: ["d-throw"] });
            assertActionableFailure("node_delete", result, expectedText);
        });

        it(`annotation_set normalizes ${label} into a schema-valid actionable row`, async () => {
            nodeMap.clear();
            const node: any = { id: "a-throw", name: "A", type: "FRAME" };
            Object.defineProperty(node, "annotations", {
                get: () => [],
                set: () => { throw makeThrown(); },
                configurable: true,
            });
            nodeMap.set(node.id, node);
            const result = await setMultipleAnnotations({
                annotations: [{ nodeId: node.id, nodeName: node.name, labelMarkdown: "x" }],
            });
            assertActionableFailure("annotation_set", result, expectedText);
        });

        it(`text_set_content normalizes ${label} into a schema-valid actionable row`, async () => {
            nodeMap.clear();
            nodeMap.set("t-throw", {
                id: "t-throw", name: "T", type: "TEXT",
                fontName: { family: "Inter", style: "Regular" },
                characters: "old",
            });
            const result = await setMultipleTextContents(
                { text: [{ nodeId: "t-throw", characters: "new" }] },
                { setCharacters: (async () => { throw makeThrown(); }) as any }
            );
            assertActionableFailure("text_set_content", result, expectedText);
        });

        it(`instance_set_overrides normalizes ${label} into a schema-valid actionable row`, async () => {
            const target = {
                id: "i-throw", name: "I",
                getMainComponentAsync: async () => ({ id: "orig" }),
                swapComponent: () => { throw makeThrown(); },
            };
            const source = {
                sourceInstance: { id: "s" },
                mainComponent: { id: "new" },
                overrides: [],
            };
            const result = await setInstanceOverrides([target], source);
            assertActionableFailure("instance_set_overrides", result, expectedText);
        });
    }
});

describe("R9: delete progress payloads use only the shared count vocabulary", () => {
    beforeEach(() => installRemedFigma());

    it("no progress payload emits successCount/failureCount; the shared succeededCount/failedCount appear", async () => {
        nodeMap.clear();
        nodeMap.set("d1", { id: "d1", name: "A", type: "FRAME", remove: () => {} });
        nodeMap.set("d2", { id: "d2", name: "B", type: "FRAME", remove: () => {} });

        const captured: any[] = [];
        (globalThis as any).figma.ui = { postMessage: (m: any) => captured.push(m) };

        await deleteMultipleNodes({ nodeIds: ["d1", "d2"] });

        const payloads = captured
            .filter(m => m && m.type === "command_progress" && m.payload)
            .map(m => m.payload);
        expect(payloads.length).toBeGreaterThan(0);
        // Red-proof of the rename: no progress payload carries the legacy
        // second vocabulary…
        for (const p of payloads) {
            expect(Object.prototype.hasOwnProperty.call(p, "successCount"), "no legacy successCount").toBe(false);
            expect(Object.prototype.hasOwnProperty.call(p, "failureCount"), "no legacy failureCount").toBe(false);
        }
        // …and the shared envelope count names do appear in the progress channel.
        expect(payloads.some(p => "succeededCount" in p && "failedCount" in p)).toBe(true);
    });
});

describe("C4/C5: instance override truthfulness and target TOCTOU", () => {
    beforeEach(() => installRemedFigma());

    it("C4: an unresolved override descendant fails the instance (not silent success)", async () => {
        const target: any = {
            id: "t1", name: "T1",
            getMainComponentAsync: async () => ({ id: "orig" }),
            swapComponent: () => {},
        };
        const source = {
            sourceInstance: { id: "src" }, mainComponent: { id: "new" },
            overrides: [{ id: "src/child", overriddenFields: ["characters"] }],
        };
        // The mapped override node (t1/child) is not resolvable.
        (globalThis as any).figma.getNodeByIdAsync = async () => null;

        const res = await setInstanceOverrides([target], source);
        expect(res.success).toBe(false);
        expect(res.status).toBe("failed");
        expect(res.results[0].error).toContain("not found");
        // the swap already happened → disclosed
        expect(res.results[0].partialMutation).toBe(true);
    });

    it("C4: a requested field that no branch can apply fails the instance", async () => {
        const target: any = {
            id: "t1", name: "T1",
            getMainComponentAsync: async () => ({ id: "orig" }),
            swapComponent: () => {},
        };
        const source = {
            sourceInstance: { id: "src" }, mainComponent: { id: "new" },
            overrides: [{ id: "src/child", overriddenFields: ["unsupportedField"] }],
        };
        // override node exists but has no such field; source node exists.
        const overrideNode = { id: "t1/child", type: "RECTANGLE" };
        (globalThis as any).figma.getNodeByIdAsync = async (id: string) =>
            id === "t1/child" ? overrideNode : (id === "src/child" ? { id: "src/child" } : null);

        const res = await setInstanceOverrides([target], source);
        expect(res.success).toBe(false);
        expect(res.results[0].error).toContain("could not be applied");
    });

    it("C4/R8: an earlier applied field + a later failing field disclose BOTH the swap and the applied field", async () => {
        const target: any = {
            id: "t1", name: "T1",
            getMainComponentAsync: async () => ({ id: "orig" }),
            swapComponent: () => {},
        };
        const source = {
            sourceInstance: { id: "src" }, mainComponent: { id: "new" },
            // field 1 ("characters") applies; field 2 ("bogusField") has no branch.
            overrides: [{ id: "src/child", overriddenFields: ["characters", "bogusField"] }],
        };
        let chars = "old";
        const overrideNode: any = {
            id: "t1/child", type: "TEXT", fontName: { family: "Inter", style: "Regular" },
            get characters() { return chars; }, set characters(v: string) { chars = v; },
        };
        const sourceChild = { id: "src/child", characters: "new-text" };
        (globalThis as any).figma.getNodeByIdAsync = async (id: string) =>
            id === "t1/child" ? overrideNode : (id === "src/child" ? sourceChild : null);
        (globalThis as any).figma.loadFontAsync = async () => {};

        const res = await setInstanceOverrides([target], source);
        expect(res.success).toBe(false);
        expect(res.results[0].error).toContain("could not be applied");
        // The earlier field really mutated the node.
        expect(chars).toBe("new-text");
        // C4: the failure row discloses ALL known changes — the main-component
        // swap AND the already-applied override field (red-proof of the
        // appliedFields tracking: removing it drops the "field(s) applied" half).
        expect(res.results[0].partialMutation).toBe(true);
        expect(res.results[0].whatChanged).toContain("main component swapped");
        expect(res.results[0].whatChanged).toContain("1 override field(s) applied");
        expect(res.results[0].before.mainComponentId).toBe("orig");
        expect(res.results[0].before.appliedFields).toHaveLength(1);
        expect(res.results[0].before.appliedFields[0].field).toBe("characters");
    });

    it("C5: a target that disappears on re-resolution fails the whole command", async () => {
        const { getValidTargetInstances } = await import("../../../../../figma_plugin/handlers/componentHandlers.js?remed");
        nodeMap.clear();
        // "i1" resolves; "i2" is gone on this resolution.
        nodeMap.set("i1", { id: "i1", name: "I1", type: "INSTANCE" });
        const res = await getValidTargetInstances(["i1", "i2"]);
        expect(res.success).toBe(false);
        expect(res.message).toContain("i2");
    });

    // R2 (closure audit): the use-time re-resolution must re-assert the FULL
    // prevalidation predicate set — not just existence+type (the C5 behavior).
    // Each case is a same-object TOCTOU: the ID and type are unchanged, but one
    // safety predicate drifted after prevalidation. getValidTargetInstances is
    // the last gate before execution; a failure result makes the dispatcher throw
    // before setInstanceOverrides/swapComponent runs, so no mutation occurs.
    describe("R2: re-resolution re-asserts name/lock/scope (same-object TOCTOU)", () => {
        const importGate = () => import("../../../../../figma_plugin/handlers/componentHandlers.js?remed");
        const scopeRoot = { id: "scope", type: "PAGE" };

        it("fails the whole command when the target was renamed since validation", async () => {
            const { getValidTargetInstances } = await importGate();
            nodeMap.clear();
            // Same ID, still an INSTANCE and in scope/unlocked — only the name drifted.
            nodeMap.set("t", { id: "t", name: "Changed", type: "INSTANCE", parent: scopeRoot });
            const res = await getValidTargetInstances([{ nodeId: "t", nodeName: "Original" }], scopeRoot);
            expect(res.success).toBe(false);
            expect(res.message).toContain("renamed");
        });

        it("fails the whole command when the target was locked since validation", async () => {
            const { getValidTargetInstances } = await importGate();
            nodeMap.clear();
            nodeMap.set("t", { id: "t", name: "T", type: "INSTANCE", parent: scopeRoot, locked: true });
            const res = await getValidTargetInstances([{ nodeId: "t", nodeName: "T" }], scopeRoot);
            expect(res.success).toBe(false);
            expect(res.message.toLowerCase()).toContain("locked");
        });

        it("fails the whole command when the target moved outside scope since validation", async () => {
            const { getValidTargetInstances } = await importGate();
            nodeMap.clear();
            const elsewhere = { id: "elsewhere", type: "PAGE" };
            nodeMap.set("t", { id: "t", name: "T", type: "INSTANCE", parent: elsewhere });
            const res = await getValidTargetInstances([{ nodeId: "t", nodeName: "T" }], scopeRoot);
            expect(res.success).toBe(false);
            expect(res.message).toContain("scope");
        });

        it("fails the whole command when the target became a non-INSTANCE since validation", async () => {
            const { getValidTargetInstances } = await importGate();
            nodeMap.clear();
            nodeMap.set("t", { id: "t", name: "T", type: "FRAME", parent: scopeRoot });
            const res = await getValidTargetInstances([{ nodeId: "t", nodeName: "T" }], scopeRoot);
            expect(res.success).toBe(false);
        });

        it("passes when name, lock, scope, and type are all intact", async () => {
            const { getValidTargetInstances } = await importGate();
            nodeMap.clear();
            const node = { id: "t", name: "T", type: "INSTANCE", parent: scopeRoot, locked: false };
            nodeMap.set("t", node);
            const res = await getValidTargetInstances([{ nodeId: "t", nodeName: "T" }], scopeRoot);
            expect(res.success).toBe(true);
            expect(res.targetInstances).toEqual([node]);
        });
    });
});
