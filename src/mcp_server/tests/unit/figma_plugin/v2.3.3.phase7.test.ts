import { beforeEach, describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

mock.module("../../../figma-client.js", () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve()),
    resetChannel: mock(() => {}),
}));

const {
    registerAllTools,
    INTENTIONAL_INPUT_CATCHALL_PATHS,
    recursivelyStrictInputSchema,
} = await import("../../../tools/index.js");
const { sendCommandToFigma } = await import("../../../figma-client.js");
const { ANNOTATION_PROPERTY_TYPES } = await import("../../../tools/annotation.js");
const { BLEND_MODES, EFFECT_TYPES } = await import("../../../tools/style.js");
const { normalizeEffects } = await import("../../../../../figma_plugin/handlers/stylingHandlers.js");
const { normalizeObjectSchema, safeParseAsync } = await import(
    "@modelcontextprotocol/sdk/server/zod-compat.js"
);
const { toJsonSchemaCompat } = await import(
    "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js"
);
const {
    getAnnotations,
    setMultipleAnnotations,
} = await import("../../../../../figma_plugin/handlers/annotationHandlers.js?phase7");
const { getStructuredError } = await import("../../../../../figma_plugin/utils/errors.js");
const { ANNOTATION_VERIFICATION_CODES } = await import("../../../../shared/errorCodes.js");

type CapturedTool = {
    description: string;
    inputSchema: any;
    outputSchema: any;
    annotations: any;
    handler: Function;
};

const TOOLS: Record<string, CapturedTool> = {};
const mockServer: any = {
    registerTool: (name: string, config: any, handler: Function) => {
        TOOLS[name] = {
            description: config.description,
            inputSchema: config.inputSchema,
            outputSchema: config.outputSchema,
            annotations: config.annotations,
            handler,
        };
    },
    registerPrompt: () => {},
    prompt: () => {},
    registerResource: () => {},
    resource: () => {},
};
registerAllTools(mockServer);

// Independent oracle for D8's closed exemption inventory. Do not derive this
// from INTENTIONAL_INPUT_CATCHALL_PATHS: production and emitted schemas must
// both match these two ratified literals, so adding a production exemption
// cannot update the test's expectation automatically.
const RATIFIED_INPUT_CATCHALL_PATHS = [
    "style_manage.properties.paints[]",
    "style_manage.properties.layoutGrids[]",
] as const;

function formatPath(toolName: string, path: readonly string[]): string {
    let formatted = toolName;
    for (const segment of path) {
        formatted += segment === "[]" || segment === "{}" ? segment : `.${segment}`;
    }
    return formatted;
}

type ObjectSchemaEntry = {
    path: string;
    schema: any;
};

function collectObjectSchemas(toolName: string, root: any): ObjectSchemaEntry[] {
    const entries: ObjectSchemaEntry[] = [];
    const seen = new WeakSet<object>();

    const visit = (schema: any, path: readonly string[]) => {
        if (!schema || typeof schema !== "object" || !schema._def || seen.has(schema)) {
            return;
        }
        seen.add(schema);
        const def = schema._def;

        switch (def.type) {
            case "object":
                entries.push({ path: formatPath(toolName, path), schema });
                for (const [key, child] of Object.entries(def.shape ?? {})) {
                    visit(child, [...path, key]);
                }
                break;
            case "array":
                visit(def.element, [...path, "[]"]);
                break;
            case "optional":
            case "nullable":
            case "default":
            case "prefault":
            case "nonoptional":
            case "readonly":
            case "catch":
            case "success":
            case "promise":
                visit(def.innerType, path);
                break;
            case "union":
                for (const option of def.options ?? []) visit(option, path);
                break;
            case "intersection":
                visit(def.left, path);
                visit(def.right, path);
                break;
            case "tuple":
                for (const item of def.items ?? []) visit(item, [...path, "[]"]);
                if (def.rest) visit(def.rest, [...path, "[]"]);
                break;
            case "record":
            case "map":
                visit(def.keyType, path);
                visit(def.valueType, [...path, "{}"]);
                break;
            case "set":
                visit(def.valueType, [...path, "[]"]);
                break;
            case "pipe":
                visit(def.in, path);
                visit(def.out, path);
                break;
            case "lazy":
                visit(def.getter(), path);
                break;
        }
    };

    visit(root, []);
    return entries;
}

