import { describe, it, expect, beforeEach } from "bun:test";

// =============================================================================
// §14 — Per-asset edit permissions: the full 8-cell matrix (PRD §14, D4/D5).
//
// Three independent permission axes, exercised through the REAL dispatcher in
// main.ts (not handler-direct), so the gating logic itself is under test:
//   - allowEditNode      (the scope link)  → gates node writes  (READ_ONLY_MODE)
//   - allowEditVariable  (checkbox)         → gates variable_*   (VARIABLE_EDITS_DISABLED)
//   - allowEditStyle     (checkbox)         → gates style_*      (STYLE_EDITS_DISABLED)
//
// Verifies for every combination:
//   • node writes blocked  ⇔ !allowEditNode      (regardless of asset flags)
//   • variable_* blocked   ⇔ !allowEditVariable  (regardless of node/style flags)
//   • style_* blocked      ⇔ !allowEditStyle     (regardless of node/variable flags)
//   • reads (style_list / variable_list) succeed under every combo (D5)
//
// Harness mirrors componentHandlers.test.ts "Security Gates via main.ts routing":
// main.ts assigns figma.ui.onmessage at module load and reads the `figma` global
// at call time, so we install our gate figma BEFORE importing it. The
// `?scope=permissionMatrix` query forces a fresh main.ts module instance (its own
// `state`), isolated from the other suites that also import main.ts.
//
// NOTE (Phase 3): the matrix's "remote guard (§7) still wins" cell is deferred —
// the §7 remote-asset guard is implemented in Phase 3. Add that cell here once §7
// lands (enabling allowEditVariable/allowEditStyle must still fail to edit a
// *remote* variable/style).
// =============================================================================

const gateNodeMap = new Map<string, any>();
const gatePendingPromises = new Map<string | number, (msg: any) => void>();

function makeGateFigma() {
    return {
        showUI: () => { },
        ui: {
            onmessage: null as any,
            postMessage: (msg: any) => {
                const resolver = gatePendingPromises.get(msg.id);
                if (resolver) {
                    resolver(msg);
                    gatePendingPromises.delete(msg.id);
                }
            },
        },
        on: () => { },
        notify: () => { },
        closePlugin: () => { },
        clientStorage: { setAsync: async () => { } },
        getNodeByIdAsync: async (id: string) => gateNodeMap.get(id) || null,
        currentPage: { selection: [], children: [] },
        root: { children: [] },
        mixed: Symbol("mixed"),
        loadAllPagesAsync: async () => { },
        // Reads exercised below — return empty sets so the handlers succeed.
        getLocalPaintStylesAsync: async () => [],
        getLocalTextStylesAsync: async () => [],
        getLocalEffectStylesAsync: async () => [],
        getLocalGridStylesAsync: async () => [],
        variables: {
            getLocalVariableCollectionsAsync: async () => [],
            getLocalVariablesAsync: async () => [],
        },
    };
}

const gateFigma = makeGateFigma();
(globalThis as any).__html__ = "<html></html>";
(globalThis as any).figma = gateFigma;

await import("../../../../../figma_plugin/src/main.js?scope=permissionMatrix");
const gateOnMessage = gateFigma.ui.onmessage as (msg: any) => Promise<void> | void;

function executeCommand(command: string, params: any): Promise<any> {
    const id = `cmd-${Math.random()}`;
    return new Promise<any>((resolve) => {
        gatePendingPromises.set(id, resolve);
        void Promise.resolve(gateOnMessage({ type: "execute-command", command, params, id }));
    });
}

// Connect with a given permission combination via the set-scope handshake.
// nodeLink=true → scopeNodeId set → allowEditNode becomes truthy ("node").
async function connectWith(nodeLink: boolean, allowEditVariable: boolean, allowEditStyle: boolean) {
    if (nodeLink) {
        await gateOnMessage({
            type: "set-scope",
            scopeNodeId: "scope-1",
            scopeNodeType: "FRAME",
            allowEditVariable,
            allowEditStyle,
        });
    } else {
        await gateOnMessage({ type: "set-scope", allowEditVariable, allowEditStyle });
    }
}

