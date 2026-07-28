import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult, looseOutput } from "./_result.js";

// ── style_manage `properties` (hybrid typing) ──────────────────────────────
// Common cases are fully typed (enums + value-objects) so an LLM gets a real,
// validated contract. Gradient/image paints and layout grids retain their full
// polymorphic Figma payloads via the two ratified `.catchall` exemptions;
// effects use the strict per-variant union below.
const rgb = z.object({
    r: z.number().min(0).max(1).describe("Red, 0–1"),
    g: z.number().min(0).max(1).describe("Green, 0–1"),
    b: z.number().min(0).max(1).describe("Blue, 0–1"),
});

// One object, not a union: `color` is the SOLID-specific typed field (optional so
// gradients/images omit it), and `.catchall` lets non-solid paints carry their
// full Figma fields (gradientStops/gradientTransform, imageHash/scaleMode, …).
// A single object avoids an `anyOf` the model would have to branch on, and still
// validates a SOLID's color range (a malformed SOLID can't slip through a union).
const paint = z.object({
    type: z.enum(["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND", "IMAGE", "VIDEO"])
        .describe("Paint type"),
    color: rgb.optional().describe("SOLID only: RGB color, channels 0–1"),
    opacity: z.number().min(0).max(1).optional().describe("0–1 (default 1)"),
    visible: z.boolean().optional().describe("default true"),
}).catchall(z.any())
    .describe("Paint. SOLID → {type:'SOLID', color:{r,g,b}}; GRADIENT_*/IMAGE pass through their full Figma fields (gradientStops, gradientTransform, imageHash, scaleMode, …).");

/**
 * Figma's `Effect` union, enumerated per variant (open-questions Q35, resolved
 * 2026-07-25).
 *
 * `effects[]` used to be `{type: string, blendMode?} + .catchall(any)` and was
 * one of D8's three strictness exemptions. That failed the Golden Rule on both
 * halves. First-call correctness: the emitted schema described two fields, so a
 * model could not compose a valid effect from the schema alone — every field
 * that matters was invisible behind the catchall. One-round-trip recovery: an
 * unknown key was ACCEPTED and then silently dropped by `normalizeEffects`, so
 * a wrong call produced no error at all and the model never learned. A live
 * probe (channel x507, 2026-07-25) confirmed both: `style_manage` accepted an
 * effect carrying `bogusUnknownKey` while `node_set_effects` rejected the
 * byte-identical object.
 *
 * The seven `type` literals below are pinned to `@figma/plugin-typings`'
 * `Effect` union and mechanically parity-tested against
 * `plugin-api-standalone.d.ts`, the same way `ANNOTATION_PROPERTY_TYPES` is —
 * so enumeration cannot drift as Figma adds variants.
 *
 * Two deliberate deviations from the typings, both so the schema promises only
 * what a WRITE actually honours:
 *  - Fields the plugin handler defaults (`visible`, `blendMode`, and the shadow
 *    `color`/`offset`/`radius`) stay optional with the default documented,
 *    rather than required as the read-side typings mark them. Requiring them
 *    would break working calls for no first-call gain. A colour that IS supplied
 *    must be complete, though — see `rgba` below.
 *  - `boundVariables` is NOT declared. It is a read-side projection; variable
 *    binding on an effect goes through `setBoundVariableForEffect`, so
 *    advertising it would promise a field that silently does nothing.
 *
 * ACCEPTED RESIDUAL — enumeration trades forward compatibility for correctness.
 * A `type` the pinned typings do not declare is now rejected, where the old
 * catchall would have forwarded it. The live Figma runtime is already ahead of
 * the pinned package: it accepts a `SHADER` effect (`{type:'SHADER', id}`) that
 * `plugin-api-standalone.d.ts` does not define (observed in a runtime validation
 * error, channel zgkx, 2026-07-26). Such a variant is unreachable through this
 * tool until `@figma/plugin-typings` is bumped — at which point the parity test
 * below FAILS until the variant is added here, which is the intended lever. This
 * is judged an acceptable cost: a shader effect needs an opaque `id` a model
 * cannot compose anyway, whereas the seven pinned variants are the ones an agent
 * actually authors.
 */
export const EFFECT_TYPES = [
    "DROP_SHADOW",
    "INNER_SHADOW",
    "LAYER_BLUR",
    "BACKGROUND_BLUR",
    "NOISE",
    "TEXTURE",
    "GLASS",
] as const;

