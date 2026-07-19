import { describe, it, expect, mock, beforeEach } from "bun:test";
import { z } from "zod";
import { registerVariableTools } from "../../../tools/variable.js";
import { registerStyleTools } from "../../../tools/style.js";
import { withStrictInputSchemas } from "../../../tools/index.js";
import { OPERATIONAL_CODES, VERIFICATION_CODES, RATIFIED_CODES, UNKNOWN_ERROR } from "../../../../shared/errorCodes.js";
import { ERRORS, REFUSALS, getStructuredError } from "../../../../../figma_plugin/utils/errors.js";

// Loaded under a cache-busting query key so this file always gets the REAL
// module: other test files replace "figma-client.js" via mock.module with
// factories that omit FigmaError, and bun's module mocks persist across files.
const { FigmaError } = await import("../../../figma-client.js?phase4-real");
import { handleVariableRequest } from "../../../../../figma_plugin/handlers/variableHandlers.js";
import { createStyle } from "../../../../../figma_plugin/handlers/styleHandlers.js";

// =============================================================================
// 1. SCHEMA & DESCRIPTION-MARKER TESTS
// =============================================================================

describe("v2.3.3 Phase 4: Schema Rejection & Description-Marker Tests", () => {
    let variableManageSchema: z.ZodObject<any>;
    let variableManageDescription: string;
    let styleManageSchema: z.ZodObject<any>;
    let styleManageDescription: string;

    beforeEach(() => {
        const mockServer: any = {
            registerTool: (name: string, config: any, cb: any) => {
                if (name === "variable_manage") {
                    variableManageSchema = config.inputSchema;
                    variableManageDescription = config.description;
                } else if (name === "style_manage") {
                    styleManageSchema = config.inputSchema;
                    styleManageDescription = config.description;
                }
            }
        };

        registerVariableTools(mockServer);
        registerStyleTools(mockServer);
    });

    it("description markers are present in both tool and field descriptions", () => {
        // variable_manage descriptions
        expect(variableManageDescription).toContain("UPDATE_VARIABLE requires `currentVariableName`");
        expect(variableManageDescription).toContain("CREATE_VARIABLE requires `collectionName` and `scopes`");

        const varFields = variableManageSchema.shape;
        expect(varFields.currentVariableName.description).toContain("REQUIRED for UPDATE_VARIABLE");
        expect(varFields.collectionName.description).toContain("REQUIRED for CREATE_VARIABLE");
        expect(varFields.scopes.description).toContain("REQUIRED for CREATE_VARIABLE");

        // style_manage descriptions
        expect(styleManageDescription).toContain("UPDATE requires currentStyleName");
        const styleFields = styleManageSchema.shape;
        expect(styleFields.currentStyleName.description).toContain("REQUIRED for UPDATE when styleId is supplied");
        expect(styleFields.name.description).toContain("REQUIRED for CREATE");
    });

    it("variable_manage schema rejects invalid actions and missing conditional parameters", () => {
        // UPDATE_VARIABLE failures
        const updateMissingVarName = variableManageSchema.safeParse({
            action: "UPDATE_VARIABLE",
            variableId: "var-123"
            // currentVariableName omitted
        });
        expect(updateMissingVarName.success).toBe(false);
        if (!updateMissingVarName.success) {
            expect(updateMissingVarName.error.message).toContain("currentVariableName is required");
        }

        const updateMissingVarId = variableManageSchema.safeParse({
            action: "UPDATE_VARIABLE",
            currentVariableName: "MyVar"
            // variableId omitted
        });
        expect(updateMissingVarId.success).toBe(false);
        if (!updateMissingVarId.success) {
            expect(updateMissingVarId.error.message).toContain("variableId is required");
        }

        // CREATE_VARIABLE failures
        const createMissingCollName = variableManageSchema.safeParse({
            action: "CREATE_VARIABLE",
            collectionId: "coll-123",
            name: "NewVar",
            type: "STRING",
            scopes: ["ALL_SCOPES"]
            // collectionName omitted
        });
        expect(createMissingCollName.success).toBe(false);
        if (!createMissingCollName.success) {
            expect(createMissingCollName.error.message).toContain("collectionName is required");
        }

        const createMissingScopes = variableManageSchema.safeParse({
            action: "CREATE_VARIABLE",
            collectionId: "coll-123",
            collectionName: "MyColl",
            name: "NewVar",
            type: "STRING"
            // scopes omitted
        });
        expect(createMissingScopes.success).toBe(false);
        if (!createMissingScopes.success) {
            expect(createMissingScopes.error.message).toContain("scopes is required");
        }

        // Happy paths succeed
        const updateHappy = variableManageSchema.safeParse({
            action: "UPDATE_VARIABLE",
            variableId: "var-123",
            currentVariableName: "MyVar",
            value: "Hello",
            modeId: "mode-1"
        });
        expect(updateHappy.success).toBe(true);

        const createHappy = variableManageSchema.safeParse({
            action: "CREATE_VARIABLE",
            collectionId: "coll-123",
            collectionName: "MyColl",
            name: "NewVar",
            type: "STRING",
            scopes: ["ALL_SCOPES"]
        });
        expect(createHappy.success).toBe(true);
    });

    it("style_manage schema rejects missing conditional parameters", () => {
        // UPDATE style failures (styleId supplied, currentStyleName missing)
        const updateMissingStyleName = styleManageSchema.safeParse({
            type: "PAINT",
            styleId: "style-123"
            // currentStyleName omitted
        });
        expect(updateMissingStyleName.success).toBe(false);
        if (!updateMissingStyleName.success) {
            expect(updateMissingStyleName.error.message).toContain("currentStyleName is required");
        }

        // CREATE style failures (no styleId, name missing)
        const createMissingName = styleManageSchema.safeParse({
            type: "PAINT"
            // name omitted
        });
        expect(createMissingName.success).toBe(false);
        if (!createMissingName.success) {
            expect(createMissingName.error.message).toContain("name is required to create a new style");
        }

        // Happy paths succeed
        const updateHappy = styleManageSchema.safeParse({
            type: "PAINT",
            styleId: "style-123",
            currentStyleName: "MyStyle",
            properties: { paints: [] }
        });
        expect(updateHappy.success).toBe(true);

        const createHappy = styleManageSchema.safeParse({
            type: "PAINT",
            name: "NewStyle",
            properties: { paints: [] }
        });
        expect(createHappy.success).toBe(true);
    });

    it("P4-2: an explicitly empty styleId is rejected — never silently a create", () => {
        const emptyId = styleManageSchema.safeParse({
            type: "PAINT",
            styleId: "",
            name: "Accidental creation"
        });
        expect(emptyId.success).toBe(false);
        if (!emptyId.success) {
            expect(emptyId.error.message).toContain("styleId must not be empty");
        }
    });

    it("P4-6: empty names are rejected on style and variable updates", () => {
        const styleEmptyName = styleManageSchema.safeParse({
            type: "PAINT",
            styleId: "style-123",
            currentStyleName: "MyStyle",
            name: ""
        });
        expect(styleEmptyName.success).toBe(false);
        if (!styleEmptyName.success) {
            expect(styleEmptyName.error.message).toContain("name must not be empty");
        }

        const varEmptyName = variableManageSchema.safeParse({
            action: "UPDATE_VARIABLE",
            variableId: "var-1",
            currentVariableName: "MyVar",
            name: ""
        });
        expect(varEmptyName.success).toBe(false);
        if (!varEmptyName.success) {
            expect(varEmptyName.error.message).toContain("name must not be empty");
        }
    });
});

