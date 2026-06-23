import { describe, it, expect, beforeEach, mock } from "bun:test";

// =============================================================================
// CONTRACT-SEAM TEST — schema ↔ handler field-name contract for every tool.
//
// WHY THIS EXISTS
// The `setBoundVariable`/`node_bind_variable` bug (PRD §17), like §15/§16, was a
// schema↔handler DRIFT: the MCP tool emitted a payload whose field names did not
// match what the plugin payload-consumer read. No test caught it because the
// suite tests each half in isolation:
//   - tool-layer tests stop at `sendCommandToFigma` (plugin side mocked away)
//   - handler tests feed the handler its own internal shape (so a mismatch with
//     the *schema* shape is invisible — exactly how §16 hid)
// Nothing exercised the seam between them.
//
// WHAT THIS DOES
// For every command tool: derive a valid input from the tool's Zod schema,
// invoke the REAL tool handler to capture the exact payload it sends to the
// plugin, and assert that payload carries every key the payload-consumer reads
// (`reads`). The consumer is the dispatcher case in figma_plugin/src/main.ts —
// usually a pass-through to the named handler, occasionally a remap (e.g.
// node_delete turns `nodes` into `nodeIds` itself). `reads` is therefore the
// PAYLOAD-level contract (what the agent must send), derived from the consumer's
// source and cited per entry.
//
// This catches all three drift directions for every tool:
//   - schema renames/drops a field the consumer needs  → key missing from payload
//   - transform drops/renames a field                  → key missing from payload
//   - consumer reads a field the schema never declares  → key missing from payload
// It would have failed on §15/§16/§17 at introduction.
//
// MAINTENANCE
// `reads` mirrors the payload-consumer. If you change what a handler/dispatcher
// reads, update its `reads` here (and keep the schema in sync — that's the point).
// A coverage guard fails if a registered tool has no contract, so new tools must
// be declared.
// =============================================================================

mock.module("../../../figma-client.js", () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => { }),
}));

mock.module("../../../imageResize.js", () => ({
    resizeIfOversized: mock(async (b64: string) => ({ base64: b64 }))
}));

const { registerAllTools } = await import("../../../tools/index.js");
const { sendCommandToFigma } = await import("../../../figma-client.js");

// Capture every registered tool's schema + handler via a mock server.
type Captured = { schema: any; handler: Function };
const TOOLS: Record<string, Captured> = {};
const mockServer: any = {
    registerTool: (name: string, config: any, handler: Function) => {
        TOOLS[name] = { schema: config?.inputSchema, handler };
    },
    tool: (name: string, _d: any, _s: any, handler: Function) => {
        TOOLS[name] = { schema: undefined, handler };
    },
    prompt: () => { },
    registerPrompt: () => { },
    registerResource: () => { },
    resource: () => { },
};
registerAllTools(mockServer);

// Build a schema-valid dummy input so the tool's transform runs and emits a
// representative payload. We only assert on payload KEYS, never values, so the
// dummies just need to be type-correct enough not to crash the transform.
function dummyFor(schema: any): any {
    if (!schema) return "x";
    const def = schema._def || {};
    const t = def.type;
    if (t === "optional" || t === "nullable" || t === "default") return dummyFor(def.innerType);
    if (schema.shape || t === "object") {
        const shape = schema.shape || def.shape || {};
        const out: any = {};
        for (const k of Object.keys(shape)) out[k] = dummyFor(shape[k]);
        return out;
    }
    if (t === "array") return [dummyFor(def.element)];
    if (t === "string") return "x";
    if (t === "number") return 1;
    if (t === "boolean") return true;
    if (t === "enum") return Object.values(def.entries ?? {})[0] ?? "x";
    if (t === "literal") return Array.isArray(def.values) ? def.values[0] : def.values;
    if (t === "union") return dummyFor((def.options ?? [])[0]);
    if (t === "record") return { __k: dummyFor(def.valueType) };
    return "x";
}

type Contract = {
    reads: string[];                       // top-level payload keys the consumer needs
    readsOneOf?: string[][];               // list of mutually exclusive keys, at least one must be present
    item?: { key: string; reads: string[] }; // for array-wrapped payloads
    skip?: string;                          // known-failing (cite the PRD section)
};

// Tools not part of the command→consumer seam.
const EXCLUDED = new Set<string>([
    "channel_join", // handshake: sends get_connect_payload; covered by connectHandlers.test.ts
]);

