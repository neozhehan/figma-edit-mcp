import { describe, it, expect } from "vitest";
import { normalizeEffects } from "../../../../../figma_plugin/handlers/stylingHandlers.js";

describe("stylingHandlers: normalizeEffects", () => {
    it("throws if effect is missing type", () => {
        expect(() => normalizeEffects([{}])).toThrow("Each effect must have a type");
    });

    it("normalizes shadow effects and supplies NORMAL blendMode if omitted", () => {
        const input = [
            { type: "DROP_SHADOW" },
            { type: "INNER_SHADOW", blendMode: "MULTIPLY", offset: { x: 2, y: 2 } }
        ];
        const result = normalizeEffects(input);

        expect(result[0]).toEqual({
            type: "DROP_SHADOW",
            visible: true,
            color: { r: 0, g: 0, b: 0, a: 0.25 },
            offset: { x: 0, y: 4 },
            radius: 4,
            spread: 0,
            blendMode: "NORMAL",
            showShadowBehindNode: false
        });

        // INNER_SHADOW must NOT carry showShadowBehindNode — Figma's runtime
        // rejects that key on inner shadows ("Unrecognized key(s) ...").
        expect(result[1]).toEqual({
            type: "INNER_SHADOW",
            visible: true,
            color: { r: 0, g: 0, b: 0, a: 0.25 },
            offset: { x: 2, y: 2 },
            radius: 4,
            spread: 0,
            blendMode: "MULTIPLY"
        });
    });

    it("does not inject showShadowBehindNode on INNER_SHADOW (Figma rejects it)", () => {
        const result = normalizeEffects([{ type: "INNER_SHADOW" }]);
        expect(result[0]).not.toHaveProperty("showShadowBehindNode");
        expect(result[0].blendMode).toBe("NORMAL");
    });

    it("injects showShadowBehindNode only on DROP_SHADOW", () => {
        const result = normalizeEffects([{ type: "DROP_SHADOW" }]);
        expect(result[0].showShadowBehindNode).toBe(false);
    });

    it("normalizes blur effects without blendMode", () => {
        const input = [
            { type: "LAYER_BLUR", radius: 10 },
            { type: "BACKGROUND_BLUR" }
        ];
        const result = normalizeEffects(input);

        expect(result[0]).toEqual({
            type: "LAYER_BLUR",
            visible: true,
            radius: 10
        });

        expect(result[1]).toEqual({
            type: "BACKGROUND_BLUR",
            visible: true,
            radius: 4
        });
    });

    it("passes through unknown types unchanged", () => {
        const input = [{ type: "UNKNOWN_EFFECT", custom: 123 }];
        const result = normalizeEffects(input);
        expect(result[0]).toEqual({ type: "UNKNOWN_EFFECT", custom: 123 });
    });
});

import { setEffects } from "../../../../../figma_plugin/handlers/stylingHandlers.js";

describe("stylingHandlers: setEffects", () => {
    it("applies normalized effects to node", async () => {
        const mockNode = {
            id: "1:2",
            name: "Node",
            effects: []
        };
        (globalThis as any).figma = {
            getNodeByIdAsync: async () => mockNode
        };

        const res = await setEffects({
            nodeId: "1:2",
            effects: [{ type: "DROP_SHADOW" }]
        });

        expect(mockNode.effects.length).toBe(1);
        expect(mockNode.effects[0].blendMode).toBe("NORMAL");
        expect(res.effects).toEqual(mockNode.effects);
    });
});