// =============================================================================
// 2. STRUCTURED ERROR TRANSPORT — the production code, not a copy
// =============================================================================

describe("v2.3.3 Phase 4: Structured Error Transport (production wrapper)", () => {
    it("FigmaError extracts code/message/details from a structured error object", () => {
        const figmaError = new FigmaError({
            code: "TEST_CODE",
            message: "Test message string",
            details: { foo: "bar" }
        });
        expect(figmaError.code).toBe("TEST_CODE");
        expect(figmaError.message).toBe("Test message string");
        expect(figmaError.details).toEqual({ foo: "bar" });
    });

    it("FigmaError falls back to UNKNOWN_ERROR for legacy string errors (Q16)", () => {
        const figmaError = new FigmaError("plain legacy string");
        expect(figmaError.code).toBe("UNKNOWN_ERROR");
        expect(figmaError.message).toBe("plain legacy string");
        expect(figmaError.details).toBeUndefined();
    });

    // Registers a synthetic tool through the REAL withStrictInputSchemas proxy
    // and returns the wrapped callback the proxy hands to the server.
    function wrapThroughProduction(cb: any) {
        let wrappedCb: any;
        const mockServer: any = {
            registerTool: (_name: string, _config: any, wrapped: any) => {
                wrappedCb = wrapped;
            }
        };
        const strict = withStrictInputSchemas(mockServer);
        (strict as any).registerTool("synthetic_tool", { inputSchema: z.object({}) }, cb);
        return wrappedCb;
    }

    it("the wrapper converts a thrown coded error into isError + structuredContent, code in the text fallback", async () => {
        const wrapped = wrapThroughProduction(async () => {
            throw new FigmaError({
                code: "COLLECTION_NAME_MISMATCH",
                message: "Mismatch collection name error",
                details: { coll: "Test" }
            });
        });

        const result = await wrapped({}, {});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Error [COLLECTION_NAME_MISMATCH]: Mismatch collection name error");
        expect(result.structuredContent.error.code).toBe("COLLECTION_NAME_MISMATCH");
        expect(result.structuredContent.error.message).toBe("Mismatch collection name error");
        expect(result.structuredContent.error.details).toEqual({ coll: "Test" });
    });

    it("the wrapper defaults uncoded and degenerate throws to UNKNOWN_ERROR without crashing", async () => {
        for (const thrown of [new Error("plain failure"), "bare string", null]) {
            const wrapped = wrapThroughProduction(async () => { throw thrown; });
            const result = await wrapped({}, {});
            expect(result.isError).toBe(true);
            expect(result.structuredContent.error.code).toBe("UNKNOWN_ERROR");
            expect(result.content[0].text).toContain("Error [UNKNOWN_ERROR]");
        }
    });

    it("the wrapper passes successful results through untouched", async () => {
        const success = { content: [{ type: "text", text: "ok" }], structuredContent: { id: "1" } };
        const wrapped = wrapThroughProduction(async () => success);
        expect(await wrapped({}, {})).toBe(success);
    });
});

