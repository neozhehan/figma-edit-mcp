import { describe, it, expect, mock, beforeAll } from "bun:test";

/**
 * Official-SDK boundary suite (review finding P4-1 / Q21).
 *
 * Drives the REAL registered production server through the pinned official SDK
 * `Client` over a linked in-memory transport — the exact validation path a
 * conforming MCP client runs, including the client-side ajv validation of
 * `structuredContent` against each tool's advertised output schema (which the
 * pinned SDK applies even on `isError: true` results).
 *
 * What this suite guarantees:
 *  - A thrown coded refusal (e.g. STYLE_NAME_MISMATCH) arrives as
 *    `isError: true` with code/details intact in `structuredContent` and the
 *    code repeated in the text fallback — never converted to a `-32602`
 *    output-schema validation error.
 *  - Every registered tool's advertised output schema accepts the common D9
 *    error envelope.
 *  - The Q21 dual-description contract holds in the EMITTED `tools/list`
 *    metadata, not just raw registration configuration.
 */

// Real module under a cache-busting key: gives us the real FigmaError even
// while the canonical specifier is mocked below.
const realClient = await import("../../../figma-client.js?boundary-real");
const { FigmaError } = realClient;

// The rejection sendCommandToFigma produces; individual tests overwrite it.
let commandBehavior: (command: string, params?: any) => Promise<any> = async () => {
    throw new FigmaError({ code: "UNKNOWN_ERROR", message: "behavior not set" });
};

mock.module("../../../figma-client.js", () => ({
    ...realClient,
    sendCommandToFigma: mock((command: string, params?: any) => commandBehavior(command, params)),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => {}),
    connectToFigma: mock(() => {}),
}));

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
const { registerAllTools } = await import("../../../tools/index.js");

