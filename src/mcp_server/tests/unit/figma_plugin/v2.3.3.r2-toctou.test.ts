import { describe, it, expect, beforeEach } from "bun:test";

/**
 * R2 (2026-07-25 second recheck) — END-TO-END dispatcher TOCTOU proof.
 *
 * The first R2 remediation added a predicate re-check inside
 * `getValidTargetInstances`, but that gate was still followed by awaited work
 * (`getSourceInstanceData`, and each target's `getMainComponentAsync()`) before
 * `swapComponent()`. Every `await` is an event-loop yield in which a shared
 * document can change the very target that just passed validation.
 *
 * These tests drive the REAL dispatcher and introduce same-object drift inside
 * those awaited windows — the exact intervals the helper-level matrix cannot
 * reach, because it calls the helper on objects that have already drifted.
 * Safety-drift/capture failures assert a command error and zero swaps; the
 * partial-mutation regression asserts that the captured main-component before
 * value is the one observed immediately before the swap.
 */

const nodeMap = new Map<string, any>();
let swapCount = 0;

const gateFigma: any = {
    showUI: () => { },
    ui: {
        postMessage: (msg: any) => {
            const resolver = pending.get(msg.id);
            if (resolver) {
                resolver(msg);
                pending.delete(msg.id);
            }
        },
    },
    on: () => { },
    notify: () => { },
    closePlugin: () => { },
    clientStorage: { setAsync: async () => { } },
    getNodeByIdAsync: async (id: string) => nodeMap.get(id) || null,
    root: { id: "doc", name: "Doc", children: [] as any[] },
    mixed: Symbol("mixed"),
    loadFontAsync: async () => { },
};

const pending = new Map<string, (val: any) => void>();

(globalThis as any).__html__ = "<html></html>";
(globalThis as any).figma = gateFigma;

const mainMod: any = await import("../../../../../figma_plugin/src/main.js?scope=r2toctou");
const pluginState = mainMod.getPluginState();
const onMessage = gateFigma.ui.onmessage as (msg: any) => Promise<void> | void;

async function sendCommand(command: string, params: any) {
    const msg = { type: "execute-command", command, id: Math.random().toString(), params };
    const resultPromise = new Promise<any>((resolve) => pending.set(msg.id, resolve));
    await onMessage!(msg);
    return await resultPromise;
}

/** Scope root, source instance, and N target instances that all pass validation. */
function setupEnvironment(targetCount = 1) {
    nodeMap.clear();
    swapCount = 0;

    const scopeRoot: any = {
        id: "scope-root", name: "Scope Root", type: "FRAME",
        parent: null, children: [], removed: false,
    };

    const sourceInstance: any = {
        id: "src", name: "Source", type: "INSTANCE", parent: scopeRoot,
        overrides: [],
        getMainComponentAsync: async () => ({ id: "main-new" }),
    };
    scopeRoot.children.push(sourceInstance);
    nodeMap.set("src", sourceInstance);

    const targets: any[] = [];
    for (let i = 1; i <= targetCount; i++) {
        const t: any = {
            id: `t${i}`, name: `T${i}`, type: "INSTANCE", parent: scopeRoot, locked: false,
            removed: false,
            getMainComponentAsync: async () => ({ id: `main-orig-${i}` }),
            swapComponent: () => { swapCount++; },
        };
        scopeRoot.children.push(t);
        nodeMap.set(t.id, t);
        targets.push(t);
    }

    nodeMap.set("scope-root", scopeRoot);
    return { scopeRoot, sourceInstance, targets };
}

const requestFor = (targets: any[]) => targets.map(t => ({ nodeId: t.id, nodeName: t.name }));