// =============================================================================
// 2b. DISPATCHER TRANSPORT — the real main.ts command-error envelope
// =============================================================================

describe("v2.3.3 Phase 4: Dispatcher emits structured errors (real main.ts)", () => {
    const pendingResolvers = new Map<string | number, (msg: any) => void>();
    const dispatchFigma: any = {
        showUI: () => { },
        ui: {
            onmessage: null as any,
            postMessage: (msg: any) => {
                const resolver = pendingResolvers.get(msg.id);
                if (resolver) {
                    resolver(msg);
                    pendingResolvers.delete(msg.id);
                }
            },
        },
        on: () => { },
        notify: () => { },
        closePlugin: () => { },
        clientStorage: { setAsync: async () => { } },
        getNodeByIdAsync: async () => null,
        root: { id: "doc", name: "Doc", children: [] as any[] },
        mixed: Symbol("mixed"),
        loadFontAsync: async () => { },
        variables: {
            getVariableByIdAsync: async () => null,
        },
    };

    function runCommand(onmessage: any, command: string, params: any): Promise<any> {
        return new Promise((resolve) => {
            const id = `phase4-${Math.random()}`;
            pendingResolvers.set(id, resolve);
            void Promise.resolve(onmessage({ type: "execute-command", command, params, id }));
        });
    }

    it("a coded refusal and a legacy string both arrive as {code, message} envelopes", async () => {
        (globalThis as any).__html__ = "<html></html>";
        (globalThis as any).figma = dispatchFigma;
        const mainMod: any = await import("../../../../../figma_plugin/src/main.js?scope=phase4transport");
        const pluginState = mainMod.getPluginState();
        const onmessage = dispatchFigma.ui.onmessage;
        pluginState.allowEditVariable = true;

        // Coded path: the handler's VARIABLE_NAME_MISSING refusal survives to
        // the command-error envelope with its code intact.
        const coded = await runCommand(onmessage, "variable_manage", {
            action: "UPDATE_VARIABLE",
            variableId: "var-1"
            // currentVariableName omitted
        });
        expect(coded.type).toBe("command-error");
        expect(coded.error.code).toBe("VARIABLE_NAME_MISSING");
        expect(coded.error.message).toContain("variable_list");
        expect(coded.error.message).toContain("pass it back verbatim");

        // Legacy path: an uncoded handler throw becomes the ratified
        // UNKNOWN_ERROR fallback with the message preserved (Q16 — codes are
        // never derived from message prose).
        const legacy = await runCommand(onmessage, "variable_manage", {
            action: "UPDATE_VARIABLE",
            variableId: "var-does-not-exist",
            currentVariableName: "Anything"
        });
        expect(legacy.type).toBe("command-error");
        expect(legacy.error.code).toBe("UNKNOWN_ERROR");
        expect(legacy.error.message).toContain("not found");
    });
});

