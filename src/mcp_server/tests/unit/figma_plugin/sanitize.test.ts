import { describe, it, expect } from "bun:test";
import { sanitizeForPostMessage } from "../../../../../figma_plugin/utils/sanitize.js";

// figma.mixed is a unique Symbol; simulate it.
const MIXED = Symbol("figma.mixed");

describe("sanitizeForPostMessage", () => {
    it("replaces a top-level symbol with 'mixed'", () => {
        expect(sanitizeForPostMessage(MIXED)).toBe("mixed");
    });

    it("replaces symbols nested in objects and arrays", () => {
        expect(
            sanitizeForPostMessage({
                id: "1:2",
                cornerRadius: MIXED,
                fontSize: 14,
                corners: [10, MIXED, 0],
                nested: { letterSpacing: MIXED, ok: true },
            })
        ).toEqual({
            id: "1:2",
            cornerRadius: "mixed",
            fontSize: 14,
            corners: [10, "mixed", 0],
            nested: { letterSpacing: "mixed", ok: true },
        });
    });

    it("passes plain data through unchanged", () => {
        const input = { a: 1, b: "x", c: false, d: null, e: [1, 2, { f: "g" }] };
        expect(sanitizeForPostMessage(input)).toEqual(input);
    });

    it("drops functions (also non-cloneable)", () => {
        const result = sanitizeForPostMessage({ fn: () => 1, keep: 2 });
        expect(result.fn).toBeUndefined();
        expect(result.keep).toBe(2);
    });

    it("makes a mixed-cornerRadius response structured-clone-safe (the node_set_corner_radius bug)", () => {
        const handlerResult = { id: "1:2", name: "Rect", cornerRadius: MIXED, topLeftRadius: 24 };
        // The raw result can't be cloned — this is exactly the postMessage crash.
        expect(() => structuredClone(handlerResult)).toThrow();
        const safe = sanitizeForPostMessage(handlerResult);
        // After sanitizing it clones cleanly (no symbols).
        expect(() => structuredClone(safe)).not.toThrow();
        expect(safe.cornerRadius).toBe("mixed");
        expect(safe.topLeftRadius).toBe(24);
    });

    it("survives cyclic structures without infinite recursion", () => {
        const a: any = { name: "a" };
        a.self = a;
        const safe = sanitizeForPostMessage(a);
        expect(safe.name).toBe("a");
        expect(safe.self).toBeUndefined();
    });
});