describe("Phase 7 D10: annotation schema and registered contract", () => {
    const input = TOOLS.annotation_set.inputSchema;
    const output = TOOLS.annotation_set.outputSchema;

    it("matches the pinned AnnotationPropertyType union exactly", () => {
        const typingsPath = resolve(
            import.meta.dir,
            "../../../../..",
            "node_modules/@figma/plugin-typings/plugin-api-standalone.d.ts"
        );
        const source = readFileSync(typingsPath, "utf8");
        const union = source.match(
            /type AnnotationPropertyType =([\s\S]*?)\ninterface AnnotationsMixin/
        );
        expect(union, "pinned AnnotationPropertyType union is present").not.toBeNull();
        const pinned = Array.from(union![1].matchAll(/\|\s*'([^']+)'/g), (match) => match[1]);

        expect([...ANNOTATION_PROPERTY_TYPES]).toEqual(pinned);
    });

    it("accepts the append-only native shape and preserves Markdown byte-for-byte", () => {
        const labelMarkdown = "  **Keep this whitespace**\n\n```ts\nconst x = 1;\n```\n  ";
        const parsed = input.safeParse({
            annotations: [{
                nodeId: "1:2",
                nodeName: "Card",
                labelMarkdown,
                categoryId: "cat-1",
                properties: [{ type: "width" }, { type: "fills" }],
            }],
        });

        expect(parsed.success).toBe(true);
        expect(parsed.data.annotations[0].labelMarkdown).toBe(labelMarkdown);
    });

    it("rejects legacy annotationId/status fields instead of stripping them at the SDK boundary", async () => {
        const sdkSchema = normalizeObjectSchema(input) ?? input;
        for (const legacy of [
            { annotationId: "legacy-1" },
            { status: "TODO" },
        ]) {
            const parsed: any = await safeParseAsync(sdkSchema, {
                annotations: [{
                    nodeId: "1:2",
                    nodeName: "Card",
                    labelMarkdown: "Append me",
                    ...legacy,
                }],
            });
            expect(parsed.success).toBe(false);
            expect(parsed.error.issues.some(
                (issue: any) =>
                    issue.code === "unrecognized_keys" &&
                    issue.path.join(".") === "annotations.0"
            )).toBe(true);
        }
    });

    it("rejects blank Markdown, duplicate property types, and unknown property keys", () => {
        for (const labelMarkdown of ["", "   ", "\n\t"]) {
            expect(input.safeParse({
                annotations: [{ nodeId: "1:2", nodeName: "Card", labelMarkdown }],
            }).success).toBe(false);
        }

        const duplicate: any = input.safeParse({
            annotations: [{
                nodeId: "1:2",
                nodeName: "Card",
                labelMarkdown: "Note",
                properties: [{ type: "width" }, { type: "width" }],
            }],
        });
        expect(duplicate.success).toBe(false);
        expect(duplicate.error.issues[0].message).toContain("Duplicate annotation property type");

        const unknownProperty: any = input.safeParse({
            annotations: [{
                nodeId: "1:2",
                nodeName: "Card",
                labelMarkdown: "Note",
                properties: [{ type: "width", value: 100 }],
            }],
        });
        expect(unknownProperty.success).toBe(false);
        expect(unknownProperty.error.issues.some(
            (issue: any) => issue.code === "unrecognized_keys"
        )).toBe(true);
    });

    it("advertises required beforeCount/afterCount fields on every result row", () => {
        const envelope = {
            success: true,
            status: "success",
            requestedCount: 1,
            succeededCount: 1,
            failedCount: 0,
            skippedCount: 0,
        };
        expect(output.safeParse({
            ...envelope,
            results: [{
                nodeId: "1:2",
                status: "success",
                beforeCount: 0,
                afterCount: 1,
                beforeCountVerified: true,
                afterCountVerified: true,
            }],
        }).success).toBe(true);
        expect(output.safeParse({
            ...envelope,
            results: [{ nodeId: "1:2", status: "success" }],
        }).success).toBe(false);

        const rowShape = output.shape.results.unwrap().element.shape;
        expect(rowShape.beforeCount).toBeDefined();
        expect(rowShape.afterCount).toBeDefined();
        expect(rowShape.beforeCountVerified).toBeDefined();
        expect(rowShape.afterCountVerified).toBeDefined();
        expect(rowShape.outcomeUnknown).toBeDefined();
    });

    it("Q30: the category refusal is a ratified, inventoried code", () => {
        expect([...ANNOTATION_VERIFICATION_CODES]).toEqual(["ANNOTATION_CATEGORY_NOT_FOUND"]);
    });

    it("Q31: the description warns that a failed row may already have appended, and says how to check", () => {
        // The tool is non-idempotent (idempotentHint removed below), so the
        // shared "retry every non-success item" instruction is unsafe here
        // without the read-and-compare guard. The description carries it —
        // the guides are loaded on demand, the description always is.
        const description = TOOLS.annotation_set.description;
        expect(description).toContain("NOT idempotent");
        expect(description).toContain("may already have appended");
        expect(description).toContain("annotation_list");
        expect(description).toMatch(/before retrying/i);
    });

    it("advertises grouped annotation_list output and no longer claims idempotence", () => {
        const listOutput = TOOLS.annotation_list.outputSchema;
        expect(listOutput.shape.annotatedNodes).toBeDefined();
        expect(listOutput.shape.annotations).toBeUndefined();
        expect(listOutput.safeParse({
            annotatedNodes: [{
                nodeId: "1:2",
                name: "Card",
                annotations: [{
                    labelMarkdown: "Note",
                    properties: [{ type: "width" }],
                    categoryId: "cat-1",
                }],
            }],
        }).success).toBe(true);
        expect(TOOLS.annotation_set.annotations.idempotentHint).toBeUndefined();
    });
});

