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

    /**
     * F78-21: the name-ASSIGNMENT class, pinned as an inventory.
     *
     * F78-15 fixed the five creator surfaces it enumerated. Live probing on
     * channel `a7ps` (2026-07-27) found the same defect on two more tools that
     * assign a user-visible name — `node_rename` renamed a node to `Rectangle`
     * and `node_group` produced `Group`, both reporting success — because the
     * defect was closed instance-by-instance rather than as a class.
     *
     * This test pins the whole class so a new name-assigning tool cannot be
     * added off-contract. Membership rule: the field ASSIGNS a user-visible
     * name. Lookup/verification fields (`nodeName`, `styleName`, `propertyName`,
     * `collectionName`) are deliberately excluded — a present-empty
     * verification value is compared exactly, per C9 — as are content fields
     * (`text`, `labelMarkdown`), which have their own contracts.
     */
    const NAME_ASSIGNMENT_FIELDS: ReadonlyArray<readonly [string, string]> = [
        ["create_shape", "name"],
        ["create_frame", "name"],
        ["create_text", "name"],
        ["create_svg", "name"],
        ["create_component_set", "componentSetName"],
        ["node_rename", "name"],
        ["node_group", "name"],
        ["component_manage_property", "newPropertyName"],
    ];

    it("F78-21: every name-assignment field advertises a non-empty constraint in tools/list", () => {
        const offenders: string[] = [];
        for (const [toolName, field] of NAME_ASSIGNMENT_FIELDS) {
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

    it("F78-21: style_manage and variable_manage refuse an exact-empty name by refinement", async () => {
        // These two carry the same class membership but enforce it with a
        // superRefine rather than minLength, because the requirement is
        // action-conditional. Asserted behaviourally so the mechanism can
        // differ while the contract cannot.
        const registered = (server as any)._registeredTools;
        const cases = [
            { name: "style_manage", args: { type: "PAINT", name: "" } },
            { name: "variable_manage", args: { action: "CREATE_COLLECTION", name: "" } },
        ];
        for (const probe of cases) {
            const result = await registered[probe.name].inputSchema.safeParseAsync(probe.args);
            expect(result.success, `${probe.name} must refuse an exact-empty name`).toBe(false);
            const messages = result.error.issues.map((issue: any) => issue.message).join(" | ");
            expect(messages, `${probe.name} names the empty cause distinctly`).toContain("must not be empty");
        }
    });

    it("F78-21: node_rename and node_group reject an exact-empty name without dispatch", async () => {
        let dispatchCount = 0;
        commandBehavior = async () => {
            dispatchCount++;
            throw new Error("empty-name validation must prevent dispatch");
        };

        const calls = [
            { name: "node_rename", arguments: { nodeId: "1:2", nodeName: "Old", name: "" } },
            {
                name: "node_group",
                arguments: {
                    nodes: [
                        { nodeId: "1:2", nodeName: "A" },
                        { nodeId: "1:3", nodeName: "B" },
                    ],
                    name: "",
                },
            },
        ];

        const registered = (server as any)._registeredTools;
        for (const call of calls) {
            const schemaResult = await registered[call.name].inputSchema.safeParseAsync(call.arguments);
            expect(
                schemaResult.success,
                `${call.name}'s registered schema must reject an exact-empty name`,
            ).toBe(false);

            // Whitespace is a real name and is preserved by Figma
            // (live-verified on a7ps) — it must keep passing.
            const whitespaceResult = await registered[call.name].inputSchema.safeParseAsync({
                ...call.arguments,
                name: " ",
            });
            expect(
                whitespaceResult.success,
                `${call.name} must continue to accept whitespace`,
            ).toBe(true);

            let validationError: any;
            try {
                await (server as any).validateToolInput(registered[call.name], call.arguments, call.name);
            } catch (caught) {
                validationError = caught;
            }
            expect(
                validationError,
                `${call.name}'s SDK validation must throw Invalid Params`,
            ).toBeDefined();
        }
        expect(dispatchCount, "no empty-name call may reach the plugin").toBe(0);
    });

    it("F78-21: omitting the optional name still dispatches, so the default is unchanged", async () => {
        let dispatched: any = null;
        commandBehavior = async (command: string, params?: any) => {
            dispatched = { command, params };
            return { id: "1:9", name: "Group", childCount: 2 };
        };
        await client.callTool({
            name: "node_group",
            arguments: {
                nodes: [
                    { nodeId: "1:2", nodeName: "A" },
                    { nodeId: "1:3", nodeName: "B" },
                ],
            },
        });
        expect(dispatched.command).toBe("node_group");
        expect(dispatched.params.name).toBeUndefined();
    });
});
