import { describe, it, expect } from "bun:test";
import { customBase64Encode, base64ToBytes } from "../../../../../figma_plugin/utils/exportUtils.js";

describe("exportUtils", () => {
    describe("base64ToBytes", () => {
        it("roundtrips with customBase64Encode", () => {
            const original = new Uint8Array([0, 10, 20, 255, 128, 64]);
            const base64 = customBase64Encode(original);
            const decoded = base64ToBytes(base64);
            expect(decoded).toEqual(original);
        });

        it("decodes without padding", () => {
            // "SGVsbG8=" -> "Hello" -> [72, 101, 108, 108, 111]
            const decoded = base64ToBytes("SGVsbG8");
            expect(decoded).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
        });

        it("decodes with data URI prefix", () => {
            const decoded = base64ToBytes("data:image/png;base64,SGVsbG8=");
            expect(decoded).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
        });

        it("throws on invalid base64", () => {
            expect(() => base64ToBytes("not_base64_@!")).toThrow("Invalid base64 string");
        });
    });
});