// Exact parity with the pinned @figma/plugin-typings `BlendMode` union. Effects
// that expose blendMode use this closed enum so a misspelling is rejected at
// the MCP boundary rather than reaching Figma or being silently normalized.
export const BLEND_MODES = [
    "PASS_THROUGH",
    "NORMAL",
    "DARKEN",
    "MULTIPLY",
    "LINEAR_BURN",
    "COLOR_BURN",
    "LIGHTEN",
    "SCREEN",
    "LINEAR_DODGE",
    "COLOR_DODGE",
    "OVERLAY",
    "SOFT_LIGHT",
    "HARD_LIGHT",
    "DIFFERENCE",
    "EXCLUSION",
    "HUE",
    "SATURATION",
    "COLOR",
    "LUMINOSITY",
] as const;

const blendMode = z.enum(BLEND_MODES);

// Alpha is REQUIRED, unlike the `rgb` used by paints. Figma's effect colours are
// `RGBA` and its runtime rejects a partial colour outright — live-verified on
// channel zgkx (2026-07-26): a DROP_SHADOW with `color: {r,g,b}` fails with
// `Required value missing at [0].color.a`. Declaring `a` optional would let the
// schema accept a call Figma refuses, which is the same first-call-correctness
// failure Q35 exists to remove, just relocated from unknown keys to missing
// alpha. Omitting `color` entirely is still fine — the handler defaults it.
const rgba = z.object({
    r: z.number().min(0).max(1).describe("Red, 0–1"),
    g: z.number().min(0).max(1).describe("Green, 0–1"),
    b: z.number().min(0).max(1).describe("Blue, 0–1"),
    a: z.number().min(0).max(1).describe("Alpha, 0–1 — required: Figma rejects an effect colour without it"),
});

const vector = z.object({
    x: z.number().describe("X offset, px"),
    y: z.number().describe("Y offset, px"),
});

const shadowFields = {
    color: rgba.optional().describe("Shadow colour (default {r:0,g:0,b:0,a:0.25})"),
    offset: vector.optional().describe("Shadow offset (default {x:0,y:4})"),
    radius: z.number().nonnegative().optional().describe("Blur radius, px; must be ≥ 0 (default 4)"),
    spread: z.number().optional().describe("Shadow spread, px (default 0)"),
    visible: z.boolean().optional().describe("default true"),
    blendMode: blendMode.optional().describe("Figma BlendMode (default 'NORMAL')"),
};

const dropShadowEffect = z.object({
    type: z.literal("DROP_SHADOW"),
    ...shadowFields,
    showShadowBehindNode: z.boolean().optional().describe("DROP_SHADOW only (default false)"),
});

const innerShadowEffect = z.object({
    type: z.literal("INNER_SHADOW"),
    ...shadowFields,
});

// LAYER_BLUR and BACKGROUND_BLUR share one shape; `blurType` is the secondary
// discriminator, and the PROGRESSIVE fields are gated on it so a model cannot
// send a half-specified progressive blur and get a silent normal blur instead.
const blurFields = {
    radius: z.number().nonnegative().optional().describe("Blur radius, px; must be ≥ 0 (default 4)"),
    visible: z.boolean().optional().describe("default true"),
    blurType: z.enum(["NORMAL", "PROGRESSIVE"]).optional().describe("default 'NORMAL'"),
    startRadius: z.number().optional().describe("PROGRESSIVE only: radius at the start of the ramp"),
    startOffset: vector.optional().describe("PROGRESSIVE only: where the ramp starts"),
    endOffset: vector.optional().describe("PROGRESSIVE only: where the ramp ends"),
};

const progressiveBlurRefinement = (blur: any, ctx: z.RefinementCtx) => {
    const progressiveOnly = ["startRadius", "startOffset", "endOffset"] as const;
    if (blur.blurType === "PROGRESSIVE") {
        for (const field of progressiveOnly) {
            if (blur[field] === undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [field],
                    message: `${field} is required when blurType is 'PROGRESSIVE'. Supply startRadius, startOffset and endOffset together, or omit blurType for a normal blur.`,
                });
            }
        }
        return;
    }
    for (const field of progressiveOnly) {
        if (blur[field] !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: `${field} is only valid when blurType is 'PROGRESSIVE'. Set blurType: 'PROGRESSIVE', or remove ${field}.`,
            });
        }
    }
};

const layerBlurEffect = z.object({ type: z.literal("LAYER_BLUR"), ...blurFields })
    .superRefine(progressiveBlurRefinement);
const backgroundBlurEffect = z.object({ type: z.literal("BACKGROUND_BLUR"), ...blurFields })
    .superRefine(progressiveBlurRefinement);