const CONTRACTS: Record<string, Contract> = {
    // ---- page ----
    page_info: { reads: ["pageIds"] },                                   // getPagesInfo
    // ---- node ----
    node_info: { reads: ["nodeIds", "properties"] },                    // getNodesInfo (input unified on `properties`)
    node_transform: { reads: ["nodeId"] },                              // transformNode
    node_rename: { reads: ["nodeId", "name"] },                         // setNodeName
    node_delete: { reads: ["nodes"], item: { key: "nodes", reads: ["nodeId", "nodeName"] } }, // dispatcher reads params.nodes[]
    node_clone: { reads: ["nodeId"] },                                  // cloneNode
    view_navigate: { reads: ["ids"] },                                  // viewNavigate
    node_group: { reads: ["nodes"], item: { key: "nodes", reads: ["nodeId", "nodeName"] } }, // dispatcher reads params.nodes[]
    node_ungroup: { reads: ["nodeId"] },                               // ungroupNodes
    node_flatten: { reads: ["nodeId"] },                               // flattenNode
    node_insert_child: { reads: ["parentId", "childId"] },             // insertChild
    node_set_auto_layout: { reads: ["nodeId"] },                       // setAutoLayout
    node_set_fill: { reads: ["nodeId"], readsOneOf: [["color", "image"]] },                     // setFillColor (transform builds color or forwards image)
    node_set_stroke: { reads: ["nodeId", "color"] },                   // setStroke (transform builds color)
    node_set_corner_radius: { reads: ["nodeId", "radius"] },           // setCornerRadius
    node_set_effects: { reads: ["nodeId", "effects"] },                // setEffects
    node_apply_style: { reads: ["nodeId", "styleId", "styleType"] },   // applyStyle
    node_bind_variable: { reads: ["nodeId", "bindVariables", "explicitVariableModes"] }, // setBoundVariable (§17 fix)
    node_export_visual: { reads: ["nodeId"] },                         // exportNodeAsImage
    // ---- create ----
    create_shape: { reads: ["type"] },                                 // createShape
    create_frame: { reads: ["parentId"] },                             // createFrame
    create_text: { reads: ["text", "parentId"] },                      // createText (reads `text`)
    create_svg: { reads: ["parentId", "svg"] },                        // createNodeFromSvg
    create_component: { reads: ["nodeId"] },                           // createComponent
    create_instance: { reads: ["parentId"] },                          // createInstance
    create_component_set: { reads: ["components", "properties", "componentSetName"] }, // createComponentSet
    create_connection: { reads: ["connections", "connectorId", "checkDefault"] },     // createConnections (transform builds checkDefault)
    // ---- style ----
    style_list: { reads: [] },                                          // getStyles (no params)
    style_manage: { reads: ["type", "name"] },                         // createStyle
    style_delete: { reads: ["styleId", "styleName"] },                 // deleteStyle
    // ---- text ----
    text_set_content: { reads: ["text"], item: { key: "text", reads: ["nodeId", "characters"] } },
    text_set_style: { reads: ["nodeId", "fontName", "fontSize", "lineHeight", "letterSpacing", "paragraphIndent", "paragraphSpacing", "textCase", "textDecoration", "textAlignHorizontal", "textAlignVertical"] },
    // ---- component ----
    component_list: { reads: [] },                                     // getComponents (all optional)
    component_manage_property: { reads: ["nodeId", "action", "propertyName"] }, // manageComponentProperty
    component_delete_property: { reads: ["nodeId", "propertyName"] },  // deleteComponentProperty
    // ---- instance ----
    instance_set_property: { reads: ["nodeId", "propertyName", "value"] },  // setComponentInstanceProperty
    instance_get_overrides: { reads: ["instanceNodeId"] },                 // dispatcher reads instanceNodeId (tool maps nodeId→instanceNodeId)
    instance_set_overrides: { reads: ["sourceInstanceId", "targetNodes"], item: { key: "targetNodes", reads: ["nodeId"] } }, // dispatcher
    // ---- reaction ----
    reaction_list: { reads: ["nodeIds"] },                            // getReactions(params.nodeIds)
    reaction_update: { reads: ["nodeId", "reactions"] },              // updateReactions
    // ---- variable ----
    variable_list: { reads: [] },                                     // getVariables (all optional)
    variable_manage: { reads: ["action"] },                           // handleVariableRequest
    variable_delete: { reads: ["variableIds", "collectionId"] },      // deleteVariables
    // ---- annotation ----
    annotation_list: { reads: [] },                                   // getAnnotations (nodeId|pageId both optional)
    annotation_set: { reads: ["annotations"], item: { key: "annotations", reads: ["nodeId"] } }, // setMultipleAnnotations (per-item)
};

async function capturePayload(name: string): Promise<any> {
    (sendCommandToFigma as any).mockClear();
    const input = dummyFor(TOOLS[name].schema);
    try {
        await TOOLS[name].handler(input);
    } catch {
        // Tool may throw after sendCommandToFigma (post-processing of our {} mock
        // result); the payload is already captured below.
    }
    const calls = (sendCommandToFigma as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0); // the tool actually dispatched a command
    return calls[calls.length - 1][1];
}

describe("Contract seam: registry coverage", () => {
    it("every registered command tool has a contract (or is explicitly excluded)", () => {
        const missing = Object.keys(TOOLS).filter(
            (n) => !EXCLUDED.has(n) && !(n in CONTRACTS),
        );
        expect(missing).toEqual([]);
    });

    it("every contract maps to a registered tool", () => {
        const stale = Object.keys(CONTRACTS).filter((n) => !(n in TOOLS));
        expect(stale).toEqual([]);
    });
});

describe("Contract seam: tool payload carries every key its consumer reads", () => {
    for (const [name, contract] of Object.entries(CONTRACTS)) {
        if (contract.skip) {
            it.skip(`${name} — KNOWN FAILING (${contract.skip})`, () => { });
            continue;
        }
        it(`${name}`, async () => {
            const payload = await capturePayload(name);
            for (const key of contract.reads) {
                expect(payload).toHaveProperty(key);
            }
            if (contract.readsOneOf) {
                for (const options of contract.readsOneOf) {
                    const hasOne = options.some(k => k in payload);
                    expect(hasOne).toBe(true);
                }
            }
            if (contract.item) {
                const arr = payload[contract.item.key];
                expect(Array.isArray(arr)).toBe(true);
                expect(arr.length).toBeGreaterThan(0);
                for (const key of contract.item.reads) {
                    expect(arr[0]).toHaveProperty(key);
                }
            }
        });
    }
});
