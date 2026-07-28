import { describe, it, expect, mock, beforeEach } from "bun:test";
import { z } from "zod";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { registerVariableTools } from "../../../tools/variable.js";
import { registerStyleTools } from "../../../tools/style.js";
import { withStrictInputSchemas } from "../../../tools/index.js";
import { OPERATIONAL_CODES, SOCKET_OPERATIONAL_CODES, CLIENT_OPERATIONAL_CODES, PLUGIN_OPERATIONAL_CODES, VERIFICATION_CODES, PARENT_VERIFICATION_CODES, ANNOTATION_VERIFICATION_CODES, RATIFIED_CODES, UNKNOWN_ERROR } from "../../../../shared/errorCodes.js";
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

    it("Q29: the D5 .superRefine() name-verification messages meet D9's content bar (read tool + pass-back)", () => {
        // Q29 (resolved 2026-07-23, Option B): the schema-layer superRefine
        // messages co-locate with their schema rather than sourcing from the
        // plugin REFUSALS registry, but must still meet D9's CONTENT bar where
        // a read tool supplies the correct value. This test makes that a
        // guarantee, not just a doc claim, so it cannot silently regress.
        const cases: Array<{ parse: any; readTool: string }> = [
            {
                parse: variableManageSchema.safeParse({ action: "UPDATE_VARIABLE", variableId: "v-1" }),
                readTool: "variable_list",
            },
            {
                parse: variableManageSchema.safeParse({ action: "CREATE_VARIABLE", collectionId: "c-1", name: "N", type: "STRING", scopes: ["ALL_SCOPES"] }),
                readTool: "variable_list",
            },
            {
                parse: styleManageSchema.safeParse({ type: "PAINT", styleId: "s-1" }),
                readTool: "style_list",
            },
        ];
        for (const { parse, readTool } of cases) {
            expect(parse.success).toBe(false);
            if (!parse.success) {
                const msg = parse.error.message;
                expect(msg).toContain(readTool);
                expect(msg).toContain("pass it back verbatim");
            }
        }
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

    it("style_manage empty-name recovery distinguishes required CREATE from optional UPDATE", () => {
        const createEmpty = styleManageSchema.safeParse({
            type: "PAINT",
            name: "",
        });
        expect(createEmpty.success).toBe(false);
        if (!createEmpty.success) {
            const message = createEmpty.error.issues
                .map((issue) => issue.message)
                .join(" | ");
            expect(message).toContain("Supply a non-empty name for the new style");
            expect(message).not.toContain("Omit name");
        }

        const updateEmpty = styleManageSchema.safeParse({
            type: "PAINT",
            styleId: "style-123",
            currentStyleName: "MyStyle",
            name: "",
        });
        expect(updateEmpty.success).toBe(false);
        if (!updateEmpty.success) {
            const message = updateEmpty.error.issues
                .map((issue) => issue.message)
                .join(" | ");
            expect(message).toContain(
                "Omit name to leave the style's name unchanged",
            );
            expect(message).not.toContain(
                "Supply a non-empty name for the new style",
            );
        }
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
    it("the ratified inventory is exact: twenty-one codes plus the fallback, no duplicates", () => {
        // Rev 46 (Q30): ANNOTATION_CATEGORY_NOT_FOUND joins the inventory.
        // Rev 57: CHANNEL_NOT_BOUND joins it on the same "adds or edits" rule,
        // because P9-F2 made "no binding" a state a failed join can create.
        expect(RATIFIED_CODES.length).toBe(22);
        expect(new Set(RATIFIED_CODES).size).toBe(RATIFIED_CODES.length);
        expect(RATIFIED_CODES).toContain(UNKNOWN_ERROR);
    });

    it("P4-5/Q27: every plugin-thrown ratified code is a REFUSALS factory, not an ERRORS string", () => {
        // Q27 (resolved 2026-07-23) scopes ERRORS to the legacy, pre-v2.3.3
        // surface only. Every code this release adds lives in a factory
        // registry — but Change 5 (P9-F3) sites each factory where the code can
        // actually be THROWN. The four D13 channel-admission codes are decided
        // by the socket bridge, so they live in channelProtocol.ts and are
        // asserted absent here; the plugin registry holds exactly the rest.
        const pluginThrownCodes: readonly string[] = [
            ...PLUGIN_OPERATIONAL_CODES, ...VERIFICATION_CODES, ...PARENT_VERIFICATION_CODES,
            ...ANNOTATION_VERIFICATION_CODES,
        ];

        // The registry keys are exactly the plugin-thrown codes — no more, no less.
        expect(Object.keys(REFUSALS).sort()).toEqual([...pluginThrownCodes].sort());

        // P9-F3: a socket- or client-origin code must never gain a dead plugin
        // mirror. Both are decided outside the Figma sandbox entirely.
        for (const code of [...SOCKET_OPERATIONAL_CODES, ...CLIENT_OPERATIONAL_CODES]) {
            expect(
                code in REFUSALS,
                `REFUSALS.${code} must not exist — ${code} is raised outside the plugin, which can never throw it (P9-F3)`,
            ).toBe(false);
        }

        // Typed iteration over the registry (no `as any`): every factory
        // returns its own key as `code`. Extra operands are harmless for the
        // zero-arg factories, so one call shape covers both arities.
        type RefusalFactory = (...operands: string[]) => { code: string; message: string; details?: unknown };
        for (const [key, factory] of Object.entries(REFUSALS) as Array<[string, RefusalFactory]>) {
            const produced = factory("stored-operand", "received-operand");
            expect(produced.code, `REFUSALS.${key} must return its own key as code`).toBe(key);
            expect(produced.message.length).toBeGreaterThan(0);
        }

        // NO ratified code — operational (either origin), D5, or D6 — may exist
        // in the legacy ERRORS table (a duplicate string entry would be a drift
        // surface). The socket-origin four are included: they must be absent
        // from BOTH plugin-side registries, not merely moved between them.
        for (const code of [...OPERATIONAL_CODES, ...VERIFICATION_CODES, ...PARENT_VERIFICATION_CODES, ...ANNOTATION_VERIFICATION_CODES]) {
            expect(code in ERRORS, `ERRORS.${code} should not exist — ratified codes live in a factory registry (Q27)`).toBe(false);
        }
    });

    it("P4-5: operational + scopes refusal messages carry actionable recovery content, not just non-emptiness", () => {
        // The Phase 10-11 operational codes are placeholders with no live throw
        // site yet, so this is the only guard on their recovery quality until
        // then. VARIABLE_SCOPES_MISSING is the one D5 code with no read tool, so
        // the name-verification content-bar tests below don't cover it — it is
        // included here. Each must tell the caller what to DO (an actionable
        // verb), not merely restate the failure. The four socket-origin D13
        // codes are held to the same bar in socketPeerBinding.test.ts, against
        // the registry that actually defines them (Change 5, P9-F3).
        type RefusalFactory = () => { code: string; message: string };
        const recoveryVerb = /\b(retry|reconnect|pass|read|list|ensure|open|start|ask|find|use|disconnect|specify|supply|update|resolve|report|verify|continue)\b/i;
        for (const code of [...PLUGIN_OPERATIONAL_CODES, "VARIABLE_SCOPES_MISSING"]) {
            const factory = (REFUSALS as Record<string, RefusalFactory>)[code];
            const { message } = factory();
            expect(message.length, `${code} message too short to carry recovery`).toBeGreaterThanOrEqual(25);
            expect(recoveryVerb.test(message), `${code} message names no recovery action`).toBe(true);
        }
    });

    it("P4-5: no ratified code appears as a string literal outside the REFUSALS registry (no inline coded throws)", () => {
        // Source-use invariant via the TS AST: a ratified code as a string
        // LITERAL should appear ONLY in the factory registry
        // (figma_plugin/utils/errors.ts). An inline coded throw
        // (`throw { code: "VARIABLE_NAME_MISSING", ... }`) would place the code
        // string in a handler and fail here; a proper `REFUSALS.CODE()` call
        // references the code as an identifier, not a string literal, so it is
        // invisible to this scan. This is what makes "every live coded throw
        // routes through REFUSALS" a CI-enforced invariant, not a claim.
        const ratified = new Set<string>([
            ...OPERATIONAL_CODES, ...VERIFICATION_CODES, ...PARENT_VERIFICATION_CODES,
            ...ANNOTATION_VERIFICATION_CODES,
        ]);
        const pluginDir = path.resolve(import.meta.dir, "../../../../../figma_plugin");
        const registryFile = path.join("utils", "errors.ts");
        const offenders: string[] = [];

        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir)) {
                const full = path.join(dir, entry);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) { walk(full); continue; }
                if (!entry.endsWith(".ts")) continue;
                const rel = path.relative(pluginDir, full);
                if (rel === registryFile) continue; // the one allowed home

                const text = fs.readFileSync(full, "utf8");
                const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
                const visit = (node: ts.Node) => {
                    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ratified.has(node.text)) {
                        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
                        offenders.push(`${rel}:${line} -> "${node.text}"`);
                    }
                    ts.forEachChild(node, visit);
                };
                visit(sf);
            }
        };
        walk(pluginDir);

        expect(offenders, `ratified code string literals found outside REFUSALS:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("P4-5: no plugin throw reconstructs or spreads a coded error object (must throw REFUSALS.CODE() directly)", () => {
        // The string-literal scan above misses a factory-bypass that rebuilds
        // the object without a literal code, e.g.
        //   throw { code: REFUSALS.VARIABLE_NAME_MISSING().code, message: "..." }
        //   throw { ...REFUSALS.VARIABLE_NAME_MISSING(), message: "..." }
        // Both are object-literal throws. Coded errors must be thrown as the
        // direct call `throw REFUSALS.CODE()` (a CallExpression); legacy uncoded
        // throws are `throw new Error(...)`. So NO plugin throw may throw an
        // object literal at all — that is the enforceable form of "every live
        // coded throw routes through REFUSALS".
        const pluginDir = path.resolve(import.meta.dir, "../../../../../figma_plugin");
        const offenders: string[] = [];

        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir)) {
                const full = path.join(dir, entry);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) { walk(full); continue; }
                if (!entry.endsWith(".ts")) continue;
                const rel = path.relative(pluginDir, full);
                const text = fs.readFileSync(full, "utf8");
                const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
                const visit = (node: ts.Node) => {
                    if (ts.isThrowStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
                        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
                        offenders.push(`${rel}:${line}`);
                    }
                    ts.forEachChild(node, visit);
                };
                visit(sf);
            }
        };
        walk(pluginDir);

        expect(offenders, `object-literal throws found (rebuild/spread-override bypass):\n${offenders.join("\n")}`).toEqual([]);
    });

    it("P4-5: the \"UNKNOWN_ERROR\" string literal appears only in its two approved definitions", () => {
        // A reintroduced hardcoded `errorCode: "UNKNOWN_ERROR"` (the P4-5 fix
        // that was undone by a lax connect-handler test) fails here. Allowed
        // only as the two constant definitions plugin- and server-side.
        const repoRoot = path.resolve(import.meta.dir, "../../../../..");
        const approved = new Set([
            path.join(repoRoot, "figma_plugin", "utils", "errors.ts"),
            path.join(repoRoot, "src", "shared", "errorCodes.ts"),
        ]);
        const roots = [
            path.join(repoRoot, "figma_plugin"),
            path.join(repoRoot, "src"),
        ];
        const offenders: string[] = [];

        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir)) {
                const full = path.join(dir, entry);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) {
                    // Production source only — skip test dirs and build output.
                    if (entry === "tests" || entry === "node_modules" || entry === "dist") continue;
                    walk(full);
                    continue;
                }
                if (!entry.endsWith(".ts")) continue;
                if (approved.has(full)) continue;
                const text = fs.readFileSync(full, "utf8");
                const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
                const visit = (node: ts.Node) => {
                    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === "UNKNOWN_ERROR") {
                        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
                        offenders.push(`${path.relative(repoRoot, full)}:${line}`);
                    }
                    ts.forEachChild(node, visit);
                };
                visit(sf);
            }
        };
        for (const root of roots) walk(root);

        expect(offenders, `"UNKNOWN_ERROR" literal found outside its two approved definitions:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("mismatch factories carry operands, the read tool, and the verbatim instruction (D5 + D9 merged)", () => {
        const cases: Array<[string, string]> = [
            ["VARIABLE_NAME_MISMATCH", "variable_list"],
            ["COLLECTION_NAME_MISMATCH", "variable_list"],
            ["STYLE_NAME_MISMATCH", "style_list"],
            ["PARENT_NAME_MISMATCH", "node_info"],
        ];
        for (const [code, readTool] of cases) {
            const msg = (REFUSALS as any)[code]("StoredName", "ReceivedName").message;
            expect(msg).toContain('"StoredName"');
            expect(msg).toContain('"ReceivedName"');
            expect(msg).toContain(readTool);
            expect(msg).toContain("pass it back verbatim");
        }
    });

    it("missing factories name their read tool and the verbatim instruction (C13 — D9 one-round-trip recovery)", () => {
        const cases: Array<[string, string]> = [
            ["VARIABLE_NAME_MISSING", "variable_list"],
            ["COLLECTION_NAME_MISSING", "variable_list"],
            ["STYLE_NAME_MISSING", "style_list"],
            ["PARENT_NAME_MISSING", "node_info"],
        ];
        for (const [code, readTool] of cases) {
            const msg = (REFUSALS as any)[code]().message;
            expect(msg, `${code} must name its read tool`).toContain(readTool);
            expect(msg, `${code} must say "pass it back verbatim"`).toContain("pass it back verbatim");
        }
    });

    it("the plugin fallback and the shared constant agree; codes are never derived from prose", () => {
        const fallback = getStructuredError(new Error("Operation Denied: some legacy refusal text"));
        expect(fallback.code).toBe(UNKNOWN_ERROR); // prose prefix must NOT produce a code
        expect(fallback.message).toContain("some legacy refusal text");

        const coded = getStructuredError({ code: "ANY_FUTURE_CODE", message: "m", details: { a: 1 } });
        expect(coded.code).toBe("ANY_FUTURE_CODE"); // structural pass-through, untouched
    });

    it("error structuring is total for hostile direct and nested getters", () => {
        const hostile = new Proxy({}, {
            get: () => {
                throw new Error("hostile getter must not escape");
            },
            ownKeys: () => {
                throw new Error("hostile enumeration must not escape");
            },
        });
        expect(getStructuredError(hostile)).toEqual({
            code: UNKNOWN_ERROR,
            message: "Error executing command",
        });

        const codedWithHostileOptionalFields: any = { code: "CODE_SURVIVES" };
        Object.defineProperties(codedWithHostileOptionalFields, {
            message: {
                get: () => {
                    throw new Error("message getter must not escape");
                },
            },
            details: {
                get: () => {
                    throw new Error("details getter must not escape");
                },
            },
        });
        expect(getStructuredError(codedWithHostileOptionalFields)).toEqual({
            code: "CODE_SURVIVES",
            message: "Error executing command",
        });

        const nested = {
            error: {
                code: "NESTED_CODE",
                message: "nested message",
                details: hostile,
            },
        };
        expect(getStructuredError(nested)).toEqual({
            code: "NESTED_CODE",
            message: "nested message",
        });
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

    it("style_manage plugin backstop gives action-specific empty-name recovery before lookup or creation", async () => {
        const getStyleByIdAsync = mock(async () => mockStyle);
        const createPaintStyle = mock(() => mockStyle);
        (globalThis as any).figma.getStyleByIdAsync = getStyleByIdAsync;
        (globalThis as any).figma.createPaintStyle = createPaintStyle;

        let createRefusal: any;
        try {
            await createStyle({
                type: "PAINT",
                name: "",
            });
        } catch (error) {
            createRefusal = error;
        }
        expect(createRefusal?.message).toContain(
            "Supply a non-empty name for the new style",
        );
        expect(createRefusal?.message).not.toContain("Omit name");
        expect(createPaintStyle).not.toHaveBeenCalled();
        expect(getStyleByIdAsync).not.toHaveBeenCalled();

        let updateRefusal: any;
        try {
            await createStyle({
                type: "PAINT",
                styleId: mockStyle.id,
                currentStyleName: mockStyle.name,
                name: "",
            });
        } catch (error) {
            updateRefusal = error;
        }
        expect(updateRefusal?.message).toContain(
            "Omit name to leave the style's name unchanged",
        );
        expect(updateRefusal?.message).not.toContain(
            "Supply a non-empty name for the new style",
        );
        expect(createPaintStyle).not.toHaveBeenCalled();
        expect(getStyleByIdAsync).not.toHaveBeenCalled();
        expect(mockStyle.name).toBe("MyStyle");
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