const READ_ONLY = "Read-Only Mode";
const VARIABLE_DISABLED = "Variable editing is disabled";
const STYLE_DISABLED = "Style editing is disabled";

function expectGateBlocked(result: any, permString: string) {
    expect(result.type).toBe("command-error");
    expect(result.error.message).toContain(permString);
}

// The gate opened if the command did NOT fail with the permission error. It may
// still fail downstream (out-of-scope, missing node, handler validation) — that
// proves the permission check passed, which is all this matrix asserts.
function expectGateOpen(result: any, permString: string) {
    if (result.type === "command-error") {
        expect(result.error.message).not.toContain(permString);
    }
    // command-result ⇒ gate definitively opened.
}

describe("§14 Per-asset permission matrix (via main.ts routing)", () => {
    beforeEach(() => {
        (globalThis as any).figma = gateFigma;
        gateNodeMap.clear();
        gatePendingPromises.clear();
        // A resolvable scope root so node-link checkScopeAccess doesn't trip on a
        // missing scope (keeps the node-write gate the only thing under test).
        gateNodeMap.set("scope-1", { id: "scope-1", name: "Scope", parent: null });
    });

    // All 8 combinations of (nodeLink, allowEditVariable, allowEditStyle).
    const combos: Array<{ nodeLink: boolean; v: boolean; s: boolean }> = [];
    for (const nodeLink of [false, true]) {
        for (const v of [false, true]) {
            for (const s of [false, true]) {
                combos.push({ nodeLink, v, s });
            }
        }
    }

    for (const { nodeLink, v, s } of combos) {
        const label = `node=${nodeLink ? "link" : "none"} variable=${v ? "on" : "off"} style=${s ? "on" : "off"}`;

        describe(`combo: ${label}`, () => {
            beforeEach(async () => {
                await connectWith(nodeLink, v, s);
            });

            it("node write follows allowEditNode (independent of asset flags)", async () => {
                const result = await executeCommand("node_set_fill", {
                    nodeId: "target-1",
                    nodeName: "Target",
                    fillColor: { r: 1, g: 0, b: 0, a: 1 },
                });
                if (nodeLink) {
                    expectGateOpen(result, READ_ONLY);
                } else {
                    expectGateBlocked(result, READ_ONLY);
                }
            });

            it("variable write follows allowEditVariable (independent of node/style)", async () => {
                const result = await executeCommand("variable_manage", {
                    action: "CREATE_COLLECTION",
                    name: "Colors",
                });
                if (v) {
                    expectGateOpen(result, VARIABLE_DISABLED);
                } else {
                    expectGateBlocked(result, VARIABLE_DISABLED);
                }
            });

            it("style write follows allowEditStyle (independent of node/variable)", async () => {
                const result = await executeCommand("style_manage", {
                    styleType: "PAINT",
                    name: "Brand",
                });
                if (s) {
                    expectGateOpen(result, STYLE_DISABLED);
                } else {
                    expectGateBlocked(result, STYLE_DISABLED);
                }
            });

            it("reads are never gated (D5): style_list and variable_list succeed", async () => {
                const styles = await executeCommand("style_list", {});
                expect(styles.type).toBe("command-result");

                const variables = await executeCommand("variable_list", {});
                expect(variables.type).toBe("command-result");
            });
        });
    }

    // D5, node-read side: a node read is never gated even when nodes are read-only.
    it("node read (node_info empty-args) is not gated when allowEditNode is false", async () => {
        await connectWith(false, false, false);
        const result = await executeCommand("node_info", {});
        expect(result.type).toBe("command-result");
        expect(result.result).toEqual({ nodes: [] });
    });
});
