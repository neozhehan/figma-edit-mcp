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

        it("tolerates line-wrapped (RFC 2045 MIME) base64", () => {
            // Encode 60 bytes, then wrap at 76 chars with CRLF like a MIME encoder.
            const original = new Uint8Array(Array.from({ length: 60 }, (_, i) => (i * 7) % 256));
            const wrapped = customBase64Encode(original).replace(/(.{4})/g, "$1\r\n");
            const decoded = base64ToBytes(wrapped);
            expect(decoded).toEqual(original);
        });

        it("tolerates surrounding/embedded whitespace and a data URI prefix together", () => {
            const decoded = base64ToBytes("  data:image/png;base64,\nSGVs bG8=\n ");
            expect(decoded).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
        });

        it("throws on invalid base64", () => {
            expect(() => base64ToBytes("not_base64_@!")).toThrow("Invalid base64 string");
        });
    });
});