describe("Phase 7 D8: recursive strictness", () => {
    const allObjectSchemas = Object.entries(TOOLS).flatMap(([toolName, tool]) =>
        collectObjectSchemas(toolName, tool.inputSchema)
    );

    it("injects an unknown key into every non-catchall object schema and rejects it", () => {
        const allowed = new Set<string>(RATIFIED_INPUT_CATCHALL_PATHS);
        expect(allObjectSchemas.length).toBeGreaterThan(70);

        for (const { path, schema } of allObjectSchemas) {
            if (allowed.has(path)) continue;

            const parsed: any = schema.safeParse({ __phase7UnknownKey__: true });
            expect(parsed.success, `${path} unexpectedly accepted an unknown key`).toBe(false);
            expect(
                parsed.error.issues.some(
                    (issue: any) =>
                        issue.code === "unrecognized_keys" &&
                        issue.keys?.includes("__phase7UnknownKey__")
                ),
                `${path} failed for another reason but did not reject the unknown key`
            ).toBe(true);
        }
    });

    it("has exactly the two independently pinned catchalls and accepts their polymorphic fields", () => {
        const actualCatchalls = allObjectSchemas
            .filter(({ schema }) =>
                schema._def.catchall && schema._def.catchall._def?.type !== "never"
            )
            .map(({ path }) => path)
            .sort();

        expect([...INTENTIONAL_INPUT_CATCHALL_PATHS].sort())
            .toEqual([...RATIFIED_INPUT_CATCHALL_PATHS].sort());
        expect(actualCatchalls).toEqual([...RATIFIED_INPUT_CATCHALL_PATHS].sort());

        const style = TOOLS.style_manage.inputSchema;
        expect(style.safeParse({
            type: "PAINT",
            name: "Gradient",
            properties: {
                paints: [{
                    type: "GRADIENT_LINEAR",
                    gradientStops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }],
                    gradientTransform: [[1, 0, 0], [0, 1, 0]],
                }],
            },
        }).success).toBe(true);
        expect(style.safeParse({
            type: "EFFECT",
            name: "Shadow",
            properties: {
                effects: [{
                    type: "DROP_SHADOW",
                    color: { r: 0, g: 0, b: 0, a: 0.25 },
                    offset: { x: 0, y: 4 },
                    radius: 8,
                }],
            },
        }).success).toBe(true);
        expect(style.safeParse({
            type: "GRID",
            name: "Grid",
            properties: {
                layoutGrids: [{ pattern: "GRID", sectionSize: 8, visible: true }],
            },
        }).success).toBe(true);

        // The containing style object remains strict; only the array payload
        // objects above are exemptions.
        expect(style.safeParse({
            type: "PAINT",
            name: "Bad",
            properties: { inventedStyleProperty: true },
        }).success).toBe(false);
    });

    it("Q35: the effect type inventory matches the pinned Effect union exactly", () => {
        // Same pinning discipline as ANNOTATION_PROPERTY_TYPES: enumeration is
        // only safe if drift against @figma/plugin-typings fails CI.
        const typingsPath = resolve(
            import.meta.dir,
            "../../../../..",
            "node_modules/@figma/plugin-typings/plugin-api-standalone.d.ts"
        );
        const source = readFileSync(typingsPath, "utf8");

        const union = source.match(/\ntype Effect =([\s\S]*?)\n(?:type|interface|declare) /);
        expect(union, "pinned Effect union is present").not.toBeNull();
        const memberNames = Array.from(union![1].matchAll(/\|\s*(\w+)/g), (match) => match[1]);
        expect(memberNames.length).toBeGreaterThan(0);

        // Resolve alias members (BlurEffect, NoiseEffect) down to interfaces.
        const resolved: string[] = [];
        for (const member of memberNames) {
            const alias = source.match(new RegExp(`\\ntype ${member} = ([^\\n]+)`));
            if (alias) {
                resolved.push(...alias[1].split("|").map((part) => part.trim()));
            } else {
                resolved.push(member);
            }
        }

        // Each interface declares `readonly type: 'X'` (or a union of literals),
        // possibly on a base interface it extends (BlurEffectNormal → BlurEffectBase).
        const pinned = new Set<string>();
        const collectTypeLiterals = (name: string, seen = new Set<string>()) => {
            expect(seen.has(name), `interface ${name} must not extend itself`).toBe(false);
            seen.add(name);
            const declaration = source.match(
                new RegExp(`interface ${name}(?: extends (\\w+))?\\s*\\{([\\s\\S]*?)\\n\\}`)
            );
            expect(declaration, `interface ${name} is present`).not.toBeNull();
            const typeLine = declaration![2].match(/readonly type:([^\n]+)/);
            if (typeLine) {
                for (const literal of typeLine[1].matchAll(/'([^']+)'/g)) {
                    pinned.add(literal[1]);
                }
                return;
            }
            const base = declaration![1];
            expect(base, `${name} declares a type discriminator or extends one that does`).toBeDefined();
            collectTypeLiterals(base, seen);
        };
        for (const name of resolved) collectTypeLiterals(name);

        expect([...EFFECT_TYPES].sort()).toEqual([...pinned].sort());
    });

    it("Q35: the effect BlendMode inventory matches the pinned union exactly", () => {
        const typingsPath = resolve(
            import.meta.dir,
            "../../../../..",
            "node_modules/@figma/plugin-typings/plugin-api-standalone.d.ts"
        );
        const source = readFileSync(typingsPath, "utf8");
        const union = source.match(/\ntype BlendMode =([\s\S]*?)\ntype MaskType/);
        expect(union, "pinned BlendMode union is present").not.toBeNull();
        const pinned = Array.from(
            union![1].matchAll(/\|\s*'([^']+)'/g),
            (match) => match[1]
        );

        expect([...BLEND_MODES]).toEqual(pinned);
    });

    it("Q35: style_manage effects are per-variant strict, and every pinned type is constructible", () => {
        const style = TOOLS.style_manage.inputSchema;
        const valid: Record<string, any> = {
            DROP_SHADOW: { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 8, spread: 1, showShadowBehindNode: true },
            INNER_SHADOW: { type: "INNER_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 2 }, radius: 4 },
            LAYER_BLUR: { type: "LAYER_BLUR", radius: 6 },
            BACKGROUND_BLUR: { type: "BACKGROUND_BLUR", radius: 6, blurType: "PROGRESSIVE", startRadius: 0, startOffset: { x: 0, y: 0 }, endOffset: { x: 0, y: 100 } },
            NOISE: { type: "NOISE", noiseType: "DUOTONE", color: { r: 1, g: 0, b: 0, a: 1 }, secondaryColor: { r: 0, g: 0, b: 1, a: 1 }, noiseSize: 2, density: 0.5 },
            TEXTURE: { type: "TEXTURE", noiseSize: 2, radius: 4, clipToShape: true },
            GLASS: { type: "GLASS", lightIntensity: 0.5, lightAngle: 45, refraction: 0.2, depth: 3, dispersion: 0.1, radius: 8 },
        };

        for (const effectType of EFFECT_TYPES) {
            const parsed: any = style.safeParse({
                type: "EFFECT",
                name: `Probe ${effectType}`,
                properties: { effects: [valid[effectType]] },
            });
            expect(parsed.success, `${effectType} must be constructible: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
        }

        // The live x507 probe: this exact payload used to be ACCEPTED and then
        // silently discarded by normalizeEffects.
        const unknownKey: any = style.safeParse({
            type: "EFFECT",
            name: "Probe",
            properties: { effects: [{ type: "DROP_SHADOW", radius: 8, bogusUnknownKey: "discarded" }] },
        });
        expect(unknownKey.success).toBe(false);
        expect(unknownKey.error.issues.some(
            (issue: any) => issue.code === "unrecognized_keys" && issue.keys?.includes("bogusUnknownKey")
        )).toBe(true);

        // Per-variant gating: fields that belong to another variant are refused.
        for (const wrong of [
            { type: "INNER_SHADOW", showShadowBehindNode: true },
            { type: "LAYER_BLUR", startRadius: 2 },
        ]) {
            expect(style.safeParse({
                type: "EFFECT",
                name: "Probe",
                properties: { effects: [wrong] },
            }).success, `${wrong.type} must reject a foreign-variant field`).toBe(false);
        }

        // Keep this oracle isolated from RGBA validation: the complete colour
        // is valid, and the actionable opacity issue proves the MONOTONE
        // cross-variant field itself caused the refusal.
        const monotoneOpacity: any = style.safeParse({
            type: "EFFECT",
            name: "Probe",
            properties: {
                effects: [{
                    type: "NOISE",
                    noiseType: "MONOTONE",
                    color: { r: 0, g: 0, b: 0, a: 1 },
                    noiseSize: 1,
                    density: 1,
                    opacity: 0.5,
                }],
            },
        });
        expect(monotoneOpacity.success).toBe(false);
        expect(monotoneOpacity.error.issues.some(
            (issue: any) =>
                issue.path.join(".") === "properties.effects.0.opacity" &&
                issue.message === "opacity is only valid when noiseType is 'MULTITONE'."
        )).toBe(true);

        for (const effect of [
            { type: "DROP_SHADOW", blendMode: "NOT_A_BLEND_MODE" },
            { type: "INNER_SHADOW", blendMode: "NOT_A_BLEND_MODE" },
            {
                type: "NOISE",
                noiseType: "MONOTONE",
                color: { r: 0, g: 0, b: 0, a: 1 },
                noiseSize: 1,
                density: 1,
                blendMode: "NOT_A_BLEND_MODE",
            },
        ]) {
            const invalidBlendMode: any = style.safeParse({
                type: "EFFECT",
                name: "Probe",
                properties: { effects: [effect] },
            });
            expect(
                invalidBlendMode.success,
                `${effect.type} must reject NOT_A_BLEND_MODE`
            ).toBe(false);
            expect(invalidBlendMode.error.issues.some(
                (issue: any) =>
                    issue.path.join(".") === "properties.effects.0.blendMode"
            )).toBe(true);
        }
        for (const accepted of BLEND_MODES) {
            expect(style.safeParse({
                type: "EFFECT",
                name: "Probe",
                properties: {
                    effects: [{ type: "DROP_SHADOW", blendMode: accepted }],
                },
            }).success, `DROP_SHADOW must accept pinned BlendMode ${accepted}`).toBe(true);
        }

        // Live-verified on zgkx (2026-07-26): Figma rejects an effect colour
        // without alpha, so a schema that accepted `{r,g,b}` would pass a call
        // the runtime refuses. Omitting `color` entirely stays valid — the
        // handler defaults it — but a supplied colour must be complete.
        const partialColor: any = style.safeParse({
            type: "EFFECT",
            name: "Probe",
            properties: { effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0 }, radius: 8 }] },
        });
        expect(partialColor.success).toBe(false);
        expect(partialColor.error.issues.some(
            (issue: any) => issue.path.join(".").endsWith("color.a")
        )).toBe(true);
        expect(style.safeParse({
            type: "EFFECT",
            name: "Probe",
            properties: { effects: [{ type: "DROP_SHADOW", radius: 8 }] },
        }).success, "omitting color entirely stays valid").toBe(true);
        expect(style.safeParse({
            type: "EFFECT",
            name: "Probe",
            properties: {
                effects: [{
                    type: "NOISE", noiseType: "DUOTONE", noiseSize: 2, density: 0.4,
                    color: { r: 1, g: 0, b: 0 },
                    secondaryColor: { r: 0, g: 0, b: 1, a: 1 },
                }],
            },
        }).success, "NOISE primary colour must also carry alpha").toBe(false);

        // A PROGRESSIVE blur missing its ramp is refused with an actionable path.
        const halfProgressive: any = style.safeParse({
            type: "EFFECT",
            name: "Probe",
            properties: { effects: [{ type: "LAYER_BLUR", radius: 4, blurType: "PROGRESSIVE" }] },
        });
        expect(halfProgressive.success).toBe(false);
        expect(halfProgressive.error.issues.some(
            (issue: any) => issue.message.includes("blurType is 'PROGRESSIVE'")
        )).toBe(true);
    });

    it("F78-06: enforces live-confirmed effect bounds while accepting their boundaries", () => {
        const style = TOOLS.style_manage.inputSchema;
        const parseEffect = (candidate: any) => style.safeParse({
            type: "EFFECT",
            name: "Numeric bounds probe",
            properties: { effects: [candidate] },
        });

        // Exact values rejected by live Figma on o4g6 must be stopped at the
        // MCP boundary instead of consuming a runtime round trip.
        expect(parseEffect({ type: "LAYER_BLUR", radius: -1 }).success).toBe(false);
        expect(parseEffect({
            type: "GLASS",
            lightIntensity: 2,
            lightAngle: 45,
            refraction: 0.5,
            depth: 1,
            dispersion: 0.5,
            radius: 1,
        }).success).toBe(false);
        expect(parseEffect({
            type: "GLASS",
            lightIntensity: 0.5,
            lightAngle: 45,
            refraction: 2,
            depth: 1,
            dispersion: 0.5,
            radius: 1,
        }).success).toBe(false);
        expect(parseEffect({
            type: "GLASS",
            lightIntensity: 0.5,
            lightAngle: 45,
            refraction: 0.5,
            depth: 1,
            dispersion: 2,
            radius: 1,
        }).success).toBe(false);
        expect(parseEffect({
            type: "GLASS",
            lightIntensity: 0.5,
            lightAngle: 45,
            refraction: 0.5,
            depth: 1,
            dispersion: 0.5,
            radius: -1,
        }).success).toBe(false);

        // Both ends of each confirmed closed interval are valid. A setter-only
        // probe previously accepted depth: 0, but live read-back on 4b9u proved
        // Figma normalizes it to 1. Reject zero rather than claim exact success.
        expect(parseEffect({
            type: "GLASS",
            lightIntensity: 0.5,
            lightAngle: 45,
            refraction: 0.5,
            depth: 0,
            dispersion: 0.5,
            radius: 0,
        }).success).toBe(false);
        expect(parseEffect({
            type: "GLASS",
            lightIntensity: 0,
            lightAngle: 45,
            refraction: 1,
            depth: 1,
            dispersion: 0,
            radius: 0,
        }).success).toBe(true);
        expect(parseEffect({
            type: "GLASS",
            lightIntensity: 1,
            lightAngle: 45,
            refraction: 0,
            depth: 1,
            dispersion: 1,
            radius: 0,
        }).success).toBe(true);

        // The pinned ShadowEffect typings require non-negative radii for both
        // variants. LAYER_BLUR and BACKGROUND_BLUR share their radius schema,
        // so the live-confirmed LAYER_BLUR lower bound protects its sibling.
        expect(parseEffect({ type: "DROP_SHADOW", radius: -1 }).success).toBe(false);
        expect(parseEffect({ type: "INNER_SHADOW", radius: -1 }).success).toBe(false);
        expect(parseEffect({ type: "DROP_SHADOW", radius: 0 }).success).toBe(true);
        expect(parseEffect({ type: "INNER_SHADOW", radius: 0 }).success).toBe(true);
        expect(parseEffect({ type: "BACKGROUND_BLUR", radius: -1 }).success).toBe(false);

        // NOISE/TEXTURE grain and radius bounds, measured live on channel f6ux
        // (2026-08-02). Figma rejects negatives outright and SILENTLY CLAMPS
        // anything above 100 — `noiseSize: 101` and `100000` both read back as
        // `100` — so an unbounded schema reported success for a value the
        // document never held. Same rule that produced Rev 74 for GLASS depth.
        const noise = (over: Record<string, unknown>) => parseEffect({
            type: "NOISE",
            noiseType: "MONOTONE",
            color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
            noiseSize: 2,
            density: 0.4,
            ...over,
        });
        expect(noise({ noiseSize: -1 }).success).toBe(false);
        expect(noise({ noiseSize: 101 }).success).toBe(false);
        expect(noise({ noiseSize: 0 }).success).toBe(true);
        expect(noise({ noiseSize: 100 }).success).toBe(true);
        expect(noise({ density: -0.1 }).success).toBe(false);
        expect(noise({ density: 1.1 }).success).toBe(false);
        expect(noise({ density: 0 }).success).toBe(true);
        expect(noise({ density: 1 }).success).toBe(true);

        const texture = (over: Record<string, unknown>) => parseEffect({
            type: "TEXTURE", noiseSize: 2, radius: 1, clipToShape: true, ...over,
        });
        expect(texture({ noiseSize: -1 }).success).toBe(false);
        expect(texture({ noiseSize: 101 }).success).toBe(false);
        expect(texture({ radius: -1 }).success).toBe(false);
        expect(texture({ radius: 101 }).success).toBe(false);
        expect(texture({ noiseSize: 0, radius: 0 }).success).toBe(true);
        expect(texture({ noiseSize: 100, radius: 100 }).success).toBe(true);
    });

    it("F78-06b: rejects a second GLASS effect, which Figma refuses per node", () => {
        const style = TOOLS.style_manage.inputSchema;
        const glass = {
            type: "GLASS", lightIntensity: 0.5, lightAngle: 45, refraction: 0.5,
            depth: 1, dispersion: 0.5, radius: 0,
        };
        const parseEffects = (effects: any[]) => style.safeParse({
            type: "EFFECT",
            name: "Glass count probe",
            properties: { effects },
        });

        // Live on f6ux: a two-GLASS array is refused by the host with "Only one
        // glass effect is allowed per node." Rejecting at the MCP boundary turns
        // an UNKNOWN_ERROR relaying Figma's prose into a predictable refusal.
        expect(parseEffects([glass]).success).toBe(true);
        expect(parseEffects([glass, { type: "DROP_SHADOW", radius: 4 }]).success).toBe(true);

        const twoGlass = parseEffects([glass, { ...glass, radius: 8 }]);
        expect(twoGlass.success).toBe(false);
        const issue = twoGlass.error!.issues[0];
        expect(issue.path).toEqual(["properties", "effects", 1, "type"]);
        expect(issue.message).toContain("Only one GLASS effect is allowed per node");
    });

    it("F78-05: node_set_effects rejects cross-variant fields before its registered callback", async () => {
        const input = TOOLS.node_set_effects.inputSchema;
        const wrong: any = input.safeParse({
            nodeId: "1:2",
            nodeName: "Card",
            effects: [{ type: "INNER_SHADOW", showShadowBehindNode: true }],
        });
        expect(wrong.success).toBe(false);
        expect(wrong.error.issues.some(
            (issue: any) =>
                issue.code === "unrecognized_keys" &&
                issue.path.join(".") === "effects.0" &&
                issue.keys?.includes("showShadowBehindNode")
        )).toBe(true);
        const badBlendMode: any = input.safeParse({
            nodeId: "1:2",
            nodeName: "Card",
            effects: [{
                type: "DROP_SHADOW",
                blendMode: "NOT_A_BLEND_MODE",
            }],
        });
        expect(badBlendMode.success).toBe(false);
        expect(badBlendMode.error.issues.some(
            (issue: any) => issue.path.join(".") === "effects.0.blendMode"
        )).toBe(true);

        const valid: any = input.safeParse({
            nodeId: "1:2",
            nodeName: "Card",
            effects: [{
                type: "DROP_SHADOW",
                radius: 0,
                showShadowBehindNode: true,
            }],
        });
        expect(valid.success).toBe(true);

        (sendCommandToFigma as any).mockClear();
        await TOOLS.node_set_effects.handler(valid.data);
        expect((sendCommandToFigma as any).mock.calls).toEqual([[
            "node_set_effects",
            valid.data,
        ]]);
    });

    it("Q35: normalizeEffects forwards validated fields instead of rebuilding from a field list", () => {
        // The rebuild dropped every field it did not name: a progressive blur
        // silently became a normal blur, and NOISE/TEXTURE/GLASS lost everything.
        const [progressive] = normalizeEffects([{
            type: "LAYER_BLUR",
            radius: 6,
            blurType: "PROGRESSIVE",
            startRadius: 0,
            startOffset: { x: 0, y: 0 },
            endOffset: { x: 0, y: 100 },
        }]);
        expect(progressive.blurType).toBe("PROGRESSIVE");
        expect(progressive.startOffset).toEqual({ x: 0, y: 0 });
        expect(progressive.endOffset).toEqual({ x: 0, y: 100 });

        const [noise] = normalizeEffects([{
            type: "NOISE",
            noiseType: "DUOTONE",
            color: { r: 1, g: 0, b: 0 },
            secondaryColor: { r: 0, g: 0, b: 1 },
            noiseSize: 2,
            density: 0.5,
        }]);
        expect(noise.noiseType).toBe("DUOTONE");
        expect(noise.secondaryColor).toEqual({ r: 0, g: 0, b: 1 });
        expect(noise.visible).toBe(true);

        // Defaults still apply, and INNER_SHADOW still cannot carry the
        // DROP_SHADOW-only key even if a non-conforming client sends it.
        const [shadow] = normalizeEffects([{ type: "DROP_SHADOW" }]);
        expect(shadow).toMatchObject({
            type: "DROP_SHADOW",
            visible: true,
            radius: 4,
            spread: 0,
            blendMode: "NORMAL",
            showShadowBehindNode: false,
        });
        const [inner] = normalizeEffects([{ type: "INNER_SHADOW", showShadowBehindNode: true }]);
        expect("showShadowBehindNode" in inner).toBe(false);
    });

    it("Q35: the plugin's known-type list covers exactly the pinned inventory", () => {
        // The plugin bundle cannot import EFFECT_TYPES across the Q27 boundary,
        // so its mirror list is verified behaviourally: a known type receives the
        // `visible` default, an unrecognised one is forwarded untouched.
        for (const effectType of EFFECT_TYPES) {
            const [normalized] = normalizeEffects([{ type: effectType }]);
            expect(normalized.visible, `${effectType} must be recognised by the plugin`).toBe(true);
        }
        const [unknown] = normalizeEffects([{ type: "NOT_A_FIGMA_EFFECT", custom: 1 }]);
        expect(unknown).toEqual({ type: "NOT_A_FIGMA_EFFECT", custom: 1 });
    });

    it("keeps a shared subtree open only where its remaining path reaches an exact exemption", () => {
        const sharedPayload = z.object({ kind: z.string() }).catchall(z.unknown());
        const sharedBranch = z.object({
            paints: z.array(sharedPayload),
        });
        const transformed = recursivelyStrictInputSchema(
            z.object({
                properties: sharedBranch,
                mirror: sharedBranch,
            }),
            "style_manage"
        );

        expect(transformed.safeParse({
            properties: {
                paints: [{ kind: "gradient", polymorphicPaintField: true }],
            },
            mirror: {
                paints: [{ kind: "gradient" }],
            },
        }).success).toBe(true);
        const nonExempt: any = transformed.safeParse({
            properties: {
                paints: [{ kind: "gradient", polymorphicPaintField: true }],
            },
            mirror: {
                paints: [{ kind: "gradient", polymorphicPaintField: true }],
            },
        });
        expect(nonExempt.success).toBe(false);
        expect(nonExempt.error.issues.some(
            (issue: any) =>
                issue.code === "unrecognized_keys" &&
                issue.path.join(".") === "mirror.paints.0" &&
                issue.keys?.includes("polymorphicPaintField")
        )).toBe(true);
    });

    it("terminates on recursive lazies for parsing and wire JSON-schema generation", () => {
        let recursiveNode: any;
        recursiveNode = z.lazy(() => z.object({
            name: z.string(),
            children: z.array(recursiveNode).optional(),
        }));
        const transformed = recursivelyStrictInputSchema(
            z.object({ root: recursiveNode }),
            "synthetic_recursive_tool"
        );

        expect(transformed.safeParse({
            root: {
                name: "root",
                children: [{ name: "child", children: [{ name: "leaf" }] }],
            },
        }).success).toBe(true);
        expect(transformed.safeParse({
            root: {
                name: "root",
                children: [{ name: "child", invented: true }],
            },
        }).success).toBe(false);

        const wireSchema = toJsonSchemaCompat(transformed);
        expect(wireSchema).toBeDefined();
        expect(JSON.stringify(wireSchema).length).toBeGreaterThan(0);
    });
});

describe("Phase 7 D10: real append/list behavior", () => {
    let nodes: Map<string, any>;
    let categoryLookups: string[];

    beforeEach(() => {
        nodes = new Map<string, any>();
        categoryLookups = [];
        (globalThis as any).figma = {
            annotations: {
                getAnnotationCategoriesAsync: async () => [{
                    id: "cat-1",
                    label: "Ready",
                    color: "green",
                    isPreset: false,
                }],
                getAnnotationCategoryByIdAsync: async (id: string) => {
                    categoryLookups.push(id);
                    return id === "cat-1"
                        ? { id, label: "Ready", color: "green", isPreset: false }
                        : null;
                },
            },
            getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
        };
    });

    it("appends the native Figma shape, reports counts, and rediscovers grouped owners", async () => {
        const child = {
            id: "2:2",
            name: "Card",
            type: "RECTANGLE",
            annotations: [] as any[],
        };
        const root = {
            id: "2:1",
            name: "Section",
            type: "FRAME",
            annotations: [{ labelMarkdown: "Root note" }],
            children: [child],
        };
        nodes.set(root.id, root);
        nodes.set(child.id, child);

        const result = await setMultipleAnnotations({
            annotations: [{
                nodeId: child.id,
                nodeName: child.name,
                labelMarkdown: "  Child **note**  ",
                categoryId: "cat-1",
                properties: [{ type: "width" }],
            }],
        });

        expect(categoryLookups).toEqual(["cat-1"]);
        expect(result.status).toBe("success");
        expect(result.results).toEqual([{
            success: true,
            status: "success",
            nodeId: child.id,
            beforeCount: 0,
            afterCount: 1,
            beforeCountVerified: true,
            afterCountVerified: true,
        }]);
        expect(child.annotations).toEqual([{
            labelMarkdown: "  Child **note**  ",
            categoryId: "cat-1",
            properties: [{ type: "width" }],
        }]);
        expect(child.annotations[0].label).toBeUndefined();

        const listed = await getAnnotations({
            nodeId: root.id,
            includeCategories: false,
        });
        expect(listed).toEqual({
            annotatedNodes: [
                { nodeId: root.id, name: root.name, annotations: root.annotations },
                { nodeId: child.id, name: child.name, annotations: child.annotations },
            ],
            coverage: { complete: true, pagesAttempted: 0, pageErrors: [] },
        });
        expect(TOOLS.annotation_set.outputSchema.safeParse(result).success).toBe(true);
        expect(TOOLS.annotation_list.outputSchema.safeParse(listed).success).toBe(true);
    });

    it("F78-04: traverses a GROUP root without AnnotationsMixin through the registered callback", async () => {
        const annotatedChild = {
            id: "2:4",
            name: "Annotated child",
            type: "RECTANGLE",
            annotations: [{ labelMarkdown: "Descendant note" }],
        };
        const group = {
            id: "2:3",
            name: "Container group",
            type: "GROUP",
            children: [annotatedChild],
        };
        nodes.set(group.id, group);
        nodes.set(annotatedChild.id, annotatedChild);

        const expected = {
            annotatedNodes: [{
                nodeId: annotatedChild.id,
                name: annotatedChild.name,
                annotations: annotatedChild.annotations,
            }],
            coverage: { complete: true, pagesAttempted: 0, pageErrors: [] },
        };
        expect(await getAnnotations({
            nodeId: group.id,
            includeCategories: false,
        })).toEqual(expected);

        const parsed: any = TOOLS.annotation_list.inputSchema.safeParse({
            nodeId: group.id,
            includeCategories: false,
        });
        expect(parsed.success).toBe(true);

        (sendCommandToFigma as any).mockImplementationOnce(
            async (command: string, params: any) => {
                expect(command).toBe("annotation_list");
                return getAnnotations(params);
            }
        );
        const callbackResult = await TOOLS.annotation_list.handler(parsed.data);
        expect(callbackResult.isError).toBeUndefined();
        expect(callbackResult.structuredContent).toEqual(expected);
        expect(TOOLS.annotation_list.outputSchema.safeParse(
            callbackResult.structuredContent
        ).success).toBe(true);
    });

    it("prevalidates every category before mutation, including a later bad category", async () => {
        const first = {
            id: "3:1",
            name: "First",
            type: "RECTANGLE",
            annotations: [] as any[],
        };
        const second = {
            id: "3:2",
            name: "Second",
            type: "RECTANGLE",
            annotations: [] as any[],
        };
        nodes.set(first.id, first);
        nodes.set(second.id, second);

        let thrown: any = null;
        try {
            await setMultipleAnnotations({
                annotations: [
                    {
                        nodeId: first.id,
                        nodeName: first.name,
                        labelMarkdown: "Would otherwise append first",
                        categoryId: "cat-1",
                    },
                    {
                        nodeId: second.id,
                        nodeName: second.name,
                        labelMarkdown: "Bad category",
                        categoryId: "missing-category",
                    },
                ],
            });
        } catch (error: any) {
            thrown = error;
        }

        // Q30 (Rev 46): a coded refusal from the central registry, carrying the
        // offending operand and its own recovery — not a prose throw on the
        // UNKNOWN_ERROR fallback, which could never get a playbook entry.
        expect(thrown).not.toBeNull();
        expect(thrown.code).toBe("ANNOTATION_CATEGORY_NOT_FOUND");
        expect(getStructuredError(thrown).code).toBe("ANNOTATION_CATEGORY_NOT_FOUND");
        expect(thrown.message).toContain('"missing-category"');
        expect(thrown.message).toContain("annotation_list");
        expect(thrown.message).toContain("pass a returned category ID back verbatim");

        expect(categoryLookups).toEqual(["cat-1", "missing-category"]);
        expect(first.annotations).toEqual([]);
        expect(second.annotations).toEqual([]);
    });

    it("reports the observable post-attempt count when a setter commits and then throws", async () => {
        let stored = [{ labelMarkdown: "Existing note" }];
        const node = {
            id: "4:1",
            name: "Commit then throw",
            type: "RECTANGLE",
            get annotations() {
                return stored;
            },
            set annotations(next: any[]) {
                stored = next;
                throw new Error("setter threw after committing");
            },
        };
        nodes.set(node.id, node);

        const result = await setMultipleAnnotations({
            annotations: [{
                nodeId: node.id,
                nodeName: node.name,
                labelMarkdown: "Appended despite throw",
            }],
        });

        expect(stored).toHaveLength(2);
        expect(result.status).toBe("failed");
        // Q32 (Rev 46): a mutate-then-fail row carries the shared D7/Q9
        // partial-mutation vocabulary, so the append is not merely implied by
        // two numbers the agent has to diff for itself.
        expect(result.results).toEqual([{
            success: false,
            status: "failed",
            nodeId: node.id,
            error: "setter threw after committing",
            beforeCount: 1,
            afterCount: 2,
            beforeCountVerified: true,
            afterCountVerified: true,
            partialMutation: true,
            whatChanged: "the annotation was appended before the failure occurred — the node's annotation count went from 1 to 2.",
            before: { annotationCount: 1 },
        }]);
        expect(TOOLS.annotation_set.outputSchema.safeParse(result).success).toBe(true);
    });

    it("fails safe when a setter throws and the committed post-state is unreadable through the registered callback", async () => {
        let stored = [{ labelMarkdown: "Existing note" }];
        let annotationReads = 0;
        const node = {
            id: "4:2",
            name: "Unknown setter outcome",
            type: "RECTANGLE",
            get annotations() {
                annotationReads++;
                if (annotationReads > 1) {
                    throw new Error("post-state getter unavailable");
                }
                return stored;
            },
            set annotations(next: any[]) {
                stored = next;
                throw new Error("setter primary failure");
            },
        };
        nodes.set(node.id, node);

        const parsed: any = TOOLS.annotation_set.inputSchema.safeParse({
            annotations: [{
                nodeId: node.id,
                nodeName: node.name,
                labelMarkdown: "Possibly appended",
            }],
        });
        expect(parsed.success).toBe(true);
        (sendCommandToFigma as any).mockImplementationOnce(
            async (command: string, params: any) => {
                expect(command).toBe("annotation_set");
                return setMultipleAnnotations(params);
            }
        );

        const callbackResult = await TOOLS.annotation_set.handler(parsed.data);
        expect(callbackResult.isError).toBeUndefined();
        expect(stored).toHaveLength(2);
        const row = callbackResult.structuredContent.results[0];
        expect(row).toEqual({
            success: false,
            status: "failed",
            nodeId: node.id,
            error: "setter primary failure",
            beforeCount: 1,
            afterCount: null,
            beforeCountVerified: true,
            afterCountVerified: false,
            partialMutation: true,
            outcomeUnknown: true,
            whatChanged: "the annotation append was attempted, but the post-attempt annotation count could not be verified; the append may have committed.",
            before: { annotationCount: 1 },
            postStateError: "post-attempt annotation count read failed: post-state getter unavailable",
        });
        expect(TOOLS.annotation_set.outputSchema.safeParse(
            callbackResult.structuredContent
        ).success).toBe(true);
    });

    it("fails safe when the aggregator's outer path cannot read post-attempt state", async () => {
        let stored = [{ labelMarkdown: "Existing note" }];
        let annotationReads = 0;
        const node = {
            id: "4:3",
            name: "Unknown outer outcome",
            type: "RECTANGLE",
            get annotations() {
                annotationReads++;
                if (annotationReads > 2) {
                    throw new Error("outer post-state unavailable");
                }
                return stored;
            },
            set annotations(next: any[]) {
                stored = next;
            },
        };
        nodes.set(node.id, node);

        let nodeIdReads = 0;
        const annotation: any = {
            nodeName: node.name,
            labelMarkdown: "Append before outer failure",
        };
        Object.defineProperty(annotation, "nodeId", {
            enumerable: false,
            get() {
                nodeIdReads++;
                if (nodeIdReads === 3) {
                    throw new Error("outer row construction failure");
                }
                return node.id;
            },
        });

        const result = await setMultipleAnnotations({ annotations: [annotation] });
        expect(stored).toHaveLength(2);
        expect(result.status).toBe("failed");
        expect(result.results[0]).toEqual({
            success: false,
            status: "failed",
            nodeId: node.id,
            error: "outer row construction failure",
            beforeCount: 1,
            afterCount: null,
            beforeCountVerified: true,
            afterCountVerified: false,
            partialMutation: true,
            outcomeUnknown: true,
            whatChanged: "the annotation append was attempted, but the post-attempt annotation count could not be verified; the append may have committed.",
            before: { annotationCount: 1 },
            postStateError: "post-attempt annotation count read failed: outer post-state unavailable",
        });
        expect(TOOLS.annotation_set.outputSchema.safeParse(result).success).toBe(true);
    });

    it("Q32: a zero-mutation failure carries neither the flag nor a before-value", async () => {
        const node = {
            id: "5:1",
            name: "Rejects the write",
            type: "RECTANGLE",
            get annotations() {
                return [{ labelMarkdown: "Existing note" }];
            },
            set annotations(_next: any[]) {
                throw new Error("setter rejected the write");
            },
        };
        nodes.set(node.id, node);

        const result = await setMultipleAnnotations({
            annotations: [{
                nodeId: node.id,
                nodeName: node.name,
                labelMarkdown: "Never applied",
            }],
        });

        const row = result.results[0];
        expect(row.status).toBe("failed");
        expect(row.beforeCount).toBe(1);
        expect(row.afterCount).toBe(1);
        expect(row.beforeCountVerified).toBe(true);
        expect(row.afterCountVerified).toBe(true);
        expect(row.partialMutation).toBeUndefined();
        expect(row.whatChanged).toBeUndefined();
        expect(row.before).toBeUndefined();
        expect(TOOLS.annotation_set.outputSchema.safeParse(result).success).toBe(true);
    });

    it("an empty batch is a Layer 2 refusal (throws), not an envelope-less payload", async () => {
        // `.min(1)` stops a conforming client at Layer 1, so this is the AS1
        // defense-in-depth path. It must THROW: the previous early return
        // produced `{success:false, error:"<string>"}`, which carries no
        // status/counts/rows for the three-layer contract to classify, and whose
        // top-level string `error` collides with the advertised D9 envelope —
        // the SDK client rejects such a result outright.
        for (const empty of [[], undefined, "not-an-array"]) {
            let thrown: any = null;
            try {
                await setMultipleAnnotations({ annotations: empty });
            } catch (error: any) {
                thrown = error;
            }
            expect(thrown, `annotations=${JSON.stringify(empty)} must throw`).not.toBeNull();
            expect(thrown.message).toContain("at least one annotation entry");
        }
    });

    it("Q25: an item with no nodeId still produces a schema-valid failure row", async () => {
        // The row schema requires `nodeId`; a non-conforming client that
        // bypasses the input schema must not be able to make the plugin emit a
        // protocol-invalid row (the R13 totality rule, applied to identity).
        const result = await setMultipleAnnotations({
            annotations: [{ nodeName: "Nameless", labelMarkdown: "note" }],
        });

        expect(result.results[0].nodeId).toBe("unknown");
        expect(result.results[0].error).toContain("Missing nodeId");
        expect(TOOLS.annotation_set.outputSchema.safeParse(result).success).toBe(true);
    });
});