describe("MCP boundary (official SDK client, real registered server)", () => {
    let server: any;
    let client: any;
    let toolsList: any;

    beforeAll(async () => {
        server = new McpServer({ name: "figma-edit-mcp-test", version: "0.0.0" });
        registerAllTools(server);

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        client = new Client({ name: "boundary-test-client", version: "0.0.0" });
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        // listTools() primes the client-side output-schema validators — without
        // this, the client performs no structuredContent validation and the
        // suite could not catch the -32602 failure class.
        toolsList = await client.listTools();
    });

    it("a thrown coded refusal arrives as isError with code and details intact — not a -32602", async () => {
        commandBehavior = async () => {
            throw new FigmaError({
                code: "STYLE_NAME_MISMATCH",
                message: 'Operation Denied: currentStyleName does not match the resolved style\'s stored name — stored name "Real", received currentStyleName "Wrong". Read the current name with style_list and pass it back verbatim.',
                details: { storedName: "Real", received: "Wrong" },
            });
        };

        // Must RESOLVE (an in-band error result), not reject with McpError -32602.
        const result = await client.callTool({
            name: "style_manage",
            arguments: { type: "PAINT", styleId: "S:1", currentStyleName: "Wrong" },
        });

        expect(result.isError).toBe(true);
        expect(result.structuredContent.error.code).toBe("STYLE_NAME_MISMATCH");
        expect(result.structuredContent.error.details).toEqual({ storedName: "Real", received: "Wrong" });
        expect(result.content[0].text).toContain("Error [STYLE_NAME_MISMATCH]");
        expect(result.content[0].text).toContain("pass it back verbatim");
    });

    it("a legacy uncoded failure arrives as UNKNOWN_ERROR with its message preserved", async () => {
        commandBehavior = async () => {
            throw new FigmaError("Node ghost-id not found");
        };
        const result = await client.callTool({
            name: "node_rename",
            arguments: { nodeId: "1:2", nodeName: "A", name: "B" },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent.error.code).toBe("UNKNOWN_ERROR");
        expect(result.structuredContent.error.message).toContain("not found");
    });

    it("successful results still pass client-side output validation", async () => {
        commandBehavior = async () => ({ id: "S:1", name: "Body", type: "PAINT" });
        const result = await client.callTool({
            name: "style_manage",
            arguments: { type: "PAINT", styleId: "S:1", currentStyleName: "Body" },
        });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent.name).toBe("Body");
    });

    it("every registered tool's advertised output schema accepts the common error envelope", () => {
        const registered = (server as any)._registeredTools;
        const names = Object.keys(registered);
        expect(names.length).toBeGreaterThan(40);

        const envelope = {
            error: { code: "SOME_CODE", message: "Some message", details: { anything: true } },
        };
        const withOutput = names.filter((n) => registered[n].outputSchema);
        expect(withOutput.length).toBeGreaterThan(0);
        for (const name of withOutput) {
            const parsed = registered[name].outputSchema.safeParse(envelope);
            expect(parsed.success, `tool ${name} rejects the error envelope`).toBe(true);
        }
    });

    it("output schemas are still advertised in tools/list (fields documented; error field present)", () => {
        const styleManage = toolsList.tools.find((t: any) => t.name === "style_manage");
        const nodeDelete = toolsList.tools.find((t: any) => t.name === "node_delete");
        expect(styleManage.outputSchema).toBeDefined();
        // Success fields remain documented (types advertised, requiredness relaxed)…
        expect(styleManage.outputSchema.properties.id).toBeDefined();
        expect(styleManage.outputSchema.properties.name).toBeDefined();
        // …and the common error envelope is advertised alongside them.
        expect(styleManage.outputSchema.properties.error).toBeDefined();
        expect(styleManage.outputSchema.required ?? []).toEqual([]);

        // R10/Rev 43: clients see the corrected disclosure contract. `before`
        // records diagnostic evidence; it does not promise a directly executable
        // one-call restore.
        const beforeDescription =
            nodeDelete.outputSchema.properties.results.items.properties.before.description;
        expect(beforeDescription).toContain("diagnostic evidence");
        expect(beforeDescription).not.toContain("so a restoring write can be composed");
    });

    it("Q21: the dual-description contract holds in the emitted tools/list", () => {
        const variableManage = toolsList.tools.find((t: any) => t.name === "variable_manage");
        const styleManage = toolsList.tools.find((t: any) => t.name === "style_manage");

        // Tool descriptions: natural sentence naming the action and the field.
        expect(variableManage.description).toContain("UPDATE_VARIABLE requires `currentVariableName`");
        expect(variableManage.description).toContain("CREATE_VARIABLE requires `collectionName` and `scopes`");
        expect(styleManage.description).toContain("UPDATE requires currentStyleName");

        // Field descriptions: the literal "REQUIRED for …" marker.
        const varProps = variableManage.inputSchema.properties;
        expect(varProps.currentVariableName.description).toContain("REQUIRED for UPDATE_VARIABLE");
        expect(varProps.collectionName.description).toContain("REQUIRED for CREATE_VARIABLE");
        expect(varProps.scopes.description).toContain("REQUIRED for CREATE_VARIABLE");

        const styleProps = styleManage.inputSchema.properties;
        expect(styleProps.currentStyleName.description).toContain("REQUIRED for UPDATE when styleId is supplied");
        expect(styleProps.name.description).toContain("REQUIRED for CREATE");
    });

    it("R6: every batch tool description teaches retrying every non-success row in the emitted tools/list", () => {
        for (const name of ["node_delete", "text_set_content", "instance_set_overrides"]) {
            const tool = toolsList.tools.find((t: any) => t.name === name);
            expect(tool, `${name} present in tools/list`).toBeDefined();
            // R6: the corrected recovery wording, asserted on the ADVERTISED
            // description — not the "failed items" shorthand.
            expect(tool.description, `${name} teaches non-success retry`).toContain("retry every non-success item (both failed and skipped)");
        }

        // Q31 (Rev 46): `annotation_set` is the one carve-out. Append is not
        // idempotent, so an unguarded "retry every non-success item" would tell
        // the model to duplicate an annotation a `failed` row had already
        // appended. Its description must still address every non-success row,
        // but gate the retry on reading the node's current annotations first.
        const annotationSet = toolsList.tools.find((t: any) => t.name === "annotation_set");
        expect(annotationSet, "annotation_set present in tools/list").toBeDefined();
        expect(annotationSet.description).toContain("failed and skipped items");
        expect(annotationSet.description).toContain("NOT idempotent");
        expect(annotationSet.description).toContain("may already have appended");
        expect(annotationSet.description).toContain("before retrying any non-success item");
        expect(annotationSet.description).toContain("annotation_list");
    });
});
