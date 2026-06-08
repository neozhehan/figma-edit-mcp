import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { sendCommandToFigma } from "../figma-client.js";
import { toolResult } from "./_result.js";

// ── style_manage `properties` (hybrid typing) ──────────────────────────────
// Common cases are fully typed (enums + value-objects) so an LLM gets a real,
// validated contract; the polymorphic Figma types (gradient/image paints,
// effects, grids) accept their full objects via `.catchall` rather than forcing
// the model to hand-author matrices/stops through a strict schema.
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
    effects: z.array(
        z.object({ type: z.string().describe("DROP_SHADOW|INNER_SHADOW|LAYER_BLUR|BACKGROUND_BLUR") }).catchall(z.any())
    ).optional().describe("EFFECT: array of Figma Effect objects, e.g. {type:'DROP_SHADOW', color, offset:{x,y}, radius, spread?, visible?}"),
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
            outputSchema: z.object({
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
            description: "Create a named style (paint/text/effect/grid), or update an existing one when `styleId` is given.",
            inputSchema: z.object({
                type: z
                    .enum(["TEXT", "PAINT", "EFFECT", "GRID"])
                    .describe("Type of style to create or update"),
                name: z.string().describe("Name of the style"),
                description: z.string().optional().describe("Description of the style"),
                properties: styleProperties
                    .optional()
                    .describe("Style properties to set; which subset applies depends on `type` (TEXT/PAINT/EFFECT/GRID)."),
                styleId: z.string().optional().describe("ID of the style to update (if not creating a new one)"),
                bindVariables: z.record(z.string(), z.string().nullable()).optional().describe("Map of field names to variable IDs (to bind) or null (to unbind). For PAINT styles, valid fields include 'color'. For TEXT styles, fields include 'fontSize', 'fontFamily', etc."),
            }),
            outputSchema: z.object({
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
                styleName: z.string().describe("Expected name of style to delete (verification)"),
            }),
            outputSchema: z.object({
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
