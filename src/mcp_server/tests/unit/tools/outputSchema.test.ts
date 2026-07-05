import { describe, it, expect, mock } from "bun:test";

mock.module("../../../figma-client.js", () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => { }),
}));

mock.module("../../../imageResize.js", () => ({
    resizeIfOversized: mock(async (b64: string) => ({ base64: b64 }))
}));

const { registerAllTools } = await import("../../../tools/index.js");
const { toJsonSchemaCompat } = await import("@modelcontextprotocol/sdk/server/zod-json-schema-compat.js");
const { AjvJsonSchemaValidator } = await import("@modelcontextprotocol/sdk/validation/ajv-provider.js");

// Capture every registered tool's schema
const TOOLS: Record<string, any> = {};
const mockServer: any = {
    registerTool: (name: string, config: any, handler: Function) => {
        TOOLS[name] = config?.outputSchema;
    },
    tool: (name: string, _d: any, _s: any, handler: Function) => {
        // Ignored or handle differently
    },
    prompt: () => { },
    registerPrompt: () => { },
    registerResource: () => { },
    resource: () => { },
};
registerAllTools(mockServer);

// Validation runs at BOTH seams the SDK enforces:
//  - server side: zod safeParse of structuredContent (strip mode — catches
//    missing required fields and type mismatches);
//  - client side: Ajv against the JSON Schema the server advertises via
//    tools/list (toJsonSchemaCompat) — the layer that produced the live §6
//    `-32602` failure.
// The extra-key probe pins the _result.ts loose convention: a dependency
// change that reintroduces `additionalProperties: false` in the advertised
// schema (the zod-v3-era conversion behavior) must fail here, not live.
const ajv = new AjvJsonSchemaValidator();

function assertPayloadValidates(name: string, schema: any, payload: any) {
    const zodRes = schema.safeParse(payload);
    if (!zodRes.success) {
        console.error(`zod validation failed for ${name}:`, zodRes.error.format());
    }
    expect(zodRes.success).toBe(true);

    const advertised = toJsonSchemaCompat(schema, { target: "draft-7" });
    const clientValidate = ajv.getValidator(advertised);

    const clientRes = clientValidate(payload);
    if (!clientRes.valid) {
        console.error(`Ajv validation failed for ${name}:`, clientRes.errorMessage);
    }
    expect(clientRes.valid).toBe(true);

    const probeRes = clientValidate({ ...payload, __undeclaredDocumentDependentField: "probe" });
    if (!probeRes.valid) {
        console.error(`Advertised schema for ${name} rejects extra keys (violates the _result.ts loose convention):`, probeRes.errorMessage);
    }
    expect(probeRes.valid).toBe(true);

    // Tolerance must be DECLARED (looseOutput/catchall), not inherited from a
    // converter default: older bundled SDKs emit `additionalProperties: false`
    // for a plain z.object, which live-reproduced the §6 rejection even after
    // the zod-v4 upgrade made plain objects tolerant under the dev converter.
    expect((advertised as any).additionalProperties).toBeDefined();
    expect((advertised as any).additionalProperties).not.toBe(false);
}