// =============================================================================
// 2c. CODE-INVENTORY PARITY (Q16 / review finding P4-5)
// =============================================================================

describe("v2.3.3 Phase 4: Error-code inventory parity", () => {
    it("the ratified inventory is exact: seventeen codes plus the fallback, no duplicates", () => {
        expect(RATIFIED_CODES.length).toBe(18);
        expect(new Set(RATIFIED_CODES).size).toBe(RATIFIED_CODES.length);
        expect(RATIFIED_CODES).toContain(UNKNOWN_ERROR);
    });

    it("every ratified operational code is registered in the plugin's central ERRORS table", () => {
        for (const code of OPERATIONAL_CODES) {
            expect(typeof ERRORS[code], `ERRORS.${code} missing`).toBe("string");
            expect(ERRORS[code].length).toBeGreaterThan(0);
        }
    });

    it("every ratified verification code has exactly one message factory producing its own code", () => {
        expect(Object.keys(REFUSALS).sort()).toEqual([...VERIFICATION_CODES].sort());
        for (const code of VERIFICATION_CODES) {
            const produced = (REFUSALS as any)[code].length > 0
                ? (REFUSALS as any)[code]("stored-operand", "received-operand")
                : (REFUSALS as any)[code]();
            expect(produced.code).toBe(code);
            expect(produced.message).toContain("Operation Denied:");
        }
    });

    it("mismatch factories carry operands, the read tool, and the verbatim instruction (D5 + D9 merged)", () => {
        const cases: Array<[string, string]> = [
            ["VARIABLE_NAME_MISMATCH", "variable_list"],
            ["COLLECTION_NAME_MISMATCH", "variable_list"],
            ["STYLE_NAME_MISMATCH", "style_list"],
        ];
        for (const [code, readTool] of cases) {
            const msg = (REFUSALS as any)[code]("StoredName", "ReceivedName").message;
            expect(msg).toContain('"StoredName"');
            expect(msg).toContain('"ReceivedName"');
            expect(msg).toContain(readTool);
            expect(msg).toContain("pass it back verbatim");
        }
    });

    it("the plugin fallback and the shared constant agree; codes are never derived from prose", () => {
        const fallback = getStructuredError(new Error("Operation Denied: some legacy refusal text"));
        expect(fallback.code).toBe(UNKNOWN_ERROR); // prose prefix must NOT produce a code
        expect(fallback.message).toContain("some legacy refusal text");

        const coded = getStructuredError({ code: "ANY_FUTURE_CODE", message: "m", details: { a: 1 } });
        expect(coded.code).toBe("ANY_FUTURE_CODE"); // structural pass-through, untouched
    });
});

// =============================================================================
// 3. PLUGIN-LEVEL VALIDATION & MUTATION SAFETY TESTS
// =============================================================================