describe("R2 end-to-end: same-object drift inside awaited windows never reaches swapComponent()", () => {
    beforeEach(() => {
        pluginState.allowEditNode = "node";
        pluginState.scopeRootId = "scope-root";
    });

    it("baseline: with no drift the command succeeds and swaps exactly once", async () => {
        const { targets } = setupEnvironment(1);
        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-result");
        expect(swapCount).toBe(1); // the gate does not over-reject
    });

    it("drift during SOURCE resolution (rename+lock+scope-move) fails with zero swaps", async () => {
        const { sourceInstance, targets } = setupEnvironment(1);
        const target = targets[0];
        // The source's getMainComponentAsync is awaited by getSourceInstanceData
        // — mutate the target inside that window. Same object, same id, still
        // an INSTANCE; only the safety predicates drift.
        sourceInstance.getMainComponentAsync = async () => {
            target.name = "Renamed";
            target.locked = true;
            target.parent = { id: "elsewhere", name: "Elsewhere", type: "FRAME", parent: null };
            return { id: "main-new" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-error");
        expect(swapCount).toBe(0);
    });

    it("drift during the TARGET's getMainComponentAsync fails with zero swaps", async () => {
        const { targets } = setupEnvironment(1);
        const target = targets[0];
        // This await sits between the gate and swapComponent() in the original
        // code — the window the hoist + post-hoist re-assert closes.
        target.getMainComponentAsync = async () => {
            target.name = "Renamed mid-flight";
            return { id: "main-orig-1" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-error");
        expect(swapCount).toBe(0);
    });

    it("a target that becomes locked during the target await fails with zero swaps", async () => {
        const { targets } = setupEnvironment(1);
        const target = targets[0];
        target.getMainComponentAsync = async () => {
            target.locked = true;
            return { id: "main-orig-1" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-error");
        expect(swapCount).toBe(0);
    });

    it("a target removed during its awaited main-component read fails with zero swaps", async () => {
        const { targets } = setupEnvironment(1);
        const target = targets[0];
        target.getMainComponentAsync = async () => {
            target.removed = true;
            return { id: "main-orig-1" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("removed since validation");
        expect(swapCount).toBe(0);
    });

    it("a scope root removed during a target await fails with zero swaps", async () => {
        const { scopeRoot, targets } = setupEnvironment(1);
        targets[0].getMainComponentAsync = async () => {
            scopeRoot.removed = true;
            return { id: "main-orig-1" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("editable scope root");
        expect(swapCount).toBe(0);
    });

    it("an original-main capture error fails before any swap", async () => {
        const { targets } = setupEnvironment(1);
        targets[0].getMainComponentAsync = async () => {
            throw new Error("main-component read failed");
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("Failed to capture the original main component");
        expect(res.error.message).toContain("main-component read failed");
        expect(swapCount).toBe(0);
    });

    it("a null original-main capture fails before any swap", async () => {
        const { targets } = setupEnvironment(1);
        targets[0].getMainComponentAsync = async () => null;

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-error");
        expect(res.error.message).toContain("no main component was returned");
        expect(swapCount).toBe(0);
    });

    it("identity drift (resolver returns a different node id) fails with zero swaps", async () => {
        const { targets, scopeRoot } = setupEnvironment(1);
        const request = requestFor(targets);
        let lookups = 0;
        // First lookup (dispatcher prevalidation) returns the real target; the
        // re-resolution returns a DIFFERENT node that would otherwise satisfy
        // every predicate — only the id betrays it.
        const impostor: any = {
            id: "impostor", name: "T1", type: "INSTANCE", parent: scopeRoot, locked: false,
            getMainComponentAsync: async () => ({ id: "x" }),
            swapComponent: () => { swapCount++; },
        };
        gateFigma.getNodeByIdAsync = async (id: string) => {
            if (id === "t1") {
                lookups++;
                return lookups === 1 ? nodeMap.get("t1") : impostor;
            }
            return nodeMap.get(id) || null;
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: request,
        });
        expect(res.type).toBe("command-error");
        expect(swapCount).toBe(0);
        gateFigma.getNodeByIdAsync = async (id: string) => nodeMap.get(id) || null;
    });

    it("multi-target: drift on a LATER target during an earlier target's await blocks ALL swaps", async () => {
        const { targets } = setupEnvironment(3);
        // Target 1's awaited main-component read drifts target 3. Because every
        // target is revalidated after the hoisted awaits and before the first
        // mutation, no swap may occur at all — not even for the intact targets.
        targets[0].getMainComponentAsync = async () => {
            targets[2].name = "Renamed later target";
            return { id: "main-orig-1" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(res.type).toBe("command-error");
        expect(swapCount).toBe(0); // every validatable target is checked before ANY swap
    });

    it("multi-target: later-target drift during target 1's authoritative read blocks the first swap", async () => {
        const { targets } = setupEnvironment(3);
        let targetOneReads = 0;
        targets[0].getMainComponentAsync = async () => {
            targetOneReads++;
            // Read 1 is the batch-wide preflight. Drift only during read 2, the
            // authoritative use-time capture after that preflight passed.
            if (targetOneReads === 2) {
                targets[2].name = "Renamed during authoritative capture";
            }
            return { id: "main-orig-1" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });
        expect(targetOneReads).toBe(2);
        expect(res.type).toBe("command-error");
        expect(swapCount).toBe(0);
    });

    it("multi-target: later-target removal after an earlier swap becomes a truthful failure row", async () => {
        const { targets } = setupEnvironment(2);
        let laterReads = 0;
        targets[1].getMainComponentAsync = async () => {
            laterReads++;
            // Read 1 is batch preflight. Read 2 is the later target's
            // authoritative capture, after target 1 has already swapped.
            if (laterReads === 2) targets[1].removed = true;
            return { id: "main-orig-2" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });

        expect(res.type).toBe("command-result");
        expect(swapCount).toBe(1);
        expect(res.result.status).toBe("partial_success");
        expect(res.result.results).toHaveLength(2);
        expect(res.result.results[0].status).toBe("success");
        expect(res.result.results[1].status).toBe("failed");
        expect(res.result.results[1].error).toContain("removed since validation");
    });

    it("multi-target: a later target's await cannot stale an earlier target's before.mainComponentId", async () => {
        const { sourceInstance, targets } = setupEnvironment(2);
        const mainA = { id: "main-A" };
        const mainB = { id: "main-B" };
        let targetOneMain = mainA;
        let beforeAtSwap: string | null = null;

        sourceInstance.overrides = [{
            id: "src/child",
            overriddenFields: ["characters"],
        }];
        targets[0].getMainComponentAsync = async () => targetOneMain;
        targets[0].swapComponent = (component: any) => {
            beforeAtSwap = targetOneMain.id;
            targetOneMain = component;
            swapCount++;
        };
        // During the batch-wide preflight, this later target's await changes the
        // earlier target after its first read. The per-target authoritative read
        // must observe main-B immediately before the swap.
        targets[1].getMainComponentAsync = async () => {
            targetOneMain = mainB;
            return { id: "main-orig-2" };
        };

        const res = await sendCommand("instance_set_overrides", {
            sourceInstanceId: "src",
            targetNodes: requestFor(targets),
        });

        expect(res.type).toBe("command-result");
        expect(swapCount).toBe(1);
        expect(beforeAtSwap).toBe("main-B");
        expect(res.result.results[0].status).toBe("failed");
        expect(res.result.results[0].partialMutation).toBe(true);
        expect(res.result.results[0].before).toEqual({ mainComponentId: "main-B" });
    });
});
