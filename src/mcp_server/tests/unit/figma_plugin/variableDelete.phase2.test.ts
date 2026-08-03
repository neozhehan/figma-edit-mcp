import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deleteVariables } from "../../../../../figma_plugin/handlers/variableHandlers.js";
import * as progressUtils from "../../../../../figma_plugin/utils/progressUtils.js";

/**
 * Change 8 (C1): the in-use outcome is a coded D9 refusal now, not a non-error
 * result carrying a bare `error` string, so it is THROWN. Capturing it keeps
 * these regressions focused on the consumer-detection semantics they exist to
 * pin, while asserting the coded envelope once here.
 */
async function captureInUseRefusal(call: Promise<any>) {
    let thrown: any;
    try {
        await call;
    } catch (error: any) {
        thrown = error;
    }
    expect(thrown, "an in-use delete must refuse").toBeDefined();
    expect(thrown.code).toBe("VARIABLE_IN_USE");
    expect(thrown.details.variablesInUse).toBeDefined();
    return { success: false, error: thrown.message, variablesInUse: thrown.details.variablesInUse };
}




describe("Phase 2: variable_delete WS-link stall and concurrency", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(progressUtils, "sendProgressUpdate").mockResolvedValue(undefined);
        
        // Setup Figma global mock
        global.figma = {
            root: { children: [] },
            variables: {
                getVariableByIdAsync: vi.fn(),
                getVariableCollectionByIdAsync: vi.fn(),
                getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
            },
            getLocalPaintStylesAsync: vi.fn().mockResolvedValue([]),
            getLocalTextStylesAsync: vi.fn().mockResolvedValue([]),
            getLocalEffectStylesAsync: vi.fn().mockResolvedValue([]),
            getLocalGridStylesAsync: vi.fn().mockResolvedValue([]),
        } as any;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function createMockNode(id: string, name: string, type: string, children: any[] = [], boundVariables?: any) {
        return {
            id, name, type, children, boundVariables,
            loadAsync: vi.fn().mockResolvedValue(undefined)
        };
    }

    it("Heartbeat fires from within the walk on a single-page fixture that exceeds the time budget", async () => {
        // Create a deep/large node structure that takes time to walk
        // To simulate time passing during the walk, we intercept loadAsync or just rely on the count fallback
        // The time budget yields every 50ms OR 500 nodes.
        // We will create 1500 nodes to trigger the node-count fallback, which yields and checks time.
        
        const children = [];
        for (let i = 0; i < 1500; i++) {
            children.push(createMockNode(`child-${i}`, `Child ${i}`, "RECTANGLE"));
        }
        const page = createMockNode("page-1", "Page 1", "PAGE", children);
        global.figma.root.children = [page];

        const variable = { id: "var-1", name: "Var1", remove: vi.fn() };
        (global.figma.variables.getVariableByIdAsync as any).mockResolvedValue(variable);

        const deletePromise = deleteVariables({
            variableIds: ["var-1"],
            variableNames: ["Var1"],
            commandId: "cmd-123"
        });

        // Use a Date.now() mock to simulate time passing during the walk.
        // It's called for lastYield initialization, lastHeartbeat initialization, and then multiple times during the walk.
        let time = 1000000;
        vi.spyOn(Date, "now").mockImplementation(() => {
            time += 50; // Every time Date.now() is called, advance by 50ms.
            return time;
        });

        const result = await deletePromise;
        expect(result.success).toBe(true);
        expect(variable.remove).toHaveBeenCalled();

        // Heartbeat should have fired at least once due to the throttle + node count yielding
        expect(progressUtils.sendProgressUpdate).toHaveBeenCalled();
        const call = (progressUtils.sendProgressUpdate as any).mock.calls[0];
        expect(call[0]).toBe("cmd-123");
        expect(call[1]).toBe("variable_delete");
        expect(call[2]).toBe("in_progress");
        expect(call[3]).toBe(50); // Indeterminate progress
    });

    it("nodeConsumerMap merges to the same result with concurrent promises as the prior sequential scan", async () => {
        // Create 3 pages with consumers
        const page1 = createMockNode("page-1", "Page 1", "PAGE", [
            createMockNode("node-1", "Node 1", "RECTANGLE", [], { fills: [{ id: "var-1" }] })
        ]);
        const page2 = createMockNode("page-2", "Page 2", "PAGE", [
            createMockNode("node-2", "Node 2", "TEXT", [], { characters: { id: "var-1" } })
        ]);
        const page3 = createMockNode("page-3", "Page 3", "PAGE", [
            createMockNode("node-3", "Node 3", "FRAME", [], { strokes: [{ id: "var-2" }] }) // Different variable
        ]);
        global.figma.root.children = [page1, page2, page3];

        const var1 = { id: "var-1", name: "Var1", remove: vi.fn() };
        (global.figma.variables.getVariableByIdAsync as any).mockResolvedValue(var1);

        const result = await captureInUseRefusal(deleteVariables({
            variableIds: ["var-1"],
            variableNames: ["Var1"]
        }));

        // var-1 has consumers in page-1 and page-2, so deletion should fail and list them.
        expect(result.success).toBe(false);
        // C8-F9: each consumer line carries its ID, because layer names are not
        // unique and the listing exists to be acted on.
        expect(result.error).toContain("Node 'Node 1' (RECTANGLE, node-1) on fields: fills");
        expect(result.error).toContain("Node 'Node 2' (TEXT, node-2) on fields: characters");
        expect(result.error).not.toContain("Node 3");

        // The pages should have been loaded concurrently.
        // We verify that all page loadAsync calls were made
        expect(page1.loadAsync).toHaveBeenCalled();
        expect(page2.loadAsync).toHaveBeenCalled();
        expect(page3.loadAsync).toHaveBeenCalled();
    });

    it("Semantics regression: in-use rejection error and collection-mode alias filtering", async () => {
        // Collection-mode alias filtering
        // If a variable is aliased by another variable IN THE SAME COLLECTION, it shouldn't block deletion of the collection.

        const var1 = { id: "var-1", name: "Var1", remove: vi.fn() };
        const var2 = { id: "var-2", name: "Var2", remove: vi.fn() }; // var-2 aliases var-1
        
        const collection = {
            id: "col-1",
            name: "Col1",
            variableIds: ["var-1", "var-2"],
            remove: vi.fn()
        };

        (global.figma.variables.getVariableCollectionByIdAsync as any).mockResolvedValue(collection);
        (global.figma.variables.getVariableByIdAsync as any).mockImplementation((id: string) => {
            if (id === "var-1") return var1;
            if (id === "var-2") return var2;
            return null;
        });

        // Make var-2 an alias of var-1
        (global.figma.variables.getLocalVariablesAsync as any).mockResolvedValue([
            {
                id: "var-1", name: "Var1", resolvedType: "COLOR",
                valuesByMode: { "mode-1": { r: 1, g: 0, b: 0 } }
            },
            {
                id: "var-2", name: "Var2", resolvedType: "COLOR",
                valuesByMode: { "mode-1": { type: "VARIABLE_ALIAS", id: "var-1" } }
            }
        ]);

        const result = await deleteVariables({
            collectionId: "col-1",
            collectionName: "Col1"
        });

        // Deletion should succeed because the only consumer of var-1 is var-2, which is ALSO in the collection being deleted.
        expect(result.success).toBe(true);
        expect(collection.remove).toHaveBeenCalled();
        
        // Now what if var-3 (outside collection) aliases var-1?
        const collection2 = {
            id: "col-2", name: "Col2", variableIds: ["var-1", "var-2"], remove: vi.fn()
        };
        (global.figma.variables.getVariableCollectionByIdAsync as any).mockResolvedValue(collection2);
        
        (global.figma.variables.getLocalVariablesAsync as any).mockResolvedValue([
            {
                id: "var-3", name: "Var3", resolvedType: "COLOR", // NOT in collection
                valuesByMode: { "mode-1": { type: "VARIABLE_ALIAS", id: "var-1" } }
            }
        ]);

        const result2 = await captureInUseRefusal(deleteVariables({
            collectionId: "col-2",
            collectionName: "Col2"
        }));

        expect(result2.success).toBe(false);
        expect(result2.error).toContain("Aliased by variable 'Var3'");
    });

    it("walk yields on the time budget alone (below the node-count fallback)", async () => {
        // 10 nodes — far below the 500-node fallback — so ANY yield must come from
        // the 50ms time budget, not walkCount % 500.
        const children = [];
        for (let i = 0; i < 10; i++) children.push(createMockNode(`n-${i}`, `N${i}`, "RECTANGLE"));
        global.figma.root.children = [createMockNode("page-1", "Page 1", "PAGE", children)];
        const variable = { id: "var-1", name: "Var1", remove: vi.fn() };
        (global.figma.variables.getVariableByIdAsync as any).mockResolvedValue(variable);

        // no commandId → isolate the yield behaviour from the heartbeat
        const p = deleteVariables({ variableIds: ["var-1"], variableNames: ["Var1"] });

        const setTimeoutSpy = vi.spyOn(global, "setTimeout");
        let t = 1_000_000;
        vi.spyOn(Date, "now").mockImplementation(() => { t += 60; return t; }); // >50ms per call → budget exceeded each node

        const result = await p;
        expect(result.success).toBe(true);

        // The walk ceded the event loop via setTimeout(…, 0); with <500 nodes these can
        // only be time-budget yields (the node-count fallback never triggers).
        const zeroDelayYields = setTimeoutSpy.mock.calls.filter((c: any[]) => c[1] === 0).length;
        expect(zeroDelayYields).toBeGreaterThan(0);
    });

    it("the ~1s heartbeat throttle prevents flooding on a sub-second scan", async () => {
        // 1500 nodes → the node-count fallback yields at 500/1000/1500 regardless of time.
        const children = [];
        for (let i = 0; i < 1500; i++) children.push(createMockNode(`n-${i}`, `N${i}`, "RECTANGLE"));
        global.figma.root.children = [createMockNode("page-1", "Page 1", "PAGE", children)];
        const variable = { id: "var-1", name: "Var1", remove: vi.fn() };
        (global.figma.variables.getVariableByIdAsync as any).mockResolvedValue(variable);

        const p = deleteVariables({ variableIds: ["var-1"], variableNames: ["Var1"], commandId: "cmd-x" });

        const setTimeoutSpy = vi.spyOn(global, "setTimeout");
        vi.spyOn(Date, "now").mockReturnValue(2_000_000); // constant clock = the extreme fast scan (0ms elapsed)

        const result = await p;
        expect(result.success).toBe(true);

        // Multiple node-count yields happened…
        const yields = setTimeoutSpy.mock.calls.filter((c: any[]) => c[1] === 0).length;
        expect(yields).toBeGreaterThanOrEqual(3);
        // …but with <1s elapsed the throttle gated EVERY heartbeat (without it, each yield would emit one).
        expect(progressUtils.sendProgressUpdate).not.toHaveBeenCalled();
    });

    it("handles variant COMPONENT children inside COMPONENT_SET without crashing, and detects consumer on the COMPONENT_SET", async () => {
        const variant = createMockNode("variant-1", "Variant 1", "COMPONENT");
        const componentSet = createMockNode("set-1", "Component Set 1", "COMPONENT_SET", [variant]);
        variant.parent = componentSet;

        // Mock Figma's crash behavior for reading componentPropertyDefinitions on a variant
        Object.defineProperty(variant, "componentPropertyDefinitions", {
            get: () => {
                throw new Error("in get_componentPropertyDefinitions: Can only get component property definitions of a component set or non-variant component");
            }
        });

        // Set bound variables on the Component Set
        const defs = {
            "prop-1": {
                type: "TEXT",
                defaultValue: "hello",
                boundVariables: {
                    value: { id: "var-1", type: "VARIABLE_ALIAS" }
                }
            }
        };
        Object.defineProperty(componentSet, "componentPropertyDefinitions", {
            get: () => defs
        });

        const page = createMockNode("page-1", "Page 1", "PAGE", [componentSet]);
        global.figma.root.children = [page];

        const var1 = { id: "var-1", name: "Var1", remove: vi.fn() };
        const var2 = { id: "var-2", name: "Var2", remove: vi.fn() };
        (global.figma.variables.getVariableByIdAsync as any).mockImplementation((id: string) => {
            if (id === "var-1") return var1;
            if (id === "var-2") return var2;
            return null;
        });

        // delete of in-use var-1 should fail and list componentSet as consumer, but not crash on variant
        const resultVar1 = await captureInUseRefusal(deleteVariables({
            variableIds: ["var-1"],
            variableNames: ["Var1"]
        }));
        expect(resultVar1.success).toBe(false);
        expect(resultVar1.error).toContain("Component Set 1");
        expect(resultVar1.error).toContain("componentProperty:prop-1");

        // delete of unused var-2 should succeed
        const resultVar2 = await deleteVariables({
            variableIds: ["var-2"],
            variableNames: ["Var2"]
        });
        expect(resultVar2.success).toBe(true);
        expect(var2.remove).toHaveBeenCalled();
    });
});