// NOISE carries a required secondary discriminator, and DUOTONE/MULTITONE each
// add exactly one field — gated, for the same reason as the blur ramp.
const noiseEffect = z.object({
    type: z.literal("NOISE"),
    noiseType: z.enum(["MONOTONE", "DUOTONE", "MULTITONE"]).describe("Noise variant"),
    color: rgba.describe("Primary noise colour"),
    noiseSize: z.number().describe("Noise grain size"),
    density: z.number().describe("Noise density"),
    visible: z.boolean().optional().describe("default true"),
    blendMode: blendMode.optional().describe("Figma BlendMode (default 'NORMAL')"),
    secondaryColor: rgba.optional().describe("DUOTONE only: the second colour"),
    opacity: z.number().min(0).max(1).optional().describe("MULTITONE only: 0–1"),
}).superRefine((noise, ctx) => {
    if (noise.noiseType === "DUOTONE" && noise.secondaryColor === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["secondaryColor"],
            message: "secondaryColor is required when noiseType is 'DUOTONE'.",
        });
    }
    if (noise.noiseType !== "DUOTONE" && noise.secondaryColor !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["secondaryColor"],
            message: "secondaryColor is only valid when noiseType is 'DUOTONE'.",
        });
    }
    if (noise.noiseType === "MULTITONE" && noise.opacity === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["opacity"],
            message: "opacity is required when noiseType is 'MULTITONE'.",
        });
    }
    if (noise.noiseType !== "MULTITONE" && noise.opacity !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["opacity"],
            message: "opacity is only valid when noiseType is 'MULTITONE'.",
        });
    }
});

const textureEffect = z.object({
    type: z.literal("TEXTURE"),
    noiseSize: z.number().describe("Texture grain size"),
    radius: z.number().describe("Texture radius"),
    clipToShape: z.boolean().describe("Clip the texture to the shape"),
    visible: z.boolean().optional().describe("default true"),
});

const glassEffect = z.object({
    type: z.literal("GLASS"),
    lightIntensity: z.number().min(0).max(1).describe("Light intensity, 0–1"),
    lightAngle: z.number().describe("Light angle, degrees"),
    refraction: z.number().min(0).max(1).describe("Refraction amount, 0–1"),
    depth: z.number().describe("Glass depth (0 is accepted by Figma)"),
    dispersion: z.number().min(0).max(1).describe("Chromatic dispersion, 0–1"),
    radius: z.number().nonnegative().describe("Corner/blur radius; must be ≥ 0"),
    visible: z.boolean().optional().describe("default true"),
});

/**
 * The four variants historically exposed by `node_set_effects`. Sharing these
 * exact objects with `style_manage` keeps their field gates and live-confirmed
 * numeric bounds identical while preserving the node tool's existing surface.
 */
export const nodeEffect = z.discriminatedUnion("type", [
    dropShadowEffect,
    innerShadowEffect,
    layerBlurEffect,
    backgroundBlurEffect,
]);

const effect = z.discriminatedUnion("type", [
    dropShadowEffect,
    innerShadowEffect,
    layerBlurEffect,
    backgroundBlurEffect,
    noiseEffect,
    textureEffect,
    glassEffect,
]);

const styleProperties = z.object({
    // TEXT — typed
    fontName: z.object({ family: z.string(), style: z.string() }).optional()
        .describe("TEXT: font, e.g. {family:'Inter', style:'Bold'}"),
    fontSize: z.number().positive().optional().describe("TEXT: font size in px"),
    lineHeight: z.union([
        z.object({ unit: z.literal("AUTO") }),
        z.object({ value: z.number(), unit: z.enum(["PIXELS", "PERCENT"]) }),
    ]).optional().describe("TEXT: {unit:'AUTO'} or {value, unit:'PIXELS'|'PERCENT'}"),
    letterSpacing: z.object({ value: z.number(), unit: z.enum(["PIXELS", "PERCENT"]) }).optional()
        .describe("TEXT: {value, unit:'PIXELS'|'PERCENT'}"),
    paragraphIndent: z.number().optional().describe("TEXT: first-line indent, px"),
    paragraphSpacing: z.number().optional().describe("TEXT: space between paragraphs, px"),
    textCase: z.enum(["ORIGINAL", "UPPER", "LOWER", "TITLE"]).optional().describe("TEXT: letter casing"),
    textDecoration: z.enum(["NONE", "UNDERLINE", "STRIKETHROUGH"]).optional().describe("TEXT: decoration"),
    // PAINT / EFFECT / GRID
    paints: z.array(paint).optional()
        .describe("PAINT: array of paints (SOLID typed; GRADIENT_*/IMAGE pass through)"),
    effects: z.array(effect).optional()
        .describe("EFFECT: array of Figma Effect objects, one shape per `type` — DROP_SHADOW/INNER_SHADOW (color, offset, radius, spread), LAYER_BLUR/BACKGROUND_BLUR (radius, blurType), NOISE (noiseType, noiseSize, density), TEXTURE (noiseSize, radius, clipToShape), GLASS (lightIntensity, refraction, depth, dispersion, radius)."),
    layoutGrids: z.array(
        z.object({ pattern: z.enum(["GRID", "ROWS", "COLUMNS"]).describe("Grid pattern") }).catchall(z.any())
    ).optional().describe("GRID: array of Figma LayoutGrid objects, e.g. {pattern:'GRID', sectionSize, visible?} or {pattern:'COLUMNS', count, gutterSize, alignment, …}"),
}).describe("Style properties; the relevant subset depends on `type` (TEXT/PAINT/EFFECT/GRID).");

