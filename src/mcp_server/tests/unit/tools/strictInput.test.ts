import { describe, it, expect, mock } from "bun:test";

// =============================================================================
// STRICT INPUT VALIDATION — unknown keys are rejected, never silently stripped.
//
// Regression for the class behind a real hallucination: an agent passed
// `node_info({ properties: [...] })` when the parameter is named `fields`. Zod's
// default strips unknown keys, so the bad key vanished and the tool "succeeded"
// with no field selection — silent corruption of intent. registerAllTools now
// registers every tool with a STRICT input schema (see tools/index.ts), so the
// MCP SDK rejects unknown keys with an actionable error instead.
//
// These tests reproduce the SDK's exact validation path (normalizeObjectSchema +
// safeParseAsync from the SDK's zod-compat) against the *actually registered*
// schemas, so they assert real end-to-end behavior, not a re-derived schema.
// =============================================================================

mock.module("../../../figma-client.js", () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => { }),
}));

const { registerAllTools } = await import("../../../tools/index.js");
const { normalizeObjectSchema, safeParseAsync } = await import(
    "@modelcontextprotocol/sdk/server/zod-compat.js"
);

// Capture every registered tool's (strict-wrapped) input schema.
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

// Validate args exactly as the MCP SDK does at the protocol boundary.
async function validate(toolName: string, args: any) {
    const schema = SCHEMAS[toolName];
    const norm = normalizeObjectSchema(schema) ?? schema;
    return safeParseAsync(norm, args);
}

describe("Strict input validation: node_info input name unified on `properties`", () => {
    // The original hallucination passed `properties` (the output key) when the
    // input was named `fields`. We unified the input on `properties` (so input ==
    // output == internal payload), and strict now rejects the stale `fields` name.
    it("accepts node_info({ properties }) — input name now matches the output key", async () => {
        const res: any = await validate("node_info", { nodeIds: ["1:2"], properties: ["locked"] });
        expect(res.success).toBe(true);
    });

    it("rejects the old `fields` key (renamed to `properties`)", async () => {
        const res: any = await validate("node_info", { fields: ["locked"] });
        expect(res.success).toBe(false);
        const issue = res.error.issues?.[0];
        expect(issue.code).toBe("unrecognized_keys");
        expect(issue.keys).toContain("fields");
    });
});

describe("Strict input validation: every tool rejects unknown keys", () => {
    for (const name of Object.keys(SCHEMAS)) {
        it(`${name} rejects an unknown key`, async () => {
            const res: any = await validate(name, { __definitelyNotAParam__: true });
            expect(res.success).toBe(false);
            // The failure must be about the unknown key (not merely a missing
            // required field), proving strict mode is active for this tool.
            const codes = (res.error.issues ?? []).map((i: any) => i.code);
            expect(codes).toContain("unrecognized_keys");
        });
    }
});