describe("Phase 4: outputSchema Validation Tests", () => {
    describe("channel_join output schema validation", () => {
        const schema = TOOLS["channel_join"];

        it("validates successful page-mode connects", () => {
            assertPayloadValidates("channel_join(page)", schema, {
                status: "success",
                channel: "my-channel",
                allowEditNode: "page",
                allowEditVariable: true,
                allowEditStyle: true,
                editableScopeType: "page",
                scopeRootId: "1:2",
                documentId: "doc-1",
                documentName: "My Doc",
                pageCount: 3,
                pages: [
                    {
                        pageId: "1:2",
                        pageName: "Page 1",
                        descendantCount: 42,
                        children: [
                            { id: "1:3", name: "Frame", type: "FRAME" }
                        ]
                    }
                ]
            });
        });

        it("validates successful node-mode connects", () => {
            assertPayloadValidates("channel_join(node)", schema, {
                status: "success",
                channel: "my-channel",
                allowEditNode: "node",
                allowEditVariable: false,
                allowEditStyle: false,
                editableScopeType: "node",
                scopeRootId: "1:4",
                documentId: "doc-1",
                documentName: "My Doc",
                node: {
                    nodeId: "1:4",
                    nodeName: "My Frame",
                    type: "FRAME",
                    path: [["PAGE", "0:1", "Page 1"]],
                    descendantCount: 5,
                    children: [
                        { id: "1:5", name: "Text", type: "TEXT" }
                    ]
                }
            });
        });

        it("validates successful read-only connects", () => {
            assertPayloadValidates("channel_join(readonly)", schema, {
                status: "success",
                channel: "my-channel",
                allowEditNode: false,
                allowEditVariable: false,
                allowEditStyle: false,
                editableScopeType: "readonly",
                documentId: "doc-1",
                documentName: "My Doc",
                pageCount: 2,
                pages: [
                    { pageId: "0:1", pageName: "Page 1" },
                    { pageId: "0:2", pageName: "Page 2" }
                ]
            });
        });
    });

    describe("Contract-seam outputSchema validations for all tools", () => {
        // Representative SUCCESS payloads, authored from the plugin handlers'
        // actual `return` statements (not from the schemas — that would be
        // circular and could not catch schema-vs-handler drift).
        const REPRESENTATIVE_OUTPUTS: Record<string, any> = {
            channel_join: {
                status: "success",
                channel: "my-channel"
            },
            page_info: {
                documentId: "doc-1",
                documentName: "My Doc",
                pageCount: 1,
                pages: [{ pageId: "1:1", pageName: "Page" }],
                missingPageIds: ["9:9"]
            },
            node_info: {
                nodes: [{ id: "1:2", name: "Node", type: "FRAME" }],
                missingNodeIds: ["9:9"]
            },
            node_transform: {
                id: "1:2",
                name: "Node",
                x: 0,
                y: 0,
                width: 100,
                height: 100
            },
            node_rename: {
                id: "1:2",
                name: "New Name",
                oldName: "Old Name"
            },
            // deleteMultipleNodes return shape
            node_delete: {
                success: true,
                nodesDeleted: 1,
                nodesFailed: 0,
                totalNodes: 1,
                results: [{ success: true, nodeId: "1:2" }],
                completedInChunks: 1
            },
            node_clone: {
                id: "1:3",
                name: "Clone",
                x: 10,
                y: 20,
                width: 100,
                height: 100
            },
            // viewNavigate scene-node branch return shape
            view_navigate: {
                success: true,
                count: 1,
                selectedNodes: [{ id: "1:2", name: "Node" }],
                message: "Selected 1 nodes"
            },
            node_group: {
                id: "1:4",
                name: "Group",
                childCount: 2
            },
            node_ungroup: {
                parentId: "1:1",
                ungroupedChildren: [{ id: "1:2", name: "Child" }]
            },
            node_flatten: {
                id: "1:6",
                name: "Flattened",
                type: "BOOLEAN_OPERATION"
            },
            node_insert_child: {
                childId: "1:2",
                newParentId: "1:1",
                index: 0
            },
            node_set_auto_layout: {
                id: "1:2",
                name: "Node",
                layoutMode: "HORIZONTAL",
                layoutWrap: "NO_WRAP"
            },
            node_set_fill: {
                id: "1:2",
                name: "Node",
                fills: []
            },
            node_set_stroke: {
                id: "1:2",
                name: "Node",
                strokes: [],
                strokeWeight: 2,
                strokeTopWeight: 2,
                strokeBottomWeight: 2,
                strokeLeftWeight: 2,
                strokeRightWeight: 2
            },
            node_set_corner_radius: {
                id: "1:2",
                name: "Node",
                cornerRadius: 10,
                topLeftRadius: 10,
                topRightRadius: 10,
                bottomRightRadius: 10,
                bottomLeftRadius: 10
            },
            node_set_effects: {
                id: "1:2",
                name: "Node",
                effects: []
            },
            // applyStyle returns { success, message }
            node_apply_style: {
                success: true,
                message: "Style s:1 applied to node 1:2"
            },
            node_bind_variable: {
                success: true,
                name: "Node",
                message: "Variable bound"
            },
            node_export_visual: {
                nodeId: "1:2",
                format: "PNG",
                scale: 1,
                mimeType: "image/png",
                imageData: "aGVsbG8="
            },
            create_shape: {
                id: "1:10",
                name: "Rectangle",
                type: "RECTANGLE",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                parentId: "1:1"
            },
            // createFrame's full return shape
            create_frame: {
                id: "1:11",
                name: "Frame",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                fills: [],
                strokes: [],
                strokeWeight: 1,
                layoutMode: "NONE",
                layoutWrap: "NO_WRAP",
                parentId: "1:1"
            },
            // createText's full return shape
            create_text: {
                id: "1:12",
                name: "Text",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                characters: "Hello",
                fontSize: 14,
                fontWeight: 400,
                fontColor: { r: 0, g: 0, b: 0, a: 1 },
                fontName: { family: "Inter", style: "Regular" },
                fills: [],
                parentId: "1:1"
            },
            create_svg: {
                id: "1:13",
                name: "Vector",
                type: "FRAME"
            },
            create_component: {
                id: "1:14",
                name: "Component",
                type: "COMPONENT"
            },
            create_instance: {
                id: "1:15",
                name: "Instance",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                componentId: "1:14"
            },
            // createComponentSet's full return shape (guarded result read)
            create_component_set: {
                id: "1:16",
                name: "Set",
                type: "COMPONENT_SET",
                childCount: 2,
                variantProperties: { "Size": { values: ["S", "L"] } }
            },
            create_connection: {
                success: true,
                message: "Connections created"
            },
            style_list: {
                colors: [],
                texts: [],
                effects: [],
                grids: []
            },
            style_manage: {
                id: "s:1",
                name: "Style",
                type: "PAINT"
            },
            style_delete: {
                success: true,
                message: "Style deleted"
            },
            // setMultipleTextContents return shape
            text_set_content: {
                success: true,
                replacementsApplied: 1,
                replacementsFailed: 0,
                totalReplacements: 1,
                results: []
            },
            // setTextStyle return shape
            text_set_style: {
                id: "1:2",
                name: "Text",
                type: "TEXT",
                fontName: { family: "Inter", style: "Regular" },
                fontSize: 14
            },
            component_list: {
                count: 0,
                scope: "document",
                components: []
            },
            component_manage_property: {
                id: "1:14",
                name: "Component",
                action: "ADD",
                propertyName: "prop",
                success: true
            },
            component_delete_property: {
                id: "1:14",
                name: "Component",
                propertyName: "prop",
                success: true
            },
            instance_set_property: {
                nodeId: "1:15",
                propertyName: "prop",
                value: "val"
            },
            instance_get_overrides: {
                success: true,
                message: "Got overrides",
                sourceInstanceId: "1:15",
                mainComponentId: "1:14",
                overridesCount: 1
            },
            instance_set_overrides: {
                success: true,
                message: "Overrides applied",
                totalCount: 1,
                results: []
            },
            reaction_list: {
                nodesCount: 1,
                nodesWithReactions: 0,
                nodes: []
            },
            // updateReactions returns { success, message }
            reaction_update: {
                success: true,
                message: "Successfully updated reactions for node 1:2"
            },
            variable_list: {
                variables: [],
                collections: []
            },
            variable_manage: {
                id: "v1",
                name: "v"
            },
            // deleteVariables returns { success, deleted } (message never set)
            variable_delete: {
                success: true,
                deleted: ["v1"]
            },
            annotation_list: {
                annotations: [],
                categories: []
            },
            annotation_set: {
                success: true,
                results: []
            }
        };

        for (const name of Object.keys(TOOLS)) {
            it(`validates representative output of ${name}`, () => {
                const schema = TOOLS[name];
                expect(schema).toBeDefined();
                const payload = REPRESENTATIVE_OUTPUTS[name];
                expect(payload).toBeDefined();
                assertPayloadValidates(name, schema, payload);
            });
        }

        it("has no stale representative entries for unregistered tools", () => {
            for (const name of Object.keys(REPRESENTATIVE_OUTPUTS)) {
                expect(TOOLS[name]).toBeDefined();
            }
        });
    });
});