export function registerStyleTools(server: McpServer) {
    // 1. List Styles Tool
    server.registerTool(
        "style_list",
        {
            title: "List Styles",
            description: "List all local styles (paint/text/effect/grid) in the document.",
            inputSchema: z.object({}),
            outputSchema: looseOutput({
                colors: z.array(z.any()).describe("List of paint/color styles"),
                texts: z.array(z.any()).describe("List of text styles"),
                effects: z.array(z.any()).describe("List of effect styles"),
                grids: z.array(z.any()).describe("List of grid styles"),
            }),
            annotations: {
                readOnlyHint: true,
                openWorldHint: true
            }
        },
        async () => {
            const result = await sendCommandToFigma("style_list");
            return toolResult(result);
        }
    );

    // 2. Manage Style Tool
    server.registerTool(
        "style_manage",
        {
            title: "Manage Style",
            description: "Create a named style (paint/text/effect/grid), or update an existing one when `styleId` is given. UPDATE requires currentStyleName.",
            inputSchema: z.object({
                type: z
                    .enum(["TEXT", "PAINT", "EFFECT", "GRID"])
                    .describe("Type of style to create or update"),
                name: z
                    .string()
                    .optional()
                    .describe("Style name. Must be non-empty when supplied. REQUIRED for CREATE; omit it on UPDATE to leave the current style name unchanged."),
                description: z.string().optional().describe("Description of the style"),
                properties: styleProperties
                    .optional()
                    .describe("Style properties to set; which subset applies depends on `type` (TEXT/PAINT/EFFECT/GRID)."),
                styleId: z.string().optional().describe("ID of the style to update (if not creating a new one)"),
                currentStyleName: z
                    .string()
                    .optional()
                    .describe("REQUIRED for UPDATE when styleId is supplied — the style's **current exact** name, passed back verbatim from `style_list`"),
                bindVariables: z.record(z.string(), z.string().nullable()).optional().describe("Map of field names to variable IDs (to bind) or null (to unbind). For PAINT styles, valid fields include 'color'. For TEXT styles, fields include 'fontSize', 'fontFamily', etc."),
            }).superRefine((data, ctx) => {
                // Empty names are rejected, never assigned: a style named ""
                // could not pass exact-name verification afterward (P4-6).
                if (data.name === "") {
                    const recovery = data.styleId === undefined
                        ? "Supply a non-empty name for the new style."
                        : "Omit name to leave the style's name unchanged.";
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["name"],
                        message: `name must not be empty. ${recovery}`
                    });
                }
                // Create/update splits on PRESENCE, not truthiness: an explicit
                // empty styleId is malformed update intent, not a create (P4-2).
                if (data.styleId !== undefined) {
                    if (data.styleId === "") {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["styleId"],
                            message: "styleId must not be empty. Omit styleId to create a new style, or pass a real style ID from style_list back verbatim."
                        });
                    }
                    if (!data.currentStyleName) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["currentStyleName"],
                            message: "currentStyleName is required for UPDATE when styleId is supplied. Retrieve the style's current exact name from style_list and pass it back verbatim."
                        });
                    }
                } else {
                    if (!data.name) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ["name"],
                            message: "name is required to create a new style."
                        });
                    }
                }
            }),
            outputSchema: looseOutput({
                id: z.string().describe("ID of the style"),
                name: z.string().describe("Name of the style"),
                type: z.string().describe("Type of the style"),
            }),
            annotations: {
                openWorldHint: true
            }
        },
        async (params: any) => {
            // `properties` is already a typed object — the handler reads it directly.
            const result = await sendCommandToFigma("style_manage", params);
            return toolResult(result);
        }
    );

    // 3. Delete Style Tool
    server.registerTool(
        "style_delete",
        {
            title: "Delete Style",
            description: "Delete a local style by id. Detaches consumers — they keep their resolved values and lose only the style link.",
            inputSchema: z.object({
                styleId: z.string().describe("ID of style to delete"),
                styleName: z.string().describe("The style's current exact name, passed back verbatim from `style_list`."),
            }),
            outputSchema: looseOutput({
                success: z.boolean().describe("Whether style was successfully deleted"),
                message: z.string().describe("Success/failure status message"),
            }),
            annotations: {
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async (params: any) => {
            const result = await sendCommandToFigma("style_delete", params);
            return toolResult(result);
        }
    );
}