describe("v2.3.3 Phase 4: Plugin-level Verification & Mutative Safety", () => {
    let mockVariable: any;
    let mockCollection: any;
    let mockStyle: any;

    beforeEach(() => {
        mockVariable = {
            id: "var-1",
            name: "MyVariable",
            remote: false,
            variableCollectionId: "coll-1",
            scopes: ["ALL_SCOPES"],
            setValueForMode: mock((mode: string, val: any) => {}),
            remove: mock(() => {})
        };

        mockCollection = {
            id: "coll-1",
            name: "MyCollection",
            defaultModeId: "mode-1",
            modes: [{ modeId: "mode-1", name: "Default" }]
        };

        mockStyle = {
            id: "style-1",
            name: "MyStyle",
            type: "PAINT",
            remote: false,
            paints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
            remove: mock(() => {})
        };

        global.figma = {
            variables: {
                getVariableByIdAsync: async (id: string) => id === mockVariable.id ? mockVariable : null,
                getVariableCollectionByIdAsync: async (id: string) => id === mockCollection.id ? mockCollection : null,
                createVariable: mock((name: string, collection: any, type: string) => mockVariable)
            },
            getStyleByIdAsync: async (id: string) => id === mockStyle.id ? mockStyle : null,
            loadFontAsync: async (font: any) => {}
        } as any;
    });

    it("UPDATE_VARIABLE requires currentVariableName and rejects mismatch without modifying variable", async () => {
        // Missing currentVariableName
        let caughtErr: any;
        try {
            await handleVariableRequest({
                action: "UPDATE_VARIABLE",
                variableId: "var-1",
                name: "NewName"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("VARIABLE_NAME_MISSING");
        expect(mockVariable.name).toBe("MyVariable"); // Unchanged

        // Empty string is missing too — the plugin matches the schema layer.
        caughtErr = undefined;
        try {
            await handleVariableRequest({
                action: "UPDATE_VARIABLE",
                variableId: "var-1",
                currentVariableName: "",
                name: "NewName"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("VARIABLE_NAME_MISSING");

        // Mismatched currentVariableName — the refusal carries both operands
        // and the recovery (D5 stored/received labels + D9 read tool).
        caughtErr = undefined;
        try {
            await handleVariableRequest({
                action: "UPDATE_VARIABLE",
                variableId: "var-1",
                currentVariableName: "WrongName",
                name: "NewName"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("VARIABLE_NAME_MISMATCH");
        expect(caughtErr.message).toContain('stored name "MyVariable"');
        expect(caughtErr.message).toContain('received currentVariableName "WrongName"');
        expect(caughtErr.message).toContain("variable_list");
        expect(caughtErr.message).toContain("pass it back verbatim");
        expect(mockVariable.name).toBe("MyVariable"); // Unchanged
    });

    it("UPDATE_VARIABLE with invalid modeId does not mutate any fields", async () => {
        let caughtErr: any;
        try {
            await handleVariableRequest({
                action: "UPDATE_VARIABLE",
                variableId: "var-1",
                currentVariableName: "MyVariable",
                name: "NewName",
                description: "New Description",
                value: 42,
                modeId: "invalid-mode-id" // Invalid mode
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(mockVariable.name).toBe("MyVariable"); // Unchanged
        expect(mockVariable.description).toBeUndefined(); // Unchanged
        expect(mockVariable.setValueForMode).not.toHaveBeenCalled(); // No value mutation
    });

    it("Q17: an alias value with a dangling target mutates nothing", async () => {
        let caughtErr: any;
        try {
            await handleVariableRequest({
                action: "UPDATE_VARIABLE",
                variableId: "var-1",
                currentVariableName: "MyVariable",
                name: "NewName",
                value: { type: "VARIABLE_ALIAS", id: "var-does-not-exist" },
                modeId: "mode-1"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.message).toContain("Alias target variable not found");
        expect(mockVariable.name).toBe("MyVariable"); // Unchanged
        expect(mockVariable.setValueForMode).not.toHaveBeenCalled();
    });

    it("Q18: an unexpected failure after a write carries partialMutation with before-values; a clean failure never does", async () => {
        // Unexpected mid-update failure: name applies, then the value write throws.
        mockVariable.setValueForMode = mock(() => { throw new Error("figma exploded"); });
        let caughtErr: any;
        try {
            await handleVariableRequest({
                action: "UPDATE_VARIABLE",
                variableId: "var-1",
                currentVariableName: "MyVariable",
                name: "NewName",
                value: 42,
                modeId: "mode-1"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.details.partialMutation).toBe(true);
        expect(caughtErr.details.before.name).toBe("MyVariable");
        expect(caughtErr.details.whatChanged).toContain("name");
        expect(caughtErr.message).toContain("figma exploded");
        expect(caughtErr.message).toContain("Partial mutation");

        // Clean failure (mismatch refusal, nothing written): no flag.
        caughtErr = undefined;
        try {
            await handleVariableRequest({
                action: "UPDATE_VARIABLE",
                variableId: "var-1",
                currentVariableName: "WrongName"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.details?.partialMutation).toBeUndefined();
    });

    it("CREATE_VARIABLE requires collectionName and rejects mismatch without creating variable", async () => {
        // Missing collectionName
        let caughtErr: any;
        try {
            await handleVariableRequest({
                action: "CREATE_VARIABLE",
                collectionId: "coll-1",
                name: "NewVar",
                type: "FLOAT",
                scopes: ["ALL_SCOPES"]
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("COLLECTION_NAME_MISSING");
        expect(figma.variables.createVariable).not.toHaveBeenCalled();

        // Mismatched collectionName
        caughtErr = undefined;
        try {
            await handleVariableRequest({
                action: "CREATE_VARIABLE",
                collectionId: "coll-1",
                collectionName: "WrongCollectionName",
                name: "NewVar",
                type: "FLOAT",
                scopes: ["ALL_SCOPES"]
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("COLLECTION_NAME_MISMATCH");
        expect(caughtErr.message).toContain('stored name "MyCollection"');
        expect(figma.variables.createVariable).not.toHaveBeenCalled();
    });

    it("CREATE_VARIABLE without scopes is a coded refusal (schema backstop, D5)", async () => {
        let caughtErr: any;
        try {
            await handleVariableRequest({
                action: "CREATE_VARIABLE",
                collectionId: "coll-1",
                collectionName: "MyCollection",
                name: "NewVar",
                type: "FLOAT"
                // scopes omitted
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("VARIABLE_SCOPES_MISSING");
        expect(figma.variables.createVariable).not.toHaveBeenCalled();
    });

    it("style_manage requires currentStyleName on update and rejects mismatch without modifying style", async () => {
        // Missing currentStyleName
        let caughtErr: any;
        try {
            await createStyle({
                type: "PAINT",
                styleId: "style-1",
                name: "NewStyleName"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("STYLE_NAME_MISSING");
        expect(mockStyle.name).toBe("MyStyle"); // Unchanged

        // Mismatched currentStyleName
        caughtErr = undefined;
        try {
            await createStyle({
                type: "PAINT",
                styleId: "style-1",
                currentStyleName: "WrongStyleName",
                name: "NewStyleName"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("STYLE_NAME_MISMATCH");
        expect(caughtErr.message).toContain('stored name "MyStyle"');
        expect(caughtErr.message).toContain("style_list");
        expect(mockStyle.name).toBe("MyStyle"); // Unchanged
    });

    it("style_manage update without name does not rename style", async () => {
        await createStyle({
            type: "PAINT",
            styleId: "style-1",
            currentStyleName: "MyStyle",
            description: "Updated Description"
        });
        expect(mockStyle.name).toBe("MyStyle"); // Unchanged
        expect(mockStyle.description).toBe("Updated Description");
    });

    it("style_manage fails variable binding pre-mutation without modifying anything", async () => {
        let caughtErr: any;
        try {
            await createStyle({
                type: "PAINT",
                styleId: "style-1",
                currentStyleName: "MyStyle",
                name: "NewStyleName",
                bindVariables: {
                    color: "non-existent-var-id" // Mismatch variable binding
                }
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(mockStyle.name).toBe("MyStyle"); // Unchanged
    });

    it("P4-2 (plugin defense): styleId '' takes the update path and fails closed — no style is created", async () => {
        const createPaintStyle = mock(() => ({ id: "new", name: "", type: "PAINT" }));
        (global.figma as any).createPaintStyle = createPaintStyle;
        let caughtErr: any;
        try {
            await createStyle({
                type: "PAINT",
                styleId: "",
                currentStyleName: "MyStyle",
                name: "Accidental creation"
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.message).toContain("not found");
        expect(createPaintStyle).not.toHaveBeenCalled();
    });

    it("P4-6 (plugin defense): an empty name is rejected before any mutation", async () => {
        let caughtErr: any;
        try {
            await createStyle({
                type: "PAINT",
                styleId: "style-1",
                currentStyleName: "MyStyle",
                name: ""
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.message).toContain("must not be empty");
        expect(mockStyle.name).toBe("MyStyle"); // Unchanged
        expect(caughtErr.details?.partialMutation).toBeUndefined(); // Clean failure
    });

    it("P4-3: an empty bindVariables map is a no-op — a paintless style still renames cleanly", async () => {
        mockStyle.paints = [];
        const res = await createStyle({
            type: "PAINT",
            styleId: "style-1",
            currentStyleName: "MyStyle",
            name: "Renamed",
            bindVariables: {}
        });
        expect(res.name).toBe("Renamed");
        expect(mockStyle.name).toBe("Renamed");
        expect(mockStyle.paints).toEqual([]); // No binding writes attempted
    });

    it("Q17: a PAINT bind against an existing style with no paints fails before any mutation", async () => {
        mockStyle.paints = [];
        let caughtErr: any;
        try {
            await createStyle({
                type: "PAINT",
                styleId: "style-1",
                currentStyleName: "MyStyle",
                name: "NewStyleName",
                bindVariables: { color: "var-1" }
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.message).toContain("no paints");
        expect(mockStyle.name).toBe("MyStyle"); // Not renamed — the check ran pre-mutation
        expect(caughtErr.details?.partialMutation).toBeUndefined(); // Clean failure
    });

    it("Q18: a style update that fails after the rename discloses the partial mutation", async () => {
        let paintsWrites = 0;
        Object.defineProperty(mockStyle, "paints", {
            get() { return [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }]; },
            set() { paintsWrites++; throw new Error("paints write exploded"); },
            configurable: true,
        });
        let caughtErr: any;
        try {
            await createStyle({
                type: "PAINT",
                styleId: "style-1",
                currentStyleName: "MyStyle",
                name: "NewStyleName",
                properties: { paints: [{ type: "SOLID", color: { r: 0, g: 1, b: 0 } }] }
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(paintsWrites).toBe(1);
        expect(caughtErr.details.partialMutation).toBe(true);
        expect(caughtErr.details.before.name).toBe("MyStyle");
        expect(caughtErr.details.whatChanged).toContain("name");
        expect(caughtErr.message).toContain("paints write exploded");
        expect(mockStyle.remove).not.toHaveBeenCalled(); // Never roll back an update
    });

    it("Q19: a TEXT style update loads the target font before any mutation", async () => {
        mockStyle = {
            id: "style-1",
            name: "MyTextStyle",
            type: "TEXT",
            remote: false,
            fontName: { family: "Custom Font", style: "Bold" },
            remove: mock(() => {})
        };
        (global.figma as any).loadFontAsync = mock(async () => { throw new Error("font unavailable"); });

        let caughtErr: any;
        try {
            await createStyle({
                type: "TEXT",
                styleId: "style-1",
                currentStyleName: "MyTextStyle",
                name: "Renamed",
                properties: { fontSize: 20 }
            });
        } catch (e: any) {
            caughtErr = e;
        }
        expect(caughtErr).toBeDefined();
        expect(caughtErr.message).toContain("font unavailable");
        // The load used the style's ACTUAL font, and failed BEFORE the rename.
        expect((global.figma as any).loadFontAsync).toHaveBeenCalledWith({ family: "Custom Font", style: "Bold" });
        expect(mockStyle.name).toBe("MyTextStyle");
        expect(caughtErr.details?.partialMutation).toBeUndefined(); // Clean failure — nothing mutated
    });

    it("Positive path: fully verified operations succeed", async () => {
        // Variable update succeeds
        const varRes = await handleVariableRequest({
            action: "UPDATE_VARIABLE",
            variableId: "var-1",
            currentVariableName: "MyVariable",
            name: "NewVariable",
            value: 42,
            modeId: "mode-1"
        });
        expect(varRes.success).toBe(true);
        expect(mockVariable.name).toBe("NewVariable");
        expect(mockVariable.setValueForMode).toHaveBeenCalledWith("mode-1", 42);

        // Style update succeeds
        const styleRes = await createStyle({
            type: "PAINT",
            styleId: "style-1",
            currentStyleName: "MyStyle",
            name: "NewStyle"
        });
        expect(styleRes.name).toBe("NewStyle");
        expect(mockStyle.name).toBe("NewStyle");
    });
});
