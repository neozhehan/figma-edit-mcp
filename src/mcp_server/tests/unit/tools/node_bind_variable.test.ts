import { describe, it, expect, mock } from "bun:test";

mock.module("../../../figma-client.js", () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => { }),
}));

const { registerAllTools } = await import("../../../tools/index.js");
const { normalizeObjectSchema, safeParseAsync } = await import(
    "@modelcontextprotocol/sdk/server/zod-compat.js"
);
const { toJsonSchemaCompat } = await import(
    "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js"
);

const SCHEMAS: Record<string, any> = {};
const mockServer: any = {
    registerTool: (name: string, config: any, _cb: Function) => {
        SCHEMAS[name] = config?.inputSchema;
    },
    tool: (name: string, _d: any, schema: any, _cb: Function) => {
        SCHEMAS[name] = schema;
    },
    prompt: () => { },
    registerPrompt: () => { },
    registerResource: () => { },
    resource: () => { },
};
registerAllTools(mockServer);

async function validate(toolName: string, args: any) {
    const schema = SCHEMAS[toolName];
    const norm = normalizeObjectSchema(schema) ?? schema;
    return safeParseAsync(norm, args);
}

describe("node_bind_variable bindVariables allowlist", () => {
    it("accepts valid fields (e.g. paddingLeft, fills, strokes, strokeTopWeight, fontFamily)", async () => {
        const validFields = ["paddingLeft", "fills", "strokes", "strokeTopWeight", "fontFamily"];
        
        for (const field of validFields) {
            const res: any = await validate("node_bind_variable", {
                nodeId: "1:1",
                nodeName: "Test Node",
                bindVariables: {
                    [field]: "VariableID:1:2"
                }
            });
            expect(res.success).toBe(true);
        }
    });

    it("rejects unknown fields with a hint for common typos", async () => {
        const invalidCases = [
            { field: "padding", expectedHint: "Did you mean 'paddingLeft'?" },
            { field: "gap", expectedHint: "Did you mean 'itemSpacing'?" },
            { field: "cornerRadius", expectedHint: "Did you mean 'topLeftRadius'?" },
            // Lexical near-misses (F8): singular form and a casing slip.
            { field: "fill", expectedHint: "Did you mean 'fills'?" },
            { field: "fontsize", expectedHint: "Did you mean 'fontSize'?" },
            { field: "unknownField", expectedHint: undefined }
        ];

        for (const { field, expectedHint } of invalidCases) {
            const res: any = await validate("node_bind_variable", {
                nodeId: "1:1",
                nodeName: "Test Node",
                bindVariables: {
                    [field]: "VariableID:1:2"
                }
            });
            expect(res.success).toBe(false);

            const issue = res.error.issues[0];
            // The allowlist is the record's key enum, so an unknown key surfaces as
            // `invalid_key`; the record's error map rewrites it to the actionable string.
            expect(issue.code).toBe("invalid_key");
            expect(issue.message).toContain(`Unknown bind field '${field}'`);
            expect(issue.message).toContain("Valid fields are the Figma bindable node/text fields plus fills/strokes");

            if (expectedHint) {
                expect(issue.message).toContain(expectedHint);
            } else {
                expect(issue.message).not.toContain("Did you mean");
            }
        }
    });

    it("publishes the valid field set in the wire JSON schema (propertyNames.enum)", async () => {
        const schema = SCHEMAS["node_bind_variable"];
        const norm = normalizeObjectSchema(schema) ?? schema;
        const js: any = toJsonSchemaCompat(norm);
        const enumVals = js?.properties?.bindVariables?.propertyNames?.enum;
        expect(Array.isArray(enumVals)).toBe(true);
        // Valid fields are advertised; typos are not — so schema-aware clients
        // see the allowlist without having to trigger a runtime error.
        expect(enumVals).toContain("paddingLeft");
        expect(enumVals).toContain("fills");
        expect(enumVals).toContain("strokeTopWeight");
        expect(enumVals).not.toContain("padding");
    });

    it("accepts empty or omitted bindVariables (modes-only path)", async () => {
        const resOmitted: any = await validate("node_bind_variable", {
            nodeId: "1:1",
            nodeName: "Test Node",
            explicitVariableModes: { "CollectionID": "ModeID" }
        });
        expect(resOmitted.success).toBe(true);

        const resEmpty: any = await validate("node_bind_variable", {
            nodeId: "1:1",
            nodeName: "Test Node",
            bindVariables: {}
        });
        expect(resEmpty.success).toBe(true);
    });
});
