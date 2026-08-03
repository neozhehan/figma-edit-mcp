import { describe, it, expect, mock, beforeAll } from "bun:test";
import {
    EXPECTED_NAME_ASSIGNMENT_SINKS,
    expectedNameAssignmentContracts,
    scanPluginNameAssignmentSinks,
} from "./nameAssignmentInvariants.js";
import { SERVER_VERSION } from "../../../../shared/version.js";

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
let joinAttemptCount = 0;

mock.module("../../../figma-client.js", () => ({
    ...realClient,
    sendCommandToFigma: mock((command: string, params?: any) => commandBehavior(command, params)),
    joinChannel: mock(async () => {
        joinAttemptCount++;
        return { serverVersion: SERVER_VERSION, pluginVersion: SERVER_VERSION };
    }),
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

    // Asserted only through the official client. The F78-15 case below needs a
    // `validateToolInput` probe because it checks many tools' classification at
    // once, but here the in-band text already carries the `-32602` code AND the
    // issue path, so a private-method probe would add no coverage — and pinning
    // the path (which the probe never did) is what proves the rejection came
    // from `channel`'s own `.min(1)` rather than some other validation failure.
    //
    // Red-proof (2026-08-01): removing channel.ts's `.min(1)` and running this
    // test produced 0 pass / 1 fail / 22 filtered, failing at `isError`. The
    // production line was restored before the green rerun.
    it("Change 20: channel_join rejects an empty channel at the SDK boundary before its handler runs", async () => {
        const attemptsBefore = joinAttemptCount;

        const result = await client.callTool({
            name: "channel_join",
            arguments: { channel: "" },
        });

        expect(result.isError).toBe(true);
        const text = (result as any).content[0].text;
        expect(text).toContain("MCP error -32602");
        expect(text).toContain("Input validation error");
        expect(text).toMatch(/"path":\s*\[\s*"channel"\s*\]/);
        expect(text).toContain("channel is required");
        // Guards the compound regression only: with `.min(1)` gone, the handler's
        // retained `if (!channel)` defense still returns MISSING_CHANNEL before
        // dispatch, so this stays equal unless that defense is removed too.
        expect(joinAttemptCount).toBe(attemptsBefore);
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

    it("a hostile thrown Proxy still resolves through a real registered callback as UNKNOWN_ERROR", async () => {
        const hostile = new Proxy({}, {
            get: () => {
                throw new Error("hostile getter must not escape");
            },
            ownKeys: () => {
                throw new Error("hostile enumeration must not escape");
            },
        });
        commandBehavior = async () => {
            throw hostile;
        };

        // This crosses the real registered style_manage callback and official
        // SDK client boundary. It must resolve in-band instead of rejecting
        // while the wrapper tries code/message/details or String(error).
        const result = await client.callTool({
            name: "style_manage",
            arguments: {
                type: "PAINT",
                styleId: "S:1",
                currentStyleName: "Body",
            },
        });

        expect(result.isError).toBe(true);
        expect(result.structuredContent.error).toEqual({
            code: "UNKNOWN_ERROR",
            message: "Error executing command",
        });
        expect(result.content[0].text).toBe(
            "Error [UNKNOWN_ERROR]: Error executing command",
        );
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

    // Change 8 (C1): the in-use refusal is now a coded D9 error like its sibling
    // DOCUMENT_SCAN_INCOMPLETE, not a non-error result carrying a bare `error`
    // string. This is the one place `error` had two possible types across the
    // whole tool surface, so a caller had to branch on the type of a field
    // before it could read it. The consumer evidence is unchanged in shape and
    // now lives where every other structured refusal keeps its evidence.
    it("Phase 10/Change 8: variable_delete in-use refusal is a coded refusal with structured consumers, not a bare string", async () => {
        const variablesInUse = {
            "VariableID:1": {
                nodeConsumers: [{
                    nodeId: "1:2",
                    nodeName: "Card",
                    nodeType: "FRAME",
                    fields: ["fills"],
                }],
                styleConsumers: [],
                aliasConsumers: [],
            },
        };
        commandBehavior = async () => {
            throw new FigmaError({
                code: "VARIABLE_IN_USE",
                message: "Operation Denied: Cannot delete: variable(s) are still in use. Nothing was deleted. Read each listed consumer's current state with node_info ...",
                details: { variablesInUse },
            });
        };

        const result = await client.callTool({
            name: "variable_delete",
            arguments: {
                variableIds: ["VariableID:1"],
                variableNames: ["color/background"],
            },
        });

        // Resolves in-band (no -32602) and carries the code machine-readably.
        expect(result.isError).toBe(true);
        expect(result.structuredContent.error.code).toBe("VARIABLE_IN_USE");
        expect(result.structuredContent.error.details.variablesInUse["VariableID:1"].nodeConsumers[0].nodeId)
            .toBe("1:2");
        expect(result.content[0].text).toContain("VARIABLE_IN_USE");
    });

    it("Phase 10: partial page_info coverage survives the official SDK boundary", async () => {
        commandBehavior = async () => ({
            documentId: "doc-1",
            documentName: "Document",
            pageCount: 2,
            pages: [{ pageId: "page-good", pageName: "Good" }],
            missingPageIds: ["page-bad"],
            coverage: {
                complete: false,
                pagesAttempted: 2,
                pageErrors: [{
                    pageId: "page-bad",
                    error: {
                        code: "PAGE_LOAD_FAILED",
                        message: "Failed to load page-bad",
                        details: { pageId: "page-bad" },
                    },
                }],
            },
        });

        const result = await client.callTool({
            name: "page_info",
            arguments: { pageIds: ["page-good", "page-bad"] },
        });

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent.pages).toEqual([
            { pageId: "page-good", pageName: "Good" },
        ]);
        // Change 8 (D5): the failed page is named in `missingPageIds` too, so a
        // caller can diff requested-vs-returned from one field regardless of why.
        expect(result.structuredContent.missingPageIds).toEqual(["page-bad"]);
        expect(result.structuredContent.coverage).toEqual({
            complete: false,
            pagesAttempted: 2,
            pageErrors: [{
                pageId: "page-bad",
                error: {
                    code: "PAGE_LOAD_FAILED",
                    message: "Failed to load page-bad",
                    details: { pageId: "page-bad" },
                },
            }],
        });
    });

    // Change 8 (D1): the coverage invariant is now advertised, not just checked
    // privately. A payload that violates it must be rejected by the schema the
    // client validates against, so the model can trust `complete` as derived.
    it("Change 8: an incoherent coverage payload is refused by the advertised schema", async () => {
        commandBehavior = async () => ({
            documentId: "doc-1",
            documentName: "Document",
            pageCount: 1,
            pages: [],
            coverage: { complete: true, pagesAttempted: 1, pageErrors: [{
                pageId: "page-bad",
                error: { code: "PAGE_LOAD_FAILED", message: "failed" },
            }] },
        });

        // McpServer catches its own internal -32602 and surfaces it in band, so
        // the observable proof is the validation failure itself, on the exact
        // path the invariant lives: coverage.pageErrors.
        const result: any = await client.callTool({
            name: "page_info",
            arguments: { pageIds: ["page-bad"] },
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Output validation error");
        expect(result.content[0].text).toContain("coverage");
        expect(result.content[0].text).toContain("pageErrors");
    });

    it("Phase 10: a single-page load timeout arrives as the direct structured refusal", async () => {
        commandBehavior = async () => {
            throw new FigmaError({
                code: "PAGE_LOAD_TIMEOUT",
                message: "Page page-timeout did not load within the bounded interval.",
                details: { pageId: "page-timeout", timeoutMs: 10_000 },
            });
        };

        const result = await client.callTool({
            name: "component_list",
            arguments: { scope: "page", pageId: "page-timeout" },
        });

        expect(result.isError).toBe(true);
        expect(result.structuredContent.error).toEqual({
            code: "PAGE_LOAD_TIMEOUT",
            message: "Page page-timeout did not load within the bounded interval.",
            details: { pageId: "page-timeout", timeoutMs: 10_000 },
        });
        expect(result.content[0].text).toContain("Error [PAGE_LOAD_TIMEOUT]");
    });

    it("F78-15: creator callbacks reject exact-empty names as -32602 without dispatch", async () => {
        let dispatchCount = 0;
        commandBehavior = async () => {
            dispatchCount++;
            throw new Error("empty-name validation must prevent dispatch");
        };

        const calls = [
            {
                name: "create_shape",
                arguments: {
                    type: "RECTANGLE",
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                    name: "",
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
            {
                name: "create_frame",
                arguments: {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                    name: "",
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
            {
                name: "create_text",
                arguments: {
                    x: 0,
                    y: 0,
                    text: "Body copy",
                    name: "",
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
            {
                name: "create_svg",
                arguments: {
                    svg: "<svg/>",
                    name: "",
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
            {
                name: "create_component_set",
                arguments: {
                    components: [
                        { nodeId: "2:1", nodeName: "A", propertyValues: ["A"] },
                        { nodeId: "2:2", nodeName: "B", propertyValues: ["B"] },
                    ],
                    properties: ["State"],
                    componentSetName: "",
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
        ];

        const registered = (server as any)._registeredTools;
        for (const call of calls) {
            const registeredSchema = registered[call.name].inputSchema;
            const schemaResult = await registeredSchema.safeParseAsync(
                call.arguments,
            );
            expect(
                schemaResult.success,
                `${call.name}'s registered schema must reject an exact-empty name`,
            ).toBe(false);
            const nameField = call.name === "create_component_set"
                ? "componentSetName"
                : "name";
            const whitespaceResult = await registeredSchema.safeParseAsync({
                ...call.arguments,
                [nameField]: " ",
            });
            expect(
                whitespaceResult.success,
                `${call.name}'s registered schema must continue to accept whitespace`,
            ).toBe(true);

            let validationError: any;
            try {
                await (server as any).validateToolInput(
                    registered[call.name],
                    call.arguments,
                    call.name,
                );
            } catch (caught) {
                validationError = caught;
            }
            expect(
                validationError,
                `${call.name}'s SDK validation must throw Invalid Params`,
            ).toBeDefined();
            expect(
                validationError.code,
                `${call.name}'s SDK validation must use Invalid Params`,
            ).toBe(-32602);

            // McpServer 1.29 catches the internal -32602 and intentionally
            // exposes it through tools/call as an in-band tool error.
            const result = await client.callTool(call);
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("Input validation error");
            expect(result.content[0].text).toContain(call.name);
            expect(dispatchCount, `${call.name} must not dispatch`).toBe(0);
        }
    });

    it("F78-15: creator callbacks still dispatch omissions with existing defaults", async () => {
        const dispatched: Array<{ command: string; params: any }> = [];
        const fallbackNames: Record<string, string> = {
            create_shape: "Rectangle",
            create_frame: "Frame",
            create_text: "Text",
            create_svg: "SVG",
            create_component_set: "Component set",
        };
        commandBehavior = async (command, params) => {
            dispatched.push({ command, params });
            const suppliedName = command === "create_component_set"
                ? params.componentSetName
                : params.name;
            return {
                id: `${command}-id`,
                name: suppliedName ?? fallbackNames[command],
                parentId: params.parentId,
            };
        };

        const calls = [
            {
                name: "create_shape",
                arguments: {
                    type: "RECTANGLE",
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
            {
                name: "create_frame",
                arguments: {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
            {
                name: "create_text",
                arguments: {
                    x: 0,
                    y: 0,
                    text: "Body copy",
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
            {
                name: "create_svg",
                arguments: {
                    svg: "<svg/>",
                    parentId: "1:2",
                    parentNodeName: "Parent",
                },
            },
        ];

        const omittedResults = [];
        for (const call of calls) {
            const result = await client.callTool(call);
            expect(result.isError).toBeFalsy();
            omittedResults.push(result);
        }
        expect(omittedResults.map((result) => result.structuredContent.name))
            .toEqual(["Rectangle", "Frame", "Text", "SVG"]);
        const omitted = dispatched;
        expect(Object.hasOwn(omitted[0].params, "name")).toBe(false);
        expect(omitted[1].params.name).toBe("Frame");
        expect(omitted[2].params.name).toBe("Text");
        expect(omitted[2].params.fontSize).toBe(14);
        expect(omitted[2].params.fontWeight).toBe(400);
        expect(Object.hasOwn(omitted[3].params, "name")).toBe(false);

        const componentSetArguments = {
            components: [
                { nodeId: "2:1", nodeName: "A", propertyValues: ["A"] },
                { nodeId: "2:2", nodeName: "B", propertyValues: ["B"] },
            ],
            properties: ["State"],
            parentId: "1:2",
            parentNodeName: "Parent",
        };
        const omittedSet = await client.callTool({
            name: "create_component_set",
            arguments: componentSetArguments,
        });
        expect(omittedSet.isError).toBeFalsy();
        expect(omittedSet.structuredContent.name).toBe("Component set");
        expect(Object.hasOwn(dispatched.at(-1)!.params, "componentSetName")).toBe(false);
    });

    it("create_text rejects invalid font size/weight before dispatch and accepts every supported weight", async () => {
        let dispatchCount = 0;
        commandBehavior = async (_command, params) => {
            dispatchCount++;
            return {
                id: "text-id",
                name: params.name,
                parentId: params.parentId,
            };
        };
        const base = {
            x: 0,
            y: 0,
            text: "Body copy",
            name: "Body",
            parentId: "1:2",
            parentNodeName: "Parent",
        };

        for (const invalid of [
            { fontSize: 0 },
            { fontSize: -1 },
            { fontWeight: 0 },
            { fontWeight: 350 },
        ]) {
            const beforeDispatch = dispatchCount;
            let refused = false;
            try {
                const result = await client.callTool({
                    name: "create_text",
                    arguments: { ...base, ...invalid },
                });
                refused = result.isError === true;
            } catch {
                refused = true;
            }
            expect(refused, `create_text must refuse ${JSON.stringify(invalid)}`).toBe(true);
            expect(
                dispatchCount,
                `create_text must not dispatch ${JSON.stringify(invalid)}`,
            ).toBe(beforeDispatch);
        }
        expect(dispatchCount).toBe(0);

        for (const fontWeight of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
            const result = await client.callTool({
                name: "create_text",
                arguments: { ...base, fontSize: 1, fontWeight },
            });
            expect(result.isError).toBeFalsy();
        }
        expect(dispatchCount).toBe(9);
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
        const createInstance = toolsList.tools.find((t: any) => t.name === "create_instance");
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

        // F78-07: `componentId` is part of create_instance's public result, not
        // merely an undeclared extra tolerated by looseOutput.
        expect(createInstance.outputSchema.properties.componentId).toBeDefined();
        expect(createInstance.outputSchema.properties.componentId.type).toBe("string");
    });

    it("T78-02: all eight creator output schemas advertise parentId", () => {
        const creatorNames = [
            "create_shape",
            "create_frame",
            "create_text",
            "create_svg",
            "create_instance",
            "node_clone",
            "create_component",
            "create_component_set",
        ];
        expect(creatorNames).toHaveLength(8);

        for (const name of creatorNames) {
            const tool = toolsList.tools.find((candidate: any) => candidate.name === name);
            expect(tool, `${name} present in emitted tools/list`).toBeDefined();
            expect(
                tool.outputSchema?.properties?.parentId,
                `${name} advertises parentId`,
            ).toBeDefined();
            expect(tool.outputSchema.properties.parentId.type).toBe("string");
        }
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

    it("F78-21/Change 3: an AST sink inventory independently pins every user-visible name assignment", () => {
        const actualSinks = scanPluginNameAssignmentSinks();
        const expectedSinks = EXPECTED_NAME_ASSIGNMENT_SINKS
            .map(({ sink }) => sink)
            .sort();

        expect(
            actualSinks,
            "plugin name-assignment sinks changed without an explicit contract classification",
        ).toEqual(expectedSinks);

        // These assertions make the formerly omitted action-dependent sinks
        // unmistakable in failure output. The inventory is schema-independent:
        // it scans direct `.name` writes and an explicit list of Figma naming
        // APIs rather than deriving membership from production schema metadata.
        const contracts = expectedNameAssignmentContracts();
        expect(contracts).toContain("variable_manage.modeName@CREATE_COLLECTION");
        expect(contracts).toContain("variable_manage.name@UPDATE_VARIABLE");
        expect(contracts).toContain("component_manage_property.propertyName@ADD");
        expect(contracts).toContain("component_manage_property.newPropertyName@EDIT");
    });

    it("F78-21/Change 3: every source-discovered assignment field has a schema-level non-empty boundary", () => {
        const refinementFields = new Set([
            "component_manage_property.propertyName",
            "style_manage.name",
            "variable_manage.modeName",
            "variable_manage.name",
        ]);
        const assignmentFields = [
            ...new Set(
                expectedNameAssignmentContracts().map((contract) =>
                    contract.split("@", 1)[0]
                ),
            ),
        ].sort();
        const offenders: string[] = [];
        for (const assignmentField of assignmentFields) {
            if (refinementFields.has(assignmentField)) continue;
            const separator = assignmentField.lastIndexOf(".");
            const toolName = assignmentField.slice(0, separator);
            const field = assignmentField.slice(separator + 1);
            const tool = toolsList.tools.find((t: any) => t.name === toolName);
            expect(tool, `${toolName} present in tools/list`).toBeDefined();
            const property = tool.inputSchema?.properties?.[field];
            if (!property) {
                offenders.push(`${toolName}.${field}: field absent from emitted schema`);
                continue;
            }
            if (property.minLength !== 1) {
                offenders.push(`${toolName}.${field}: minLength=${property.minLength} (expected 1)`);
            }
        }
        expect(
            offenders,
            `name-assignment fields that would silently accept "":\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("Change 3: action-conditioned assignment descriptions teach the rule before the first call", () => {
        const cases: ReadonlyArray<{
            toolName: string;
            field: string;
            markers: readonly string[];
        }> = [
            {
                toolName: "variable_manage",
                field: "name",
                markers: [
                    "must be non-empty when supplied",
                    "required for create_collection and create_variable",
                    "omit it only on update_variable",
                ],
            },
            {
                toolName: "style_manage",
                field: "name",
                markers: [
                    "must be non-empty when supplied",
                    "required for create",
                    "omit it on update",
                    "unchanged",
                ],
            },
            {
                toolName: "variable_manage",
                field: "modeName",
                markers: [
                    "create_collection",
                    "must be non-empty when supplied",
                    "omit it to keep",
                    "native default mode name",
                ],
            },
            {
                toolName: "component_manage_property",
                field: "propertyName",
                markers: [
                    "for add",
                    "must be non-empty",
                    "for edit",
                    "exact lookup name",
                ],
            },
            {
                toolName: "component_manage_property",
                field: "newPropertyName",
                markers: [
                    "for edit",
                    "must be non-empty when supplied",
                    "omit it to leave",
                    "unchanged",
                ],
            },
        ];

        for (const { toolName, field, markers } of cases) {
            const tool = toolsList.tools.find((candidate: any) =>
                candidate.name === toolName
            );
            expect(tool, `${toolName} present in tools/list`).toBeDefined();
            const description = String(
                tool.inputSchema?.properties?.[field]?.description ?? "",
            ).toLowerCase();
            for (const marker of markers) {
                expect(
                    description,
                    `${toolName}.${field} should advertise '${marker}'`,
                ).toContain(marker);
            }
        }
    });

    it("F78-21/Change 3: every action-conditioned style/variable name branch rejects exact-empty distinctly", async () => {
        const registered = (server as any)._registeredTools;
        const cases = [
            { name: "style_manage", args: { type: "PAINT", name: "" } },
            {
                name: "style_manage",
                args: {
                    type: "PAINT",
                    styleId: "S:1",
                    currentStyleName: "Style",
                    name: "",
                },
            },
            {
                name: "variable_manage",
                args: { action: "CREATE_COLLECTION", name: "" },
            },
            {
                name: "variable_manage",
                args: {
                    action: "CREATE_VARIABLE",
                    collectionId: "VariableCollectionId:1",
                    collectionName: "Collection",
                    name: "",
                    type: "STRING",
                    scopes: ["ALL_SCOPES"],
                },
            },
            {
                name: "variable_manage",
                args: {
                    action: "UPDATE_VARIABLE",
                    variableId: "VariableID:1",
                    currentVariableName: "Variable",
                    name: "",
                },
            },
        ];
        for (const probe of cases) {
            const result = await registered[probe.name].inputSchema.safeParseAsync(probe.args);
            expect(result.success, `${probe.name} must refuse an exact-empty name`).toBe(false);
            const messages = result.error.issues.map((issue: any) => issue.message).join(" | ");
            expect(messages, `${probe.name} names the empty cause distinctly`).toContain("must not be empty");
        }
    });

    it("F78-21/Change 3: affected actions return an exact public -32602 without dispatch", async () => {
        let dispatchCount = 0;
        commandBehavior = async () => {
            dispatchCount++;
            throw new Error("empty-name validation must prevent dispatch");
        };

        const calls = [
            {
                name: "variable_manage",
                field: "modeName",
                arguments: {
                    action: "CREATE_COLLECTION",
                    name: "Collection",
                    modeName: "",
                },
            },
            {
                name: "variable_manage",
                field: "name",
                arguments: {
                    action: "UPDATE_VARIABLE",
                    variableId: "VariableID:1",
                    currentVariableName: "Variable",
                    name: "",
                },
            },
            {
                name: "style_manage",
                field: "name",
                arguments: {
                    type: "PAINT",
                    name: "",
                },
            },
            {
                name: "style_manage",
                field: "name",
                arguments: {
                    type: "PAINT",
                    styleId: "S:1",
                    currentStyleName: "Style",
                    name: "",
                },
            },
            {
                name: "component_manage_property",
                field: "propertyName",
                arguments: {
                    nodeId: "1:2",
                    nodeName: "Component",
                    action: "ADD",
                    propertyName: "",
                    propertyType: "TEXT",
                    defaultValue: "Default",
                },
            },
            {
                name: "component_manage_property",
                field: "newPropertyName",
                arguments: {
                    nodeId: "1:2",
                    nodeName: "Component",
                    action: "EDIT",
                    propertyName: "Existing",
                    newPropertyName: "",
                },
            },
            {
                name: "node_rename",
                field: "name",
                arguments: {
                    nodeId: "1:2",
                    nodeName: "Old",
                    name: "",
                },
            },
            {
                name: "node_group",
                field: "name",
                arguments: {
                    nodes: [
                        { nodeId: "1:2", nodeName: "A" },
                        { nodeId: "1:3", nodeName: "B" },
                    ],
                    name: "",
                },
            },
        ];

        for (const call of calls) {
            const before = dispatchCount;
            const result = await client.callTool({
                name: call.name,
                arguments: call.arguments,
            });
            expect(
                result.isError,
                `${call.name}.${call.field} exact-empty call unexpectedly succeeded`,
            ).toBe(true);
            const text = result.content
                .map((entry: any) => entry.text ?? "")
                .join("\n");
            expect(text, `${call.name} must expose Invalid Params`).toContain(
                "MCP error -32602",
            );
            expect(text).toContain("Input validation error");
            expect(text, `${call.name} must identify ${call.field}`).toContain(
                `"${call.field}"`,
            );
            expect(
                dispatchCount,
                `${call.name}.${call.field} must not dispatch`,
            ).toBe(before);
        }
    });

    it("F78-21/Change 3: omission, whitespace, and ordinary controls dispatch without normalization", async () => {
        const dispatched: Array<{ command: string; params: any }> = [];
        const acceptedResults: any[] = [];
        commandBehavior = async (command: string, params?: any) => {
            dispatched.push({ command, params });
            if (command === "variable_manage") {
                return { id: "VariableID:1", name: params.name ?? "Variable" };
            }
            if (command === "component_manage_property") {
                return {
                    id: "1:2",
                    name: "Component",
                    action: params.action,
                    propertyName:
                        params.newPropertyName ?? params.propertyName,
                };
            }
            if (command === "node_rename") {
                return { id: "1:2", name: params.name, oldName: "Old" };
            }
            return { id: "1:9", name: params.name ?? "Group", childCount: 2 };
        };

        acceptedResults.push(await client.callTool({
            name: "variable_manage",
            arguments: { action: "CREATE_COLLECTION", name: "Default Collection" },
        }));
        acceptedResults.push(await client.callTool({
            name: "variable_manage",
            arguments: {
                action: "CREATE_COLLECTION",
                name: "Whitespace Collection",
                modeName: " ",
            },
        }));
        acceptedResults.push(await client.callTool({
            name: "variable_manage",
            arguments: {
                action: "UPDATE_VARIABLE",
                variableId: "VariableID:1",
                currentVariableName: "Variable",
            },
        }));
        acceptedResults.push(await client.callTool({
            name: "component_manage_property",
            arguments: {
                nodeId: "1:2",
                nodeName: "Component",
                action: "ADD",
                propertyName: " ",
                propertyType: "TEXT",
                defaultValue: "Default",
            },
        }));
        acceptedResults.push(await client.callTool({
            name: "component_manage_property",
            arguments: {
                nodeId: "1:2",
                nodeName: "Component",
                action: "ADD",
                propertyName: "Label",
                propertyType: "TEXT",
                defaultValue: "Default",
            },
        }));
        acceptedResults.push(await client.callTool({
            name: "component_manage_property",
            arguments: {
                nodeId: "1:2",
                nodeName: "Component",
                action: "EDIT",
                propertyName: "Label",
            },
        }));
        acceptedResults.push(await client.callTool({
            name: "component_manage_property",
            arguments: {
                nodeId: "1:2",
                nodeName: "Component",
                action: "EDIT",
                propertyName: "",
                newDefaultValue: "After",
            },
        }));
        acceptedResults.push(await client.callTool({
            name: "component_manage_property",
            arguments: {
                nodeId: "1:2",
                nodeName: "Component",
                action: "EDIT",
                propertyName: "Label",
                newPropertyName: " ",
            },
        }));
        acceptedResults.push(await client.callTool({
            name: "node_rename",
            arguments: {
                nodeId: "1:2",
                nodeName: "Old",
                name: " ",
            },
        }));
        acceptedResults.push(await client.callTool({
            name: "node_group",
            arguments: {
                nodes: [
                    { nodeId: "1:2", nodeName: "A" },
                    { nodeId: "1:3", nodeName: "B" },
                ],
            },
        }));

        for (const result of acceptedResults) {
            expect(result.isError).toBeFalsy();
        }

        expect(dispatched.map(({ command }) => command)).toEqual([
            "variable_manage",
            "variable_manage",
            "variable_manage",
            "component_manage_property",
            "component_manage_property",
            "component_manage_property",
            "component_manage_property",
            "component_manage_property",
            "node_rename",
            "node_group",
        ]);
        expect(Object.hasOwn(dispatched[0].params, "modeName")).toBe(false);
        expect(dispatched[1].params.modeName).toBe(" ");
        expect(Object.hasOwn(dispatched[2].params, "name")).toBe(false);
        expect(dispatched[3].params.propertyName).toBe(" ");
        expect(dispatched[4].params.propertyName).toBe("Label");
        expect(Object.hasOwn(dispatched[5].params, "newPropertyName")).toBe(false);
        expect(dispatched[6].params.propertyName).toBe("");
        expect(Object.hasOwn(dispatched[6].params, "newPropertyName")).toBe(false);
        expect(dispatched[7].params.newPropertyName).toBe(" ");
        expect(dispatched[8].params.name).toBe(" ");
        expect(Object.hasOwn(dispatched[9].params, "name")).toBe(false);
    });
});
